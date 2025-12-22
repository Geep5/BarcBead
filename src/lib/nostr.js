// Minimal Nostr implementation - no dependencies
// Uses basic Nostr protocol: NIP-01 for events, custom tags for URL channels

const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.primal.net'
];

// Generate a random private key (32 bytes hex)
function generatePrivateKey() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Derive public key from private key using secp256k1
// We'll use the Web Crypto API with a workaround since it doesn't support secp256k1 directly
// For now, we use a minimal implementation

// secp256k1 curve parameters
const CURVE = {
  p: 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn,
  n: 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n,
  Gx: 0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798n,
  Gy: 0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8n
};

function mod(a, b = CURVE.p) {
  const result = a % b;
  return result >= 0n ? result : b + result;
}

function modInverse(a, m = CURVE.p) {
  let [old_r, r] = [a, m];
  let [old_s, s] = [1n, 0n];
  while (r !== 0n) {
    const q = old_r / r;
    [old_r, r] = [r, old_r - q * r];
    [old_s, s] = [s, old_s - q * s];
  }
  return mod(old_s, m);
}

function pointAdd(p1, p2) {
  if (p1 === null) return p2;
  if (p2 === null) return p1;
  const [x1, y1] = p1;
  const [x2, y2] = p2;
  if (x1 === x2) {
    if (y1 !== y2) return null;
    const s = mod(3n * x1 * x1 * modInverse(2n * y1));
    const x3 = mod(s * s - 2n * x1);
    const y3 = mod(s * (x1 - x3) - y1);
    return [x3, y3];
  }
  const s = mod((y2 - y1) * modInverse(x2 - x1));
  const x3 = mod(s * s - x1 - x2);
  const y3 = mod(s * (x1 - x3) - y1);
  return [x3, y3];
}

function pointMultiply(k, point = [CURVE.Gx, CURVE.Gy]) {
  let result = null;
  let addend = point;
  while (k > 0n) {
    if (k & 1n) {
      result = pointAdd(result, addend);
    }
    addend = pointAdd(addend, addend);
    k >>= 1n;
  }
  return result;
}

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function getPublicKey(privateKeyHex) {
  const privateKey = BigInt('0x' + privateKeyHex);
  const point = pointMultiply(privateKey);
  const x = point[0].toString(16).padStart(64, '0');
  return x;
}

async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  return bytesToHex(new Uint8Array(hashBuffer));
}

// Schnorr signature (BIP340)
async function signSchnorr(messageHash, privateKeyHex) {
  let d = BigInt('0x' + privateKeyHex);

  // BIP340: If P.y is odd, negate d
  const P = pointMultiply(d);
  if (P[1] % 2n !== 0n) {
    d = CURVE.n - d;
  }
  const pHex = P[0].toString(16).padStart(64, '0');

  // Generate deterministic k using tagged hash
  // aux_rand is zeros for simplicity
  const auxRand = '0'.repeat(64);
  const t = xorHex(d.toString(16).padStart(64, '0'), await taggedHash('BIP0340/aux', auxRand));
  const kData = t + pHex + messageHash;
  const kHash = await taggedHash('BIP0340/nonce', kData);
  let k = mod(BigInt('0x' + kHash), CURVE.n);
  if (k === 0n) k = 1n;

  const R = pointMultiply(k);
  if (R[1] % 2n !== 0n) {
    k = CURVE.n - k;
  }

  const rHex = R[0].toString(16).padStart(64, '0');

  const eData = rHex + pHex + messageHash;
  const eHash = await taggedHash('BIP0340/challenge', eData);
  const e = mod(BigInt('0x' + eHash), CURVE.n);

  const s = mod(k + e * d, CURVE.n);
  const sHex = s.toString(16).padStart(64, '0');

  return rHex + sHex;
}

// BIP340 tagged hash - hash(SHA256(tag) || SHA256(tag) || msg)
async function taggedHash(tag, msgHex) {
  const tagHash = await sha256(tag);
  // Concatenate: tagHash (hex) + tagHash (hex) + msg (hex) -> all as bytes
  const combined = hexToBytes(tagHash + tagHash + msgHex);
  const hashBuffer = await crypto.subtle.digest('SHA-256', combined);
  return bytesToHex(new Uint8Array(hashBuffer));
}

// XOR two hex strings
function xorHex(a, b) {
  let result = '';
  for (let i = 0; i < 64; i += 2) {
    const byteA = parseInt(a.substr(i, 2), 16);
    const byteB = parseInt(b.substr(i, 2), 16);
    result += (byteA ^ byteB).toString(16).padStart(2, '0');
  }
  return result;
}

// NIP-04: Encrypted Direct Messages
// Uses ECDH to derive shared secret, then AES-256-CBC

