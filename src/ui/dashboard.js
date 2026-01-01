// Dashboard UI for Barc

class BarcDashboard {
  constructor() {
    this.browserTabs = []; // All browser tabs
    this.pinnedChannels = []; // Pinned/locked channels that persist
    this.selectedTabId = null; // Currently selected tab for chat
    this.selectedUrl = null;
    this.selectedTitle = null;
    this.tabUserCounts = new Map(); // url -> user count

    // Profile state
    this.openProfiles = []; // Array of {pubkey, name} for open profile tabs
    this.currentProfile = null; // Currently viewing profile {pubkey, name}
    this.myPublicKey = null; // User's own public key

    // Following state
    this.followingList = []; // Array of {pubkey, name, picture, nip05}
    this.mentionSelectedIndex = 0; // Selected index in mention autocomplete

    // DOM elements
    this.setupOverlay = document.getElementById('setup-overlay');
    this.mainLayout = document.getElementById('main-layout');
    this.generateKeyBtn = document.getElementById('generate-key-btn');
    this.importKeyInput = document.getElementById('import-key-input');
    this.importKeyBtn = document.getElementById('import-key-btn');

    this.pinnedList = document.getElementById('pinned-list');
    this.tabsList = document.getElementById('tabs-list');
    this.activityList = document.getElementById('activity-list');
    this.connectionStatus = document.getElementById('connection-status');
    this.pinBtn = document.getElementById('pin-btn');

    this.noSelection = document.getElementById('no-selection');
    this.chatContainer = document.getElementById('chat-container');
    this.chatTitle = document.getElementById('chat-title');
    this.chatUrl = document.getElementById('chat-url');
    this.userCount = document.getElementById('user-count');
    this.usersList = document.getElementById('users-list');
    this.messagesContainer = document.getElementById('messages');
    this.messageInput = document.getElementById('message-input');
    this.sendBtn = document.getElementById('send-btn');

    this.settingsBtn = document.getElementById('settings-btn');
    this.settingsModal = document.getElementById('settings-modal');
    this.closeSettingsBtn = document.getElementById('close-settings');
    this.settingsName = document.getElementById('settings-name');
    this.pubkeyDisplay = document.getElementById('pubkey-display');
    this.saveSettingsBtn = document.getElementById('save-settings');

    // Profile elements
    this.myProfileBtn = document.getElementById('my-profile-btn');
    this.profileTabsSection = document.getElementById('profile-tabs-section');
    this.profileTabsList = document.getElementById('profile-tabs-list');
    this.profileContainer = document.getElementById('profile-container');
    this.profileName = document.getElementById('profile-name');
    this.profilePubkey = document.getElementById('profile-pubkey');
    this.closeProfileBtn = document.getElementById('close-profile-btn');

    // Emoji picker
    this.emojiBtn = document.getElementById('emoji-btn');
    this.emojiPicker = document.getElementById('emoji-picker');

    // Filter controls
    this.filterSince = document.getElementById('filter-since');
    this.filterUntil = document.getElementById('filter-until');
    this.filterLimit = document.getElementById('filter-limit');
    this.filterApplyBtn = document.getElementById('filter-apply');
    this.filterResetBtn = document.getElementById('filter-reset');

    // Profile search elements
    this.profileSearchInput = document.getElementById('profile-search-input');
    this.profileSearchBtn = document.getElementById('profile-search-btn');

    // Following elements
    this.followingList = document.getElementById('following-list');
    this.followingCount = document.getElementById('following-count');
    this.followBtn = document.getElementById('follow-btn');

    // Mention picker elements
    this.mentionPicker = document.getElementById('mention-picker');
    this.mentionList = document.getElementById('mention-list');

    // Bech32 alphabet for npub decoding
    this.BECH32_ALPHABET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

    // Emoji shortcode map
    this.emojiShortcodes = {
      ':)': '😊', ':-)': '😊', '(:': '😊',
      ':D': '😀', ':-D': '😀',
      ';)': '😉', ';-)': '😉',
      ':P': '😛', ':-P': '😛', ':p': '😛',
      ':(': '😢', ':-(': '😢',
      ":'(": '😭', ":'-(": '😭',
      ':O': '😮', ':-O': '😮', ':o': '😮',
      '<3': '❤️', '</3': '💔',
      ':*': '😘', ':-*': '😘',
      'B)': '😎', 'B-)': '😎',
      ':/': '😕', ':-/': '😕',
      ':S': '😖', ':-S': '😖',
      'XD': '😂', 'xD': '😂',
      ':fire:': '🔥', ':heart:': '❤️', ':thumbsup:': '👍', ':thumbsdown:': '👎',
      ':100:': '💯', ':eyes:': '👀', ':rocket:': '🚀', ':tada:': '🎉',
      ':thinking:': '🤔', ':shrug:': '🤷', ':clap:': '👏', ':muscle:': '💪',
      ':star:': '⭐', ':check:': '✅', ':x:': '❌', ':bulb:': '💡',
      ':skull:': '💀', ':ghost:': '👻', ':clown:': '🤡', ':target:': '🎯'
    };

    this.bindEvents();
    this.init();
  }

