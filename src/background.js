// Background service worker for Barc
// Manages Nostr connections and coordinates with dashboard

import { BarcNostrClient, generatePrivateKey, getPublicKey } from './lib/nostr.js';

let nostrClient = null;
let currentChannelUrl = null; // URL of the channel we're currently joined to
let userName = null;
let unreadCount = 0;
let dashboardOpen = false;

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
  // If we have a fully initialized client and no new key, return existing
  if (nostrClient && nostrClient.publicKey && !privateKey) return nostrClient;

  // If reinitializing with new key, disconnect first
  if (nostrClient && privateKey) {
    nostrClient.disconnect();
    nostrClient = null;
  }

  // Load saved keys and username
  const stored = await chrome.storage.local.get(['privateKey', 'userName']);
  userName = stored.userName || null;

  // Use provided key, or stored key
  const keyToUse = privateKey || stored.privateKey;

  if (!keyToUse) {
    // No key yet - don't auto-generate, wait for user action
    return null;
  }

  // Create and initialize client
  nostrClient = new BarcNostrClient();
  await nostrClient.init(keyToUse);

  // Save the key if it was newly provided
  if (privateKey && privateKey !== stored.privateKey) {
    await chrome.storage.local.set({ privateKey });
  }

  // Set up event handlers
  nostrClient.onMessage((msg) => {
    // Increment unread count if dashboard is closed and message isn't ours
    if (!dashboardOpen && !msg.isOwn) {
      unreadCount++;
      updateBadge();
    }
    broadcastToAll({ type: 'NEW_MESSAGE', message: msg, url: currentChannelUrl });
  });

  nostrClient.onPresence((users) => {
    updateBadge();
    broadcastToAll({ type: 'PRESENCE_UPDATE', users, url: currentChannelUrl });
  });

  nostrClient.onGlobalActivity((activity) => {
    broadcastToAll({ type: 'GLOBAL_ACTIVITY', activity });
  });

  nostrClient.onDM((dm, otherPubkey) => {
    // Increment unread if dashboard closed and not our own message
    if (!dashboardOpen && !dm.isOwn) {
      unreadCount++;
      updateBadge();
    }
    broadcastToAll({ type: 'NEW_DM', dm, otherPubkey });
  });

  return nostrClient;
}

// Join channel for a specific URL
async function joinChannel(url) {
  if (!url || url.startsWith('chrome://') || url.startsWith('chrome-extension://')) {
    return { messages: [], users: [] };
  }

  const client = await initClient();
  if (!client) return { messages: [], users: [] }; // No key configured yet

  // Leave previous channel if different URL
  if (currentChannelUrl && currentChannelUrl !== url) {
    client.leaveChannel();
  }

  currentChannelUrl = url;
  const result = await client.joinChannel(url);

  if (userName) {
    await client.announcePresence(userName);
  }

  updateBadge();

  return {
    messages: result?.messages || [],
    users: client.getActiveUsers() || []
  };
}

// Broadcast message to all extension pages (dashboard)
async function broadcastToAll(message) {
  chrome.runtime.sendMessage(message).catch(() => {});
}

// Open dashboard tab when extension icon is clicked
chrome.action.onClicked.addListener(async () => {
  // Check if dashboard is already open
  const dashboardUrl = chrome.runtime.getURL('src/ui/dashboard.html');
  const tabs = await chrome.tabs.query({ url: dashboardUrl });

  if (tabs.length > 0) {
    // Focus existing dashboard tab
    chrome.tabs.update(tabs[0].id, { active: true });
    chrome.windows.update(tabs[0].windowId, { focused: true });
  } else {
    // Open new dashboard tab
    chrome.tabs.create({ url: dashboardUrl });
  }
});