// Compute ECDH shared point (privateKey * recipientPubKey)
function computeSharedPoint(privateKeyHex, recipientPubKeyHex) {
  const privateKey = BigInt('0x' + privateKeyHex);
  // Recipient pubkey is x-coordinate only, need to recover y
  const x = BigInt('0x' + recipientPubKeyHex);
  // y² = x³ + 7 (secp256k1)
  const y2 = mod(mod(x * x * x, CURVE.p) + 7n, CURVE.p);
  // Compute sqrt using Tonelli-Shanks (p ≡ 3 mod 4 for secp256k1)
  let y = modPow(y2, (CURVE.p + 1n) / 4n, CURVE.p);
  // Choose even y (standard convention for ECDH)
  if (y % 2n !== 0n) {
    y = CURVE.p - y;
  }
  const recipientPoint = [x, y];
  const sharedPoint = pointMultiply(privateKey, recipientPoint);
  return sharedPoint[0].toString(16).padStart(64, '0');
}

// Modular exponentiation
function modPow(base, exp, mod) {
  let result = 1n;
  base = base % mod;
  while (exp > 0n) {
    if (exp % 2n === 1n) {
      result = (result * base) % mod;
    }
    exp = exp / 2n;
    base = (base * base) % mod;
  }
  return result;
}

