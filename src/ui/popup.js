// Popup UI logic for Barc

class BarcPopup {
  constructor() {
    this.currentUrl = null;
    this.globalActivity = [];

    // DOM elements
    this.setupScreen = document.getElementById('setup-screen');
    this.chatScreen = document.getElementById('chat-screen');
    this.settingsScreen = document.getElementById('settings-screen');

    // Setup elements
    this.generateKeyBtn = document.getElementById('generate-key-btn');
    this.importKeyInput = document.getElementById('import-key-input');
    this.importKeyBtn = document.getElementById('import-key-btn');

    // Tab elements
    this.tabChat = document.getElementById('tab-chat');
    this.tabActivity = document.getElementById('tab-activity');
    this.chatView = document.getElementById('chat-view');
    this.activityView = document.getElementById('activity-view');
    this.activityList = document.getElementById('activity-list');

    // Chat elements
    this.pageUrl = document.getElementById('page-url');
    this.usersList = document.getElementById('users-list');
    this.messagesContainer = document.getElementById('messages');
    this.messageInput = document.getElementById('message-input');
    this.sendBtn = document.getElementById('send-btn');

    this.connectionStatus = document.getElementById('connection-status');
    this.userCount = document.getElementById('user-count');

    // Settings elements
    this.settingsToggle = document.getElementById('settings-toggle');
    this.settingsName = document.getElementById('settings-name');
    this.pubkeyDisplay = document.getElementById('pubkey-display');
    this.saveSettingsBtn = document.getElementById('save-settings');
    this.closeSettingsBtn = document.getElementById('close-settings');

    this.bindEvents();
    this.init();
  }

