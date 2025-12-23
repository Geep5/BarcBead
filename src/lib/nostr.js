// Nostr implementation using @noble/secp256k1 for cryptography
// Uses basic Nostr protocol: NIP-01 for events, custom tags for URL channels

import * as secp from '@noble/secp256k1';
import { sha256 } from '@noble/hashes/sha256';
import { hmac } from '@noble/hashes/hmac';
import { bytesToHex, hexToBytes, randomBytes } from '@noble/hashes/utils';

// Configure secp256k1 to use sha256 from noble/hashes (required in v3)
secp.etc.hmacSha256Sync = (k, ...m) => hmac(sha256, k, secp.etc.concatBytes(...m));
secp.etc.sha256Sync = (...m) => sha256(secp.etc.concatBytes(...m));
// Also set on hashes object for Schnorr signatures
if (secp.hashes) {
  secp.hashes.sha256 = sha256;
  secp.hashes.hmacSha256 = (key, msg) => hmac(sha256, key, msg);
}

const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.primal.net'
];

// Generate a random private key (32 bytes hex)
function generatePrivateKey() {
  return bytesToHex(randomBytes(32));
}

// Derive public key from private key (x-only, 32 bytes hex)
function getPublicKey(privateKeyHex) {
  const privateKeyBytes = hexToBytes(privateKeyHex);
  const pubkeyBytes = secp.getPublicKey(privateKeyBytes, true); // compressed
  // Return x-coordinate only (skip the 02/03 prefix byte)
  return bytesToHex(pubkeyBytes.slice(1));
}

// SHA256 hash of a string, returns hex
async function sha256Hex(message) {
  const msgBytes = new TextEncoder().encode(message);
  return bytesToHex(sha256(msgBytes));
}

// SHA256 hash of bytes, returns bytes
function sha256Bytes(bytes) {
  return sha256(bytes);
}

// Create and sign a Nostr event
async function createEvent(privateKey, kind, content, tags = []) {
  const pubkey = getPublicKey(privateKey);
  const created_at = Math.floor(Date.now() / 1000);

  // NIP-01: Event ID is sha256 of serialized [0, pubkey, created_at, kind, tags, content]
  const eventData = [0, pubkey, created_at, kind, tags, content];
  const serialized = JSON.stringify(eventData);
  const id = await sha256Hex(serialized);

  // Sign the event ID with Schnorr signature (both must be Uint8Array)
  const sig = await secp.schnorr.sign(hexToBytes(id), hexToBytes(privateKey));

  const event = {
    id,
    pubkey,
    created_at,
    kind,
    tags,
    content,
    sig: bytesToHex(sig)
  };

  // Verify our own signature before sending (for debugging)
  const isValid = await secp.schnorr.verify(sig, hexToBytes(id), hexToBytes(pubkey));
  if (!isValid) {
    console.error('Self-verification failed! Event:', event);
  }

  return event;
}

// Verify a Schnorr signature on a Nostr event
async function verifySignature(event) {
  try {
    const { id, pubkey, sig } = event;
    return await secp.schnorr.verify(hexToBytes(sig), hexToBytes(id), hexToBytes(pubkey));
  } catch (error) {
    console.error('Signature verification error:', error);
    return false;
  }
}

// NIP-04: Encrypted Direct Messages
// Uses ECDH to derive shared secret, then AES-256-CBC

async function nip04Encrypt(privateKeyHex, recipientPubKeyHex, plaintext) {
  // Compute shared point using ECDH
  // For NIP-04, we need to add the 02 prefix to make it a valid compressed pubkey
  const recipientPubkeyFull = '02' + recipientPubKeyHex;
  const sharedPoint = secp.getSharedSecret(privateKeyHex, recipientPubkeyFull);
  // Use x-coordinate as shared secret (skip first byte which is the prefix)
  const sharedSecret = sharedPoint.slice(1, 33);

  // Generate random IV (16 bytes)
  const iv = crypto.getRandomValues(new Uint8Array(16));

  // Import shared secret as AES key
  const key = await crypto.subtle.importKey(
    'raw',
    sharedSecret,
    { name: 'AES-CBC' },
    false,
    ['encrypt']
  );

  // Encrypt
  const plaintextBytes = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-CBC', iv },
    key,
    plaintextBytes
  );

  // Format: base64(ciphertext)?iv=base64(iv)
  const ciphertextB64 = btoa(String.fromCharCode(...new Uint8Array(ciphertext)));
  const ivB64 = btoa(String.fromCharCode(...iv));

  return `${ciphertextB64}?iv=${ivB64}`;
}

