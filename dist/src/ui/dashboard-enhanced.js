// Enhanced dashboard with universal room support

class EnhancedBarcDashboard {
  constructor() {
    // Room management
    this.currentRoom = null;
    this.discoveredRooms = {
      websites: [],
      groups: [],
      named: []
    };

    // User state
    this.myPublicKey = null;
    this.userName = null;
    this.followingList = [];

    // UI state
    this.currentView = 'websites'; // 'websites' or 'profiles'
    this.selectedProfile = null;

    // Initialize DOM elements
    this.initializeElements();
    this.bindEvents();
    this.init();
  }

  initializeElements() {
    // Setup overlay
    this.setupOverlay = document.getElementById('setup-overlay');
    this.mainLayout = document.getElementById('main-layout');
    this.generateKeyBtn = document.getElementById('generate-key-btn');
    this.importKeyInput = document.getElementById('import-key-input');
    this.importKeyBtn = document.getElementById('import-key-btn');

    // Room list elements
    this.tabsList = document.getElementById('tabs-list');
    this.pinnedList = document.getElementById('pinned-list');
    this.activityList = document.getElementById('activity-list');

    // Chat elements
    this.chatContainer = document.getElementById('chat-container');
    this.messagesContainer = document.getElementById('messages');
    this.messageInput = document.getElementById('message-input');
    this.sendBtn = document.getElementById('send-btn');

    // Profile elements
    this.profileContainer = document.getElementById('profile-container');
    this.followingList = document.getElementById('following-list');

    // Settings
    this.settingsModal = document.getElementById('settings-modal');
  }

