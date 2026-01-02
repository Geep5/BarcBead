// Enhanced Dashboard with Chat Rooms and Better Navigation
// Uses universal filter system for room discovery

class BarcChatDashboard {
  constructor() {
    // Chat room state
    this.activeChats = new Map(); // pubkey -> chat room data
    this.currentView = null; // 'chat' | 'profile' | 'tab' | null
    this.currentChatPartner = null; // pubkey of current chat partner

    // User state
    this.myPublicKey = null;
    this.myAlias = null;

    // Profile state (now full screen views)
    this.currentProfile = null; // Currently viewing profile

    // Tab/website chat state
    this.selectedTabId = null;
    this.selectedUrl = null;

    // DOM elements will be set up in init
    this.elements = {};

    this.init();
  }

  async init() {
    await this.setupDOM();
    await this.loadUserData();
    await this.bindEvents();
    await this.loadInitialData();
  }

  async setupDOM() {
    // Main containers
    this.elements.mainLayout = document.getElementById('main-layout');
    this.elements.sidebar = document.getElementById('sidebar');
    this.elements.contentArea = document.getElementById('content-area') || this.createContentArea();

    // Create or get UI sections
    this.elements.aliasDisplay = document.getElementById('alias-display') || this.createAliasDisplay();
    this.elements.chatsList = document.getElementById('chats-list') || this.createChatsList();
    this.elements.viewContainer = document.getElementById('view-container') || this.createViewContainer();
  }

  createContentArea() {
    const mainArea = document.querySelector('#chat-area');
    if (mainArea) {
      mainArea.id = 'content-area';
      return mainArea;
    }

    const area = document.createElement('main');
    area.id = 'content-area';
    area.className = 'content-area';
    this.elements.mainLayout.appendChild(area);
    return area;
  }

  createAliasDisplay() {
    // Replace "My Profile" button with alias display
    const profileBtn = document.getElementById('my-profile-btn');
    if (profileBtn) {
      const aliasDiv = document.createElement('div');
      aliasDiv.id = 'alias-display';
      aliasDiv.className = 'alias-display clickable';
      aliasDiv.innerHTML = `
        <div class="alias-avatar">👤</div>
        <span class="alias-name">Loading...</span>
      `;
      profileBtn.parentElement.replaceChild(aliasDiv, profileBtn);
      return aliasDiv;
    }
  }

  createChatsList() {
    // Add chats section to sidebar
    const sidebar = document.getElementById('sidebar');
    const section = document.createElement('div');
    section.className = 'sidebar-section chats-section';
    section.innerHTML = `
      <h3>Chats</h3>
      <div id="chats-list" class="chats-list">
        <div class="no-chats">No active chats</div>
      </div>
    `;

    // Insert after alias display
    const followingSection = sidebar.querySelector('.following-section');
    if (followingSection) {
      sidebar.insertBefore(section, followingSection);
    } else {
      sidebar.appendChild(section);
    }

    return section.querySelector('#chats-list');
  }

  createViewContainer() {
    const container = document.createElement('div');
    container.id = 'view-container';
    container.className = 'view-container';
    container.innerHTML = `
      <div id="empty-view" class="empty-state">
        <div class="empty-icon">💬</div>
        <h2>Welcome to Barc</h2>
        <p>Select a chat, profile, or tab to get started</p>
      </div>
    `;
    this.elements.contentArea.appendChild(container);
    return container;
  }

  async loadUserData() {
    const stored = await chrome.storage.local.get(['privateKey', 'userName']);

    if (stored.privateKey) {
      // Get public key from background
      const status = await this.sendToBackground({ type: 'GET_STATUS' });
      this.myPublicKey = status.publicKey;
      this.myAlias = stored.userName || 'Anonymous';

      // Update alias display
      this.updateAliasDisplay();
    }
  }