async function nip04Decrypt(privateKeyHex, senderPubKeyHex, encryptedContent) {
  // Compute shared point using ECDH
  const senderPubkeyFull = '02' + senderPubKeyHex;
  const sharedPoint = secp.getSharedSecret(privateKeyHex, senderPubkeyFull);
  const sharedSecret = sharedPoint.slice(1, 33);

  // Parse format: base64(ciphertext)?iv=base64(iv)
  const [ciphertextB64, ivPart] = encryptedContent.split('?iv=');
  if (!ivPart) throw new Error('Invalid NIP-04 format');

  const ciphertext = Uint8Array.from(atob(ciphertextB64), c => c.charCodeAt(0));
  const iv = Uint8Array.from(atob(ivPart), c => c.charCodeAt(0));

  // Import shared secret as AES key
  const key = await crypto.subtle.importKey(
    'raw',
    sharedSecret,
    { name: 'AES-CBC' },
    false,
    ['decrypt']
  );

  // Decrypt
  const plaintextBytes = await crypto.subtle.decrypt(
    { name: 'AES-CBC', iv },
    key,
    ciphertext
  );

  return new TextDecoder().decode(plaintextBytes);
}

// URL to channel ID - hash the normalized URL
async function urlToChannelId(url) {
  try {
    const parsed = new URL(url);
    // Normalize: remove hash, some query params, trailing slashes
    const normalized = parsed.origin + parsed.pathname.replace(/\/$/, '');
    return await sha256Hex(normalized);
  } catch {
    return await sha256Hex(url);
  }
}

// Nostr relay connection manager
class NostrRelay {
  constructor(url) {
    this.url = url;
    this.ws = null;
    this.subscriptions = new Map();
    this.connected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.eventCallbacks = new Map();
    this.eoseCallbacks = new Map();
  }

  connect() {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (!this.connected) {
          console.warn(`Connection timeout for relay: ${this.url}`);
          reject(new Error('Connection timeout'));
        }
      }, 5000);

      try {
        this.ws = new WebSocket(this.url);

        this.ws.onopen = () => {
          clearTimeout(timeout);
          this.connected = true;
          this.reconnectAttempts = 0;
          console.log(`Connected to relay: ${this.url}`);
          resolve();
        };

        this.ws.onclose = () => {
          clearTimeout(timeout);
          this.connected = false;
          console.log(`Disconnected from relay: ${this.url}`);
          this.attemptReconnect();
        };

        this.ws.onerror = (error) => {
          clearTimeout(timeout);
          console.error(`Relay error (${this.url}):`, error);
          reject(error);
        };

        this.ws.onmessage = (msg) => {
          this.handleMessage(msg.data);
        };
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    });
  }

  attemptReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      setTimeout(() => this.connect().catch(() => {}), 2000 * this.reconnectAttempts);
    }
  }

  handleMessage(data) {
    try {
      const msg = JSON.parse(data);
      const [type, ...rest] = msg;

      if (type === 'EVENT') {
        const [subId, event] = rest;
        const callback = this.eventCallbacks.get(subId);
        if (callback) {
          callback(event);
        }
      } else if (type === 'EOSE') {
        const [subId] = rest;
        const eoseCallback = this.eoseCallbacks.get(subId);
        if (eoseCallback) {
          eoseCallback();
          this.eoseCallbacks.delete(subId);
        }
      } else if (type === 'OK') {
        const [eventId, success, message] = rest;
        console.log(`[${this.url}] Event ${eventId.slice(0, 8)}: ${success ? 'published' : 'REJECTED'} - ${message || ''}`);
      }
    } catch (error) {
      console.error('Error parsing message:', error);
    }
  }

  subscribe(subId, filters, callback, onEose = null) {
    if (!this.connected) return;

    this.eventCallbacks.set(subId, callback);
    if (onEose) {
      this.eoseCallbacks.set(subId, onEose);
    }
    const msg = JSON.stringify(['REQ', subId, ...filters]);
    this.ws.send(msg);
    this.subscriptions.set(subId, filters);
  }

  unsubscribe(subId) {
    if (!this.connected) return;

    this.eventCallbacks.delete(subId);
    this.subscriptions.delete(subId);
    const msg = JSON.stringify(['CLOSE', subId]);
    this.ws.send(msg);
  }

  publish(event) {
    if (!this.connected) return false;

    const msg = JSON.stringify(['EVENT', event]);
    this.ws.send(msg);
    return true;
  }

  close() {
    if (this.ws) {
      this.ws.close();
    }
  }
}

