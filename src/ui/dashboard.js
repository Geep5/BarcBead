// Dashboard UI for Barc

class BarcDashboard {
  constructor() {
    this.browserTabs = []; // All browser tabs
    this.selectedTabId = null; // Currently selected tab for chat
    this.selectedUrl = null;
    this.tabUserCounts = new Map(); // url -> user count

    // DOM elements
    this.setupOverlay = document.getElementById('setup-overlay');
    this.mainLayout = document.getElementById('main-layout');
    this.generateKeyBtn = document.getElementById('generate-key-btn');
    this.importKeyInput = document.getElementById('import-key-input');
    this.importKeyBtn = document.getElementById('import-key-btn');

    this.tabsList = document.getElementById('tabs-list');
    this.activityList = document.getElementById('activity-list');
    this.connectionStatus = document.getElementById('connection-status');

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

    // Emoji picker
    this.emojiBtn = document.getElementById('emoji-btn');
    this.emojiPicker = document.getElementById('emoji-picker');

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
        }
      }

      // Load browser tabs
      await this.loadBrowserTabs();

      // Load global activity
      if (status.globalActivity) {
        this.updateGlobalActivity(status.globalActivity);
      }
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
        this.selectTab(tabId, url);
      });
    });
  }

  async selectTab(tabId, url) {
    if (this.selectedUrl === url) return;

    this.selectedTabId = tabId;
    this.selectedUrl = url;

    // Update UI
    this.noSelection.classList.add('hidden');
    this.chatContainer.classList.remove('hidden');

    const tab = this.browserTabs.find(t => t.id === tabId);
    this.chatTitle.textContent = tab?.title || 'Page';
    this.chatUrl.textContent = url;

    // Clear messages
    this.messagesContainer.innerHTML = '';

    // Mark as active in list
    this.tabsList.querySelectorAll('.tab-item').forEach(el => {
      el.classList.toggle('active', parseInt(el.dataset.tabId) === tabId);
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
        // Only show if we're viewing this channel
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

    div.innerHTML = `
      ${!msg.isOwn ? `<div class="author">${this.escapeHtml(msg.name)}</div>` : ''}
      <div class="content">${this.escapeHtml(msg.content)}</div>
      <div class="time">${time}</div>
    `;

    this.messagesContainer.appendChild(div);
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
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
      <span class="user-tag ${user.isYou ? 'you' : ''}">${this.escapeHtml(user.name)}${user.isYou ? ' (you)' : ''}</span>
    `).join('');

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
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new BarcDashboard();
});
