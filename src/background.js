// Background service worker for Barc
// Manages Nostr connections and coordinates between popup and content scripts

import { BarcNostrClient, generatePrivateKey, getPublicKey } from './lib/nostr.js';

let nostrClient = null;
let currentTabUrl = null;
let userName = null;

// Bech32 decoding for nsec keys
const BECH32_ALPHABET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

function bech32Decode(str) {
  str = str.toLowerCase();
  const sepIndex = str.lastIndexOf('1');
  if (sepIndex < 1) return null;

  const hrp = str.slice(0, sepIndex);
  const data = str.slice(sepIndex + 1);

  const values = [];
  for (const char of data) {
    const idx = BECH32_ALPHABET.indexOf(char);
    if (idx === -1) return null;
    values.push(idx);
  }

  // Remove checksum (last 6 characters)
  const payload = values.slice(0, -6);

  // Convert 5-bit groups to 8-bit bytes
  let acc = 0;
  let bits = 0;
  const result = [];

  for (const value of payload) {
    acc = (acc << 5) | value;
    bits += 5;
    while (bits >= 8) {
      bits -= 8;
      result.push((acc >> bits) & 0xff);
    }
  }

  return { hrp, bytes: new Uint8Array(result) };
}

function bytesToHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Parse key input - supports nsec1... or hex format
function parsePrivateKey(input) {
  input = input.trim();

  // Check for nsec bech32 format
  if (input.startsWith('nsec1')) {
    const decoded = bech32Decode(input);
    if (!decoded || decoded.hrp !== 'nsec' || decoded.bytes.length !== 32) {
      return { error: 'Invalid nsec key format' };
    }
    return { privateKey: bytesToHex(decoded.bytes) };
  }

  // Check for hex format (64 chars)
  if (/^[a-fA-F0-9]{64}$/.test(input)) {
    return { privateKey: input.toLowerCase() };
  }

  return { error: 'Invalid key format. Use nsec1... or 64-char hex.' };
}

// Initialize the Nostr client with an existing key
async function initClient(privateKey = null) {
  // If we have a client and no new key, return existing
  if (nostrClient && !privateKey) return nostrClient;

  // If reinitializing with new key, disconnect first
  if (nostrClient && privateKey) {
    nostrClient.disconnect();
    nostrClient = null;
  }

  nostrClient = new BarcNostrClient();

  // Load saved keys and username
  const stored = await chrome.storage.local.get(['privateKey', 'userName']);
  userName = stored.userName || null;

  // Use provided key, or stored key
  const keyToUse = privateKey || stored.privateKey;

  if (keyToUse) {
    await nostrClient.init(keyToUse);
    // Save the key if it was newly provided
    if (privateKey && privateKey !== stored.privateKey) {
      await chrome.storage.local.set({ privateKey });
    }
  } else {
    // No key yet - don't auto-generate, wait for user action
    return null;
  }

  // Set up event handlers
  nostrClient.onMessage((msg) => {
    broadcastToAll({ type: 'NEW_MESSAGE', message: msg });
  });

  nostrClient.onPresence((users) => {
    broadcastToAll({ type: 'PRESENCE_UPDATE', users });
  });

  return nostrClient;
}

// Broadcast message to popup and active tab
async function broadcastToAll(message) {
  // Send to popup
  chrome.runtime.sendMessage(message).catch(() => {});

  // Send to content script in active tab
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, message).catch(() => {});
    }
  } catch {}
}

// Handle messages from popup and content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  handleMessage(request, sender).then(sendResponse);
  return true; // Keep channel open for async response
});

async function handleMessage(request, sender) {
  switch (request.type) {
    case 'INIT': {
      const client = await initClient();
      return {
        publicKey: client?.publicKey || null,
        userName: userName
      };
    }

    case 'GENERATE_KEY': {
      try {
        const privateKey = generatePrivateKey();
        const publicKey = getPublicKey(privateKey);

        // Save the new key
        await chrome.storage.local.set({ privateKey });

        // Initialize client with new key
        await initClient(privateKey);

        return { success: true, publicKey };
      } catch (error) {
        return { success: false, error: error.message };
      }
    }

    case 'IMPORT_KEY': {
      const parsed = parsePrivateKey(request.key);
      if (parsed.error) {
        return { success: false, error: parsed.error };
      }

      try {
        const publicKey = getPublicKey(parsed.privateKey);

        // Save the imported key
        await chrome.storage.local.set({ privateKey: parsed.privateKey });

        // Initialize client with imported key
        await initClient(parsed.privateKey);

        return { success: true, publicKey };
      } catch (error) {
        return { success: false, error: 'Invalid private key' };
      }
    }

    case 'JOIN_CHANNEL': {
      const client = await initClient();
      if (!client) {
        return { error: 'No key configured' };
      }
      currentTabUrl = request.url;
      const channelId = await client.joinChannel(request.url);

      if (userName) {
        await client.announcePresence(userName);
      }

      return { channelId, users: client.getActiveUsers() };
    }

    case 'LEAVE_CHANNEL': {
      if (nostrClient) {
        nostrClient.leaveChannel();
      }
      currentTabUrl = null;
      return { success: true };
    }

    case 'SEND_MESSAGE': {
      if (!nostrClient) {
        return { error: 'Not connected' };
      }
      const event = await nostrClient.sendMessage(request.content);
      return { success: !!event, eventId: event?.id };
    }

    case 'SET_USERNAME': {
      userName = request.name;
      await chrome.storage.local.set({ userName });
      if (nostrClient && nostrClient.currentChannelId) {
        await nostrClient.announcePresence(userName);
      }
      return { success: true };
    }

    case 'GET_STATUS': {
      return {
        connected: nostrClient?.relays.some(r => r.connected) || false,
        channelId: nostrClient?.currentChannelId || null,
        url: currentTabUrl,
        users: nostrClient?.getActiveUsers() || [],
        publicKey: nostrClient?.publicKey || null
      };
    }

    case 'GET_CURRENT_URL': {
      try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        return { url: tabs[0]?.url || null };
      } catch {
        return { url: null };
      }
    }

    default:
      return { error: 'Unknown message type' };
  }
}

// Listen for tab changes to update channel
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (tab.url && nostrClient && tab.url !== currentTabUrl) {
      // Notify popup about tab change
      chrome.runtime.sendMessage({ type: 'TAB_CHANGED', url: tab.url }).catch(() => {});
    }
  } catch {}
});

// Listen for URL changes in the active tab
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url && tab.active) {
    chrome.runtime.sendMessage({ type: 'TAB_CHANGED', url: changeInfo.url }).catch(() => {});
  }
});

// Keep service worker alive with periodic alarm
chrome.alarms.create('keepAlive', { periodInMinutes: 1 });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'keepAlive' && nostrClient?.currentChannelId) {
    // Send presence update
    nostrClient.announcePresence(userName);
  }
});