// Main Nostr client for Barc
class BarcNostrClient {
  constructor() {
    this.relays = [];
    this.privateKey = null;
    this.publicKey = null;
    this.currentChannelId = null;
    this.currentUrl = null;
    this.messageCallback = null;
    this.presenceCallback = null;
    this.globalActivityCallback = null;
    this.dmCallback = null;
    this.users = new Map();
    this.dmConversations = new Map();
    this.globalActivity = new Map();
    this.seenMessageIds = new Set();
    this.pendingMessages = [];
  }

  async init(savedPrivateKey = null) {
    if (savedPrivateKey) {
      this.privateKey = savedPrivateKey;
    } else {
      this.privateKey = generatePrivateKey();
    }
    this.publicKey = getPublicKey(this.privateKey);

    const connectionPromises = DEFAULT_RELAYS.map(async (url) => {
      const relay = new NostrRelay(url);
      try {
        await relay.connect();
        this.relays.push(relay);
        console.log(`Successfully connected to ${url}`);
        return true;
      } catch (error) {
        console.warn(`Failed to connect to ${url}:`, error);
        return false;
      }
    });

    await Promise.allSettled(connectionPromises);
    console.log(`Connected to ${this.relays.filter(r => r.connected).length}/${DEFAULT_RELAYS.length} relays`);

    this.subscribeToGlobalActivity();
    this.subscribeToDMs();

    return { privateKey: this.privateKey, publicKey: this.publicKey };
  }

  subscribeToDMs() {
    const filters = [
      {
        kinds: [4],
        '#p': [this.publicKey],
        since: Math.floor(Date.now() / 1000) - 86400
      },
      {
        kinds: [4],
        authors: [this.publicKey],
        since: Math.floor(Date.now() / 1000) - 86400
      }
    ];

    for (const relay of this.relays) {
      relay.subscribe('barc-dms', filters, (event) => {
        this.handleDMEvent(event);
      });
    }
  }

  async handleDMEvent(event) {
    if (event.kind !== 4) return;

    const isFromMe = event.pubkey === this.publicKey;
    let otherPubkey;

    if (isFromMe) {
      const pTag = event.tags.find(t => t[0] === 'p');
      if (!pTag) return;
      otherPubkey = pTag[1];
    } else {
      otherPubkey = event.pubkey;
    }

    let plaintext;
    try {
      plaintext = await nip04Decrypt(this.privateKey, otherPubkey, event.content);
    } catch (error) {
      console.error('Failed to decrypt DM:', error);
      return;
    }

    const dm = {
      id: event.id,
      pubkey: event.pubkey,
      otherPubkey,
      content: plaintext,
      timestamp: event.created_at * 1000,
      isOwn: isFromMe
    };

    if (!this.dmConversations.has(otherPubkey)) {
      this.dmConversations.set(otherPubkey, []);
    }
    const conversation = this.dmConversations.get(otherPubkey);

    if (!conversation.find(m => m.id === dm.id)) {
      conversation.push(dm);
      conversation.sort((a, b) => a.timestamp - b.timestamp);

      if (this.dmCallback) {
        this.dmCallback(dm, otherPubkey);
      }
    }
  }