  bindEvents() {
    // Setup
    this.generateKeyBtn.addEventListener('click', () => this.handleGenerateKey());
    this.importKeyBtn.addEventListener('click', () => this.handleImportKey());
    this.importKeyInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.handleImportKey();
    });

    // Chat
    this.sendBtn.addEventListener('click', () => this.sendMessage());
    this.messageInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });

    // Settings
    this.settingsBtn.addEventListener('click', () => this.showSettings());
    this.closeSettingsBtn.addEventListener('click', () => this.hideSettings());
    this.saveSettingsBtn.addEventListener('click', () => this.saveSettings());

    // Emoji picker
    this.emojiBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleEmojiPicker();
    });

    // Close emoji picker when clicking outside
    document.addEventListener('click', (e) => {
      if (!this.emojiPicker.contains(e.target) && e.target !== this.emojiBtn) {
        this.emojiPicker.classList.add('hidden');
      }
    });

    // Emoji selection
    this.emojiPicker.querySelectorAll('.emoji').forEach(el => {
      el.addEventListener('click', () => {
        const emoji = el.dataset.emoji;
        this.insertEmoji(emoji);
      });
    });

    // Listen for messages from background
    chrome.runtime.onMessage.addListener((msg) => this.handleBackgroundMessage(msg));

    // Listen for chrome tab changes to auto-update
    chrome.tabs.onCreated.addListener(() => this.loadBrowserTabs());
    chrome.tabs.onRemoved.addListener(() => this.loadBrowserTabs());
    chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
      if (changeInfo.url || changeInfo.title) {
        this.loadBrowserTabs();
      }
    });

    // Pin button
    this.pinBtn?.addEventListener('click', () => this.togglePinCurrentChannel());

    // Filter controls
    this.filterApplyBtn?.addEventListener('click', () => this.applyFilter());
    this.filterResetBtn?.addEventListener('click', () => this.resetFilter());

    // Profile events
    this.myProfileBtn?.addEventListener('click', () => this.openMyProfile());
    this.closeProfileBtn?.addEventListener('click', () => this.closeCurrentProfile());

    // Profile search
    this.profileSearchBtn?.addEventListener('click', () => this.handleProfileSearch());
    this.profileSearchInput?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.handleProfileSearch();
      }
    });

    // Follow button
    this.followBtn?.addEventListener('click', () => this.toggleFollow());

    // @mention handling
    this.messageInput?.addEventListener('input', (e) => this.handleMentionInput(e));
    this.messageInput?.addEventListener('keydown', (e) => this.handleMentionKeydown(e));

    // Close mention picker when clicking outside
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.input-wrapper')) {
        this.hideMentionPicker();
      }
    });
  }

  async init() {
    try {
      // Tell background dashboard is open
      await this.sendToBackground({ type: 'DASHBOARD_OPENED' });

      // Initialize and get status
      await this.sendToBackground({ type: 'INIT' });
      const status = await this.sendToBackground({ type: 'GET_STATUS' });

      // Check if user has a key set up
      const { privateKey } = await chrome.storage.local.get(['privateKey']);

      if (!privateKey) {
        this.showScreen('setup');
      } else {
        this.showScreen('main');
        this.updateConnectionStatus(status.connected);
        if (status.publicKey) {
          this.pubkeyDisplay.value = status.publicKey;
          this.myPublicKey = status.publicKey;
        }
      }

      // Load pinned channels from storage
      await this.loadPinnedChannels();

      // Load browser tabs
      await this.loadBrowserTabs();

      // Load global activity
      if (status.globalActivity) {
        this.updateGlobalActivity(status.globalActivity);
      }

      // Load following list
      await this.loadFollowingList();
    } catch (error) {
      console.error('Dashboard init error:', error);
      this.showScreen('setup');
    }
  }

  showScreen(screen) {
    if (screen === 'setup') {
      this.setupOverlay.classList.remove('hidden');
      this.mainLayout.classList.add('hidden');
    } else {
      this.setupOverlay.classList.add('hidden');
      this.mainLayout.classList.remove('hidden');
    }
  }

  async loadPinnedChannels() {
    const { pinnedChannels } = await chrome.storage.local.get(['pinnedChannels']);
    this.pinnedChannels = pinnedChannels || [];
    this.renderPinnedChannels();
  }

  async savePinnedChannels() {
    await chrome.storage.local.set({ pinnedChannels: this.pinnedChannels });
  }

  async loadBrowserTabs() {
    try {
      const tabs = await chrome.tabs.query({});
      this.browserTabs = tabs.filter(tab =>
        tab.url &&
        !tab.url.startsWith('chrome://') &&
        !tab.url.startsWith('chrome-extension://') &&
        !tab.url.startsWith('about:')
      );

      // Get user counts for each tab
      const result = await this.sendToBackground({ type: 'GET_ALL_TAB_COUNTS' });
      if (result.counts) {
        this.tabUserCounts = new Map(Object.entries(result.counts));
      }

      this.renderTabs();
      this.renderPinnedChannels();
    } catch (error) {
      console.error('Failed to load tabs:', error);
    }
  }

  renderTabs() {
    if (this.browserTabs.length === 0) {
      this.tabsList.innerHTML = '<div class="no-tabs">No tabs open</div>';
      return;
    }

    this.tabsList.innerHTML = this.browserTabs.map(tab => {
      const count = this.tabUserCounts.get(tab.url) || 0;
      const isActive = tab.id === this.selectedTabId;
      const hostname = this.getHostname(tab.url);

      return `
        <div class="tab-item ${isActive ? 'active' : ''}" data-tab-id="${tab.id}" data-url="${this.escapeHtml(tab.url)}">
          <div class="tab-favicon">${tab.favIconUrl ? `<img src="${tab.favIconUrl}" width="16" height="16" onerror="this.style.display='none'">` : '&#127760;'}</div>
          <div class="tab-info">
            <div class="tab-title">${this.escapeHtml(tab.title || 'Untitled')}</div>
            <div class="tab-url">${this.escapeHtml(hostname)}</div>
          </div>
          <div class="tab-count ${count === 0 ? 'empty' : ''}">${count}</div>
        </div>
      `;
    }).join('');

    // Add click handlers
    this.tabsList.querySelectorAll('.tab-item').forEach(el => {
      el.addEventListener('click', () => {
        const tabId = parseInt(el.dataset.tabId);
        const url = el.dataset.url;
        const title = el.querySelector('.tab-title')?.textContent || 'Page';
        this.selectTab(tabId, url, title);
      });
    });
  }

  renderPinnedChannels() {
    if (!this.pinnedList) return;

    if (this.pinnedChannels.length === 0) {
      this.pinnedList.innerHTML = '<div class="no-tabs">No pinned channels</div>';
      return;
    }

    this.pinnedList.innerHTML = this.pinnedChannels.map(channel => {
      const count = this.tabUserCounts.get(channel.url) || 0;
      const isActive = this.selectedUrl === channel.url;
      const hostname = this.getHostname(channel.url);

      return `
        <div class="tab-item pinned ${isActive ? 'active' : ''}" data-url="${this.escapeHtml(channel.url)}">
          <div class="tab-favicon">&#128204;</div>
          <div class="tab-info">
            <div class="tab-title">${this.escapeHtml(channel.title || hostname)}</div>
            <div class="tab-url">${this.escapeHtml(hostname)}</div>
          </div>
          <div class="tab-actions">
            <button class="unpin-btn" data-url="${this.escapeHtml(channel.url)}" title="Unpin">&#10005;</button>
            <div class="tab-count ${count === 0 ? 'empty' : ''}">${count}</div>
          </div>
        </div>
      `;
    }).join('');

    // Add click handlers for pinned channels
    this.pinnedList.querySelectorAll('.tab-item').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.classList.contains('unpin-btn')) return;
        const url = el.dataset.url;
        const title = el.querySelector('.tab-title')?.textContent || 'Page';
        this.selectTab(null, url, title);
      });
    });

    // Add unpin handlers
    this.pinnedList.querySelectorAll('.unpin-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const url = btn.dataset.url;
        this.unpinChannel(url);
      });
    });
  }

  isChannelPinned(url) {
    return this.pinnedChannels.some(c => c.url === url);
  }

  async pinChannel(url, title) {
    if (this.isChannelPinned(url)) return;

    this.pinnedChannels.push({ url, title, pinnedAt: Date.now() });
    await this.savePinnedChannels();
    this.renderPinnedChannels();
    this.updatePinButton();
  }

  async unpinChannel(url) {
    this.pinnedChannels = this.pinnedChannels.filter(c => c.url !== url);
    await this.savePinnedChannels();
    this.renderPinnedChannels();
    this.updatePinButton();
  }

  async togglePinCurrentChannel() {
    if (!this.selectedUrl) return;

    if (this.isChannelPinned(this.selectedUrl)) {
      await this.unpinChannel(this.selectedUrl);
    } else {
      await this.pinChannel(this.selectedUrl, this.selectedTitle);
    }
  }

  updatePinButton() {
    if (!this.pinBtn) return;

    const isPinned = this.isChannelPinned(this.selectedUrl);
    this.pinBtn.innerHTML = isPinned ? '&#128204;' : '&#128205;';
    this.pinBtn.title = isPinned ? 'Unpin channel' : 'Pin channel';
    this.pinBtn.classList.toggle('pinned', isPinned);
  }

  async selectTab(tabId, url, title = 'Page') {
    if (this.selectedUrl === url && !this.currentProfile) return;

    this.selectedTabId = tabId;
    this.selectedUrl = url;
    this.selectedTitle = title;

    // Clear current profile view if any
    this.currentProfile = null;
    this.updateProfileTabsActiveState();

    // Update UI
    this.noSelection.classList.add('hidden');
    this.profileContainer.classList.add('hidden');
    this.chatContainer.classList.remove('hidden');

    const tab = this.browserTabs.find(t => t.id === tabId);
    this.chatTitle.textContent = tab?.title || title;
    this.chatUrl.textContent = url;

    // Update pin button state
    this.updatePinButton();

    // Clear messages
    this.messagesContainer.innerHTML = '';

    // Mark as active in both lists
    this.tabsList.querySelectorAll('.tab-item').forEach(el => {
      el.classList.toggle('active', el.dataset.url === url);
    });
    this.pinnedList?.querySelectorAll('.tab-item').forEach(el => {
      el.classList.toggle('active', el.dataset.url === url);
    });

    // Join channel and get messages
    const result = await this.sendToBackground({ type: 'JOIN_TAB_CHANNEL', url });

    if (result.messages && result.messages.length > 0) {
      for (const msg of result.messages) {
        this.addMessage(msg);
      }
    }

    if (result.users) {
      this.updateUsers(result.users);
    }

    this.messageInput.focus();
  }

  async applyFilter() {
    if (!this.selectedUrl) return;

    // Get filter values
    const sinceDate = this.filterSince?.value;
    const untilDate = this.filterUntil?.value;
    const limit = parseInt(this.filterLimit?.value || '10');

    // Convert dates to unix timestamps
    const since = sinceDate ? Math.floor(new Date(sinceDate).getTime() / 1000) : null;
    const until = untilDate ? Math.floor(new Date(untilDate + 'T23:59:59').getTime() / 1000) : null;

    // Clear current messages
    this.messagesContainer.innerHTML = '';
    this.addSystemMessage(`Searching... (since: ${sinceDate || 'any'}, until: ${untilDate || 'now'}, limit: ${limit})`);

    // Request filtered messages
    const result = await this.sendToBackground({
      type: 'FETCH_MESSAGES',
      url: this.selectedUrl,
      since,
      until,
      limit
    });

    // Clear the searching message
    this.messagesContainer.innerHTML = '';

    if (result.messages && result.messages.length > 0) {
      this.addSystemMessage(`Found ${result.messages.length} message(s)`);
      for (const msg of result.messages) {
        this.addMessage(msg);
      }
    } else {
      this.addSystemMessage('No messages found for this filter');
    }
  }

  resetFilter() {
    // Clear filter inputs
    if (this.filterSince) this.filterSince.value = '';
    if (this.filterUntil) this.filterUntil.value = '';
    if (this.filterLimit) this.filterLimit.value = '10';

    // Reload current channel with default settings
    if (this.selectedUrl) {
      this.messagesContainer.innerHTML = '';
      this.selectTab(this.selectedTabId, this.selectedUrl, this.selectedTitle);
    }
  }

  async sendMessage() {
    let content = this.messageInput.value.trim();
    if (!content || !this.selectedUrl) return;

    // Convert emoji shortcodes
    content = this.convertShortcodes(content);

    this.messageInput.value = '';
    this.emojiPicker.classList.add('hidden');

    const result = await this.sendToBackground({
      type: 'SEND_MESSAGE',
      content
    });

    if (!result.success) {
      this.addSystemMessage('Failed to send message');
    }
  }

  convertShortcodes(text) {
    // Sort shortcodes by length (longest first) to avoid partial matches
    const sortedCodes = Object.keys(this.emojiShortcodes).sort((a, b) => b.length - a.length);
    for (const code of sortedCodes) {
      text = text.split(code).join(this.emojiShortcodes[code]);
    }
    return text;
  }

  toggleEmojiPicker() {
    this.emojiPicker.classList.toggle('hidden');
  }

  insertEmoji(emoji) {
    const input = this.messageInput;
    const start = input.selectionStart;
    const end = input.selectionEnd;
    const text = input.value;

    input.value = text.substring(0, start) + emoji + text.substring(end);
    input.focus();
    input.selectionStart = input.selectionEnd = start + emoji.length;
  }

  handleBackgroundMessage(msg) {
    switch (msg.type) {
      case 'NEW_MESSAGE':
        // Only show if we're viewing this channel (not profiles - they use wall posts)
        if (msg.url === this.selectedUrl || !msg.url) {
          this.addMessage(msg.message);
        }
        break;
      case 'PRESENCE_UPDATE':
        if (msg.url === this.selectedUrl) {
          this.updateUsers(msg.users);
        }
        // Update tab counts
        if (msg.url && msg.users) {
          this.tabUserCounts.set(msg.url, msg.users.length);
          this.renderTabs();
        }
        break;
      case 'GLOBAL_ACTIVITY':
        this.updateGlobalActivity(msg.activity);
        break;
      case 'CONNECTION_STATUS':
        this.updateConnectionStatus(msg.connected);
        break;
      case 'TAB_COUNTS_UPDATE':
        if (msg.counts) {
          this.tabUserCounts = new Map(Object.entries(msg.counts));
          this.renderTabs();
        }
        break;
    }
  }

  addMessage(msg) {
    // Skip if message already displayed
    if (msg.id && this.messagesContainer.querySelector(`[data-msg-id="${msg.id}"]`)) {
      return;
    }

    const div = document.createElement('div');
    div.className = `message ${msg.isOwn ? 'own' : ''}`;
    if (msg.id) {
      div.dataset.msgId = msg.id;
    }

    const time = new Date(msg.timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    });

    // Generate avatar color from pubkey (consistent color per user)
    const avatarColor = msg.pubkey ? this.getAvatarColor(msg.pubkey) : '#667eea';
    const initial = (msg.name || 'A').charAt(0).toUpperCase();

    if (msg.isOwn) {
      div.innerHTML = `
        <div class="content">${this.escapeHtml(msg.content)}</div>
        <div class="time">${time}</div>
      `;
    } else {
      div.innerHTML = `
        <div class="message-author clickable-author" data-pubkey="${this.escapeHtml(msg.pubkey || '')}" data-name="${this.escapeHtml(msg.name || 'Anonymous')}">
          <div class="message-avatar" style="background: ${avatarColor}">${initial}</div>
          <span class="author-name">${this.escapeHtml(msg.name || 'Anonymous')}</span>
        </div>
        <div class="content">${this.escapeHtml(msg.content)}</div>
        <div class="time">${time}</div>
      `;

      // Add click handler to open profile
      const authorEl = div.querySelector('.clickable-author');
      if (authorEl && msg.pubkey) {
        authorEl.addEventListener('click', () => {
          this.openProfile(msg.pubkey, msg.name || 'Anonymous');
        });
      }
    }

    this.messagesContainer.appendChild(div);
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
  }

  getAvatarColor(pubkey) {
    // Generate a consistent color from pubkey
    if (!pubkey || pubkey.length < 6) return '#667eea';
    const colors = [
      '#e94560', '#667eea', '#48bb78', '#ed8936', '#9f7aea',
      '#38b2ac', '#f56565', '#4299e1', '#ed64a6', '#68d391'
    ];
    const index = parseInt(pubkey.slice(0, 6), 16) % colors.length;
    return colors[index];
  }

  addSystemMessage(text) {
    const div = document.createElement('div');
    div.className = 'message system';
    div.innerHTML = `<div class="content">${this.escapeHtml(text)}</div>`;
    this.messagesContainer.appendChild(div);
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
  }

  updateUsers(users) {
    if (!users || users.length === 0) {
      this.usersList.innerHTML = '<span class="no-users">Just you</span>';
      this.userCount.textContent = '0';
      return;
    }

    this.usersList.innerHTML = users.map(user => `
      <span class="user-tag clickable ${user.isYou ? 'you' : ''}" data-pubkey="${this.escapeHtml(user.pubkey || '')}" data-name="${this.escapeHtml(user.name)}">${this.escapeHtml(user.name)}${user.isYou ? ' (you)' : ''}</span>
    `).join('');

    // Add click handlers to user tags
    this.usersList.querySelectorAll('.user-tag.clickable').forEach(el => {
      el.addEventListener('click', () => {
        const pubkey = el.dataset.pubkey;
        const name = el.dataset.name;
        if (pubkey) {
          this.openProfile(pubkey, name);
        }
      });
    });

    this.userCount.textContent = users.length.toString();
  }

  updateGlobalActivity(activity) {
    if (!activity || activity.length === 0) {
      this.activityList.innerHTML = '<div class="no-tabs">No activity yet</div>';
      return;
    }

    this.activityList.innerHTML = activity.slice(0, 10).map(item => {
      const hostname = this.getHostname(item.url);
      const path = this.getPath(item.url);

      return `
        <div class="tab-item" data-url="${this.escapeHtml(item.url)}">
          <div class="tab-favicon">&#127760;</div>
          <div class="tab-info">
            <div class="tab-title">${this.escapeHtml(hostname)}</div>
            <div class="tab-url">${this.escapeHtml(path)}</div>
          </div>
          <div class="tab-count">${item.userCount}</div>
        </div>
      `;
    }).join('');

    // Add click handlers to navigate
    this.activityList.querySelectorAll('.tab-item').forEach(el => {
      el.addEventListener('click', () => {
        const url = el.dataset.url;
        // Open the URL in a new tab
        chrome.tabs.create({ url });
      });
    });
  }

  updateConnectionStatus(connected) {
    if (connected) {
      this.connectionStatus.classList.add('connected');
      this.connectionStatus.classList.remove('disconnected');
      this.connectionStatus.querySelector('.status-text').textContent = 'Connected';
    } else {
      this.connectionStatus.classList.remove('connected');
      this.connectionStatus.classList.add('disconnected');
      this.connectionStatus.querySelector('.status-text').textContent = 'Disconnected';
    }
  }

  async handleGenerateKey() {
    this.generateKeyBtn.disabled = true;
    this.generateKeyBtn.textContent = 'Generating...';

    try {
      const result = await this.sendToBackground({ type: 'GENERATE_KEY' });

      if (result.success) {
        this.pubkeyDisplay.value = result.publicKey;
        this.showScreen('main');
        await this.loadBrowserTabs();
      } else {
        alert('Failed to generate key: ' + (result.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Failed to generate key:', error);
      alert('Failed to generate key');
    }

    this.generateKeyBtn.disabled = false;
    this.generateKeyBtn.textContent = 'Generate New Identity';
  }

  async handleImportKey() {
    const keyInput = this.importKeyInput.value.trim();
    if (!keyInput) {
      this.importKeyInput.focus();
      return;
    }

    this.importKeyBtn.disabled = true;
    this.importKeyBtn.textContent = 'Importing...';

    try {
      const result = await this.sendToBackground({
        type: 'IMPORT_KEY',
        key: keyInput
      });

      if (result.success) {
        this.pubkeyDisplay.value = result.publicKey;
        this.importKeyInput.value = '';
        this.showScreen('main');
        await this.loadBrowserTabs();
      } else {
        alert('Failed to import key: ' + (result.error || 'Invalid key format'));
      }
    } catch (error) {
      console.error('Failed to import key:', error);
      alert('Failed to import key');
    }

    this.importKeyBtn.disabled = false;
    this.importKeyBtn.textContent = 'Import Key';
  }

  showSettings() {
    chrome.storage.local.get(['userName']).then(({ userName }) => {
      this.settingsName.value = userName || '';
    });
    this.settingsModal.classList.remove('hidden');
  }

  hideSettings() {
    this.settingsModal.classList.add('hidden');
  }

  async saveSettings() {
    const name = this.settingsName.value.trim();
    if (name) {
      await this.sendToBackground({ type: 'SET_USERNAME', name });
    }
    this.hideSettings();
  }

  getHostname(url) {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  }

  getPath(url) {
    try {
      return new URL(url).pathname;
    } catch {
      return '';
    }
  }

  sendToBackground(message) {
    return chrome.runtime.sendMessage(message);
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Profile methods
  openMyProfile() {
    if (this.myPublicKey) {
      this.openProfile(this.myPublicKey, 'My Profile', true);
    }
  }

  async openProfile(pubkey, name, isOwn = false) {
    // Add to open profiles if not already there
    if (!this.openProfiles.find(p => p.pubkey === pubkey)) {
      this.openProfiles.push({ pubkey, name, isOwn });
      this.renderProfileTabs();
    }

    // Set as current profile
    this.currentProfile = { pubkey, name, isOwn, activeTab: 'mentions' };

    // Hide other views, show profile
    this.noSelection.classList.add('hidden');
    this.chatContainer.classList.add('hidden');
    this.profileContainer.classList.remove('hidden');

    // Update profile header
    this.profileName.textContent = isOwn ? 'My Profile' : name;
    this.profilePubkey.textContent = this.truncatePubkey(pubkey);

    // Set avatar color
    const avatarColor = this.getAvatarColor(pubkey);
    const avatarEl = document.getElementById('profile-avatar');
    if (avatarEl) {
      avatarEl.style.background = avatarColor;
      avatarEl.textContent = (name || 'U').charAt(0).toUpperCase();
    }

    // Set up tab click handlers
    this.setupProfileTabs();

    // Load the default tab (mentions)
    await this.loadProfileFeed('mentions');

    // Mark active in sidebar
    this.updateProfileTabsActiveState();

    // Update follow button state
    this.updateFollowButton();

    // Clear selection from other tabs
    this.tabsList.querySelectorAll('.tab-item').forEach(el => el.classList.remove('active'));
    this.pinnedList?.querySelectorAll('.tab-item').forEach(el => el.classList.remove('active'));
  }

  setupProfileTabs() {
    const tabButtons = document.querySelectorAll('.profile-tab');
    tabButtons.forEach(btn => {
      btn.addEventListener('click', async () => {
        const tab = btn.dataset.tab;
        if (tab && tab !== this.currentProfile?.activeTab) {
          // Update active state
          tabButtons.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          this.currentProfile.activeTab = tab;
          await this.loadProfileFeed(tab);
        }
      });
    });
  }

  async loadProfileFeed(tabType) {
    if (!this.currentProfile) return;

    const feedEl = document.getElementById('profile-feed');
    const loadingEl = document.getElementById('profile-loading');
    const emptyEl = document.getElementById('profile-empty');

    // Show loading state
    feedEl.innerHTML = '';
    loadingEl.classList.remove('hidden');
    emptyEl.classList.add('hidden');

    let result;
    if (tabType === 'mentions') {
      result = await this.sendToBackground({
        type: 'FETCH_MENTIONS',
        targetPubkey: this.currentProfile.pubkey,
        limit: 50
      });
    } else {
      result = await this.sendToBackground({
        type: 'FETCH_USER_POSTS',
        targetPubkey: this.currentProfile.pubkey,
        limit: 50
      });
    }

    loadingEl.classList.add('hidden');

    if (result.posts && result.posts.length > 0) {
      for (const post of result.posts) {
        this.addFeedItem(feedEl, post);
      }
    } else {
      emptyEl.textContent = tabType === 'mentions'
        ? 'No mentions found for this user'
        : 'No posts found from this user';
      emptyEl.classList.remove('hidden');
    }
  }

  addFeedItem(container, post) {
    const item = document.createElement('div');
    item.className = 'feed-item';
    item.dataset.eventId = post.id;

    const avatarColor = this.getAvatarColor(post.pubkey);
    const initial = (post.name || 'A').charAt(0).toUpperCase();
    const timeStr = this.formatRelativeTime(post.timestamp);

    // Build content HTML with images/links
    let contentHtml = this.escapeHtml(post.content);

    // Convert URLs to clickable links (except images)
    contentHtml = contentHtml.replace(
      /(https?:\/\/[^\s]+)/g,
      (url) => {
        if (/\.(jpg|jpeg|png|gif|webp)$/i.test(url)) {
          return url; // Don't linkify image URLs, we'll show them
        }
        return `<a href="${url}" target="_blank" rel="noopener">${this.truncateUrl(url)}</a>`;
      }
    );

    // Build images HTML
    let imagesHtml = '';
    if (post.images && post.images.length > 0) {
      if (post.images.length === 1) {
        imagesHtml = `<img class="feed-item-image" src="${this.escapeHtml(post.images[0])}" alt="Image" loading="lazy" onclick="window.open('${this.escapeHtml(post.images[0])}', '_blank')">`;
      } else {
        imagesHtml = `<div class="feed-item-images">${post.images.map(img =>
          `<img src="${this.escapeHtml(img)}" alt="Image" loading="lazy" onclick="window.open('${this.escapeHtml(img)}', '_blank')">`
        ).join('')}</div>`;
      }
    }

    // Build reaction/repost special content
    let specialContent = '';
    if (post.kind === 7 && post.reaction) {
      specialContent = `<div class="feed-item-reaction">${this.escapeHtml(post.reaction)}</div>`;
    }
    if (post.kind === 9735 && post.zapMessage) {
      contentHtml = this.escapeHtml(post.zapMessage);
    }

    item.innerHTML = `
      <div class="feed-item-header">
        <div class="feed-item-avatar" style="background: ${avatarColor}" data-pubkey="${this.escapeHtml(post.pubkey)}">${initial}</div>
        <div class="feed-item-meta">
          <div class="feed-item-author" data-pubkey="${this.escapeHtml(post.pubkey)}">${this.escapeHtml(post.name || 'Anonymous')}</div>
          <div class="feed-item-time">${timeStr}</div>
        </div>
        <div class="feed-item-kind">${this.escapeHtml(post.kindLabel || 'note')}</div>
      </div>
      <div class="feed-item-content">
        ${specialContent}
        <div class="feed-item-text">${contentHtml}</div>
        ${imagesHtml}
      </div>
      <div class="feed-item-footer">
        <div class="feed-item-id">${post.id.slice(0, 8)}...</div>
      </div>
    `;

    // Add click handlers for author
    item.querySelectorAll('[data-pubkey]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const pubkey = el.dataset.pubkey;
        if (pubkey && pubkey !== this.currentProfile?.pubkey) {
          this.openProfile(pubkey, post.name || 'User');
        }
      });
    });

    container.appendChild(item);
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

  truncateUrl(url) {
    try {
      const parsed = new URL(url);
      const path = parsed.pathname.length > 20
        ? parsed.pathname.slice(0, 20) + '...'
        : parsed.pathname;
      return parsed.hostname + path;
    } catch {
      return url.length > 40 ? url.slice(0, 40) + '...' : url;
    }
  }

  closeCurrentProfile() {
    if (!this.currentProfile) return;

    // Remove from open profiles
    this.openProfiles = this.openProfiles.filter(p => p.pubkey !== this.currentProfile.pubkey);
    this.currentProfile = null;

    this.renderProfileTabs();

    // Show empty state
    this.profileContainer.classList.add('hidden');
    this.noSelection.classList.remove('hidden');
  }

  closeProfile(pubkey) {
    // Remove from open profiles
    this.openProfiles = this.openProfiles.filter(p => p.pubkey !== pubkey);

    // If it was the current profile, close the view
    if (this.currentProfile?.pubkey === pubkey) {
      this.currentProfile = null;
      this.profileContainer.classList.add('hidden');
      this.noSelection.classList.remove('hidden');
    }

    this.renderProfileTabs();
  }

  renderProfileTabs() {
    if (!this.profileTabsList || !this.profileTabsSection) return;

    if (this.openProfiles.length === 0) {
      this.profileTabsSection.classList.add('hidden');
      return;
    }

    this.profileTabsSection.classList.remove('hidden');

    this.profileTabsList.innerHTML = this.openProfiles.map(profile => {
      const isActive = this.currentProfile?.pubkey === profile.pubkey;
      const displayName = profile.isOwn ? 'My Profile' : profile.name;

      return `
        <div class="tab-item profile-tab ${isActive ? 'active' : ''}" data-pubkey="${this.escapeHtml(profile.pubkey)}">
          <div class="tab-favicon">&#128100;</div>
          <div class="tab-info">
            <div class="tab-title">${this.escapeHtml(displayName)}</div>
            <div class="tab-url">${this.truncatePubkey(profile.pubkey)}</div>
          </div>
          <div class="tab-actions">
            <button class="unpin-btn close-profile-tab" data-pubkey="${this.escapeHtml(profile.pubkey)}" title="Close">&times;</button>
          </div>
        </div>
      `;
    }).join('');

    // Add click handlers
    this.profileTabsList.querySelectorAll('.tab-item').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.classList.contains('close-profile-tab')) return;
        const pubkey = el.dataset.pubkey;
        const profile = this.openProfiles.find(p => p.pubkey === pubkey);
        if (profile) {
          this.openProfile(profile.pubkey, profile.name, profile.isOwn);
        }
      });
    });

    // Add close handlers
    this.profileTabsList.querySelectorAll('.close-profile-tab').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const pubkey = btn.dataset.pubkey;
        this.closeProfile(pubkey);
      });
    });
  }

  updateProfileTabsActiveState() {
    this.profileTabsList?.querySelectorAll('.tab-item').forEach(el => {
      el.classList.toggle('active', el.dataset.pubkey === this.currentProfile?.pubkey);
    });
  }


  truncatePubkey(pubkey) {
    if (!pubkey || pubkey.length < 16) return pubkey;
    return `${pubkey.slice(0, 8)}...${pubkey.slice(-8)}`;
  }

  // Bech32 decoding for npub keys
  bech32Decode(str) {
    str = str.toLowerCase();
    const sepIndex = str.lastIndexOf('1');
    if (sepIndex < 1) return null;

    const hrp = str.slice(0, sepIndex);
    const data = str.slice(sepIndex + 1);

    const values = [];
    for (const char of data) {
      const idx = this.BECH32_ALPHABET.indexOf(char);
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

  bytesToHex(bytes) {
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // Parse public key input - supports npub1... or hex format
  parsePublicKey(input) {
    input = input.trim();

    // Check for npub bech32 format
    if (input.startsWith('npub1')) {
      const decoded = this.bech32Decode(input);
      if (!decoded || decoded.hrp !== 'npub' || decoded.bytes.length !== 32) {
        return { error: 'Invalid npub key format' };
      }
      return { pubkey: this.bytesToHex(decoded.bytes) };
    }

    // Check for hex format (64 chars)
    if (/^[a-fA-F0-9]{64}$/.test(input)) {
      return { pubkey: input.toLowerCase() };
    }

    return { error: 'Invalid key format. Use npub1... or 64-char hex.' };
  }

  handleProfileSearch() {
    const input = this.profileSearchInput?.value.trim();
    if (!input) {
      this.profileSearchInput?.focus();
      return;
    }

    const parsed = this.parsePublicKey(input);
    if (parsed.error) {
      alert(parsed.error);
      return;
    }

    // Clear the input
    this.profileSearchInput.value = '';

    // Open the profile
    this.openProfile(parsed.pubkey, 'User');
  }

  // ==================== Following / Friends List ====================

  async loadFollowingList() {
    try {
      const result = await this.sendToBackground({ type: 'GET_FOLLOWING' });
      this.following = result.following || [];
      this.renderFollowingList();
    } catch (error) {
      console.error('Failed to load following list:', error);
      this.following = [];
    }
  }

  renderFollowingList() {
    const listEl = document.getElementById('following-list');
    const countEl = document.getElementById('following-count');

    if (!listEl) return;

    // Update count
    if (countEl) {
      countEl.textContent = this.following.length;
    }

    if (this.following.length === 0) {
      listEl.innerHTML = '<div class="empty-list">Not following anyone yet</div>';
      return;
    }

    listEl.innerHTML = this.following.map(user => {
      const avatarColor = this.getAvatarColor(user.pubkey);
      const initial = (user.name || user.displayName || 'A').charAt(0).toUpperCase();
      const avatarStyle = user.picture
        ? `background-image: url('${this.escapeHtml(user.picture)}')`
        : `background: ${avatarColor}`;

      return `
        <div class="following-item" data-pubkey="${this.escapeHtml(user.pubkey)}">
          <div class="following-avatar" style="${avatarStyle}">${user.picture ? '' : initial}</div>
          <div class="following-info">
            <div class="following-name">${this.escapeHtml(user.name || user.displayName || this.truncatePubkey(user.pubkey))}</div>
            ${user.nip05 ? `<div class="following-nip05">${this.escapeHtml(user.nip05)}</div>` : ''}
          </div>
        </div>
      `;
    }).join('');

    // Add click handlers
    listEl.querySelectorAll('.following-item').forEach(el => {
      el.addEventListener('click', () => {
        const pubkey = el.dataset.pubkey;
        const user = this.following.find(u => u.pubkey === pubkey);
        this.openProfile(pubkey, user?.name || user?.displayName || 'User');
      });
    });
  }

  async toggleFollow() {
    if (!this.currentProfile || this.currentProfile.isOwn) return;

    const pubkey = this.currentProfile.pubkey;
    const isCurrentlyFollowing = this.following.some(u => u.pubkey === pubkey);

    // Disable button during request
    this.followBtn.disabled = true;
    this.followBtn.textContent = isCurrentlyFollowing ? 'Unfollowing...' : 'Following...';

    try {
      if (isCurrentlyFollowing) {
        await this.sendToBackground({ type: 'UNFOLLOW_USER', pubkey });
      } else {
        await this.sendToBackground({
          type: 'FOLLOW_USER',
          pubkey,
          petname: this.currentProfile.name
        });
      }

      // Reload following list
      await this.loadFollowingList();

      // Update button state
      this.updateFollowButton();
    } catch (error) {
      console.error('Failed to toggle follow:', error);
    }

    this.followBtn.disabled = false;
  }

  updateFollowButton() {
    if (!this.followBtn || !this.currentProfile) return;

    // Don't show follow button for own profile
    if (this.currentProfile.isOwn) {
      this.followBtn.classList.add('hidden');
      return;
    }

    this.followBtn.classList.remove('hidden');

    const isFollowing = this.following.some(u => u.pubkey === this.currentProfile.pubkey);

    if (isFollowing) {
      this.followBtn.textContent = 'Following';
      this.followBtn.classList.add('following');
      this.followBtn.title = 'Click to unfollow';
    } else {
      this.followBtn.textContent = 'Follow';
      this.followBtn.classList.remove('following');
      this.followBtn.title = 'Follow this user';
    }
  }

  // ==================== @Mention Autocomplete ====================

  handleMentionInput(e) {
    const input = e.target;
    const value = input.value;
    const cursorPos = input.selectionStart;

    // Find if we're typing a mention (@ followed by text)
    const textBeforeCursor = value.substring(0, cursorPos);
    const mentionMatch = textBeforeCursor.match(/@(\w*)$/);

    if (mentionMatch) {
      const query = mentionMatch[1].toLowerCase();
      this.showMentionPicker(query);
    } else {
      this.hideMentionPicker();
    }
  }

  handleMentionKeydown(e) {
    if (!this.mentionPicker || this.mentionPicker.classList.contains('hidden')) {
      return;
    }

    const items = this.mentionPicker.querySelectorAll('.mention-item');
    if (items.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.mentionSelectedIndex = Math.min(this.mentionSelectedIndex + 1, items.length - 1);
      this.updateMentionSelection();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.mentionSelectedIndex = Math.max(this.mentionSelectedIndex - 1, 0);
      this.updateMentionSelection();
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      if (items[this.mentionSelectedIndex]) {
        e.preventDefault();
        const pubkey = items[this.mentionSelectedIndex].dataset.pubkey;
        const name = items[this.mentionSelectedIndex].dataset.name;
        this.insertMention(pubkey, name);
      }
    } else if (e.key === 'Escape') {
      this.hideMentionPicker();
    }
  }

  showMentionPicker(query) {
    if (!this.mentionPicker || !this.mentionList) return;

    // Filter following list by query
    let matches = this.following.filter(user => {
      const name = (user.name || user.displayName || '').toLowerCase();
      const nip05 = (user.nip05 || '').toLowerCase();
      return name.includes(query) || nip05.includes(query);
    });

    // Limit to 5 results
    matches = matches.slice(0, 5);

    if (matches.length === 0) {
      this.mentionList.innerHTML = '<div class="mention-empty">No matches found</div>';
    } else {
      this.mentionList.innerHTML = matches.map((user, index) => {
        const avatarColor = this.getAvatarColor(user.pubkey);
        const initial = (user.name || user.displayName || 'A').charAt(0).toUpperCase();
        const avatarStyle = user.picture
          ? `background-image: url('${this.escapeHtml(user.picture)}')`
          : `background: ${avatarColor}`;
        const displayName = user.name || user.displayName || this.truncatePubkey(user.pubkey);

        return `
          <div class="mention-item ${index === 0 ? 'selected' : ''}"
               data-pubkey="${this.escapeHtml(user.pubkey)}"
               data-name="${this.escapeHtml(displayName)}">
            <div class="mention-avatar" style="${avatarStyle}">${user.picture ? '' : initial}</div>
            <div class="mention-info">
              <div class="mention-name">${this.escapeHtml(displayName)}</div>
              <div class="mention-pubkey">${user.pubkey.slice(0, 8)}...</div>
            </div>
          </div>
        `;
      }).join('');

      // Add click handlers
      this.mentionList.querySelectorAll('.mention-item').forEach(el => {
        el.addEventListener('click', () => {
          this.insertMention(el.dataset.pubkey, el.dataset.name);
        });
      });
    }

    this.mentionSelectedIndex = 0;
    this.mentionPicker.classList.remove('hidden');
  }

  hideMentionPicker() {
    if (this.mentionPicker) {
      this.mentionPicker.classList.add('hidden');
    }
  }

  updateMentionSelection() {
    const items = this.mentionPicker?.querySelectorAll('.mention-item');
    if (!items) return;

    items.forEach((item, index) => {
      item.classList.toggle('selected', index === this.mentionSelectedIndex);
    });
  }

  insertMention(pubkey, name) {
    const input = this.messageInput;
    if (!input) return;

    const value = input.value;
    const cursorPos = input.selectionStart;

    // Find the @ that started this mention
    const textBeforeCursor = value.substring(0, cursorPos);
    const mentionMatch = textBeforeCursor.match(/@(\w*)$/);

    if (mentionMatch) {
      const mentionStart = cursorPos - mentionMatch[0].length;
      const beforeMention = value.substring(0, mentionStart);
      const afterMention = value.substring(cursorPos);

      // Insert the mention with nostr: prefix for NIP-27 compatibility
      // Format: @name (with pubkey stored for sending)
      const mentionText = `@${name} `;

      input.value = beforeMention + mentionText + afterMention;

      // Store the mention mapping for when we send
      if (!this.pendingMentions) {
        this.pendingMentions = [];
      }
      this.pendingMentions.push({ name, pubkey });

      // Move cursor after the mention
      const newCursorPos = beforeMention.length + mentionText.length;
      input.setSelectionRange(newCursorPos, newCursorPos);
    }

    this.hideMentionPicker();
    input.focus();
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new BarcDashboard();
});
