// Enhanced Nostr client with universal room support
import { BarcNostrClient, createEvent } from './nostr.js';

export class EnhancedNostrClient extends BarcNostrClient {
  constructor() {
    super();
    this.currentRoomContext = null;
  }

  // Join a universal room (website, users, or both)
  async joinRoom(roomContext) {
    const { website, users = [], subject } = roomContext;

    // Store current room context
    this.currentRoomContext = roomContext;

    // Build filters for this room
    const filters = [{
      kinds: [42, 1], // Chat messages and text notes
      limit: 100,
      since: Math.floor(Date.now() / 1000) - (7 * 24 * 60 * 60) // 1 week
    }];

    // Add website filter
    if (website) {
      filters[0]['#r'] = [website];
      this.currentChannelId = website; // Backward compatibility
    }

    // Add user filters
    if (users.length > 0) {
      filters[0]['#p'] = users;
    }

    // Add subject filter
    if (subject) {
      filters[0]['#subject'] = [subject];
    }

    // Clear previous messages
    this.pendingMessages = [];

    // Subscribe to room (using base class subscribe method)
    // Note: subscribeWithFilters doesn't exist in base class, using subscribe instead

    // Fetch initial messages
    const messages = await this.fetchRoomMessages(roomContext);

    // Announce presence if it's a website room
    if (website) {
      await this.announcePresence();
    }

    return {
      messages: messages,
      users: this.activeUsers
    };
  }

  // Send message with proper tagging for universal rooms
  async sendEnhancedMessage(content, options = {}) {
    const {
      website = this.currentRoomContext?.website,
      users = this.currentRoomContext?.users || [],
      subject = this.currentRoomContext?.subject,
      mentions = [], // Additional user mentions in the message
      replyTo = null, // Reply to another message
      media = [] // Media URLs
    } = options;

    // Parse mentions from content
    const parsedMentions = this.parseMentions(content);
    const allMentions = [...new Set([...mentions, ...parsedMentions])];

    // Build tags
    const tags = [];

    // Add website tag
    if (website) {
      tags.push(['r', website]);
    }

    // Add room participant tags (makes message appear in their profiles)
    users.forEach(pubkey => {
      tags.push(['p', pubkey]);
    });

    // Add mention tags (additional users mentioned in content)
    allMentions.forEach(pubkey => {
      if (!users.includes(pubkey)) {
        tags.push(['p', pubkey, '', 'mention']); // Relay hint empty, 'mention' marker
      }
    });

    // Add subject tag for named rooms
    if (subject) {
      tags.push(['subject', subject]);
    }

    // Add reply tag
    if (replyTo) {
      tags.push(['e', replyTo, '', 'reply']);
    }

    // Add media tags
    media.forEach(url => {
      tags.push(['media', url, this.getMediaType(url)]);
    });

    // Create the event
    const event = await createEvent(
      this.privateKey,
      42, // Chat message kind
      JSON.stringify({
        text: content,
        timestamp: Date.now()
      }),
      tags
    );

    // Publish to relays
    let published = false;
    for (const relay of this.relays.filter(r => r.connected)) {
      if (relay.publish(event)) {
        published = true;
      }
    }

    if (published && this.messageCallback) {
      this.messageCallback({
        id: event.id,
        pubkey: event.pubkey,
        name: this.getUserName(event.pubkey),
        content: content,
        timestamp: event.created_at * 1000,
        isOwn: true,
        tags: tags
      });
    }

    return published ? event : null;
  }