  bindEvents() {
    // Setup - key management
    this.generateKeyBtn.addEventListener('click', () => this.handleGenerateKey());
    this.importKeyBtn.addEventListener('click', () => this.handleImportKey());
    this.importKeyInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.handleImportKey();
    });

    // Tabs
    this.tabChat.addEventListener('click', () => this.showTab('chat'));
    this.tabActivity.addEventListener('click', () => this.showTab('activity'));

    // Chat
    this.sendBtn.addEventListener('click', () => this.sendMessage());
    this.messageInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });

    // Settings
    this.settingsToggle.addEventListener('click', () => this.showSettings());
    this.saveSettingsBtn.addEventListener('click', () => this.saveSettings());
    this.closeSettingsBtn.addEventListener('click', () => this.hideSettings());

    // Listen for messages from background
    chrome.runtime.onMessage.addListener((msg) => this.handleBackgroundMessage(msg));

    // Notify background when popup closes
    window.addEventListener('unload', () => {
      this.sendToBackground({ type: 'POPUP_CLOSED' });
    });
  }

  async init() {
    // Tell background popup is open (joins channel and clears unread badge)
    const openResult = await this.sendToBackground({ type: 'POPUP_OPENED' });

    // Initialize and get status
    const initResult = await this.sendToBackground({ type: 'INIT' });
    const status = await this.sendToBackground({ type: 'GET_STATUS' });

    // Use URL from popup opened result, or status, or query directly
    this.currentUrl = openResult.url || status.url;

    // If still no URL, try querying directly
    if (!this.currentUrl || this.currentUrl.startsWith('chrome')) {
      const urlResult = await this.sendToBackground({ type: 'GET_CURRENT_URL' });
      if (urlResult.url && !urlResult.url.startsWith('chrome')) {
        this.currentUrl = urlResult.url;
      }
    }

    // Check if user has a key set up
    const { privateKey } = await chrome.storage.local.get(['privateKey']);

    if (!privateKey) {
      this.showScreen('setup');
    } else {
      this.showScreen('chat');
      this.updateUI(status);
      this.updatePageInfo();
      this.updateActivity(status.globalActivity || []);
    }

    // Update connection status
    if (status.connected) {
      this.connectionStatus.classList.add('connected');
      this.connectionStatus.classList.remove('disconnected');
    }

    // Set pubkey in settings
    if (status.publicKey) {
      this.pubkeyDisplay.value = status.publicKey;
    }
  }

  showScreen(screen) {
    this.setupScreen.classList.add('hidden');
    this.chatScreen.classList.add('hidden');
    this.settingsScreen.classList.add('hidden');

    if (screen === 'setup') {
      this.setupScreen.classList.remove('hidden');
    } else if (screen === 'chat') {
      this.chatScreen.classList.remove('hidden');
    } else if (screen === 'settings') {
      this.settingsScreen.classList.remove('hidden');
    }
  }

  showTab(tab) {
    this.tabChat.classList.toggle('active', tab === 'chat');
    this.tabActivity.classList.toggle('active', tab === 'activity');
    this.chatView.classList.toggle('hidden', tab !== 'chat');
    this.activityView.classList.toggle('hidden', tab !== 'activity');
  }

  async handleGenerateKey() {
    this.generateKeyBtn.disabled = true;
    this.generateKeyBtn.textContent = 'Generating...';

    try {
      const result = await this.sendToBackground({ type: 'GENERATE_KEY' });

      if (result.success) {
        this.pubkeyDisplay.value = result.publicKey;
        // Refresh status after key generation (will have auto-joined channel)
        const status = await this.sendToBackground({ type: 'GET_STATUS' });
        this.currentUrl = status.url;
        this.showScreen('chat');
        this.updateUI(status);
        this.updatePageInfo();
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
        // Refresh status after key import (will have auto-joined channel)
        const status = await this.sendToBackground({ type: 'GET_STATUS' });
        this.currentUrl = status.url;
        this.showScreen('chat');
        this.updateUI(status);
        this.updatePageInfo();
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

  updatePageInfo() {
    if (this.currentUrl) {
      try {
        const url = new URL(this.currentUrl);
        this.pageUrl.textContent = url.hostname + url.pathname;
        this.pageUrl.title = this.currentUrl;
      } catch {
        this.pageUrl.textContent = this.currentUrl;
      }
    } else {
      this.pageUrl.textContent = 'No page detected';
    }
  }

  async sendMessage() {
    const content = this.messageInput.value.trim();
    if (!content) return;

    this.messageInput.value = '';

    const result = await this.sendToBackground({
      type: 'SEND_MESSAGE',
      content
    });

    if (!result.success) {
      // Check connection status for more specific error
      const status = await this.sendToBackground({ type: 'GET_STATUS' });
      if (!status.connected) {
        this.addSystemMessage('Not connected to any relays');
      } else if (!status.channelId) {
        this.addSystemMessage('No channel joined - try refreshing');
      } else {
        this.addSystemMessage('Failed to send message');
      }
    }
  }

  handleBackgroundMessage(msg) {
    switch (msg.type) {
      case 'NEW_MESSAGE':
        this.addMessage(msg.message);
        break;
      case 'PRESENCE_UPDATE':
        this.updateUsers(msg.users);
        break;
      case 'GLOBAL_ACTIVITY':
        this.updateActivity(msg.activity);
        break;
      case 'TAB_CHANGED':
        this.currentUrl = msg.url;
        this.updatePageInfo();
        // Clear messages when switching pages
        this.messagesContainer.innerHTML = '';
        break;
    }
  }

  addMessage(msg) {
    const div = document.createElement('div');
    div.className = `message ${msg.isOwn ? 'own' : ''}`;

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
    div.className = 'welcome-msg';
    div.innerHTML = `<p>${this.escapeHtml(text)}</p>`;
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

  updateUI(status) {
    if (status.connected) {
      this.connectionStatus.classList.add('connected');
      this.connectionStatus.classList.remove('disconnected');
    } else {
      this.connectionStatus.classList.remove('connected');
      this.connectionStatus.classList.add('disconnected');
    }

    this.updateUsers(status.users);
  }

  updateActivity(activity) {
    this.globalActivity = activity || [];

    if (this.globalActivity.length === 0) {
      this.activityList.innerHTML = '<div class="no-activity">No activity yet - browse some pages!</div>';
      return;
    }

    this.activityList.innerHTML = this.globalActivity.map(item => {
      let hostname = '';
      let path = '';
      try {
        const url = new URL(item.url);
        hostname = url.hostname;
        path = url.pathname;
      } catch {
        hostname = item.url;
      }

      return `
        <div class="activity-item ${item.isCurrentPage ? 'current' : ''}" data-url="${this.escapeHtml(item.url)}">
          <div class="activity-url">
            <div class="hostname">${this.escapeHtml(hostname)}</div>
            <div class="path">${this.escapeHtml(path)}</div>
          </div>
          <div class="activity-count">
            ${item.userCount} ${item.userCount === 1 ? 'person' : 'people'}
          </div>
        </div>
      `;
    }).join('');

    // Add click handlers to navigate to pages
    this.activityList.querySelectorAll('.activity-item').forEach(el => {
      el.addEventListener('click', () => {
        const url = el.dataset.url;
        if (url) {
          chrome.tabs.create({ url });
        }
      });
    });
  }

  async showSettings() {
    const { userName } = await chrome.storage.local.get(['userName']);
    this.settingsName.value = userName || '';
    const status = await this.sendToBackground({ type: 'GET_STATUS' });
    if (status.publicKey) {
      this.pubkeyDisplay.value = status.publicKey;
    }
    this.showScreen('settings');
  }

  async saveSettings() {
    const name = this.settingsName.value.trim();
    if (name) {
      await this.sendToBackground({ type: 'SET_USERNAME', name });
    }
    this.hideSettings();
  }

  hideSettings() {
    this.showScreen('chat');
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
  new BarcPopup();
});