// Encrypt message using NIP-04 (AES-256-CBC)
async function nip04Encrypt(privateKeyHex, recipientPubKeyHex, plaintext) {
  const sharedX = computeSharedPoint(privateKeyHex, recipientPubKeyHex);
  const sharedSecret = hexToBytes(sharedX);

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

// Decrypt message using NIP-04 (AES-256-CBC)
async function nip04Decrypt(privateKeyHex, senderPubKeyHex, encryptedContent) {
  const sharedX = computeSharedPoint(privateKeyHex, senderPubKeyHex);
  const sharedSecret = hexToBytes(sharedX);

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

async function createEvent(privateKey, kind, content, tags = []) {
  const pubkey = getPublicKey(privateKey);
  const created_at = Math.floor(Date.now() / 1000);

  const eventData = [0, pubkey, created_at, kind, tags, content];
  const serialized = JSON.stringify(eventData);
  const id = await sha256(serialized);

  const sig = await signSchnorr(id, privateKey);

  return {
    id,
    pubkey,
    created_at,
    kind,
    tags,
    content,
    sig
  };
}

// URL to channel ID - hash the normalized URL
async function urlToChannelId(url) {
  try {
    const parsed = new URL(url);
    // Normalize: remove hash, some query params, trailing slashes
    const normalized = parsed.origin + parsed.pathname.replace(/\/$/, '');
    return await sha256(normalized);
  } catch {
    return await sha256(url);
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
    this.eoseCallbacks = new Map(); // Called when historical events are done
  }

  connect() {
    return new Promise((resolve, reject) => {
      // Timeout after 5 seconds
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
        // End of stored events - notify caller that historical fetch is complete
        const [subId] = rest;
        const eoseCallback = this.eoseCallbacks.get(subId);
        if (eoseCallback) {
          eoseCallback();
          this.eoseCallbacks.delete(subId);
        }
      } else if (type === 'OK') {
        // Event published successfully
        const [eventId, success, message] = rest;
        console.log(`Event ${eventId}: ${success ? 'published' : 'failed'} - ${message || ''}`);
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
    this.users = new Map(); // pubkey -> { name, lastSeen }
    this.dmConversations = new Map(); // pubkey -> [messages]
    this.globalActivity = new Map(); // url -> { users: Map, lastUpdate }
    this.seenMessageIds = new Set(); // Dedup messages across relays
    this.pendingMessages = []; // Messages collected during initial fetch
  }

  async init(savedPrivateKey = null) {
    // Load or generate keypair
    if (savedPrivateKey) {
      this.privateKey = savedPrivateKey;
    } else {
      this.privateKey = generatePrivateKey();
    }
    this.publicKey = getPublicKey(this.privateKey);

    // Connect to relays
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

    // Subscribe to global presence events to see activity across all URLs
    this.subscribeToGlobalActivity();

    // Subscribe to DMs addressed to us
    this.subscribeToDMs();

    return { privateKey: this.privateKey, publicKey: this.publicKey };
  }

  subscribeToDMs() {
    // Subscribe to kind 4 (encrypted DM) events where we are the recipient
    const filters = [
      {
        kinds: [4], // Encrypted DM
        '#p': [this.publicKey], // Addressed to us
        since: Math.floor(Date.now() / 1000) - 86400 // Last 24 hours
      },
      {
        kinds: [4], // Encrypted DM
        authors: [this.publicKey], // Sent by us (to show our own messages)
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

    // Determine the other party in the conversation
    const isFromMe = event.pubkey === this.publicKey;
    let otherPubkey;

    if (isFromMe) {
      // Find recipient from p tag
      const pTag = event.tags.find(t => t[0] === 'p');
      if (!pTag) return;
      otherPubkey = pTag[1];
    } else {
      otherPubkey = event.pubkey;
    }

    // Decrypt the message
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

    // Store in conversation
    if (!this.dmConversations.has(otherPubkey)) {
      this.dmConversations.set(otherPubkey, []);
    }
    const conversation = this.dmConversations.get(otherPubkey);

    // Avoid duplicates
    if (!conversation.find(m => m.id === dm.id)) {
      conversation.push(dm);
      conversation.sort((a, b) => a.timestamp - b.timestamp);

      // Notify callback
      if (this.dmCallback) {
        this.dmCallback(dm, otherPubkey);
      }
    }
  }

  async sendDM(recipientPubkey, plaintext) {
    if (!plaintext.trim()) return null;

    // Encrypt the message
    const encryptedContent = await nip04Encrypt(this.privateKey, recipientPubkey, plaintext);

    // Create kind 4 event with p tag for recipient
    const event = await createEvent(
      this.privateKey,
      4, // Encrypted DM kind
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

    // Add to our conversation immediately
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
    // Return list of conversations with last message
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
    // Subscribe to ALL presence events (kind 10042) to see where people are
    const filters = [
      {
        kinds: [10042], // Presence events
        since: Math.floor(Date.now() / 1000) - 300 // Last 5 min
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

      // Get or create activity entry for this URL
      if (!this.globalActivity.has(url)) {
        this.globalActivity.set(url, { users: new Map(), lastUpdate: 0 });
      }

      const activity = this.globalActivity.get(url);
      activity.users.set(event.pubkey, {
        name: data.name || event.pubkey.slice(0, 8),
        lastSeen: event.created_at * 1000
      });
      activity.lastUpdate = Date.now();

      // Notify callback
      if (this.globalActivityCallback) {
        this.globalActivityCallback(this.getGlobalActivity());
      }
    } catch {}
  }

  getGlobalActivity() {
    const now = Date.now();
    const active = [];

    for (const [url, activity] of this.globalActivity) {
      // Count active users (seen in last 5 min)
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

    // Sort by user count descending
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

    // Subscribe to channel messages
    // Using kind 42 (channel message) with 'd' tag for channel ID
    const filters = [
      {
        kinds: [42], // Channel message
        '#d': [this.currentChannelId],
        since: Math.floor(Date.now() / 1000) - 3600 // Last hour
      },
      {
        kinds: [10042], // Presence (ephemeral-ish)
        '#d': [this.currentChannelId],
        since: Math.floor(Date.now() / 1000) - 300 // Last 5 min
      }
    ];

    // Wait for at least one relay to finish sending historical events
    const connectedRelays = this.relays.filter(r => r.connected);
    if (connectedRelays.length === 0) {
      return { channelId: this.currentChannelId, messages: [] };
    }

    // Create a promise that resolves when first relay sends EOSE
    const eosePromise = new Promise((resolve) => {
      let resolved = false;
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          resolve();
        }
      }, 3000); // 3 second timeout

      for (const relay of connectedRelays) {
        relay.subscribe(`barc-${this.currentChannelId}`, filters, (event) => {
          this.handleEvent(event, true); // true = collecting history
        }, () => {
          // EOSE callback - historical events done
          if (!resolved) {
            resolved = true;
            clearTimeout(timeout);
            resolve();
          }
        });
      }
    });

    await eosePromise;

    // Sort collected messages by timestamp
    this.pendingMessages.sort((a, b) => a.timestamp - b.timestamp);
    const messages = [...this.pendingMessages];
    this.pendingMessages = [];

    // Announce presence
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

  handleEvent(event, collecting = false) {
    if (event.kind === 42) {
      // Skip if we've already seen this message (dedup across relays)
      if (this.seenMessageIds.has(event.id)) return;
      this.seenMessageIds.add(event.id);

      // Chat message
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
        // Collecting historical messages during joinChannel
        this.pendingMessages.push(message);
      } else if (this.messageCallback) {
        // Real-time message after EOSE
        this.messageCallback(message);
      }
    } else if (event.kind === 10042) {
      // Presence update
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
      if (now - data.lastSeen < 300000) { // Active in last 5 min
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
      url: this.currentUrl, // Include URL so others can see where we are
      action: 'join'
    });

    const event = await createEvent(
      this.privateKey,
      10042, // Presence kind
      content,
      [['d', this.currentChannelId]]
    );

    for (const relay of this.relays) {
      relay.publish(event);
    }

    // Also add self to users
    this.users.set(this.publicKey, {
      name: displayName,
      lastSeen: Date.now()
    });

    // Update global activity for self
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

  async sendMessage(content) {
    if (!this.currentChannelId || !content.trim()) {
      console.error('sendMessage: No channel joined or empty content');
      return null;
    }

    // Check if any relay is connected
    const connectedRelays = this.relays.filter(r => r.connected);
    if (connectedRelays.length === 0) {
      console.error('sendMessage: No relays connected');
      return null;
    }

    const event = await createEvent(
      this.privateKey,
      42, // Channel message kind
      content,
      [['d', this.currentChannelId]]
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

    // Also trigger our own message callback so the message appears immediately
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

  disconnect() {
    this.leaveChannel();
    for (const relay of this.relays) {
      relay.close();
    }
    this.relays = [];
  }
}

// Export for use in extension
if (typeof window !== 'undefined') {
  window.BarcNostrClient = BarcNostrClient;
  window.generatePrivateKey = generatePrivateKey;
  window.getPublicKey = getPublicKey;
}

export { BarcNostrClient, generatePrivateKey, getPublicKey, DEFAULT_RELAYS };