  async sendDM(recipientPubkey, plaintext) {
    if (!plaintext.trim()) return null;

    const encryptedContent = await nip04Encrypt(this.privateKey, recipientPubkey, plaintext);

    const event = await createEvent(
      this.privateKey,
      4,
      encryptedContent,
      [['p', recipientPubkey]]
    );

    let published = false;
    for (const relay of this.relays) {
      if (relay.publish(event)) {
        published = true;
      }
    }

    if (!published) {
      console.error('sendDM: Failed to publish to any relay');
      return null;
    }

    const dm = {
      id: event.id,
      pubkey: this.publicKey,
      otherPubkey: recipientPubkey,
      content: plaintext,
      timestamp: event.created_at * 1000,
      isOwn: true
    };

    if (!this.dmConversations.has(recipientPubkey)) {
      this.dmConversations.set(recipientPubkey, []);
    }
    this.dmConversations.get(recipientPubkey).push(dm);

    if (this.dmCallback) {
      this.dmCallback(dm, recipientPubkey);
    }

    return event;
  }

  getDMConversation(pubkey) {
    return this.dmConversations.get(pubkey) || [];
  }

  getDMConversations() {
    const conversations = [];
    for (const [pubkey, messages] of this.dmConversations) {
      if (messages.length > 0) {
        const lastMessage = messages[messages.length - 1];
        conversations.push({
          pubkey,
          name: this.getUserName(pubkey),
          lastMessage: lastMessage.content,
          timestamp: lastMessage.timestamp,
          unread: messages.filter(m => !m.isOwn && !m.read).length
        });
      }
    }
    return conversations.sort((a, b) => b.timestamp - a.timestamp);
  }

  onDM(callback) {
    this.dmCallback = callback;
  }

  subscribeToGlobalActivity() {
    const filters = [
      {
        kinds: [10042],
        since: Math.floor(Date.now() / 1000) - 300
      }
    ];

    for (const relay of this.relays) {
      relay.subscribe('barc-global', filters, (event) => {
        this.handleGlobalPresence(event);
      });
    }
  }

  handleGlobalPresence(event) {
    try {
      const data = JSON.parse(event.content);
      const url = data.url;
      if (!url) return;

      if (!this.globalActivity.has(url)) {
        this.globalActivity.set(url, { users: new Map(), lastUpdate: 0 });
      }

      const activity = this.globalActivity.get(url);
      activity.users.set(event.pubkey, {
        name: data.name || event.pubkey.slice(0, 8),
        lastSeen: event.created_at * 1000
      });
      activity.lastUpdate = Date.now();

      if (this.globalActivityCallback) {
        this.globalActivityCallback(this.getGlobalActivity());
      }
    } catch {}
  }

  getGlobalActivity() {
    const now = Date.now();
    const active = [];

    for (const [url, activity] of this.globalActivity) {
      let activeCount = 0;
      const activeUsers = [];

      for (const [pubkey, data] of activity.users) {
        if (now - data.lastSeen < 300000) {
          activeCount++;
          activeUsers.push({
            pubkey,
            name: data.name,
            isYou: pubkey === this.publicKey
          });
        }
      }

      if (activeCount > 0) {
        active.push({
          url,
          userCount: activeCount,
          users: activeUsers,
          isCurrentPage: url === this.currentUrl
        });
      }
    }

    active.sort((a, b) => b.userCount - a.userCount);
    return active;
  }

  onGlobalActivity(callback) {
    this.globalActivityCallback = callback;
  }

  async joinChannel(url) {
    this.currentUrl = url;
    this.currentChannelId = await urlToChannelId(url);
    this.pendingMessages = [];
    this.seenMessageIds.clear();

    console.log('Joining channel:', this.currentChannelId, 'for URL:', url);

    const oneWeekAgo = Math.floor(Date.now() / 1000) - (7 * 24 * 60 * 60);
    const filters = [
      {
        kinds: [42],
        '#d': [this.currentChannelId],
        since: oneWeekAgo,
        limit: 10
      },
      {
        kinds: [10042],
        '#d': [this.currentChannelId],
        since: Math.floor(Date.now() / 1000) - 300
      }
    ];
    console.log('Subscribing with filters:', JSON.stringify(filters));

    const connectedRelays = this.relays.filter(r => r.connected);
    if (connectedRelays.length === 0) {
      return { channelId: this.currentChannelId, messages: [] };
    }

    const eosePromise = new Promise((resolve) => {
      let resolved = false;
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          resolve();
        }
      }, 3000);

