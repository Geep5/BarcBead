// Dashboard UI for Barc

class BarcDashboard {
  constructor() {
    this.browserTabs = []; // All browser tabs from Chrome
    this.pinnedChannels = []; // Pinned/locked channels that persist
    this.tabUserCounts = new Map(); // url -> user count

    // NEW: Header Tab Management (browser-style tabs)
    this.headerTabs = [
      { id: 'tab-private', type: 'dm-home', name: 'Private', closable: false }
    ];
    this.activeHeaderTabId = 'tab-private';

    // Current view state
    this.selectedTabId = null; // Currently selected Chrome tab for chat
    this.selectedUrl = null;
    this.selectedTitle = null;

    // Profile state
    this.openProfiles = []; // Array of {pubkey, name} for open profile tabs
    this.currentProfile = null; // Currently viewing profile {pubkey, name}
    this.myPublicKey = null; // User's own public key

    // Following state
    this.followingList = []; // Array of {pubkey, name, picture, nip05}
    this.mentionSelectedIndex = 0; // Selected index in mention autocomplete

    // Friends state (mutual follows)
    this.mutualFollowsCache = new Map(); // pubkey -> boolean (is mutual follow / friend)
    this.mutualFollowsCacheExpiry = 5 * 60 * 1000; // 5 minute cache
    this.mutualFollowsCacheTime = 0;

    // Sidebar resize state
    this.isResizing = false;
    this.sidebarWidth = 280;

    // DOM elements - Setup
    this.setupOverlay = document.getElementById('setup-overlay');
    this.mainLayout = document.getElementById('main-layout');
    this.generateKeyBtn = document.getElementById('generate-key-btn');
    this.importKeyInput = document.getElementById('import-key-input');
    this.importKeyBtn = document.getElementById('import-key-btn');

    // DOM elements - Header
    this.browserHeader = document.getElementById('browser-header');
    this.tabsStrip = document.getElementById('tabs-strip');
    this.newTabBtn = document.getElementById('new-tab-btn');
    this.userMenuBtn = document.getElementById('user-menu-btn');
    this.userDropdown = document.getElementById('user-dropdown');
    this.headerAvatar = document.getElementById('header-avatar');

    // DOM elements - New Tab Popover
    this.newTabPopover = document.getElementById('new-tab-popover');
    this.popoverSearch = document.getElementById('popover-search');
    this.popoverWebsites = document.getElementById('popover-websites');
    this.popoverTags = document.getElementById('popover-tags');
    this.createTagBtn = document.getElementById('create-tag-btn');
    this.createTagName = document.getElementById('create-tag-name');

    // DOM elements - Sidebar
    this.sidebar = document.getElementById('sidebar');
    this.sidebarTitle = document.getElementById('sidebar-title-text');
    this.sidebarIconDm = document.getElementById('sidebar-icon-dm');
    this.sidebarIconLobby = document.getElementById('sidebar-icon-lobby');
    this.dmList = document.getElementById('dm-list');
    this.lobbyList = document.getElementById('lobby-list');
    this.onlineCount = document.getElementById('online-count');
    this.resizeHandle = document.getElementById('resize-handle');

    // DOM elements - Legacy sidebar (for compatibility)
    this.pinnedList = document.getElementById('pinned-list');
    this.tabsList = document.getElementById('tabs-list');
    this.activityList = document.getElementById('activity-list');
    this.connectionStatus = document.getElementById('connection-status');
    this.pinBtn = document.getElementById('pin-btn');

    // DOM elements - Chat area
    this.noSelection = document.getElementById('no-selection');
    this.chatContainer = document.getElementById('chat-container');
    this.chatTitle = document.getElementById('chat-title');
    this.chatWelcome = document.getElementById('chat-welcome');
    this.welcomeIcon = document.getElementById('welcome-icon');
    this.welcomeTitle = document.getElementById('welcome-title');
    this.welcomeDescription = document.getElementById('welcome-description');
    this.messagesContainer = document.getElementById('messages');
    this.messageInput = document.getElementById('message-input');
    this.sendBtn = document.getElementById('send-btn');

    // DOM elements - Settings
    this.settingsModal = document.getElementById('settings-modal');
    this.closeSettingsBtn = document.getElementById('close-settings');
    this.settingsName = document.getElementById('settings-name');
    this.settingsAvatar = document.getElementById('settings-avatar');
    this.settingsAvatarPreview = document.getElementById('settings-avatar-preview');
    this.pubkeyDisplay = document.getElementById('pubkey-display');
    this.saveSettingsBtn = document.getElementById('save-settings');
    this.dropdownSettings = document.getElementById('dropdown-settings');
    this.dropdownLogout = document.getElementById('dropdown-logout');
    this.dropdownUserName = document.getElementById('dropdown-user-name');
    this.dropdownUserId = document.getElementById('dropdown-user-id');

    // DOM elements - Profile
    this.profileContainer = document.getElementById('profile-container');
    this.profileName = document.getElementById('profile-name');
    this.profilePubkey = document.getElementById('profile-pubkey');
    this.closeProfileBtn = document.getElementById('close-profile-btn');
    this.followBtn = document.getElementById('follow-btn');

    // DOM elements - Emoji picker
    this.emojiBtn = document.getElementById('emoji-btn');
    this.emojiPicker = document.getElementById('emoji-picker');

    // DOM elements - Mention picker
    this.mentionPicker = document.getElementById('mention-picker');
    this.mentionList = document.getElementById('mention-list');

    // Legacy compatibility aliases
    this.settingsBtn = this.dropdownSettings;
    this.myProfileBtn = this.userMenuBtn;
    this.profileTabsSection = null;
    this.profileTabsList = null;

    // Log critical elements for debugging
    console.log('[Dashboard] Constructor - Critical elements:', {
      tabsStrip: !!this.tabsStrip,
      newTabBtn: !!this.newTabBtn,
      newTabPopover: !!this.newTabPopover,
      sidebar: !!this.sidebar,
      setupOverlay: !!this.setupOverlay,
      mainLayout: !!this.mainLayout
    });

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
    console.log('[Dashboard] bindEvents - Starting event binding');

    // Setup
    this.generateKeyBtn.addEventListener('click', () => this.handleGenerateKey());
    this.importKeyBtn.addEventListener('click', () => this.handleImportKey());
    this.importKeyInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.handleImportKey();
    });

    // ==================== NEW TAB MANAGEMENT ====================

    // New tab button - toggle popover
    this.newTabBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleNewTabPopover();
    });

    // Popover search input
    this.popoverSearch?.addEventListener('input', (e) => {
      this.filterPopoverItems(e.target.value);
    });

    // Create tag button
    this.createTagBtn?.addEventListener('click', () => {
      const tagName = this.popoverSearch?.value.trim();
      if (tagName) {
        this.createTagTab(tagName);
      }
    });

    // ==================== USER DROPDOWN ====================

    // User menu button - toggle dropdown
    this.userMenuBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleUserDropdown();
    });

    // Dropdown settings button
    this.dropdownSettings?.addEventListener('click', () => {
      this.hideUserDropdown();
      this.showSettings();
    });

    // Dropdown logout button
    this.dropdownLogout?.addEventListener('click', () => {
      this.hideUserDropdown();
      this.handleLogout();
    });

    // ==================== SIDEBAR RESIZE ====================

    this.resizeHandle?.addEventListener('mousedown', (e) => {
      this.startResize(e);
    });

    document.addEventListener('mousemove', (e) => {
      if (this.isResizing) {
        this.handleResize(e);
      }
    });

    document.addEventListener('mouseup', () => {
      this.stopResize();
    });

    // ==================== CLOSE POPOVERS ON OUTSIDE CLICK ====================

    document.addEventListener('click', (e) => {
      // Close new tab popover
      if (this.newTabPopover && !this.newTabPopover.contains(e.target) && e.target !== this.newTabBtn) {
        this.hideNewTabPopover();
      }

      // Close user dropdown
      if (this.userDropdown && !this.userDropdown.contains(e.target) && !this.userMenuBtn?.contains(e.target)) {
        this.hideUserDropdown();
      }

      // Close emoji picker
      if (this.emojiPicker && !this.emojiPicker.contains(e.target) && e.target !== this.emojiBtn) {
        this.emojiPicker.classList.add('hidden');
      }

      // Close mention picker
      if (!e.target.closest('.input-wrapper')) {
        this.hideMentionPicker();
      }
    });

    // ==================== CHAT ====================

    this.sendBtn?.addEventListener('click', () => this.sendMessage());
    this.messageInput?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });

    // Auto-resize textarea
    this.messageInput?.addEventListener('input', () => {
      this.messageInput.style.height = 'auto';
      this.messageInput.style.height = Math.min(this.messageInput.scrollHeight, 120) + 'px';
    });

    // ==================== SETTINGS ====================

    this.closeSettingsBtn?.addEventListener('click', () => this.hideSettings());
    this.saveSettingsBtn?.addEventListener('click', () => this.saveSettings());

    // Live preview for avatar URL
    this.settingsAvatar?.addEventListener('input', (e) => {
      this.updateAvatarPreview(e.target.value);
    });

    // Close modal on backdrop click
    this.settingsModal?.querySelector('.modal-backdrop')?.addEventListener('click', () => {
      this.hideSettings();
    });

    // ==================== EMOJI PICKER ====================

    this.emojiBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleEmojiPicker();
    });

    this.emojiPicker?.querySelectorAll('.emoji').forEach(el => {
      el.addEventListener('click', () => {
        const emoji = el.dataset.emoji;
        this.insertEmoji(emoji);
      });
    });

    // ==================== CHROME EXTENSION EVENTS ====================

    // Listen for messages from background
    chrome.runtime.onMessage.addListener((msg) => {
      console.log('[Dashboard] Received message from background:', msg.type, msg);
      this.handleBackgroundMessage(msg);
    });

    // Listen for chrome tab changes to auto-update
    chrome.tabs.onCreated.addListener(() => this.loadBrowserTabs());
    chrome.tabs.onRemoved.addListener(() => this.loadBrowserTabs());
    chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
      if (changeInfo.url || changeInfo.title) {
        this.loadBrowserTabs();
      }
    });

    // ==================== LEGACY BINDINGS ====================

    // Pin button
    this.pinBtn?.addEventListener('click', () => this.togglePinCurrentChannel());

    // Profile close
    this.closeProfileBtn?.addEventListener('click', () => this.closeCurrentProfileView());

    // Follow button
    this.followBtn?.addEventListener('click', () => this.toggleFollow());

    // @mention handling
    this.messageInput?.addEventListener('input', (e) => this.handleMentionInput(e));
    this.messageInput?.addEventListener('keydown', (e) => this.handleMentionKeydown(e));
  }

  async init() {
    try {
      // Tell background dashboard is open
      await this.sendToBackground({ type: 'DASHBOARD_OPENED' });

      // Initialize and get status
      await this.sendToBackground({ type: 'INIT' });
      const status = await this.sendToBackground({ type: 'GET_STATUS' });

      // Check if user has a key set up
      const { privateKey, userName } = await chrome.storage.local.get(['privateKey', 'userName']);

      if (!privateKey) {
        this.showScreen('setup');
      } else {
        this.showScreen('main');
        // Update connection status with small delay to ensure DOM is ready
        setTimeout(() => {
          console.log('Initial status:', status.connected);
          this.updateConnectionStatus(status.connected);
        }, 100);
        if (status.publicKey) {
          if (this.pubkeyDisplay) this.pubkeyDisplay.value = status.publicKey;
          this.myPublicKey = status.publicKey;
          this.myAlias = userName || 'Anonymous';
          this.updateUserDisplay();
        }
      }

      // Load pinned channels from storage
      await this.loadPinnedChannels();

      // Load browser tabs
      await this.loadBrowserTabs();

      // Load saved header tabs from storage (restores tabs from previous session)
      await this.loadHeaderTabs();

      // Render header tabs
      this.renderHeaderTabs();

      // Select the active tab (restores the previously active tab)
      this.selectHeaderTab(this.activeHeaderTabId);

      // Update sidebar for initial state based on active tab
      this.updateSidebarMode();

      // Load global activity
      if (status.globalActivity) {
        this.updateGlobalActivity(status.globalActivity);
      }

      // Load following list
      await this.loadFollowingList();

      // Load active chats
      await this.loadActiveChats();
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

  // ==================== HEADER TAB MANAGEMENT ====================

  renderHeaderTabs() {
    if (!this.tabsStrip) return;

    // Get the new tab button element
    const newTabBtn = this.tabsStrip.querySelector('.new-tab-btn');

    // Remove all existing tabs except the new tab button
    const existingTabs = this.tabsStrip.querySelectorAll('.header-tab');
    existingTabs.forEach(tab => tab.remove());

    // Create tab elements
    this.headerTabs.forEach(tab => {
      const tabEl = document.createElement('div');
      tabEl.className = `header-tab ${tab.id === this.activeHeaderTabId ? 'active' : ''}`;
      tabEl.dataset.tabId = tab.id;
      tabEl.dataset.tabType = tab.type;

      // Icon based on type
      let iconSvg = '';
      if (tab.type === 'dm-home') {
        iconSvg = `<svg class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
        </svg>`;
      } else if (tab.type === 'website') {
        iconSvg = `<svg class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="2" y1="12" x2="22" y2="12"></line>
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
        </svg>`;
      } else if (tab.type === 'tag') {
        iconSvg = `<svg class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="4" y1="9" x2="20" y2="9"></line>
          <line x1="4" y1="15" x2="20" y2="15"></line>
          <line x1="10" y1="3" x2="8" y2="21"></line>
          <line x1="16" y1="3" x2="14" y2="21"></line>
        </svg>`;
      }

      tabEl.innerHTML = `
        ${iconSvg}
        <span class="tab-name">${this.escapeHtml(tab.name)}</span>
        ${tab.closable !== false ? `
          <button class="tab-close" title="Close tab">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        ` : ''}
      `;

      // Click to select tab
      tabEl.addEventListener('click', (e) => {
        if (!e.target.closest('.tab-close')) {
          this.selectHeaderTab(tab.id);
        }
      });

      // Close button
      const closeBtn = tabEl.querySelector('.tab-close');
      if (closeBtn) {
        closeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.closeHeaderTab(tab.id);
        });
      }

      // Insert before the new tab button
      this.tabsStrip.insertBefore(tabEl, newTabBtn);
    });
  }

  selectHeaderTab(tabId) {
    const tab = this.headerTabs.find(t => t.id === tabId);
    if (!tab) return;

    this.activeHeaderTabId = tabId;

    // Update tab visual state
    this.tabsStrip?.querySelectorAll('.header-tab').forEach(el => {
      el.classList.toggle('active', el.dataset.tabId === tabId);
    });

    // Update sidebar mode based on tab type
    this.updateSidebarMode();

    // Update main content area
    if (tab.type === 'dm-home') {
      // Show DM home - no specific channel selected
      this.showNoSelection();
    } else if (tab.type === 'website') {
      // Show website channel
      this.selectTab(null, tab.url, tab.name);
    } else if (tab.type === 'tag') {
      // Show tag channel
      this.selectTab(null, `tag:${tab.tagName}`, `#${tab.tagName}`);
    }
  }

  closeHeaderTab(tabId) {
    const index = this.headerTabs.findIndex(t => t.id === tabId);
    if (index === -1) return;

    const tab = this.headerTabs[index];
    if (tab.closable === false) return; // Can't close unclosable tabs

    // Remove the tab
    this.headerTabs.splice(index, 1);

    // If we closed the active tab, switch to another
    if (this.activeHeaderTabId === tabId) {
      // Go to previous tab, or first tab
      const newActiveTab = this.headerTabs[Math.max(0, index - 1)];
      this.activeHeaderTabId = newActiveTab?.id || 'tab-private';
    }

    this.renderHeaderTabs();
    this.selectHeaderTab(this.activeHeaderTabId);
    this.saveHeaderTabs(); // Persist to storage
  }

  // ==================== TAB PERSISTENCE ====================

  async saveHeaderTabs() {
    try {
      // Save tabs and active tab ID to storage
      await chrome.storage.local.set({
        headerTabs: this.headerTabs,
        activeHeaderTabId: this.activeHeaderTabId
      });
      console.log('[Dashboard] Saved header tabs:', this.headerTabs.length);
    } catch (error) {
      console.error('[Dashboard] Failed to save header tabs:', error);
    }
  }

  async loadHeaderTabs() {
    try {
      const { headerTabs, activeHeaderTabId } = await chrome.storage.local.get(['headerTabs', 'activeHeaderTabId']);

      if (headerTabs && headerTabs.length > 0) {
        // Restore tabs, but ensure the private tab always exists
        const hasPrivateTab = headerTabs.some(t => t.id === 'tab-private');
        if (!hasPrivateTab) {
          headerTabs.unshift({ id: 'tab-private', type: 'dm-home', name: 'Private', closable: false });
        }
        this.headerTabs = headerTabs;

        // Restore active tab, default to private if not found
        if (activeHeaderTabId && this.headerTabs.some(t => t.id === activeHeaderTabId)) {
          this.activeHeaderTabId = activeHeaderTabId;
        } else {
          this.activeHeaderTabId = 'tab-private';
        }

        console.log('[Dashboard] Loaded header tabs:', this.headerTabs.length, 'active:', this.activeHeaderTabId);
      }
    } catch (error) {
      console.error('[Dashboard] Failed to load header tabs:', error);
    }
  }

  createWebsiteTab(url, title, favicon) {
    const tabId = `tab-web-${Date.now()}`;
    const hostname = this.getHostname(url);

    // Check if website tab already exists for this URL
    const existing = this.headerTabs.find(t => t.type === 'website' && t.url === url);
    if (existing) {
      this.selectHeaderTab(existing.id);
      this.hideNewTabPopover();
      return;
    }

    const newTab = {
      id: tabId,
      type: 'website',
      name: hostname,
      url: url,
      title: title,
      favicon: favicon,
      closable: true
    };

    this.headerTabs.push(newTab);
    this.renderHeaderTabs();
    this.selectHeaderTab(tabId);
    this.hideNewTabPopover();
    this.saveHeaderTabs(); // Persist to storage
  }

  createTagTab(tagName) {
    // Check if tag tab already exists
    const existing = this.headerTabs.find(t => t.type === 'tag' && t.tagName === tagName);
    if (existing) {
      this.selectHeaderTab(existing.id);
      this.hideNewTabPopover();
      return;
    }

    const tabId = `tab-tag-${Date.now()}`;

    const newTab = {
      id: tabId,
      type: 'tag',
      name: `#${tagName}`,
      tagName: tagName,
      closable: true
    };

    this.headerTabs.push(newTab);
    this.renderHeaderTabs();
    this.selectHeaderTab(tabId);
    this.hideNewTabPopover();
    this.saveHeaderTabs(); // Persist to storage
  }

  // ==================== NEW TAB POPOVER ====================

  toggleNewTabPopover() {
    if (!this.newTabPopover) return;

    const isHidden = this.newTabPopover.classList.contains('hidden');
    if (isHidden) {
      this.showNewTabPopover();
    } else {
      this.hideNewTabPopover();
    }
  }

  showNewTabPopover() {
    if (!this.newTabPopover) return;

    // Position the popover below the new tab button
    const btnRect = this.newTabBtn?.getBoundingClientRect();
    if (btnRect) {
      this.newTabPopover.style.top = `${btnRect.bottom + 8}px`;
      this.newTabPopover.style.left = `${Math.max(16, btnRect.left - 150)}px`;
    }

    this.newTabPopover.classList.remove('hidden');

    // Populate websites and tags
    this.populatePopoverWebsites();
    this.populatePopoverTags();

    // Focus search input
    setTimeout(() => {
      this.popoverSearch?.focus();
    }, 50);
  }

  hideNewTabPopover() {
    this.newTabPopover?.classList.add('hidden');
    if (this.popoverSearch) {
      this.popoverSearch.value = '';
    }
    this.updateCreateTagButton('');
  }

  populatePopoverWebsites() {
    if (!this.popoverWebsites) return;

    if (this.browserTabs.length === 0) {
      this.popoverWebsites.innerHTML = '<div class="popover-empty">No websites open</div>';
      return;
    }

    this.popoverWebsites.innerHTML = this.browserTabs.map(tab => {
      const hostname = this.getHostname(tab.url);
      const count = this.tabUserCounts.get(tab.url) || 0;

      return `
        <button class="popover-item" data-url="${this.escapeHtml(tab.url)}" data-title="${this.escapeHtml(tab.title || hostname)}">
          <div class="popover-item-icon">
            ${tab.favIconUrl ? `<img src="${tab.favIconUrl}" alt="" onerror="this.style.display='none'">` : ''}
            <svg class="fallback-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="2" y1="12" x2="22" y2="12"></line>
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
            </svg>
          </div>
          <div class="popover-item-info">
            <span class="popover-item-name">${this.escapeHtml(hostname)}</span>
            <span class="popover-item-detail">${this.escapeHtml(this.truncateText(tab.title || '', 40))}</span>
          </div>
          ${count > 0 ? `<span class="popover-item-badge">${count}</span>` : ''}
        </button>
      `;
    }).join('');

    // Add click handlers
    this.popoverWebsites.querySelectorAll('.popover-item').forEach(el => {
      el.addEventListener('click', () => {
        const url = el.dataset.url;
        const title = el.dataset.title;
        const favicon = el.querySelector('img')?.src;
        this.createWebsiteTab(url, title, favicon);
      });
    });
  }

  populatePopoverTags() {
    if (!this.popoverTags) return;

    // Use pinned channels as tags, or show default tags
    const tags = this.pinnedChannels.length > 0
      ? this.pinnedChannels.map(c => ({ name: this.getHostname(c.url), url: c.url }))
      : [
          { name: 'general', url: 'tag:general' },
          { name: 'crypto', url: 'tag:crypto' },
          { name: 'tech', url: 'tag:tech' },
          { name: 'random', url: 'tag:random' }
        ];

    this.popoverTags.innerHTML = tags.slice(0, 8).map(tag => `
      <button class="popover-item" data-tag="${this.escapeHtml(tag.name)}">
        <div class="popover-item-icon tag-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="4" y1="9" x2="20" y2="9"></line>
            <line x1="4" y1="15" x2="20" y2="15"></line>
            <line x1="10" y1="3" x2="8" y2="21"></line>
            <line x1="16" y1="3" x2="14" y2="21"></line>
          </svg>
        </div>
        <div class="popover-item-info">
          <span class="popover-item-name">#${this.escapeHtml(tag.name)}</span>
        </div>
      </button>
    `).join('');

    // Add click handlers
    this.popoverTags.querySelectorAll('.popover-item').forEach(el => {
      el.addEventListener('click', () => {
        const tagName = el.dataset.tag;
        this.createTagTab(tagName);
      });
    });
  }

  filterPopoverItems(query) {
    query = query.toLowerCase().trim();

    // Filter websites
    this.popoverWebsites?.querySelectorAll('.popover-item').forEach(el => {
      const name = el.querySelector('.popover-item-name')?.textContent.toLowerCase() || '';
      const detail = el.querySelector('.popover-item-detail')?.textContent.toLowerCase() || '';
      const matches = name.includes(query) || detail.includes(query);
      el.style.display = matches ? '' : 'none';
    });

    // Filter tags
    this.popoverTags?.querySelectorAll('.popover-item').forEach(el => {
      const name = el.querySelector('.popover-item-name')?.textContent.toLowerCase() || '';
      const matches = name.includes(query);
      el.style.display = matches ? '' : 'none';
    });

    // Update create tag button
    this.updateCreateTagButton(query);
  }

  updateCreateTagButton(query) {
    if (!this.createTagBtn || !this.createTagName) return;

    if (query && query.length > 0) {
      this.createTagBtn.style.display = '';
      this.createTagName.textContent = query;
    } else {
      this.createTagBtn.style.display = 'none';
    }
  }

  // ==================== USER DROPDOWN ====================

  toggleUserDropdown() {
    if (!this.userDropdown) return;

    const isHidden = this.userDropdown.classList.contains('hidden');
    if (isHidden) {
      this.showUserDropdown();
    } else {
      this.hideUserDropdown();
    }
  }

  showUserDropdown() {
    this.userDropdown?.classList.remove('hidden');
  }

  hideUserDropdown() {
    this.userDropdown?.classList.add('hidden');
  }

  async updateUserDisplay() {
    // Load avatar from storage
    const { userAvatar } = await chrome.storage.local.get(['userAvatar']);

    // Update header avatar
    this.updateHeaderAvatar(this.myAlias, userAvatar);

    // Update dropdown info
    if (this.dropdownUserName) {
      this.dropdownUserName.textContent = this.myAlias || 'Anonymous';
    }
    if (this.dropdownUserId && this.myPublicKey) {
      this.dropdownUserId.textContent = `@${this.truncatePubkey(this.myPublicKey)}`;
    }
  }

  // Legacy method - redirect to new
  updateAliasButton() {
    this.updateUserDisplay();
  }

  handleLogout() {
    if (confirm('Are you sure you want to log out? You will need your private key to log back in.')) {
      chrome.storage.local.remove(['privateKey', 'userName', 'publicKey'], () => {
        this.showScreen('setup');
      });
    }
  }

  // ==================== SIDEBAR MODE SWITCHING ====================

  updateSidebarMode() {
    const activeTab = this.headerTabs.find(t => t.id === this.activeHeaderTabId);
    const mode = activeTab?.type === 'dm-home' ? 'dm-home' : 'server';

    if (mode === 'dm-home') {
      // DM Home mode - show direct messages list
      if (this.sidebarTitle) this.sidebarTitle.textContent = 'Private Messages';
      if (this.sidebarIconDm) this.sidebarIconDm.classList.remove('hidden');
      if (this.sidebarIconLobby) this.sidebarIconLobby.classList.add('hidden');
      if (this.dmList) this.dmList.classList.remove('hidden');
      if (this.lobbyList) this.lobbyList.classList.add('hidden');

      // Render DM list
      this.renderDmList();
    } else {
      // Server/Channel mode - show lobby members
      const channelName = activeTab?.name || 'Channel';
      if (this.sidebarTitle) this.sidebarTitle.textContent = `${channelName} Lobby`;
      if (this.sidebarIconDm) this.sidebarIconDm.classList.add('hidden');
      if (this.sidebarIconLobby) this.sidebarIconLobby.classList.remove('hidden');
      if (this.dmList) this.dmList.classList.add('hidden');
      if (this.lobbyList) this.lobbyList.classList.remove('hidden');

      // Lobby members will be updated by updateUsers()
    }
  }

  async renderDmList() {
    if (!this.dmList) return;

    // Use active chats as DMs
    if (!this.activeChats || this.activeChats.size === 0) {
      this.dmList.innerHTML = '<div class="sidebar-empty">No conversations yet</div>';
      return;
    }

    // Get all other user pubkeys from chats
    const otherPubkeys = [];
    for (const [roomId, chat] of this.activeChats.entries()) {
      const otherPubkey = chat.users?.find(u => u !== this.myPublicKey);
      if (otherPubkey) {
        otherPubkeys.push(otherPubkey);
      }
    }

    // Check mutual follows if cache is expired
    const now = Date.now();
    if (now - this.mutualFollowsCacheTime > this.mutualFollowsCacheExpiry && otherPubkeys.length > 0) {
      try {
        const result = await this.sendToBackground({
          type: 'CHECK_MUTUAL_FOLLOWS',
          pubkeys: otherPubkeys
        });
        if (result.mutualFollows) {
          for (const [pubkey, isMutual] of Object.entries(result.mutualFollows)) {
            this.mutualFollowsCache.set(pubkey, isMutual);
          }
          this.mutualFollowsCacheTime = now;
        }
      } catch (error) {
        console.error('Failed to check mutual follows:', error);
      }
    }

    // Sort by last activity
    const sortedChats = Array.from(this.activeChats.entries())
      .sort((a, b) => {
        const aTime = a[1].lastMessage?.timestamp || a[1].created;
        const bTime = b[1].lastMessage?.timestamp || b[1].created;
        return bTime - aTime;
      });

    // Split into friends and others
    const friendsChats = [];
    const othersChats = [];

    for (const [roomId, chat] of sortedChats) {
      const otherPubkey = chat.users?.find(u => u !== this.myPublicKey);
      const isFriend = this.mutualFollowsCache.get(otherPubkey) === true;
      if (isFriend) {
        friendsChats.push([roomId, chat]);
      } else {
        othersChats.push([roomId, chat]);
      }
    }

    // Helper function to render a chat item
    const renderChatItem = ([roomId, chat]) => {
      const otherUserPubkey = chat.users?.find(u => u !== this.myPublicKey);
      const otherUserName = chat.names?.[otherUserPubkey] || 'User';
      const avatarColor = this.getAvatarColor(otherUserPubkey);
      const initial = (otherUserName || 'U').charAt(0).toUpperCase();
      const lastMsg = chat.lastMessage?.content || 'No messages yet';
      const isActive = this.currentRoomId === roomId;

      return `
        <div class="dm-item ${isActive ? 'active' : ''}" data-room-id="${roomId}" data-pubkey="${otherUserPubkey || ''}">
          <div class="dm-avatar" style="background: ${avatarColor}">
            <span>${initial}</span>
            <div class="dm-status online"></div>
          </div>
          <div class="dm-info">
            <span class="dm-name">${this.escapeHtml(otherUserName)}</span>
            <span class="dm-preview">${this.escapeHtml(this.truncateText(lastMsg, 30))}</span>
          </div>
          ${chat.unreadCount > 0 ? `<div class="dm-badge">${chat.unreadCount}</div>` : ''}
        </div>
      `;
    };

    // Build HTML with sections
    let html = '';

    // Friends section
    if (friendsChats.length > 0) {
      html += `
        <div class="dm-section">
          <div class="dm-section-header">
            <svg class="dm-section-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>
              <circle cx="9" cy="7" r="4"></circle>
              <path d="M22 21v-2a4 4 0 0 0-3-3.87"></path>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
            </svg>
            <span>Friends</span>
            <span class="dm-section-count">${friendsChats.length}</span>
          </div>
          ${friendsChats.map(renderChatItem).join('')}
        </div>
      `;
    }

    // Others section
    if (othersChats.length > 0) {
      html += `
        <div class="dm-section">
          <div class="dm-section-header">
            <svg class="dm-section-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
            <span>Others</span>
            <span class="dm-section-count">${othersChats.length}</span>
          </div>
          ${othersChats.map(renderChatItem).join('')}
        </div>
      `;
    }

    // If no chats in either section (shouldn't happen but fallback)
    if (html === '') {
      html = '<div class="sidebar-empty">No conversations yet</div>';
    }

    this.dmList.innerHTML = html;

    // Add click handlers
    this.dmList.querySelectorAll('.dm-item').forEach(el => {
      el.addEventListener('click', () => {
        const roomId = el.dataset.roomId;
        const pubkey = el.dataset.pubkey;
        const chat = this.activeChats?.get(roomId);
        if (chat && pubkey) {
          const name = chat.names?.[pubkey] || 'User';
          this.createOrJoinChatRoom(pubkey, name);
        }
      });
    });
  }

  showNoSelection() {
    this.noSelection?.classList.remove('hidden');
    this.chatContainer?.classList.add('hidden');
    this.profileContainer?.classList.add('hidden');
  }

  // ==================== SIDEBAR RESIZE ====================

  startResize(e) {
    this.isResizing = true;
    this.startX = e.clientX;
    this.startWidth = this.sidebar?.offsetWidth || 280;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }

  handleResize(e) {
    if (!this.isResizing || !this.sidebar) return;

    const delta = e.clientX - this.startX;
    const newWidth = Math.max(200, Math.min(400, this.startWidth + delta));

    this.sidebar.style.width = `${newWidth}px`;
    this.sidebarWidth = newWidth;
  }

  stopResize() {
    if (!this.isResizing) return;

    this.isResizing = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
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
    // Skip if tabsList element doesn't exist (different UI layout)
    if (!this.tabsList) {
      return;
    }

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
          <div class="tab-favicon">${tab.favIconUrl ? `<img src="${tab.favIconUrl}" width="16" height="16" class="favicon-img">` : '&#127760;'}</div>
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

    // Add error handlers for favicon images
    this.tabsList.querySelectorAll('.favicon-img').forEach(img => {
      img.addEventListener('error', function() {
        this.style.display = 'none';
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
    console.log('[Dashboard] selectTab called:', { tabId, url, title, currentUrl: this.selectedUrl });

    if (this.selectedUrl === url && !this.currentProfile) {
      console.log('[Dashboard] selectTab: Early return - same URL already selected');
      return;
    }

    this.selectedTabId = tabId;
    this.selectedUrl = url;
    this.selectedTitle = title;

    console.log('[Dashboard] selectTab: Set selectedUrl to:', this.selectedUrl);

    // Clear current profile and chat modes
    this.currentProfile = null;
    this.currentChatMode = null;
    this.currentChatPartner = null;
    this.updateProfileTabsActiveState();

    // Update UI
    this.noSelection?.classList.add('hidden');
    this.profileContainer?.classList.add('hidden');
    this.chatContainer?.classList.remove('hidden');

    // Show pin button again (was hidden for DMs)
    if (this.pinBtn) this.pinBtn.style.display = '';

    const tab = this.browserTabs.find(t => t.id === tabId);
    const displayTitle = tab?.title || title;
    const hostname = this.getHostname(url);

    // Update chat header
    if (this.chatTitle) {
      this.chatTitle.textContent = displayTitle;
    }

    // Update welcome message with website/channel name
    if (this.welcomeIcon) {
      this.welcomeIcon.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="4" y1="9" x2="20" y2="9"></line>
          <line x1="4" y1="15" x2="20" y2="15"></line>
          <line x1="10" y1="3" x2="8" y2="21"></line>
          <line x1="16" y1="3" x2="14" y2="21"></line>
        </svg>
      `;
    }
    if (this.welcomeTitle) {
      this.welcomeTitle.textContent = `Welcome to ${hostname}!`;
    }
    if (this.welcomeDescription) {
      this.welcomeDescription.textContent = `This is the start of the ${hostname} channel.`;
    }

    // Update pin button state
    this.updatePinButton();

    // Clear messages
    if (this.messagesContainer) {
      this.messagesContainer.innerHTML = '';
    }

    // Mark as active in both lists (legacy sidebar elements)
    this.tabsList?.querySelectorAll('.tab-item').forEach(el => {
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

    this.messageInput?.focus();
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
    if (!content) return;

    console.log('[Dashboard] sendMessage:', {
      content: content.substring(0, 20),
      selectedUrl: this.selectedUrl,
      currentChatMode: this.currentChatMode,
      hasRoomUsers: !!this.currentRoomUsers
    });

    // Check if we're in DM mode or channel mode
    if (this.currentChatMode === 'dm' && this.currentRoomUsers) {
      // Send as room message with both users tagged
      // Convert emoji shortcodes
      content = this.convertShortcodes(content);

      this.messageInput.value = '';
      this.emojiPicker?.classList.add('hidden');

      // Send message to the universal room with both users tagged
      const result = await this.sendToBackground({
        type: 'SEND_ROOM_MESSAGE',
        roomContext: {
          users: this.currentRoomUsers, // Tag both users in the message
          strict: true
        },
        content
      });

      if (!result.success) {
        this.addSystemMessage('Failed to send message');
      }

      // Update last message for this chat
      if (this.activeChats && this.currentRoomId) {
        const chat = this.activeChats.get(this.currentRoomId);
        if (chat) {
          chat.lastMessage = {
            content,
            timestamp: Date.now(),
            isOwn: true
          };
          await this.saveActiveChats();
        }
      }
    } else if (this.selectedUrl) {
      // Send as channel message
      // Convert emoji shortcodes
      content = this.convertShortcodes(content);

      this.messageInput.value = '';
      this.emojiPicker?.classList.add('hidden');

      const result = await this.sendToBackground({
        type: 'SEND_MESSAGE',
        content
      });

      if (!result.success) {
        this.addSystemMessage('Failed to send message');
      }
    } else {
      console.log('[Dashboard] sendMessage: No channel selected, cannot send');
      this.addSystemMessage('Please select a channel first');
    }
  }

  updateAliasButton() {
    // Update the profile button to show user's alias
    if (this.myProfileBtn) {
      this.myProfileBtn.innerHTML = `<span>${this.escapeHtml(this.myAlias)}</span>`;
      this.myProfileBtn.title = `${this.myAlias} (Click to view your profile)`;
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
        // Check if this is a room message with user tags (DM)
        if (msg.message?.tags) {
          const userTags = msg.message.tags.filter(t => t[0] === 'p').map(t => t[1]);
          const hasWebsiteTag = msg.message.tags.some(t => t[0] === 'r');

          // A DM is a message with exactly 2 user tags and NO website tag
          if (userTags.length === 2 && userTags.includes(this.myPublicKey) && !hasWebsiteTag) {
            // This is a chat room message (DM)
            const otherUser = userTags.find(u => u !== this.myPublicKey);
            const roomUsers = [this.myPublicKey, otherUser].sort();
            const roomId = `chat_${roomUsers.join('_')}`;

            // Update chat if we have it
            if (this.activeChats?.has(roomId)) {
              const chat = this.activeChats.get(roomId);
              chat.lastMessage = {
                content: msg.message.content,
                timestamp: msg.message.timestamp,
                isOwn: msg.message.isOwn
              };
              this.saveActiveChats();
              this.renderDmList();
            }

            // Show message if we're currently viewing this chat
            if (this.currentChatMode === 'dm' && this.currentRoomId === roomId) {
              this.addMessage(msg.message);
            }
            return;
          }
        }

        // Only show if we're viewing this channel (not profiles - they use wall posts)
        // Don't show channel messages when in DM mode
        if (this.currentChatMode !== 'dm' && (msg.url === this.selectedUrl || !msg.url)) {
          this.addMessage(msg.message);
        }
        break;
      case 'NEW_DM':
        // Handle incoming DM
        if (this.currentChatMode === 'dm' && this.currentChatPartner === msg.otherPubkey) {
          // We're currently chatting with this person, show the message
          this.addMessage(msg.dm);
        } else {
          // Show notification or update chat list
          this.showDMNotification(msg.dm, msg.otherPubkey);
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
        console.log('Received CONNECTION_STATUS message:', msg);
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

  showDMNotification(dm, otherPubkey) {
    // Add a small notification badge or toast
    // For now, just log it
    console.log('New DM from', dm.name || otherPubkey, ':', dm.content);

    // You could add a chat list in the sidebar showing active DMs
    // with unread counts
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
        <div class="message-avatar" style="background: ${avatarColor}">${initial}</div>
        <div class="message-body">
          <div class="message-header">
            <span class="message-author">You</span>
            <span class="message-time">${time}</span>
          </div>
          <div class="message-text">${this.escapeHtml(msg.content)}</div>
        </div>
      `;
    } else {
      div.innerHTML = `
        <div class="message-avatar clickable-author" style="background: ${avatarColor}" data-pubkey="${this.escapeHtml(msg.pubkey || '')}" data-name="${this.escapeHtml(msg.name || 'Anonymous')}">${initial}</div>
        <div class="message-body">
          <div class="message-header">
            <span class="message-author clickable-author" data-pubkey="${this.escapeHtml(msg.pubkey || '')}" data-name="${this.escapeHtml(msg.name || 'Anonymous')}">${this.escapeHtml(msg.name || 'Anonymous')}</span>
            <span class="message-time">${time}</span>
          </div>
          <div class="message-text">${this.escapeHtml(msg.content)}</div>
        </div>
      `;

      // Add click handler to START CHAT (not open profile modal)
      const authorEls = div.querySelectorAll('.clickable-author');
      authorEls.forEach(authorEl => {
        if (msg.pubkey && msg.pubkey !== this.myPublicKey) {
          authorEl.addEventListener('click', async (e) => {
            e.stopPropagation();
            console.log('Author clicked:', msg.pubkey, msg.name);
            await this.startChatWith(msg.pubkey, msg.name || 'Anonymous');
          });
        }
      });
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
    // Update online count in sidebar
    if (this.onlineCount) {
      this.onlineCount.textContent = users?.length || 0;
    }

    // Update lobby list in sidebar (for server/channel mode)
    if (this.lobbyList) {
      if (!users || users.length === 0) {
        this.lobbyList.innerHTML = `
          <div class="sidebar-subheader">
            <span>Online — <span id="online-count">0</span></span>
          </div>
          <div class="sidebar-empty">No one else here</div>
        `;
      } else {
        this.lobbyList.innerHTML = `
          <div class="sidebar-subheader">
            <span>Online — <span id="online-count">${users.length}</span></span>
          </div>
          ${users.map(user => {
            const avatarColor = this.getAvatarColor(user.pubkey);
            const initial = (user.name || 'U').charAt(0).toUpperCase();
            return `
              <div class="lobby-member ${user.isYou ? 'you' : ''}" data-pubkey="${this.escapeHtml(user.pubkey || '')}" data-name="${this.escapeHtml(user.name)}">
                <div class="member-avatar" style="background: ${avatarColor}">
                  <span>${initial}</span>
                  <div class="member-status online"></div>
                </div>
                <span class="member-name">${this.escapeHtml(user.name)}${user.isYou ? ' (you)' : ''}</span>
              </div>
            `;
          }).join('')}
        `;

        // Add click handlers to lobby members - start chat
        this.lobbyList.querySelectorAll('.lobby-member:not(.you)').forEach(el => {
          el.addEventListener('click', async () => {
            const pubkey = el.dataset.pubkey;
            const name = el.dataset.name;
            if (pubkey) {
              await this.startChatWith(pubkey, name);
            }
          });
        });
      }
    }

    // Legacy: Also update the old usersList if it exists
    if (this.usersList) {
      if (!users || users.length === 0) {
        this.usersList.innerHTML = '<span class="no-users">Just you</span>';
      } else {
        this.usersList.innerHTML = users.map(user => `
          <span class="user-tag clickable ${user.isYou ? 'you' : ''}" data-pubkey="${this.escapeHtml(user.pubkey || '')}" data-name="${this.escapeHtml(user.name)}">${this.escapeHtml(user.name)}${user.isYou ? ' (you)' : ''}</span>
        `).join('');

        // Add click handlers to user tags - clicking starts chat
        this.usersList.querySelectorAll('.user-tag.clickable').forEach(el => {
          el.addEventListener('click', async (e) => {
            e.stopPropagation();
            const pubkey = el.dataset.pubkey;
            const name = el.dataset.name;
            if (pubkey && !el.classList.contains('you')) {
              await this.startChatWith(pubkey, name);
            }
          });
        });
      }
    }

    if (this.userCount) {
      this.userCount.textContent = (users?.length || 0).toString();
    }
  }

  updateGlobalActivity(activity) {
    // Skip if activityList element doesn't exist (removed in new UI)
    if (!this.activityList) {
      return;
    }

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
    // Skip if connectionStatus element doesn't exist (removed in new UI)
    if (!this.connectionStatus) {
      this.connectionStatus = document.getElementById('connection-status');
      if (!this.connectionStatus) {
        // Element removed in new UI, skip silently
        return;
      }
    }

    const statusText = this.connectionStatus.querySelector('.status-text');

    if (connected) {
      this.connectionStatus.classList.add('connected');
      this.connectionStatus.classList.remove('disconnected');
      if (statusText) {
        statusText.textContent = 'Connected';
      }
    } else {
      this.connectionStatus.classList.remove('connected');
      this.connectionStatus.classList.add('disconnected');
      if (statusText) {
        statusText.textContent = 'Disconnected';
      }
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
    chrome.storage.local.get(['userName', 'userAvatar']).then(({ userName, userAvatar }) => {
      this.settingsName.value = userName || '';
      if (this.settingsAvatar) {
        this.settingsAvatar.value = userAvatar || '';
        this.updateAvatarPreview(userAvatar);
      }
    });
    this.settingsModal.classList.remove('hidden');
  }

  hideSettings() {
    this.settingsModal.classList.add('hidden');
  }

  updateAvatarPreview(url) {
    if (!this.settingsAvatarPreview) return;

    if (url && url.trim()) {
      // Show image preview
      this.settingsAvatarPreview.innerHTML = `<img src="${this.escapeHtml(url)}" alt="Avatar" onerror="this.parentElement.innerHTML='<span>?</span>'">`;
    } else {
      // Show placeholder
      const initial = this.settingsName?.value?.charAt(0)?.toUpperCase() || '?';
      this.settingsAvatarPreview.innerHTML = `<span>${initial}</span>`;
    }
  }

  async saveSettings() {
    const name = this.settingsName.value.trim();
    const avatar = this.settingsAvatar?.value?.trim() || '';

    if (name) {
      await this.sendToBackground({ type: 'SET_USERNAME', name });
    }

    // Save avatar URL
    await chrome.storage.local.set({ userAvatar: avatar });

    // Update the header avatar if we have an image
    this.updateHeaderAvatar(name, avatar);

    this.hideSettings();
  }

  updateHeaderAvatar(name, avatarUrl) {
    if (!this.headerAvatar) return;

    if (avatarUrl) {
      this.headerAvatar.innerHTML = `<img src="${this.escapeHtml(avatarUrl)}" alt="${this.escapeHtml(name || 'Me')}" onerror="this.parentElement.innerHTML='<span>${(name || 'ME').charAt(0).toUpperCase()}</span>'">`;
    } else {
      this.headerAvatar.innerHTML = `<span>${(name || 'ME').charAt(0).toUpperCase()}</span>`;
    }
  }

  getHostname(url) {
    // Handle tag URLs like "tag:general"
    if (url && url.startsWith('tag:')) {
      return '#' + url.substring(4);
    }
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

  // Chat management methods
  async saveActiveChats() {
    // Convert Map to array for storage
    const chatsArray = Array.from(this.activeChats.entries());
    await chrome.storage.local.set({ activeChats: chatsArray });
  }

  async loadActiveChats() {
    const stored = await chrome.storage.local.get(['activeChats']);
    if (stored.activeChats) {
      this.activeChats = new Map(stored.activeChats);
      this.renderDmList();
    }
  }

  truncateText(text, maxLength) {
    if (!text) return '';
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
  }

  showProfileChats(profilePubkey) {
    const feedEl = document.getElementById('profile-feed');
    const emptyEl = document.getElementById('profile-empty');

    if (!this.activeChats || this.activeChats.size === 0) {
      feedEl.innerHTML = '';
      emptyEl.textContent = 'No active chats';
      emptyEl.classList.remove('hidden');
      return;
    }

    // Find chats involving this user
    const relevantChats = Array.from(this.activeChats.entries()).filter(([roomId, chat]) => {
      return chat.users.includes(profilePubkey);
    });

    if (relevantChats.length === 0) {
      feedEl.innerHTML = '';
      emptyEl.textContent = this.currentProfile.isOwn ? 'No active chats' : 'No chats with this user';
      emptyEl.classList.remove('hidden');
      return;
    }

    emptyEl.classList.add('hidden');
    feedEl.innerHTML = '';

    // Sort by last activity
    relevantChats.sort((a, b) => {
      const aTime = a[1].lastMessage?.timestamp || a[1].created;
      const bTime = b[1].lastMessage?.timestamp || b[1].created;
      return bTime - aTime;
    });

    // Render chats
    relevantChats.forEach(([roomId, chat]) => {
      const otherUserPubkey = chat.users.find(u => u !== this.myPublicKey);
      const otherUserName = chat.names[otherUserPubkey] || 'User';
      const avatarColor = this.getAvatarColor(otherUserPubkey);
      const initial = otherUserName.charAt(0).toUpperCase();

      const chatItem = document.createElement('div');
      chatItem.className = 'chat-profile-item';
      chatItem.innerHTML = `
        <div class="chat-profile-header">
          <div class="chat-profile-avatar" style="background: ${avatarColor}">${initial}</div>
          <div class="chat-profile-info">
            <div class="chat-profile-name">${this.escapeHtml(otherUserName)}</div>
            <div class="chat-profile-last-msg">${chat.lastMessage ? this.escapeHtml(this.truncateText(chat.lastMessage.content, 50)) : 'No messages yet'}</div>
          </div>
          <button class="btn primary small open-chat-btn">Open Chat</button>
        </div>
      `;

      // Add click handler to open chat
      const openBtn = chatItem.querySelector('.open-chat-btn');
      openBtn.addEventListener('click', () => {
        this.createOrJoinChatRoom(otherUserPubkey, otherUserName);
      });

      feedEl.appendChild(chatItem);
    });
  }

  // Enhanced navigation methods
  openMyProfileFullView() {
    console.log('openMyProfileFullView called');
    console.log('Current containers:', {
      profileContainer: this.profileContainer,
      chatContainer: this.chatContainer,
      noSelection: this.noSelection
    });

    // Open own profile as full screen view, not modal
    if (this.myPublicKey) {
      this.showProfileView(this.myPublicKey, this.myAlias || 'My Profile', true);
    } else {
      console.error('No public key available');
    }
  }

  closeCurrentProfileView() {
    // Close profile and return to previous view
    this.profileContainer.classList.add('hidden');
    if (this.selectedUrl) {
      this.chatContainer.classList.remove('hidden');
    } else {
      this.noSelection.classList.remove('hidden');
    }
    this.currentProfile = null;
  }

  async startChatWith(pubkey, name) {
    // Create/join a chat room with this user
    await this.createOrJoinChatRoom(pubkey, name);
  }

  async createOrJoinChatRoom(pubkey, name) {
    // Create a unique room identifier for this chat
    // Sort pubkeys to ensure consistent room ID regardless of who initiates
    const roomUsers = [this.myPublicKey, pubkey].sort();
    const roomId = `chat_${roomUsers.join('_')}`;

    // Store this chat in active chats
    if (!this.activeChats) {
      this.activeChats = new Map();
    }

    if (!this.activeChats.has(roomId)) {
      this.activeChats.set(roomId, {
        roomId,
        users: roomUsers,
        names: {
          [pubkey]: name,
          [this.myPublicKey]: this.myAlias || 'You'
        },
        created: Date.now(),
        lastMessage: null,
        unreadCount: 0
      });

      // Save to storage
      await this.saveActiveChats();
    }

    // Switch to the Private tab first
    this.selectHeaderTab('tab-private');

    // Update sidebar DM list (not the old chats section)
    this.renderDmList();

    // Switch to chat view for this user
    this.currentProfile = null;
    this.selectedTabId = null;
    this.selectedUrl = null;

    // Hide other views
    this.noSelection?.classList.add('hidden');
    this.profileContainer?.classList.add('hidden');

    // Show chat container with DM interface
    this.chatContainer?.classList.remove('hidden');

    // Update chat header for DM
    if (this.chatTitle) {
      this.chatTitle.textContent = name;
    }

    // Update welcome message for DM
    if (this.welcomeIcon) {
      this.welcomeIcon.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
          <circle cx="12" cy="7" r="4"></circle>
        </svg>
      `;
    }
    if (this.welcomeTitle) {
      this.welcomeTitle.textContent = name;
    }
    if (this.welcomeDescription) {
      this.welcomeDescription.textContent = `This is the beginning of your direct message history with @${name}.`;
    }

    // Hide pin button for DMs
    if (this.pinBtn) this.pinBtn.style.display = 'none';

    // Clear messages
    if (this.messagesContainer) {
      this.messagesContainer.innerHTML = '';
    }

    // Load chat history using universal room filtering
    // Messages are filtered by having BOTH users tagged
    const result = await this.sendToBackground({
      type: 'FETCH_ROOM_MESSAGES',
      roomContext: {
        users: roomUsers, // Both users must be tagged
        strict: true // Require ALL users to be tagged
      },
      limit: 100
    });

    if (result.messages && result.messages.length > 0) {
      for (const msg of result.messages) {
        this.addMessage(msg);
      }
    } else {
      this.addSystemMessage('Start your conversation...');
    }

    // Store current chat context
    this.currentChatPartner = pubkey;
    this.currentChatMode = 'dm';
    this.currentRoomId = roomId;
    this.currentRoomUsers = roomUsers;

    // Update users list to show just the two participants
    this.updateUsers([
      { name: name, pubkey: pubkey },
      { name: this.myAlias || 'You', pubkey: this.myPublicKey, isYou: true }
    ]);

    this.messageInput.focus();
  }

  async showProfileView(pubkey, name, isOwn = false) {
    console.log('showProfileView called:', { pubkey, name, isOwn });
    console.log('Profile container before:', this.profileContainer.classList.toString());
    console.log('Chat container before:', this.chatContainer.classList.toString());

    // Show profile as full view (not modal overlay)
    this.currentProfile = { pubkey, name, isOwn, activeTab: 'mentions' };

    // Clear any previous chat mode
    this.currentChatMode = null;
    this.currentChatPartner = null;
    this.selectedUrl = null; // Clear selected URL to show we're not in a tab view
    this.selectedTabId = null;

    // Hide ALL other views first
    this.noSelection.classList.add('hidden');
    this.chatContainer.classList.add('hidden');

    // Also hide any modals that might be open
    const modals = document.querySelectorAll('.modal');
    modals.forEach(m => m.classList.add('hidden'));

    // Ensure the profile container is properly shown
    this.profileContainer.classList.remove('hidden');
    this.profileContainer.style.display = 'flex'; // Force display
    this.profileContainer.style.visibility = 'visible'; // Ensure visible

    console.log('Profile container after:', this.profileContainer.classList.toString());
    console.log('Profile container display:', window.getComputedStyle(this.profileContainer).display);
    console.log('Profile container visibility:', window.getComputedStyle(this.profileContainer).visibility);

    // Update profile header
    this.profileName.textContent = isOwn ? this.myAlias || 'My Profile' : name;
    this.profilePubkey.textContent = this.truncatePubkey(pubkey);

    // Set avatar
    const avatarColor = this.getAvatarColor(pubkey);
    const avatarEl = document.getElementById('profile-avatar');
    if (avatarEl) {
      avatarEl.style.background = avatarColor;
      avatarEl.textContent = (name || 'U').charAt(0).toUpperCase();
    }

    // Clear existing extra buttons first
    const existingChatBtn = document.querySelector('.profile-actions .start-chat-btn');
    if (existingChatBtn) {
      existingChatBtn.remove();
    }

    // Add "Start Chat" button if not own profile
    if (!isOwn && this.followBtn) {
      const chatBtn = document.createElement('button');
      chatBtn.className = 'btn primary start-chat-btn';
      chatBtn.textContent = 'Start Chat';
      chatBtn.addEventListener('click', () => this.startChatWith(pubkey, name));
      this.followBtn.parentElement.insertBefore(chatBtn, this.followBtn);
    }

    // Clear selection from tabs
    this.tabsList.querySelectorAll('.tab-item').forEach(el => el.classList.remove('active'));
    this.pinnedList?.querySelectorAll('.tab-item').forEach(el => el.classList.remove('active'));

    // Set up tabs and load content
    this.setupProfileTabs();
    await this.loadProfileFeed('mentions');

    // Update follow button
    this.updateFollowButton();
  }

  // Profile methods (legacy compatibility - redirect to new full view)
  openMyProfile() {
    if (this.myPublicKey) {
      // Use the new full view method instead
      this.openMyProfileFullView();
    }
  }

  async openProfile(pubkey, name, isOwn = false) {
    // Redirect to the new full view method
    this.showProfileView(pubkey, name, isOwn);
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

    if (tabType === 'chats') {
      // Show active chats with this user
      await this.loadActiveChats();
      this.showProfileChats(this.currentProfile.pubkey);
      loadingEl.classList.add('hidden');
      return;
    }

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
        imagesHtml = `<img class="feed-item-image clickable-image" src="${this.escapeHtml(post.images[0])}" alt="Image" loading="lazy" data-url="${this.escapeHtml(post.images[0])}">`;
      } else {
        imagesHtml = `<div class="feed-item-images">${post.images.map(img =>
          `<img class="clickable-image" src="${this.escapeHtml(img)}" alt="Image" loading="lazy" data-url="${this.escapeHtml(img)}">`
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

    // Add click handlers for images
    item.querySelectorAll('.clickable-image').forEach(img => {
      img.addEventListener('click', (e) => {
        e.stopPropagation();
        const url = img.dataset.url;
        if (url) {
          window.open(url, '_blank');
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
    // This is now handled by closeCurrentProfileView
    this.closeCurrentProfileView();
  }

  closeProfile(pubkey) {
    // Not needed anymore since profiles are full views
    // Just close the current profile view if it matches
    if (this.currentProfile?.pubkey === pubkey) {
      this.closeCurrentProfileView();
    }
  }

  renderProfileTabs() {
    // No longer using profile tabs since profiles are full views now
    // Keep this method for backward compatibility but do nothing
    return;
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
  const dashboard = new BarcDashboard();
  // Make dashboard globally accessible for debugging
  window.dashboard = dashboard;

  // Initialize dashboard
  dashboard.init();

  // Force check connection status after a delay
  setTimeout(() => {
    chrome.runtime.sendMessage({ type: 'GET_STATUS' }).then(status => {
      if (status && status.connected !== undefined) {
        console.log('Force update connection status:', status.connected);
        dashboard.updateConnectionStatus(status.connected);
      }
    }).catch(err => {
      console.error('Error getting connection status:', err);
    });
  }, 2000);
});
