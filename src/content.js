// Content script for Barc - embedded chat widget on pages

class BarcWidget {
  constructor() {
    this.isOpen = false;
    this.isInChannel = false;
    this.messages = [];
    this.widget = null;

    this.init();
  }

  init() {
    // Create floating widget
    this.createWidget();

    // Listen for messages from background
    chrome.runtime.onMessage.addListener((msg) => this.handleMessage(msg));

    // Report current URL to background
    this.reportUrl();
  }

  createWidget() {
    // Main container
    this.widget = document.createElement('div');
    this.widget.id = 'barc-widget';
    this.widget.innerHTML = `
      <div class="barc-fab" id="barc-fab">
        <span class="barc-fab-icon">◉</span>
        <span class="barc-fab-badge" id="barc-badge" style="display:none">0</span>
      </div>
      <div class="barc-panel" id="barc-panel" style="display:none">
        <div class="barc-header">
          <span class="barc-title">Barc Chat</span>
          <div class="barc-header-controls">
            <span class="barc-user-count" id="barc-user-count">0 here</span>
            <button class="barc-close" id="barc-close">×</button>
          </div>
        </div>
        <div class="barc-messages" id="barc-messages">
          <div class="barc-info">Click to join the conversation on this page</div>
        </div>
        <div class="barc-input-area">
          <input type="text" id="barc-input" placeholder="Type a message..." disabled>
          <button id="barc-send" disabled>→</button>
        </div>
      </div>
    `;

    document.body.appendChild(this.widget);

    // Bind events
    this.fab = document.getElementById('barc-fab');
    this.panel = document.getElementById('barc-panel');
    this.closeBtn = document.getElementById('barc-close');
    this.messagesEl = document.getElementById('barc-messages');
    this.inputEl = document.getElementById('barc-input');
    this.sendBtn = document.getElementById('barc-send');
    this.badgeEl = document.getElementById('barc-badge');
    this.userCountEl = document.getElementById('barc-user-count');

    this.fab.addEventListener('click', () => this.toggle());
    this.closeBtn.addEventListener('click', () => this.toggle());
    this.sendBtn.addEventListener('click', () => this.sendMessage());
    this.inputEl.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.sendMessage();
    });

    // Click on messages area to join when not in channel
    this.messagesEl.addEventListener('click', () => {
      if (!this.isInChannel) {
        this.joinChannel();
      }
    });
  }

  toggle() {
    this.isOpen = !this.isOpen;
    this.panel.style.display = this.isOpen ? 'flex' : 'none';
    this.fab.classList.toggle('active', this.isOpen);

    if (this.isOpen) {
      this.badgeEl.style.display = 'none';
      this.badgeEl.textContent = '0';
      this.inputEl.focus();
    }
  }

  async joinChannel() {
    try {
      const result = await chrome.runtime.sendMessage({
        type: 'JOIN_CHANNEL',
        url: window.location.href
      });

      this.isInChannel = true;
      this.inputEl.disabled = false;
      this.sendBtn.disabled = false;
      this.messagesEl.innerHTML = '<div class="barc-info">Connected! Waiting for others...</div>';

      if (result.users) {
        this.updateUserCount(result.users.length);
      }
    } catch (error) {
      console.error('Barc: Failed to join channel', error);
    }
  }

  async sendMessage() {
    const content = this.inputEl.value.trim();
    if (!content || !this.isInChannel) return;

    this.inputEl.value = '';

    await chrome.runtime.sendMessage({
      type: 'SEND_MESSAGE',
      content
    });
  }

  handleMessage(msg) {
    switch (msg.type) {
      case 'NEW_MESSAGE':
        this.addMessage(msg.message);
        break;
      case 'PRESENCE_UPDATE':
        this.updateUserCount(msg.users?.length || 0);
        break;
    }
  }

  addMessage(msg) {
    // Remove info message if present
    const info = this.messagesEl.querySelector('.barc-info');
    if (info) info.remove();

    const div = document.createElement('div');
    div.className = `barc-msg ${msg.isOwn ? 'own' : ''}`;
    div.innerHTML = `
      <span class="barc-msg-author">${this.escapeHtml(msg.name)}</span>
      <span class="barc-msg-text">${this.escapeHtml(msg.content)}</span>
    `;

    this.messagesEl.appendChild(div);
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;

    // Show badge if panel is closed
    if (!this.isOpen && !msg.isOwn) {
      const count = parseInt(this.badgeEl.textContent || '0') + 1;
      this.badgeEl.textContent = count.toString();
      this.badgeEl.style.display = 'flex';
    }
  }

  updateUserCount(count) {
    this.userCountEl.textContent = `${count} here`;
  }

  reportUrl() {
    // Let background know our URL
    chrome.runtime.sendMessage({
      type: 'CONTENT_READY',
      url: window.location.href
    }).catch(() => {});
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Only init if not in an iframe
if (window.self === window.top) {
  new BarcWidget();
}
