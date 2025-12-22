// Minimal Nostr implementation - no dependencies
// Uses basic Nostr protocol: NIP-01 for events, custom tags for URL channels

const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.nostr.band'
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

// Schnorr signature (simplified BIP340)
async function signSchnorr(messageHash, privateKeyHex) {
  const d = BigInt('0x' + privateKeyHex);
  const msgHash = BigInt('0x' + messageHash);

  // Generate deterministic k using hash of private key + message
  const kData = privateKeyHex + messageHash;
  const kHash = await sha256(kData);
  let k = mod(BigInt('0x' + kHash), CURVE.n);
  if (k === 0n) k = 1n;

  const R = pointMultiply(k);
  if (R[1] % 2n !== 0n) {
    k = CURVE.n - k;
  }

  const rHex = R[0].toString(16).padStart(64, '0');
  const P = pointMultiply(d);
  const pHex = P[0].toString(16).padStart(64, '0');

  const eData = rHex + pHex + messageHash;
  const eHash = await sha256(eData);
  const e = mod(BigInt('0x' + eHash), CURVE.n);

  const s = mod(k + e * d, CURVE.n);
  const sHex = s.toString(16).padStart(64, '0');

  return rHex + sHex;
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
  }

  connect() {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);

        this.ws.onopen = () => {
          this.connected = true;
          this.reconnectAttempts = 0;
          console.log(`Connected to relay: ${this.url}`);
          resolve();
        };

        this.ws.onclose = () => {
          this.connected = false;
          console.log(`Disconnected from relay: ${this.url}`);
          this.attemptReconnect();
        };

        this.ws.onerror = (error) => {
          console.error(`Relay error (${this.url}):`, error);
          reject(error);
        };

        this.ws.onmessage = (msg) => {
          this.handleMessage(msg.data);
        };
      } catch (error) {
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
        // End of stored events - can ignore for real-time chat
      } else if (type === 'OK') {
        // Event published successfully
        const [eventId, success, message] = rest;
        console.log(`Event ${eventId}: ${success ? 'published' : 'failed'} - ${message || ''}`);
      }
    } catch (error) {
      console.error('Error parsing message:', error);
    }
  }

  subscribe(subId, filters, callback) {
    if (!this.connected) return;

    this.eventCallbacks.set(subId, callback);
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
    this.messageCallback = null;
    this.presenceCallback = null;
    this.users = new Map(); // pubkey -> { name, lastSeen }
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
    for (const url of DEFAULT_RELAYS) {
      const relay = new NostrRelay(url);
      try {
        await relay.connect();
        this.relays.push(relay);
      } catch (error) {
        console.warn(`Failed to connect to ${url}:`, error);
      }
    }

    return { privateKey: this.privateKey, publicKey: this.publicKey };
  }

  async joinChannel(url) {
    this.currentChannelId = await urlToChannelId(url);

    // Subscribe to channel messages
    // Using kind 42 (channel message) with 'u' tag for URL channel
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

    for (const relay of this.relays) {
      relay.subscribe(`barc-${this.currentChannelId}`, filters, (event) => {
        this.handleEvent(event);
      });
    }

    // Announce presence
    await this.announcePresence();

    return this.currentChannelId;
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

  handleEvent(event) {
    if (event.kind === 42) {
      // Chat message
      const userName = this.getUserName(event.pubkey);
      if (this.messageCallback) {
        this.messageCallback({
          id: event.id,
          pubkey: event.pubkey,
          name: userName,
          content: event.content,
          timestamp: event.created_at * 1000,
          isOwn: event.pubkey === this.publicKey
        });
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
    if (!this.currentChannelId) return;

    const content = JSON.stringify({
      name: name || `User-${this.publicKey.slice(0, 6)}`,
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
      name: name || `User-${this.publicKey.slice(0, 6)}`,
      lastSeen: Date.now()
    });
  }

  async sendMessage(content) {
    if (!this.currentChannelId || !content.trim()) return null;

    const event = await createEvent(
      this.privateKey,
      42, // Channel message kind
      content,
      [['d', this.currentChannelId]]
    );

    for (const relay of this.relays) {
      relay.publish(event);
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