  bindEvents() {
    // Setup buttons
    this.generateKeyBtn?.addEventListener('click', () => this.handleGenerateKey());
    this.importKeyBtn?.addEventListener('click', () => this.handleImportKey());
    this.importKeyInput?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.handleImportKey();
    });

    // Message sending with tagging support
    this.sendBtn?.addEventListener('click', () => this.sendMessage());
    this.messageInput?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });

    // @mention support
    this.messageInput?.addEventListener('input', (e) => this.handleMentionInput(e));

    // Room click delegation
    document.addEventListener('click', (e) => {
      const roomItem = e.target.closest('.room-item');
      if (roomItem) {
        this.handleRoomClick(roomItem);
      }

      const tabItem = e.target.closest('.tab-item');
      if (tabItem) {
        const url = tabItem.dataset.url;
        if (url) this.joinWebsiteRoom(url);
      }

      const profileBtn = e.target.closest('.btn-profile');
      if (profileBtn) {
        const pubkey = profileBtn.dataset.pubkey;
        if (pubkey) this.openProfile(pubkey);
      }
    });

    // Listen for background messages
    chrome.runtime.onMessage.addListener((msg) => this.handleBackgroundMessage(msg));
  }

  handleRoomClick(roomItem) {
    const type = roomItem.dataset.roomType;

    switch (type) {
      case 'website':
        const website = roomItem.dataset.website;
        if (website) this.joinWebsiteRoom(website);
        break;

      case 'group':
        const users = roomItem.dataset.users?.split(',') || [];
        if (users.length > 0) this.joinGroupRoom(users);
        break;

      case 'named':
        const subject = roomItem.dataset.subject;
        if (subject) this.joinNamedRoom(subject);
        break;
    }
  }

  async init() {
    try {
      // Check for existing key
      const stored = await chrome.storage.local.get(['privateKey']);

      if (!stored.privateKey) {
        this.showScreen('setup');
        return;
      }

      // Initialize connection
      const status = await this.sendToBackground({ type: 'GET_STATUS' });

      if (!status.publicKey) {
        this.showScreen('setup');
        return;
      }

      this.myPublicKey = status.publicKey;
      this.showScreen('main');

      // Discover rooms
      await this.discoverRooms();

      // Load following list
      await this.loadFollowingList();

      // Load browser tabs
      await this.loadBrowserTabs();
    } catch (error) {
      console.error('Dashboard init error:', error);
      this.showScreen('setup');
    }
  }

  async handleGenerateKey() {
    this.generateKeyBtn.disabled = true;
    this.generateKeyBtn.textContent = 'Generating...';

    try {
      const result = await this.sendToBackground({ type: 'GENERATE_KEY' });

      if (result.success) {
        this.myPublicKey = result.publicKey;
        this.showScreen('main');
        await this.init(); // Re-initialize with new key
      } else {
        alert('Failed to generate key: ' + (result.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Generate key error:', error);
      alert('Failed to generate key: ' + error.message);
    }

    this.generateKeyBtn.disabled = false;
    this.generateKeyBtn.textContent = 'Generate New Identity';
  }

  async handleImportKey() {
    const key = this.importKeyInput.value.trim();
    if (!key) {
      alert('Please enter a key');
      return;
    }

    this.importKeyBtn.disabled = true;
    this.importKeyBtn.textContent = 'Importing...';

    try {
      const result = await this.sendToBackground({
        type: 'IMPORT_KEY',
        key: key
      });

      if (result.success) {
        this.myPublicKey = result.publicKey;
        this.showScreen('main');
        await this.init(); // Re-initialize with imported key
      } else {
        alert('Failed to import key: ' + (result.error || 'Invalid key format'));
      }
    } catch (error) {
      console.error('Import key error:', error);
      alert('Failed to import key: ' + error.message);
    }

    this.importKeyBtn.disabled = false;
    this.importKeyBtn.textContent = 'Import Key';
    this.importKeyInput.value = '';
  }

  // Discover all room types
  async discoverRooms() {
    const result = await this.sendToBackground({ type: 'DISCOVER_ROOMS' });

    if (result.rooms) {
      this.discoveredRooms = result.rooms;
      this.updateRoomLists();
    }
  }

  // Update UI with discovered rooms
  updateRoomLists() {
    // Update website rooms
    if (this.discoveredRooms.websites?.length > 0) {
      const websiteHtml = this.discoveredRooms.websites
        .sort((a, b) => b.lastActivity - a.lastActivity)
        .map(room => this.createRoomElement('website', room))
        .join('');

      const websiteSection = document.getElementById('website-rooms');
      if (websiteSection) {
        websiteSection.innerHTML = websiteHtml;
      }
    }

    // Update group rooms
    if (this.discoveredRooms.groups?.length > 0) {
      const groupHtml = this.discoveredRooms.groups
        .map(room => this.createRoomElement('group', room))
        .join('');

      const groupSection = document.getElementById('group-rooms');
      if (groupSection) {
        groupSection.innerHTML = groupHtml;
      }
    }

    // Update named rooms
    if (this.discoveredRooms.named?.length > 0) {
      const namedHtml = this.discoveredRooms.named
        .map(room => this.createRoomElement('named', room))
        .join('');

      const namedSection = document.getElementById('named-rooms');
      if (namedSection) {
        namedSection.innerHTML = namedHtml;
      }
    }
  }

  // Create room element for display
  createRoomElement(type, room) {
    let title, subtitle, dataAttr;

    switch (type) {
      case 'website':
        title = new URL(room.website).hostname;
        subtitle = `${room.messageCount} messages`;
        dataAttr = `data-room-type="website" data-website="${room.website}"`;
        break;

      case 'group':
        title = `${room.users.length} people`;
        subtitle = `Last: ${new Date(room.lastActivity * 1000).toLocaleDateString()}`;
        dataAttr = `data-room-type="group" data-users="${room.users.join(',')}"`;
        break;

      case 'named':
        title = room.subject;
        subtitle = `${room.participants?.size || 0} participants`;
        dataAttr = `data-room-type="named" data-subject="${room.subject}"`;
        break;
    }

    return `
      <div class="room-item" ${dataAttr}>
        <div class="room-title">${title}</div>
        <div class="room-subtitle">${subtitle}</div>
      </div>
    `;
  }

  // Join a room with context
  async joinRoom(roomContext) {
    this.currentRoom = roomContext;

    // Show loading
    this.showChatLoading();

    // Join via background
    const result = await this.sendToBackground({
      type: 'JOIN_ROOM',
      roomContext: roomContext
    });

    if (result.messages) {
      this.displayMessages(result.messages);
    }

    if (result.users) {
      this.updateUsersList(result.users);
    }

    // Update UI
    this.updateChatHeader(roomContext);
    this.showChatContainer();
  }

  // Join website room
  async joinWebsiteRoom(url) {
    await this.joinRoom({ website: url });
  }

  // Join group room
  async joinGroupRoom(users) {
    await this.joinRoom({ users: users });
  }

  // Join named room
  async joinNamedRoom(subject) {
    await this.joinRoom({ subject: subject });
  }

  // Send message with proper tagging
  async sendMessage() {
    const content = this.messageInput.value.trim();
    if (!content) return;

    // Parse @mentions
    const mentions = this.parseMentions(content);

    // Determine room context
    let roomContext = this.currentRoom;

    // Add any mentioned users to the tags
    const taggedUsers = [...(roomContext?.users || []), ...mentions];

    // Send with enhanced format
    const result = await this.sendToBackground({
      type: 'SEND_MESSAGE',
      content: content,
      roomContext: {
        ...roomContext,
        users: taggedUsers
      },
      mentions: mentions
    });

    if (result.success) {
      this.messageInput.value = '';
    }
  }

  // Parse @mentions from text
  parseMentions(text) {
    const mentions = [];
    const regex = /@(\w+)/g;
    let match;

    while ((match = regex.exec(text)) !== null) {
      const username = match[1].toLowerCase();

      // Find user in following list
      const user = this.followingList.find(u =>
        u.name?.toLowerCase() === username
      );

      if (user) {
        mentions.push(user.pubkey);
      }
    }

    return mentions;
  }

  // Handle @mention input
  handleMentionInput(e) {
    const input = e.target;
    const text = input.value;
    const cursorPos = input.selectionStart;

    // Check if we're typing a mention
    const beforeCursor = text.substring(0, cursorPos);
    const mentionMatch = beforeCursor.match(/@(\w*)$/);

    if (mentionMatch) {
      const searchTerm = mentionMatch[1].toLowerCase();
      this.showMentionSuggestions(searchTerm, mentionMatch.index);
    } else {
      this.hideMentionSuggestions();
    }
  }

  // Show mention suggestions
  showMentionSuggestions(searchTerm, position) {
    const matches = this.followingList.filter(user =>
      user.name?.toLowerCase().includes(searchTerm)
    );

    if (matches.length === 0) {
      this.hideMentionSuggestions();
      return;
    }

    const picker = document.getElementById('mention-picker');
    const list = document.getElementById('mention-list');

    // Create suggestion items
    list.innerHTML = matches.slice(0, 5).map(user => `
      <div class="mention-item" data-pubkey="${user.pubkey}" data-name="${user.name}">
        <span class="mention-name">${user.name}</span>
        <span class="mention-pubkey">${user.pubkey.slice(0, 8)}...</span>
      </div>
    `).join('');

    // Position picker
    picker.classList.remove('hidden');

    // Add click handlers
    list.querySelectorAll('.mention-item').forEach(item => {
      item.addEventListener('click', () => {
        this.insertMention(item.dataset.name, item.dataset.pubkey, position);
      });
    });
  }

  // Hide mention suggestions
  hideMentionSuggestions() {
    document.getElementById('mention-picker')?.classList.add('hidden');
  }

  // Insert mention into input
  insertMention(name, pubkey, position) {
    const input = this.messageInput;
    const text = input.value;

    // Find the end of the partial mention
    let endPos = position;
    while (endPos < text.length && /\w/.test(text[endPos])) {
      endPos++;
    }

    // Replace partial mention with full mention
    const newText = text.substring(0, position) +
                   `@${name} ` +
                   text.substring(endPos);

    input.value = newText;
    input.setSelectionRange(position + name.length + 2, position + name.length + 2);

    this.hideMentionSuggestions();
  }

  // Display messages with tag awareness
  displayMessages(messages) {
    this.messagesContainer.innerHTML = '';

    messages.forEach(msg => {
      const messageEl = this.createMessageElement(msg);
      this.messagesContainer.appendChild(messageEl);
    });

    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
  }

  // Create message element with tag indicators
  createMessageElement(msg) {
    const el = document.createElement('div');
    el.className = 'message-item';
    el.dataset.pubkey = msg.pubkey;

    // Check if message tags current user
    const tagsMe = msg.tags?.some(t =>
      t[0] === 'p' && t[1] === this.myPublicKey
    );

    if (tagsMe) {
      el.classList.add('mentions-me');
    }

    // Format content with clickable mentions
    let content = msg.content;
    const mentions = msg.tags?.filter(t => t[0] === 'p') || [];

    mentions.forEach(mention => {
      const user = this.followingList.find(u => u.pubkey === mention[1]);
      if (user) {
        content = content.replace(
          new RegExp(`@${user.name}`, 'gi'),
          `<span class="mention" data-pubkey="${user.pubkey}">@${user.name}</span>`
        );
      }
    });

    el.innerHTML = `
      <div class="message-header">
        <span class="message-author">${msg.name || 'Anonymous'}</span>
        <span class="message-time">${this.formatTime(msg.timestamp)}</span>
      </div>
      <div class="message-content">${content}</div>
      ${msg.tags?.find(t => t[0] === 'r') ?
        `<div class="message-context">from ${new URL(msg.tags.find(t => t[0] === 'r')[1]).hostname}</div>` : ''}
    `;

    // Add click handler for mentions
    el.querySelectorAll('.mention').forEach(mention => {
      mention.addEventListener('click', () => {
        this.openProfile(mention.dataset.pubkey);
      });
    });

    return el;
  }

  // Open user profile
  async openProfile(pubkey) {
    this.selectedProfile = pubkey;

    // Fetch wall posts
    const result = await this.sendToBackground({
      type: 'FETCH_WALL_POSTS',
      userPubkey: pubkey,
      limit: 50
    });

    if (result.posts) {
      this.displayWallPosts(result.posts);
    }

    this.showProfileView();
  }

  // Display wall posts
  displayWallPosts(posts) {
    const wallContainer = document.getElementById('wall-posts');
    if (!wallContainer) return;

    wallContainer.innerHTML = posts.map(post => `
      <div class="wall-post">
        <div class="post-author">${post.name || 'Anonymous'}</div>
        <div class="post-content">${post.content}</div>
        <div class="post-time">${this.formatTime(post.timestamp)}</div>
      </div>
    `).join('');
  }

  // Post to wall
  async postToWall(targetPubkey, content) {
    const result = await this.sendToBackground({
      type: 'POST_TO_WALL',
      targetPubkey: targetPubkey,
      content: content
    });

    if (result.success) {
      // Refresh wall posts
      await this.openProfile(targetPubkey);
    }

    return result;
  }

  // Load following list
  async loadFollowingList() {
    const result = await this.sendToBackground({ type: 'GET_FOLLOWING' });
    if (result.following) {
      this.followingList = result.following;
      this.updateFollowingUI();
    }
  }

  // Utility functions
  formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;

    if (diff < 60000) return 'now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
    return date.toLocaleDateString();
  }

  sendToBackground(message) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(message, resolve);
    });
  }

  showScreen(screen) {
    if (screen === 'setup') {
      this.setupOverlay?.classList.remove('hidden');
      this.mainLayout?.classList.add('hidden');
    } else {
      this.setupOverlay?.classList.add('hidden');
      this.mainLayout?.classList.remove('hidden');
    }
  }

  showChatContainer() {
    this.chatContainer?.classList.remove('hidden');
    document.getElementById('no-selection')?.classList.add('hidden');
  }

  showChatLoading() {
    if (this.messagesContainer) {
      this.messagesContainer.innerHTML = '<div class="loading">Loading messages...</div>';
    }
  }

  updateChatHeader(roomContext) {
    const titleEl = document.getElementById('chat-title');
    const urlEl = document.getElementById('chat-url');

    if (roomContext.website) {
      titleEl.textContent = new URL(roomContext.website).hostname;
      urlEl.textContent = roomContext.website;
    } else if (roomContext.subject) {
      titleEl.textContent = roomContext.subject;
      urlEl.textContent = 'Named room';
    } else if (roomContext.users) {
      titleEl.textContent = `Group (${roomContext.users.length} people)`;
      urlEl.textContent = 'Private group';
    }
  }

  updateUsersList(users) {
    const usersList = document.getElementById('users-list');
    if (!usersList) return;

    if (users.length === 0) {
      usersList.innerHTML = '<span class="no-users">Just you</span>';
    } else {
      usersList.innerHTML = users.map(user => `
        <span class="user-chip" data-pubkey="${user.pubkey}">
          ${user.name || 'Anonymous'}
        </span>
      `).join('');
    }

    document.getElementById('user-count').textContent = users.length;
  }

  updateFollowingUI() {
    if (!this.followingList) return;

    const followingEl = document.getElementById('following-list');
    if (followingEl) {
      followingEl.innerHTML = this.followingList.map(user => `
        <div class="following-item" data-pubkey="${user.pubkey}">
          <span class="user-name">${user.name || 'Unknown'}</span>
          <button class="btn-profile btn-small" data-pubkey="${user.pubkey}">Profile</button>
        </div>
      `).join('');
    }

    const countEl = document.getElementById('following-count');
    if (countEl) {
      countEl.textContent = this.followingList.length;
    }
  }

  handleBackgroundMessage(msg) {
    switch (msg.type) {
      case 'NEW_MESSAGE':
        if (this.currentRoom) {
          // Check if message belongs to current room
          const belongsHere = this.messageMatchesRoom(msg.message, this.currentRoom);
          if (belongsHere) {
            const el = this.createMessageElement(msg.message);
            this.messagesContainer.appendChild(el);
            this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
          }
        }
        break;

      case 'PRESENCE_UPDATE':
        if (msg.users) {
          this.updateUsersList(msg.users);
        }
        break;
    }
  }

  // Check if message matches current room context
  messageMatchesRoom(message, roomContext) {
    const tags = message.tags || [];

    if (roomContext.website) {
      // Must have website tag
      if (!tags.some(t => t[0] === 'r' && t[1] === roomContext.website)) {
        return false;
      }
    }

    if (roomContext.users?.length > 0) {
      // Must have all user tags for strict matching
      const taggedUsers = tags.filter(t => t[0] === 'p').map(t => t[1]);
      const hasAllUsers = roomContext.users.every(user => taggedUsers.includes(user));
      if (!hasAllUsers) return false;
    }

    if (roomContext.subject) {
      // Must have subject tag
      if (!tags.some(t => t[0] === 'subject' && t[1] === roomContext.subject)) {
        return false;
      }
    }

    return true;
  }

  // Load browser tabs
  async loadBrowserTabs() {
    const tabs = await chrome.tabs.query({});
    const tabRooms = tabs
      .filter(tab => tab.url && !tab.url.startsWith('chrome'))
      .map(tab => ({
        website: tab.url,
        title: tab.title,
        active: tab.active
      }));

    const tabsHtml = tabRooms.map(room => `
      <div class="tab-item ${room.active ? 'active' : ''}"
           onclick="dashboard.joinWebsiteRoom('${room.website}')">
        <div class="tab-title">${room.title}</div>
        <div class="tab-url">${new URL(room.website).hostname}</div>
      </div>
    `).join('');

    if (this.tabsList) {
      this.tabsList.innerHTML = tabsHtml;
    }
  }

  showProfileView() {
    this.profileContainer?.classList.remove('hidden');
    this.chatContainer?.classList.add('hidden');
  }
}

// Initialize dashboard
document.addEventListener('DOMContentLoaded', () => {
  window.dashboard = new EnhancedBarcDashboard();
});