      for (const relay of connectedRelays) {
        relay.subscribe(`barc-${this.currentChannelId}`, filters, (event) => {
          this.handleEvent(event, true);
        }, () => {
          if (!resolved) {
            resolved = true;
            clearTimeout(timeout);
            resolve();
          }
        });
      }
    });

    await eosePromise;

    this.pendingMessages.sort((a, b) => a.timestamp - b.timestamp);
    const messages = [...this.pendingMessages];
    this.pendingMessages = [];

    console.log('joinChannel: Got', messages.length, 'messages after EOSE');

    await this.announcePresence();

    return { channelId: this.currentChannelId, messages };
  }

  leaveChannel() {
    if (this.currentChannelId) {
      for (const relay of this.relays) {
        relay.unsubscribe(`barc-${this.currentChannelId}`);
      }
      this.currentChannelId = null;
      this.users.clear();
    }
  }

  async fetchMessages(url, since = null, until = null, limit = 10) {
    const channelId = await urlToChannelId(url);
    const collectedMessages = [];
    const seenIds = new Set();

    const defaultSince = Math.floor(Date.now() / 1000) - (30 * 24 * 60 * 60);
    const filter = {
      kinds: [42],
      '#d': [channelId],
      since: since || defaultSince,
      limit: limit
    };

    if (until) {
      filter.until = until;
    }

    const connectedRelays = this.relays.filter(r => r.connected);
    if (connectedRelays.length === 0) {
      return [];
    }

    console.log('Fetching messages with filter:', filter);

    const subId = `search-${Date.now()}`;

    const eosePromise = new Promise((resolve) => {
      let eoseCount = 0;
      const timeout = setTimeout(() => {
        console.log('Search timeout reached');
        resolve();
      }, 5000);

      for (const relay of connectedRelays) {
        relay.subscribe(subId, [filter], (event) => {
          if (!seenIds.has(event.id)) {
            seenIds.add(event.id);
            const userName = this.getUserName(event.pubkey);
            collectedMessages.push({
              id: event.id,
              pubkey: event.pubkey,
              name: userName,
              content: event.content,
              timestamp: event.created_at * 1000,
              isOwn: event.pubkey === this.publicKey
            });
          }
        }, () => {
          eoseCount++;
          console.log(`EOSE from relay ${eoseCount}/${connectedRelays.length}`);
          if (eoseCount >= connectedRelays.length) {
            clearTimeout(timeout);
            resolve();
          }
        });
      }
    });

    await eosePromise;

    for (const relay of connectedRelays) {
      relay.unsubscribe(subId);
    }

    collectedMessages.sort((a, b) => a.timestamp - b.timestamp);

    console.log(`Found ${collectedMessages.length} messages`);
    return collectedMessages;
  }

  handleEvent(event, collecting = false) {
    console.log('handleEvent received:', event.kind, event.id?.slice(0, 8), 'collecting:', collecting);

    if (event.kind === 42) {
      if (this.seenMessageIds.has(event.id)) return;
      this.seenMessageIds.add(event.id);

      const userName = this.getUserName(event.pubkey);
      const message = {
        id: event.id,
        pubkey: event.pubkey,
        name: userName,
        content: event.content,
        timestamp: event.created_at * 1000,
        isOwn: event.pubkey === this.publicKey
      };

      if (collecting) {
        this.pendingMessages.push(message);
      } else if (this.messageCallback) {
        this.messageCallback(message);
      }
    } else if (event.kind === 10042) {
      try {
        const data = JSON.parse(event.content);
        this.users.set(event.pubkey, {
          name: data.name || event.pubkey.slice(0, 8),
          lastSeen: event.created_at * 1000
        });
        if (this.presenceCallback) {
          this.presenceCallback(this.getActiveUsers());
        }
      } catch {}
    }
  }

  getUserName(pubkey) {
    const user = this.users.get(pubkey);
    return user?.name || pubkey.slice(0, 8);
  }

  getActiveUsers() {
    const now = Date.now();
    const active = [];
    for (const [pubkey, data] of this.users) {
      if (now - data.lastSeen < 300000) {
        active.push({
          pubkey,
          name: data.name,
          isYou: pubkey === this.publicKey
        });
      }
    }
    return active;
  }

  async announcePresence(name = null) {
    if (!this.currentChannelId || !this.publicKey) return;

    const displayName = name || `User-${this.publicKey.slice(0, 6)}`;

    const content = JSON.stringify({
      name: displayName,
      url: this.currentUrl,
      action: 'join'
    });

    const event = await createEvent(
      this.privateKey,
      10042,
      content,
      [['d', this.currentChannelId]]
    );

    for (const relay of this.relays) {
      relay.publish(event);
    }

    this.users.set(this.publicKey, {
      name: displayName,
      lastSeen: Date.now()
    });

    if (this.currentUrl) {
      if (!this.globalActivity.has(this.currentUrl)) {
        this.globalActivity.set(this.currentUrl, { users: new Map(), lastUpdate: 0 });
      }
      const activity = this.globalActivity.get(this.currentUrl);
      activity.users.set(this.publicKey, {
        name: displayName,
        lastSeen: Date.now()
      });
    }
  }

  async sendMessage(content, url = null) {
    // Use provided URL or fall back to current channel
    const channelId = url ? await urlToChannelId(url) : this.currentChannelId;

    console.log('sendMessage: url=', url, 'channelId=', channelId, 'currentChannelId=', this.currentChannelId);

    if (!channelId || !content.trim()) {
      console.error('sendMessage: No channel or empty content');
      return null;
    }

    const connectedRelays = this.relays.filter(r => r.connected);
    if (connectedRelays.length === 0) {
      console.error('sendMessage: No relays connected');
      return null;
    }

    const event = await createEvent(
      this.privateKey,
      42,
      content,
      [['d', channelId]]
    );

    let published = false;
    for (const relay of connectedRelays) {
      if (relay.publish(event)) {
        published = true;
      }
    }

    if (!published) {
      console.error('sendMessage: Failed to publish to any relay');
      return null;
    }

    if (this.messageCallback) {
      this.messageCallback({
        id: event.id,
        pubkey: event.pubkey,
        name: this.getUserName(event.pubkey),
        content: event.content,
        timestamp: event.created_at * 1000,
        isOwn: true
      });
    }

    return event;
  }

  onMessage(callback) {
    this.messageCallback = callback;
  }

  onPresence(callback) {
    this.presenceCallback = callback;
  }

  // Post to someone's wall (HomeScreen) - uses p-tag to reference the wall owner
  // This is a bare-bones post to a pubkey address
  async postToWall(targetPubkey, content) {
    if (!content.trim()) {
      console.error('postToWall: Empty content');
      return null;
    }

    const connectedRelays = this.relays.filter(r => r.connected);
    if (connectedRelays.length === 0) {
      console.error('postToWall: No relays connected');
      return null;
    }

    // Use kind 1 (short text note) with p-tag pointing to the wall owner
    // This keeps it as simple as possible while still being addressable
    const event = await createEvent(
      this.privateKey,
      1, // Standard text note
      content,
      [
        ['p', targetPubkey], // Reference to whose wall this is on
        ['barc-wall', targetPubkey] // Custom tag to identify wall posts
      ]
    );

    let published = false;
    for (const relay of connectedRelays) {
      if (relay.publish(event)) {
        published = true;
      }
    }

    if (!published) {
      console.error('postToWall: Failed to publish to any relay');
      return null;
    }

    return event;
  }

  // Fetch posts that mention/tag a pubkey (from other users)
  async fetchMentions(targetPubkey, limit = 50) {
    const connectedRelays = this.relays.filter(r => r.connected);
    if (connectedRelays.length === 0) {
      return [];
    }

    const posts = [];
    const seenIds = new Set();

    // Query for events that tag this pubkey (NIP-01 p-tag)
    // Common kinds: 1 (text note), 6 (repost), 7 (reaction), 9735 (zap receipt)
    const filter = {
      kinds: [1, 6, 7, 9735],
      '#p': [targetPubkey],
      limit
    };

    const fetchPromises = connectedRelays.map(relay => {
      return new Promise((resolve) => {
        const timeout = setTimeout(() => resolve(), 5000);

        relay.subscribe(filter, (event) => {
          if (!seenIds.has(event.id)) {
            seenIds.add(event.id);
            posts.push(this.parseEventToPost(event));
          }
        }, () => {
          clearTimeout(timeout);
          resolve();
        });
      });
    });

    await Promise.all(fetchPromises);

    // Sort by timestamp descending (newest first)
    posts.sort((a, b) => b.timestamp - a.timestamp);

    return posts;
  }

  // Fetch posts authored by a pubkey (their own posts)
  async fetchUserPosts(targetPubkey, limit = 50) {
    const connectedRelays = this.relays.filter(r => r.connected);
    if (connectedRelays.length === 0) {
      return [];
    }

    const posts = [];
    const seenIds = new Set();

    // Query for events authored by this pubkey
    // Common kinds: 1 (text note), 6 (repost), 30023 (long-form)
    const filter = {
      kinds: [1, 6, 30023],
      authors: [targetPubkey],
      limit
    };

    const fetchPromises = connectedRelays.map(relay => {
      return new Promise((resolve) => {
        const timeout = setTimeout(() => resolve(), 5000);

        relay.subscribe(filter, (event) => {
          if (!seenIds.has(event.id)) {
            seenIds.add(event.id);
            posts.push(this.parseEventToPost(event));
          }
        }, () => {
          clearTimeout(timeout);
          resolve();
        });
      });
    });

    await Promise.all(fetchPromises);

    // Sort by timestamp descending (newest first)
    posts.sort((a, b) => b.timestamp - a.timestamp);

    return posts;
  }

  // Parse a raw Nostr event into a structured post object
  parseEventToPost(event) {
    const post = {
      id: event.id,
      pubkey: event.pubkey,
      name: this.getUserName(event.pubkey),
      content: event.content,
      timestamp: event.created_at * 1000,
      kind: event.kind,
      kindLabel: this.getKindLabel(event.kind),
      tags: event.tags,
      isOwn: event.pubkey === this.publicKey,
      images: [],
      links: [],
      mentionedPubkeys: []
    };

    // Extract images from content (common image URLs)
    const imageRegex = /(https?:\/\/[^\s]+\.(?:jpg|jpeg|png|gif|webp))/gi;
    const imageMatches = event.content.match(imageRegex);
    if (imageMatches) {
      post.images = [...new Set(imageMatches)];
    }

    // Extract links from content
    const linkRegex = /(https?:\/\/[^\s]+)/gi;
    const linkMatches = event.content.match(linkRegex);
    if (linkMatches) {
      post.links = [...new Set(linkMatches)].filter(l => !post.images.includes(l));
    }

    // Extract mentioned pubkeys from p-tags
    for (const tag of event.tags) {
      if (tag[0] === 'p' && tag[1]) {
        post.mentionedPubkeys.push(tag[1]);
      }
    }

    // For reposts (kind 6), the content might be the original event JSON
    if (event.kind === 6 && event.content) {
      try {
        const originalEvent = JSON.parse(event.content);
        post.repostedEvent = this.parseEventToPost(originalEvent);
      } catch {
        // Content isn't valid JSON, just use as is
      }
    }

    // For reactions (kind 7), content is the reaction emoji
    if (event.kind === 7) {
      post.reaction = event.content || '+';
      // Find what event they're reacting to
      for (const tag of event.tags) {
        if (tag[0] === 'e' && tag[1]) {
          post.reactedToEventId = tag[1];
          break;
        }
      }
    }

    // For zap receipts (kind 9735), extract amount
    if (event.kind === 9735) {
      for (const tag of event.tags) {
        if (tag[0] === 'bolt11' && tag[1]) {
          // Basic extraction of amount from bolt11 invoice
          post.zapInvoice = tag[1];
        }
        if (tag[0] === 'description' && tag[1]) {
          try {
            const zapRequest = JSON.parse(tag[1]);
            post.zapMessage = zapRequest.content;
          } catch {
            // Not valid JSON
          }
        }
      }
    }

    return post;
  }

  // Get human-readable label for event kind
  getKindLabel(kind) {
    const kinds = {
      1: 'note',
      6: 'repost',
      7: 'reaction',
      9735: 'zap',
      30023: 'article'
    };
    return kinds[kind] || `kind ${kind}`;
  }

  // Keep old method for backwards compatibility
  async fetchWallPosts(targetPubkey, limit = 50) {
    return this.fetchMentions(targetPubkey, limit);
  }

  disconnect() {
    this.leaveChannel();
    for (const relay of this.relays) {
      relay.close();
    }
    this.relays = [];
  }
}

// Export for use in extension
export { BarcNostrClient, generatePrivateKey, getPublicKey, DEFAULT_RELAYS };