// Handle messages from dashboard
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

    case 'DASHBOARD_OPENED': {
      dashboardOpen = true;
      clearUnread();
      return { success: true };
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

    case 'JOIN_TAB_CHANNEL': {
      const result = await joinChannel(request.url);
      return result;
    }

    case 'SEND_MESSAGE': {
      if (!nostrClient) {
        return { error: 'Not connected' };
      }
      // If url is provided, use it (for profile walls), otherwise use current channel
      const targetUrl = request.url || currentChannelUrl;
      const event = await nostrClient.sendMessage(request.content, targetUrl);
      return { success: !!event, eventId: event?.id };
    }

    case 'POST_TO_WALL': {
      if (!nostrClient) {
        return { error: 'Not connected' };
      }
      // Post to someone's wall using their pubkey as the address
      const event = await nostrClient.postToWall(request.targetPubkey, request.content);
      return { success: !!event, eventId: event?.id };
    }

    case 'FETCH_WALL_POSTS': {
      if (!nostrClient) {
        return { posts: [], error: 'Not connected' };
      }
      try {
        const posts = await nostrClient.fetchWallPosts(request.targetPubkey, request.limit || 50);
        return { posts };
      } catch (error) {
        console.error('Failed to fetch wall posts:', error);
        return { posts: [], error: error.message };
      }
    }

    case 'FETCH_MENTIONS': {
      if (!nostrClient) {
        return { posts: [], error: 'Not connected' };
      }
      try {
        const posts = await nostrClient.fetchMentions(request.targetPubkey, request.limit || 50);
        return { posts };
      } catch (error) {
        console.error('Failed to fetch mentions:', error);
        return { posts: [], error: error.message };
      }
    }

    case 'FETCH_USER_POSTS': {
      if (!nostrClient) {
        return { posts: [], error: 'Not connected' };
      }
      try {
        const posts = await nostrClient.fetchUserPosts(request.targetPubkey, request.limit || 50);
        return { posts };
      } catch (error) {
        console.error('Failed to fetch user posts:', error);
        return { posts: [], error: error.message };
      }
    }

    case 'SEND_DM': {
      if (!nostrClient) {
        return { error: 'Not connected' };
      }
      const event = await nostrClient.sendDM(request.recipientPubkey, request.content);
      return { success: !!event, eventId: event?.id };
    }

    case 'GET_DM_CONVERSATIONS': {
      return {
        conversations: nostrClient?.getDMConversations() || []
      };
    }

    case 'GET_DM_CONVERSATION': {
      return {
        messages: nostrClient?.getDMConversation(request.pubkey) || []
      };
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
        url: currentChannelUrl,
        users: nostrClient?.getActiveUsers() || [],
        publicKey: nostrClient?.publicKey || null,
        unreadCount: unreadCount,
        globalActivity: nostrClient?.getGlobalActivity() || []
      };
    }

    case 'GET_GLOBAL_ACTIVITY': {
      return {
        activity: nostrClient?.getGlobalActivity() || []
      };
    }

    case 'GET_ALL_TAB_COUNTS': {
      // Get user counts for all URLs from global activity
      const counts = {};
      const activity = nostrClient?.getGlobalActivity() || [];
      for (const item of activity) {
        counts[item.url] = item.userCount;
      }
      return { counts };
    }

    case 'FETCH_MESSAGES': {
      if (!nostrClient) {
        return { messages: [], error: 'Not connected' };
      }
      try {
        const messages = await nostrClient.fetchMessages(
          request.url,
          request.since,
          request.until,
          request.limit
        );
        return { messages };
      } catch (error) {
        console.error('Failed to fetch messages:', error);
        return { messages: [], error: error.message };
      }
    }

    // NIP-02: Contact List / Following
    case 'GET_FOLLOWING': {
      if (!nostrClient) {
        return { following: [], error: 'Not connected' };
      }
      try {
        const following = await nostrClient.getFollowingWithMetadata();
        return { following };
      } catch (error) {
        console.error('Failed to fetch following:', error);
        return { following: [], error: error.message };
      }
    }

    case 'FOLLOW_USER': {
      if (!nostrClient) {
        return { success: false, error: 'Not connected' };
      }
      try {
        const result = await nostrClient.followUser(request.pubkey, request.petname);
        return result;
      } catch (error) {
        console.error('Failed to follow user:', error);
        return { success: false, error: error.message };
      }
    }

    case 'UNFOLLOW_USER': {
      if (!nostrClient) {
        return { success: false, error: 'Not connected' };
      }
      try {
        const result = await nostrClient.unfollowUser(request.pubkey);
        return result;
      } catch (error) {
        console.error('Failed to unfollow user:', error);
        return { success: false, error: error.message };
      }
    }

    case 'IS_FOLLOWING': {
      if (!nostrClient) {
        return { isFollowing: false, error: 'Not connected' };
      }
      try {
        const isFollowing = await nostrClient.isFollowing(request.pubkey);
        return { isFollowing };
      } catch (error) {
        console.error('Failed to check following status:', error);
        return { isFollowing: false, error: error.message };
      }
    }

    case 'FETCH_USER_METADATA': {
      if (!nostrClient) {
        return { metadata: null, error: 'Not connected' };
      }
      try {
        const metadata = await nostrClient.fetchUserMetadata(request.pubkey);
        return { metadata };
      } catch (error) {
        console.error('Failed to fetch user metadata:', error);
        return { metadata: null, error: error.message };
      }
    }

    default:
      return { error: 'Unknown message type' };
  }
}

// Initialize client on startup
chrome.runtime.onStartup.addListener(async () => {
  await initClient();
});

// Also init when extension is installed/updated
chrome.runtime.onInstalled.addListener(async () => {
  await initClient();
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
