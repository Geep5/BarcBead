// Background service worker for Barc
// Manages Nostr connections and coordinates between popup and content scripts

import { BarcNostrClient, generatePrivateKey, getPublicKey } from './lib/nostr.js';

let nostrClient = null;
let currentTabUrl = null;
let currentTabId = null;
let userName = null;
let unreadCount = 0;
let popupOpen = false;

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

// Update the extension badge
function updateBadge() {
  if (unreadCount > 0) {
    chrome.action.setBadgeText({ text: unreadCount > 99 ? '99+' : unreadCount.toString() });
    chrome.action.setBadgeBackgroundColor({ color: '#e94560' });
  } else {
    // Show user count if no unread messages
    const userCount = nostrClient?.getActiveUsers()?.length || 0;
    if (userCount > 0) {
      chrome.action.setBadgeText({ text: userCount.toString() });
      chrome.action.setBadgeBackgroundColor({ color: '#4ade80' });
    } else {
      chrome.action.setBadgeText({ text: '' });
    }
  }
}

// Clear unread count
function clearUnread() {
  unreadCount = 0;
  updateBadge();
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
    // Increment unread count if popup is closed and message isn't ours
    if (!popupOpen && !msg.isOwn) {
      unreadCount++;
      updateBadge();
    }
    broadcastToAll({ type: 'NEW_MESSAGE', message: msg });
  });

  nostrClient.onPresence((users) => {
    updateBadge();
    broadcastToAll({ type: 'PRESENCE_UPDATE', users });
  });

  return nostrClient;
}

// Auto-join channel for a URL
async function autoJoinChannel(url) {
  if (!url || url.startsWith('chrome://') || url.startsWith('chrome-extension://')) {
    return;
  }

  const client = await initClient();
  if (!client) return; // No key configured yet

  // Leave previous channel if different URL
  if (currentTabUrl && currentTabUrl !== url) {
    client.leaveChannel();
  }

  currentTabUrl = url;
  await client.joinChannel(url);

  if (userName) {
    await client.announcePresence(userName);
  }

  updateBadge();
}

// Broadcast message to popup and active tab
async function broadcastToAll(message) {
  // Send to popup
  chrome.runtime.sendMessage(message).catch(() => {});

  // Send to content script in active tab
  if (currentTabId) {
    chrome.tabs.sendMessage(currentTabId, message).catch(() => {});
  }
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

        // Auto-join current tab's channel
        if (currentTabUrl) {
          await autoJoinChannel(currentTabUrl);
        }

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

        // Auto-join current tab's channel
        if (currentTabUrl) {
          await autoJoinChannel(currentTabUrl);
        }

        return { success: true, publicKey };
      } catch (error) {
        return { success: false, error: 'Invalid private key' };
      }
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
        publicKey: nostrClient?.publicKey || null,
        unreadCount: unreadCount
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

    case 'POPUP_OPENED': {
      popupOpen = true;
      clearUnread();
      return { success: true };
    }

    case 'POPUP_CLOSED': {
      popupOpen = false;
      return { success: true };
    }

    default:
      return { error: 'Unknown message type' };
  }
}

// Listen for tab activation - auto-join that tab's channel
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    currentTabId = activeInfo.tabId;
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (tab.url) {
      await autoJoinChannel(tab.url);
      broadcastToAll({ type: 'TAB_CHANGED', url: tab.url });
    }
  } catch {}
});

// Listen for URL changes in the active tab - auto-join new channel
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.url && tab.active) {
    currentTabId = tabId;
    await autoJoinChannel(changeInfo.url);
    broadcastToAll({ type: 'TAB_CHANGED', url: changeInfo.url });
  }
});

// Initialize on startup - join current tab's channel
chrome.runtime.onStartup.addListener(async () => {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]?.url) {
      currentTabId = tabs[0].id;
      currentTabUrl = tabs[0].url;
      await autoJoinChannel(tabs[0].url);
    }
  } catch {}
});

// Also init when extension is installed/updated
chrome.runtime.onInstalled.addListener(async () => {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]?.url) {
      currentTabId = tabs[0].id;
      currentTabUrl = tabs[0].url;
      await autoJoinChannel(tabs[0].url);
    }
  } catch {}
});

// Keep service worker alive with periodic alarm
chrome.alarms.create('keepAlive', { periodInMinutes: 1 });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'keepAlive' && nostrClient?.currentChannelId) {
    // Send presence update
    nostrClient.announcePresence(userName);
    updateBadge();
  }
});
