// Background service worker for Barc
// Manages Nostr connections and coordinates between popup and content scripts

import { BarcNostrClient } from './lib/nostr.js';

let nostrClient = null;
let currentTabUrl = null;
let userName = null;

// Initialize the Nostr client
async function initClient() {
  if (nostrClient) return nostrClient;

  nostrClient = new BarcNostrClient();

  // Load saved keys and username
  const stored = await chrome.storage.local.get(['privateKey', 'userName']);
  userName = stored.userName || null;

  await nostrClient.init(stored.privateKey);

  // Save the private key if newly generated
  if (!stored.privateKey) {
    await chrome.storage.local.set({ privateKey: nostrClient.privateKey });
  }

  // Set up event handlers
  nostrClient.onMessage((msg) => {
    // Forward to popup and content script
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
        publicKey: client.publicKey,
        userName: userName
      };
    }

    case 'JOIN_CHANNEL': {
      const client = await initClient();
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