  updateAliasDisplay() {
    if (!this.elements.aliasDisplay) return;

    const avatarColor = this.getAvatarColor(this.myPublicKey);
    const initial = this.myAlias.charAt(0).toUpperCase();

    this.elements.aliasDisplay.innerHTML = `
      <div class="alias-avatar" style="background: ${avatarColor}">${initial}</div>
      <span class="alias-name">${this.escapeHtml(this.myAlias)}</span>
    `;
  }

  async bindEvents() {
    // Alias click - opens own profile view
    if (this.elements.aliasDisplay) {
      this.elements.aliasDisplay.addEventListener('click', () => {
        this.openProfileView(this.myPublicKey, this.myAlias, true);
      });
    }

    // Listen for messages from background
    chrome.runtime.onMessage.addListener((msg) => this.handleBackgroundMessage(msg));
  }

  async loadInitialData() {
    // Load active chats from storage
    const stored = await chrome.storage.local.get(['activeChats']);
    if (stored.activeChats) {
      this.activeChats = new Map(stored.activeChats);
      this.renderChatsList();
    }

    // Load browser tabs
    await this.loadBrowserTabs();
  }

  // ==================== Chat Room Management ====================

  async createOrJoinChat(pubkey, name) {
    // Check if chat already exists
    if (this.activeChats.has(pubkey)) {
      this.openChatView(pubkey);
      return;
    }

    // Create new chat room
    const chatRoom = {
      pubkey,
      name: name || 'User',
      created: Date.now(),
      lastMessage: null,
      unreadCount: 0
    };

    this.activeChats.set(pubkey, chatRoom);
    await this.saveActiveChats();

    // Render updated chats list
    this.renderChatsList();

    // Open the chat
    this.openChatView(pubkey);
  }

  async saveActiveChats() {
    // Convert Map to array for storage
    const chatsArray = Array.from(this.activeChats.entries());
    await chrome.storage.local.set({ activeChats: chatsArray });
  }