  // Fetch messages for any room configuration
  async fetchRoomMessages(roomContext, limit = 100) {
    const { website, users = [], subject, strict = true } = roomContext;

    const filters = [{
      kinds: [42, 1],
      limit: limit
    }];

    if (website) {
      filters[0]['#r'] = [website];
    }

    if (users.length > 0) {
      filters[0]['#p'] = users;
    }

    if (subject) {
      filters[0]['#subject'] = [subject];
    }

    // Fetch from relays using a simpler approach
    const messages = [];

    // Use existing subscription mechanism from base class
    for (const relay of this.relays) {
      if (!relay.connected) continue;

      // Generate unique subscription ID
      const subId = `room_${Date.now()}_${Math.random().toString(36).substring(7)}`;

      relay.subscribe(subId, filters, (event) => {
        // For strict mode, verify ALL users are tagged
        if (strict && users.length > 0) {
          const taggedUsers = event.tags
            .filter(t => t[0] === 'p')
            .map(t => t[1]);

          const hasAllUsers = users.every(user => taggedUsers.includes(user));
          if (!hasAllUsers) return;

          // If this is a users-only query (no website), exclude messages that have website tags
          // This ensures DM messages don't include website channel messages
          if (!website) {
            const hasWebsiteTag = event.tags.some(t => t[0] === 'r');
            if (hasWebsiteTag) return;
          }
        }

        messages.push(this.formatMessage(event));
      });
    }

    // Wait for messages to come in
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(messages.sort((a, b) => a.timestamp - b.timestamp));
      }, 2000);
    });
  }

  // Discover rooms from user's activity
  async discoverRooms() {
    // Fetch user's recent messages
    const myMessages = [];

    // Use relay subscription to fetch messages
    const filter = {
      kinds: [42, 1],
      authors: [this.publicKey],
      limit: 500
    };

    for (const relay of this.relays) {
      if (!relay.connected) continue;

      // Generate unique subscription ID
      const subId = `discover_${Date.now()}_${Math.random().toString(36).substring(7)}`;

      relay.subscribe(subId, [filter], (event) => {
        myMessages.push(event);
      });
    }

    // Wait for messages
    await new Promise(resolve => setTimeout(resolve, 2000));

    const rooms = {
      websites: new Map(),
      groups: new Map(),
      named: new Map()
    };

    myMessages.forEach(msg => {
      const tags = msg.tags || [];

      // Website rooms
      const websiteTag = tags.find(t => t[0] === 'r');
      if (websiteTag) {
        const url = websiteTag[1];
        if (!rooms.websites.has(url)) {
          rooms.websites.set(url, {
            website: url,
            messageCount: 0,
            lastActivity: 0,
            participants: new Set()
          });
        }
        const room = rooms.websites.get(url);
        room.messageCount++;
        room.lastActivity = Math.max(room.lastActivity, msg.created_at);

        // Track participants
        tags.filter(t => t[0] === 'p').forEach(t => {
          room.participants.add(t[1]);
        });
      }

      // Group rooms (multiple users tagged)
      const userTags = tags.filter(t => t[0] === 'p').map(t => t[1]);
      if (userTags.length > 1) {
        const roomKey = userTags.sort().join(',');
        if (!rooms.groups.has(roomKey)) {
          rooms.groups.set(roomKey, {
            users: userTags,
            messageCount: 0,
            lastActivity: 0
          });
        }
        const room = rooms.groups.get(roomKey);
        room.messageCount++;
        room.lastActivity = Math.max(room.lastActivity, msg.created_at);
      }

      // Named rooms
      const subjectTag = tags.find(t => t[0] === 'subject');
      if (subjectTag) {
        const subject = subjectTag[1];
        if (!rooms.named.has(subject)) {
          rooms.named.set(subject, {
            subject: subject,
            messageCount: 0,
            lastActivity: 0,
            participants: new Set()
          });
        }
        const room = rooms.named.get(subject);
        room.messageCount++;
        room.lastActivity = Math.max(room.lastActivity, msg.created_at);

        // Track participants
        userTags.forEach(pubkey => room.participants.add(pubkey));
      }
    });

    return {
      websites: Array.from(rooms.websites.values()),
      groups: Array.from(rooms.groups.values()),
      named: Array.from(rooms.named.values())
    };
  }

  // Parse @mentions from message text
  parseMentions(text) {
    const mentions = [];
    const regex = /@(npub1[a-z0-9]{58})/g;
    let match;

    while ((match = regex.exec(text)) !== null) {
      try {
        const pubkey = this.npubToPubkey(match[1]);
        if (pubkey) mentions.push(pubkey);
      } catch (e) {
        // Invalid npub, ignore
      }
    }

    return mentions;
  }

  // Get media type from URL
  getMediaType(url) {
    const ext = url.split('.').pop()?.toLowerCase();
    const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
    const videoExts = ['mp4', 'webm', 'mov'];
    const audioExts = ['mp3', 'wav', 'ogg', 'webm'];

    if (imageExts.includes(ext)) return 'image';
    if (videoExts.includes(ext)) return 'video';
    if (audioExts.includes(ext)) return 'audio';
    return 'file';
  }

  // Format message for display
  formatMessage(event) {
    let content = event.content;

    // Try to parse JSON content
    try {
      const parsed = JSON.parse(content);
      content = parsed.text || parsed.content || content;
    } catch {
      // Not JSON, use as-is
    }

    return {
      id: event.id,
      pubkey: event.pubkey,
      name: this.getUserName(event.pubkey),
      content: content,
      timestamp: event.created_at * 1000,
      isOwn: event.pubkey === this.publicKey,
      tags: event.tags || []
    };
  }

  // Post to user's wall (profile post)
  async postToWall(targetPubkey, content) {
    const event = await createEvent(
      this.privateKey,
      1, // Kind 1: Text note
      content,
      [
        ['p', targetPubkey],     // Tag the wall owner
        ['t', 'wall-post'],      // Mark as wall post
        ['wall', targetPubkey]    // Explicit wall tag
      ]
    );

    // Publish
    let published = false;
    for (const relay of this.relays.filter(r => r.connected)) {
      if (relay.publish(event)) {
        published = true;
      }
    }

    return published ? event : null;
  }

  // Fetch wall posts for a user
  async fetchWallPosts(userPubkey, limit = 50) {
    const posts = [];

    // Subscribe to wall posts
    for (const relay of this.relays) {
      if (!relay.connected) continue;

      // Generate unique subscription ID
      const subId = `wall_${Date.now()}_${Math.random().toString(36).substring(7)}`;

      // Fetch posts tagged to user's wall - pass filters as array
      relay.subscribe(
        subId,
        [
          {
            kinds: [1],
            '#wall': [userPubkey],
            limit: limit
          },
          {
            kinds: [1, 42],
            '#p': [userPubkey],
            '#t': ['wall-post'],
            limit: limit
          }
        ],
        (event) => {
          posts.push(this.formatMessage(event));
        }
      );
    }

    // Wait and return
    return new Promise(resolve => {
      setTimeout(() => resolve(posts), 2000);
    });
  }
}