  renderChatsList() {
    if (!this.elements.chatsList) return;

    if (this.activeChats.size === 0) {
      this.elements.chatsList.innerHTML = '<div class="no-chats">No active chats</div>';
      return;
    }

    // Sort chats by last activity
    const sortedChats = Array.from(this.activeChats.entries())
      .sort((a, b) => (b[1].lastMessage?.timestamp || b[1].created) - (a[1].lastMessage?.timestamp || a[1].created));

    this.elements.chatsList.innerHTML = sortedChats.map(([pubkey, chat]) => {
      const isActive = this.currentView === 'chat' && this.currentChatPartner === pubkey;
      const avatarColor = this.getAvatarColor(pubkey);
      const initial = chat.name.charAt(0).toUpperCase();

      return `
        <div class="chat-item ${isActive ? 'active' : ''}" data-pubkey="${this.escapeHtml(pubkey)}">
          <div class="chat-avatar" style="background: ${avatarColor}">${initial}</div>
          <div class="chat-info">
            <div class="chat-name">${this.escapeHtml(chat.name)}</div>
            ${chat.lastMessage ? `
              <div class="chat-preview">${this.escapeHtml(this.truncateText(chat.lastMessage.content, 30))}</div>
            ` : '<div class="chat-preview">No messages yet</div>'}
          </div>
          ${chat.unreadCount > 0 ? `
            <div class="chat-unread">${chat.unreadCount}</div>
          ` : ''}
          <button class="chat-close" data-pubkey="${this.escapeHtml(pubkey)}" title="Close chat">×</button>
        </div>
      `;
    }).join('');

    // Add click handlers
    this.elements.chatsList.querySelectorAll('.chat-item').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.classList.contains('chat-close')) {
          e.stopPropagation();
          this.closeChat(e.target.dataset.pubkey);
        } else {
          const pubkey = el.dataset.pubkey;
          this.openChatView(pubkey);
        }
      });
    });
  }

  closeChat(pubkey) {
    this.activeChats.delete(pubkey);
    this.saveActiveChats();
    this.renderChatsList();

    // If this was the current view, show empty state
    if (this.currentView === 'chat' && this.currentChatPartner === pubkey) {
      this.showEmptyView();
    }
  }

  // ==================== View Management ====================

  showEmptyView() {
    this.currentView = null;
    this.currentChatPartner = null;
    this.currentProfile = null;

    this.elements.viewContainer.innerHTML = `
      <div id="empty-view" class="empty-state">
        <div class="empty-icon">💬</div>
        <h2>Welcome to Barc</h2>
        <p>Select a chat, profile, or tab to get started</p>
      </div>
    `;
  }

  async openChatView(pubkey) {
    this.currentView = 'chat';
    this.currentChatPartner = pubkey;

    const chat = this.activeChats.get(pubkey);
    if (!chat) return;

    // Clear unread count
    chat.unreadCount = 0;
    await this.saveActiveChats();
    this.renderChatsList();

    // Create chat view
    this.elements.viewContainer.innerHTML = `
      <div class="chat-view">
        <div class="chat-header">
          <div class="chat-partner-info">
            <div class="chat-partner-avatar" style="background: ${this.getAvatarColor(pubkey)}">
              ${chat.name.charAt(0).toUpperCase()}
            </div>
            <div class="chat-partner-details">
              <div class="chat-partner-name">${this.escapeHtml(chat.name)}</div>
              <div class="chat-partner-pubkey">${this.truncatePubkey(pubkey)}</div>
            </div>
          </div>
          <div class="chat-actions">
            <button class="btn icon view-profile-btn" title="View Profile">👤</button>
            <button class="btn icon close-chat-btn" title="Close">×</button>
          </div>
        </div>

        <div class="chat-messages" id="chat-messages">
          <div class="loading-messages">Loading messages...</div>
        </div>

        <div class="chat-input-area">
          <input type="text" id="chat-input" placeholder="Type a message..." />
          <button id="send-chat-btn" class="btn primary">Send</button>
        </div>
      </div>
    `;

    // Add event handlers
    this.elements.viewContainer.querySelector('.view-profile-btn').addEventListener('click', () => {
      this.openProfileView(pubkey, chat.name);
    });

    this.elements.viewContainer.querySelector('.close-chat-btn').addEventListener('click', () => {
      this.showEmptyView();
    });

    const input = this.elements.viewContainer.querySelector('#chat-input');
    const sendBtn = this.elements.viewContainer.querySelector('#send-chat-btn');

    const sendMessage = async () => {
      const content = input.value.trim();
      if (!content) return;

      input.value = '';

      // Send DM using universal room with user tags
      await this.sendToBackground({
        type: 'SEND_DM',
        targetPubkey: pubkey,
        content
      });
    };

    sendBtn.addEventListener('click', sendMessage);
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    // Load chat history
    await this.loadChatHistory(pubkey);
  }

  async loadChatHistory(pubkey) {
    const messagesEl = document.getElementById('chat-messages');
    if (!messagesEl) return;

    // Fetch DM history
    const result = await this.sendToBackground({
      type: 'FETCH_DMS',
      otherPubkey: pubkey,
      limit: 100
    });

    messagesEl.innerHTML = '';

    if (result.messages && result.messages.length > 0) {
      result.messages.forEach(msg => {
        this.addChatMessage(messagesEl, msg, pubkey);
      });
    } else {
      messagesEl.innerHTML = '<div class="no-messages">No messages yet. Start the conversation!</div>';
    }

    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  addChatMessage(container, msg, chatPartnerPubkey) {
    const isOwn = msg.pubkey === this.myPublicKey;
    const div = document.createElement('div');
    div.className = `chat-message ${isOwn ? 'own' : ''}`;

    const time = new Date(msg.timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    });

    div.innerHTML = `
      <div class="message-bubble">
        <div class="message-content">${this.escapeHtml(msg.content)}</div>
        <div class="message-time">${time}</div>
      </div>
    `;

    container.appendChild(div);
  }

  async openProfileView(pubkey, name, isOwn = false) {
    this.currentView = 'profile';
    this.currentProfile = { pubkey, name, isOwn };

    // Create full profile view (not modal)
    this.elements.viewContainer.innerHTML = `
      <div class="profile-view">
        <div class="profile-header">
          <div class="profile-info">
            <div class="profile-avatar" style="background: ${this.getAvatarColor(pubkey)}">
              ${(name || 'U').charAt(0).toUpperCase()}
            </div>
            <div class="profile-details">
              <h1 class="profile-name">${isOwn ? 'Your Profile' : this.escapeHtml(name || 'User')}</h1>
              <div class="profile-pubkey">${this.truncatePubkey(pubkey)}</div>
            </div>
          </div>
          <div class="profile-actions">
            ${!isOwn ? `
              <button class="btn primary start-chat-btn">Start Chat</button>
              <button class="btn follow-btn">Follow</button>
            ` : `
              <button class="btn edit-profile-btn">Edit Profile</button>
            `}
            <button class="btn icon close-btn" title="Close">×</button>
          </div>
        </div>

        <div class="profile-content">
          <div class="profile-tabs">
            <button class="profile-tab active" data-tab="posts">Posts</button>
            <button class="profile-tab" data-tab="mentions">Mentions</button>
            <button class="profile-tab" data-tab="following">Following</button>
          </div>
          <div class="profile-feed" id="profile-feed">
            <div class="loading">Loading...</div>
          </div>
        </div>
      </div>
    `;

    // Add event handlers
    const closeBtn = this.elements.viewContainer.querySelector('.close-btn');
    closeBtn.addEventListener('click', () => this.showEmptyView());

    if (!isOwn) {
      const startChatBtn = this.elements.viewContainer.querySelector('.start-chat-btn');
      startChatBtn?.addEventListener('click', () => {
        this.createOrJoinChat(pubkey, name);
      });
    }

    // Tab switching
    const tabs = this.elements.viewContainer.querySelectorAll('.profile-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this.loadProfileTab(pubkey, tab.dataset.tab);
      });
    });

    // Load default tab
    this.loadProfileTab(pubkey, 'posts');
  }

  async loadProfileTab(pubkey, tabType) {
    const feedEl = document.getElementById('profile-feed');
    if (!feedEl) return;

    feedEl.innerHTML = '<div class="loading">Loading...</div>';

    let result;
    switch (tabType) {
      case 'posts':
        result = await this.sendToBackground({
          type: 'FETCH_USER_POSTS',
          targetPubkey: pubkey,
          limit: 50
        });
        break;
      case 'mentions':
        result = await this.sendToBackground({
          type: 'FETCH_MENTIONS',
          targetPubkey: pubkey,
          limit: 50
        });
        break;
      case 'following':
        result = await this.sendToBackground({
          type: 'FETCH_FOLLOWING',
          targetPubkey: pubkey
        });
        break;
    }

    feedEl.innerHTML = '';

    if (tabType === 'following' && result.following) {
      this.renderFollowingList(feedEl, result.following);
    } else if (result.posts && result.posts.length > 0) {
      result.posts.forEach(post => {
        this.renderPost(feedEl, post);
      });
    } else {
      feedEl.innerHTML = `<div class="empty-feed">No ${tabType} found</div>`;
    }
  }

  renderPost(container, post) {
    const div = document.createElement('div');
    div.className = 'post-item';

    const timeStr = this.formatRelativeTime(post.timestamp);

    div.innerHTML = `
      <div class="post-header">
        <div class="post-author" data-pubkey="${this.escapeHtml(post.pubkey)}">
          ${this.escapeHtml(post.name || 'Anonymous')}
        </div>
        <div class="post-time">${timeStr}</div>
      </div>
      <div class="post-content">${this.escapeHtml(post.content)}</div>
    `;

    // Make author clickable
    div.querySelector('.post-author')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.openProfileView(post.pubkey, post.name || 'User');
    });

    container.appendChild(div);
  }

  renderFollowingList(container, following) {
    if (following.length === 0) {
      container.innerHTML = '<div class="empty-feed">Not following anyone</div>';
      return;
    }

    const list = document.createElement('div');
    list.className = 'following-list';

    following.forEach(user => {
      const item = document.createElement('div');
      item.className = 'following-item clickable';
      item.dataset.pubkey = user.pubkey;

      const avatarColor = this.getAvatarColor(user.pubkey);
      const initial = (user.name || user.displayName || 'U').charAt(0).toUpperCase();

      item.innerHTML = `
        <div class="following-avatar" style="background: ${avatarColor}">${initial}</div>
        <div class="following-info">
          <div class="following-name">${this.escapeHtml(user.name || user.displayName || 'User')}</div>
          <div class="following-pubkey">${this.truncatePubkey(user.pubkey)}</div>
        </div>
        <button class="btn small chat-btn" data-pubkey="${user.pubkey}" data-name="${this.escapeHtml(user.name || 'User')}">Chat</button>
      `;

      // Profile click
      item.addEventListener('click', (e) => {
        if (!e.target.classList.contains('chat-btn')) {
          this.openProfileView(user.pubkey, user.name || user.displayName);
        }
      });

      // Chat button
      item.querySelector('.chat-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.createOrJoinChat(e.target.dataset.pubkey, e.target.dataset.name);
      });

      list.appendChild(item);
    });

    container.appendChild(list);
  }

  // ==================== Background Message Handling ====================

  handleBackgroundMessage(msg) {
    switch (msg.type) {
      case 'NEW_DM':
        this.handleNewDM(msg.dm, msg.otherPubkey);
        break;
      case 'NEW_MESSAGE':
        // Regular channel messages
        if (msg.url === this.selectedUrl) {
          // Handle tab/website messages
        }
        break;
    }
  }

  handleNewDM(dm, otherPubkey) {
    // Update chat room data
    let chat = this.activeChats.get(otherPubkey);

    if (!chat) {
      // Create new chat if it doesn't exist
      chat = {
        pubkey: otherPubkey,
        name: dm.name || 'User',
        created: Date.now(),
        lastMessage: dm,
        unreadCount: 1
      };
      this.activeChats.set(otherPubkey, chat);
    } else {
      chat.lastMessage = dm;
      if (this.currentView !== 'chat' || this.currentChatPartner !== otherPubkey) {
        chat.unreadCount++;
      }
    }

    this.saveActiveChats();
    this.renderChatsList();

    // If we're viewing this chat, add the message
    if (this.currentView === 'chat' && this.currentChatPartner === otherPubkey) {
      const messagesEl = document.getElementById('chat-messages');
      if (messagesEl) {
        this.addChatMessage(messagesEl, dm, otherPubkey);
        messagesEl.scrollTop = messagesEl.scrollHeight;
      }
    }
  }

  // ==================== Utility Methods ====================

  async loadBrowserTabs() {
    // Existing tab loading logic
  }

  sendToBackground(message) {
    return chrome.runtime.sendMessage(message);
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  truncateText(text, maxLength) {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  }

  truncatePubkey(pubkey) {
    if (!pubkey || pubkey.length < 16) return pubkey;
    return `${pubkey.slice(0, 8)}...${pubkey.slice(-8)}`;
  }

  getAvatarColor(pubkey) {
    if (!pubkey || pubkey.length < 6) return '#667eea';
    const colors = [
      '#e94560', '#667eea', '#48bb78', '#ed8936', '#9f7aea',
      '#38b2ac', '#f56565', '#4299e1', '#ed64a6', '#68d391'
    ];
    const index = parseInt(pubkey.slice(0, 6), 16) % colors.length;
    return colors[index];
  }

  formatRelativeTime(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 7) {
      return new Date(timestamp).toLocaleDateString();
    } else if (days > 0) {
      return `${days}d ago`;
    } else if (hours > 0) {
      return `${hours}h ago`;
    } else if (minutes > 0) {
      return `${minutes}m ago`;
    } else {
      return 'just now';
    }
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new BarcChatDashboard();
});