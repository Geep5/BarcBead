(() => {
  const state = {
    publicKey: null,
    userName: null,
    currentView: "websites",
    currentChannel: null,
    tabs: /* @__PURE__ */ new Map(),
    pinnedChannels: /* @__PURE__ */ new Set(),
    following: /* @__PURE__ */ new Map(),
    messages: /* @__PURE__ */ new Map(),
    users: /* @__PURE__ */ new Map(),
    rooms: {
      websites: []
    }
  };
  document.addEventListener("DOMContentLoaded", async () => {
    console.log("Dashboard loading...");
    setupEventListeners();
    await initializeApp();
  });
  function setupEventListeners() {
    const generateBtn = document.getElementById("generate-key-btn");
    const importBtn = document.getElementById("import-key-btn");
    if (generateBtn) {
      generateBtn.addEventListener("click", handleGenerateKey);
    }
    if (importBtn) {
      importBtn.addEventListener("click", handleImportKey);
    }
    document.querySelectorAll(".nav-tab").forEach((tab) => {
      tab.addEventListener("click", (e) => {
        const view = e.currentTarget.dataset.view;
        switchView(view);
      });
    });
    const settingsBtn = document.getElementById("settings-btn");
    if (settingsBtn) {
      settingsBtn.addEventListener("click", () => showModal("settings-modal"));
    }
    const closeSettingsBtn = document.getElementById("close-settings");
    if (closeSettingsBtn) {
      closeSettingsBtn.addEventListener("click", () => hideModal("settings-modal"));
    }
    const saveProfileBtn = document.getElementById("save-profile-btn");
    if (saveProfileBtn) {
      saveProfileBtn.addEventListener("click", handleSaveProfile);
    }
    const profileSearchBtn = document.getElementById("profile-search-btn");
    if (profileSearchBtn) {
      profileSearchBtn.addEventListener("click", handleProfileSearch);
    }
    const sendBtn = document.getElementById("send-btn");
    if (sendBtn) {
      sendBtn.addEventListener("click", handleSendMessage);
    }
    const messageInput = document.getElementById("message-input");
    if (messageInput) {
      messageInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          handleSendMessage();
        }
      });
      messageInput.addEventListener("input", handleMentionInput);
    }
    const emojiBtn = document.getElementById("emoji-btn");
    if (emojiBtn) {
      emojiBtn.addEventListener("click", toggleEmojiPicker);
    }
    document.querySelectorAll(".emoji").forEach((emoji) => {
      emoji.addEventListener("click", (e) => {
        insertEmoji(e.currentTarget.dataset.emoji);
      });
    });
    const pinBtn = document.getElementById("pin-btn");
    if (pinBtn) {
      pinBtn.addEventListener("click", handlePinChannel);
    }
    setupEventDelegation();
  }
  function setupEventDelegation() {
    const tabsList = document.getElementById("tabs-list");
    if (tabsList) {
      tabsList.addEventListener("click", (e) => {
        const tabItem = e.target.closest(".tab-item");
        if (tabItem) {
          const url = tabItem.dataset.url;
          if (url) {
            handleTabClick(url);
          }
        }
      });
    }
    const pinnedList = document.getElementById("pinned-list");
    if (pinnedList) {
      pinnedList.addEventListener("click", (e) => {
        const tabItem = e.target.closest(".tab-item");
        if (tabItem) {
          const url = tabItem.dataset.url;
          if (url) {
            handleTabClick(url);
          }
        }
      });
    }
    const activityList = document.getElementById("activity-list");
    if (activityList) {
      activityList.addEventListener("click", (e) => {
        const tabItem = e.target.closest(".tab-item");
        if (tabItem) {
          const url = tabItem.dataset.url;
          if (url) {
            handleTabClick(url);
          }
        }
      });
    }
    const followingList = document.getElementById("following-list");
    if (followingList) {
      followingList.addEventListener("click", (e) => {
        const userItem = e.target.closest(".user-item");
        if (userItem) {
          const pubkey = userItem.dataset.pubkey;
          handleUserClick(pubkey);
        }
      });
    }
    const usersList = document.getElementById("users-list");
    if (usersList) {
      usersList.addEventListener("click", (e) => {
        const userChip = e.target.closest(".user-chip");
        if (userChip) {
          const pubkey = userChip.dataset.pubkey;
          handleUserClick(pubkey);
        }
      });
    }
  }
  async function initializeApp() {
    console.log("Initializing app...");
    if (state.publicKey) {
      console.log("Already initialized, skipping...");
      return;
    }
    const response = await chrome.runtime.sendMessage({ type: "INIT" });
    console.log("INIT response:", response);
    if (response.publicKey) {
      state.publicKey = response.publicKey;
      state.userName = response.userName || "Anonymous";
      console.log("User authenticated, showing main layout");
      const setupOverlay = document.getElementById("setup-overlay");
      const mainLayout = document.getElementById("main-layout");
      if (setupOverlay && mainLayout) {
        setupOverlay.classList.add("hidden");
        mainLayout.classList.remove("hidden");
        mainLayout.style.display = "flex";
        mainLayout.style.flexDirection = "column";
        console.log("Main layout display:", window.getComputedStyle(mainLayout).display);
        console.log("Main layout visibility:", window.getComputedStyle(mainLayout).visibility);
      } else {
        console.error("Layout elements not found!", { setupOverlay, mainLayout });
      }
      updateProfileDisplay();
      const websitesView = document.getElementById("websites-view");
      const profileView = document.getElementById("profile-view");
      console.log("View panels found:", { websitesView: !!websitesView, profileView: !!profileView });
      if (websitesView) {
        websitesView.classList.add("active");
      }
      console.log("Loading initial data...");
      await loadTabs();
      await loadFollowing();
      await discoverRooms();
      setupMessageListener();
      chrome.runtime.sendMessage({ type: "DASHBOARD_OPENED" });
      console.log("App initialized successfully");
    } else {
      console.log("No public key, showing setup");
      const setupOverlay = document.getElementById("setup-overlay");
      const mainLayout = document.getElementById("main-layout");
      if (setupOverlay && mainLayout) {
        setupOverlay.classList.remove("hidden");
        mainLayout.classList.add("hidden");
      }
    }
  }
  async function handleGenerateKey() {
    const response = await chrome.runtime.sendMessage({ type: "GENERATE_KEY" });
    if (response.success) {
      state.publicKey = response.publicKey;
      await initializeApp();
    } else {
      alert("Failed to generate key: " + response.error);
    }
  }
  async function handleImportKey() {
    const input = document.getElementById("import-key-input");
    const key = input.value.trim();
    if (!key) {
      alert("Please enter a key");
      return;
    }
    const response = await chrome.runtime.sendMessage({
      type: "IMPORT_KEY",
      key
    });
    if (response.success) {
      state.publicKey = response.publicKey;
      await initializeApp();
    } else {
      alert("Failed to import key: " + response.error);
    }
  }
  function switchView(view) {
    console.log("Switching to view:", view);
    state.currentView = view;
    document.querySelectorAll(".nav-tab").forEach((tab) => {
      tab.classList.toggle("active", tab.dataset.view === view);
    });
    document.querySelectorAll(".view-panel").forEach((panel) => {
      const isActive = panel.id === `${view}-view`;
      panel.classList.toggle("active", isActive);
      console.log(`Panel ${panel.id}: ${isActive ? "active" : "hidden"}`);
    });
    if (view === "discover") {
      handleDiscoverTab("websites");
    }
  }
  async function loadTabs() {
    console.log("Loading tabs...");
    const tabs = await chrome.tabs.query({});
    console.log("Found tabs:", tabs.length);
    const tabsList = document.getElementById("tabs-list");
    if (!tabsList) {
      console.error("tabs-list element not found!");
      return;
    }
    tabsList.innerHTML = "";
    state.tabs.clear();
    const countsResponse = await chrome.runtime.sendMessage({ type: "GET_ALL_TAB_COUNTS" });
    const userCounts = countsResponse.counts || {};
    let validTabCount = 0;
    tabs.forEach((tab) => {
      if (!tab.url || tab.url.startsWith("chrome://") || tab.url.startsWith("chrome-extension://")) {
        return;
      }
      validTabCount++;
      state.tabs.set(tab.url, tab);
      const tabItem = createTabItem({
        title: tab.title,
        url: tab.url,
        userCount: userCounts[tab.url] || 0,
        isPinned: state.pinnedChannels.has(tab.url)
      });
      tabsList.appendChild(tabItem);
    });
    console.log(`Added ${validTabCount} valid tabs to list`);
    console.log("Tabs list HTML length:", tabsList.innerHTML.length);
    console.log("Tabs list children:", tabsList.children.length);
    const sidebar = document.querySelector(".sidebar");
    if (sidebar) {
      console.log("Sidebar display:", window.getComputedStyle(sidebar).display);
    }
  }
  function createTabItem({ title, url, userCount, isPinned }) {
    const div = document.createElement("div");
    div.className = "tab-item";
    div.dataset.url = url;
    const domain = new URL(url).hostname;
    div.innerHTML = `
    <div>
      <div class="tab-title">${title}</div>
      <div class="tab-url">${domain}</div>
    </div>
    ${userCount > 0 ? `<span class="user-count-badge">${userCount}</span>` : ""}
  `;
    return div;
  }
  async function handleTabClick(url) {
    if (state.currentView !== "websites") {
      switchView("websites");
    }
    state.currentChannel = url;
    document.getElementById("no-selection").classList.add("hidden");
    document.getElementById("chat-container").classList.remove("hidden");
    const tab = state.tabs.get(url);
    document.getElementById("chat-title").textContent = tab?.title || "Loading...";
    document.getElementById("chat-url").textContent = url;
    const messagesEl = document.getElementById("messages");
    messagesEl.innerHTML = '<div class="loading">Loading messages...</div>';
    const response = await chrome.runtime.sendMessage({
      type: "JOIN_TAB_CHANNEL",
      url
    });
    displayMessages(response.messages || []);
    displayUsers(response.users || []);
    document.querySelectorAll(".tab-item").forEach((item) => {
      item.classList.toggle("active", item.dataset.url === url);
    });
  }
  async function loadFollowing() {
    const response = await chrome.runtime.sendMessage({ type: "GET_FOLLOWING" });
    const following = response.following || [];
    state.following.clear();
    following.forEach((user) => {
      state.following.set(user.pubkey, user);
    });
    document.getElementById("following-count").textContent = following.length;
    const followingList = document.getElementById("following-list");
    if (!followingList) return;
    followingList.innerHTML = "";
    if (following.length === 0) {
      followingList.innerHTML = '<div class="empty-state small">Not following anyone yet</div>';
      return;
    }
    following.forEach((user) => {
      const userItem = document.createElement("div");
      userItem.className = "user-item";
      userItem.dataset.pubkey = user.pubkey;
      userItem.innerHTML = `
      <div class="user-chip">${user.name || user.petname || "Anonymous"}</div>
    `;
      followingList.appendChild(userItem);
    });
  }
  async function discoverRooms() {
    const response = await chrome.runtime.sendMessage({ type: "DISCOVER_ROOMS" });
    if (response.rooms) {
      state.rooms = response.rooms;
      updateGroupsList();
      updateGlobalActivity();
    }
  }
  function updateGroupsList() {
    const groupsList = document.getElementById("groups-list");
    if (!groupsList) return;
    groupsList.innerHTML = "";
    state.rooms.groups.forEach((room) => {
      const card = document.createElement("div");
      card.className = "group-card";
      card.dataset.roomContext = JSON.stringify({ users: room.users });
      card.innerHTML = `
      <h3>Group Chat</h3>
      <p>${room.users.length} participants</p>
      <p class="small">${room.messageCount} messages</p>
    `;
      groupsList.appendChild(card);
    });
    state.rooms.named.forEach((room) => {
      const card = document.createElement("div");
      card.className = "group-card";
      card.dataset.roomContext = JSON.stringify({ subject: room.subject });
      card.innerHTML = `
      <h3>${room.subject}</h3>
      <p>${room.participants.size} participants</p>
      <p class="small">${room.messageCount} messages</p>
    `;
      groupsList.appendChild(card);
    });
  }
  function updateGlobalActivity() {
    const activityList = document.getElementById("activity-list");
    if (!activityList) return;
    activityList.innerHTML = "";
    const topSites = Array.from(state.rooms.websites).sort((a, b) => b.messageCount - a.messageCount).slice(0, 10);
    topSites.forEach((site) => {
      const item = createTabItem({
        title: new URL(site.website).hostname,
        url: site.website,
        userCount: site.participants.size,
        isPinned: false
      });
      activityList.appendChild(item);
    });
    if (topSites.length === 0) {
      activityList.innerHTML = '<div class="empty-state small">No activity yet</div>';
    }
  }
  async function handleDiscoverTab(type) {
    document.querySelectorAll(".discover-tab").forEach((tab) => {
      tab.classList.toggle("active", tab.dataset.type === type);
    });
    const content = document.getElementById("discover-content");
    content.innerHTML = '<div class="loading">Loading...</div>';
    setTimeout(() => {
      content.innerHTML = "";
      if (type === "websites") {
        state.rooms.websites.forEach((site) => {
          const item = document.createElement("div");
          item.className = "discover-item";
          item.dataset.roomContext = JSON.stringify({ website: site.website });
          const domain = new URL(site.website).hostname;
          item.innerHTML = `
          <h3>${domain}</h3>
          <p>${site.participants.size} people chatting</p>
          <p class="small">${site.messageCount} messages</p>
        `;
          content.appendChild(item);
        });
      } else if (type === "topics") {
        state.rooms.named.forEach((room) => {
          const item = document.createElement("div");
          item.className = "discover-item";
          item.dataset.roomContext = JSON.stringify({ subject: room.subject });
          item.innerHTML = `
          <h3>#${room.subject}</h3>
          <p>${room.participants.size} participants</p>
          <p class="small">${room.messageCount} messages</p>
        `;
          content.appendChild(item);
        });
      } else if (type === "groups") {
        state.rooms.groups.forEach((room) => {
          const item = document.createElement("div");
          item.className = "discover-item";
          item.dataset.roomContext = JSON.stringify({ users: room.users });
          item.innerHTML = `
          <h3>Group Chat</h3>
          <p>${room.users.length} members</p>
          <p class="small">${room.messageCount} messages</p>
        `;
          content.appendChild(item);
        });
      }
      if (content.children.length === 0) {
        content.innerHTML = '<div class="empty-state">No rooms found</div>';
      }
    }, 500);
  }
  function displayMessages(messages) {
    const messagesEl = document.getElementById("messages");
    messagesEl.innerHTML = "";
    if (messages.length === 0) {
      messagesEl.innerHTML = '<div class="empty-state small">No messages yet. Be the first to say hi!</div>';
      return;
    }
    messages.forEach((msg) => {
      const msgEl = createMessageElement(msg);
      messagesEl.appendChild(msgEl);
    });
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }
  function createMessageElement(msg) {
    const div = document.createElement("div");
    div.className = "message" + (msg.isOwn ? " own" : "");
    const time = new Date(msg.timestamp).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit"
    });
    const avatar = msg.name ? msg.name[0].toUpperCase() : "?";
    div.innerHTML = `
    <div class="message-avatar">${avatar}</div>
    <div class="message-content">
      <div class="message-header">
        <span class="message-name">${msg.name || "Anonymous"}</span>
        <span class="message-time">${time}</span>
      </div>
      <div class="message-text">${escapeHtml(msg.content)}</div>
    </div>
  `;
    return div;
  }
  function displayUsers(users) {
    const usersListEl = document.getElementById("users-list");
    const userCountEl = document.getElementById("user-count");
    userCountEl.textContent = users.length;
    if (users.length === 0) {
      usersListEl.innerHTML = '<span class="no-users">Just you</span>';
      return;
    }
    usersListEl.innerHTML = "";
    users.forEach((user) => {
      const chip = document.createElement("span");
      chip.className = "user-chip";
      chip.dataset.pubkey = user.pubkey;
      chip.textContent = user.name || "Anonymous";
      usersListEl.appendChild(chip);
    });
  }
  async function handleSendMessage() {
    const input = document.getElementById("message-input");
    const content = input.value.trim();
    if (!content || !state.currentChannel) return;
    let messageData;
    if (typeof state.currentChannel === "string") {
      messageData = {
        type: "SEND_MESSAGE",
        content,
        url: state.currentChannel
      };
    } else {
      messageData = {
        type: "SEND_MESSAGE",
        content,
        roomContext: state.currentChannel
      };
    }
    const response = await chrome.runtime.sendMessage(messageData);
    if (response.success) {
      input.value = "";
    } else {
      alert("Failed to send message");
    }
  }
  function handleMentionInput(e) {
    const input = e.target;
    const value = input.value;
    const cursorPos = input.selectionStart;
    const beforeCursor = value.substring(0, cursorPos);
    const mentionMatch = beforeCursor.match(/@(\w*)$/);
    const mentionPicker = document.getElementById("mention-picker");
    const mentionList = document.getElementById("mention-list");
    if (mentionMatch) {
      const search = mentionMatch[1].toLowerCase();
      const users = Array.from(state.users.values()).filter((user) => {
        const name = (user.name || "Anonymous").toLowerCase();
        return name.includes(search);
      });
      if (users.length > 0) {
        mentionList.innerHTML = "";
        users.forEach((user) => {
          const item = document.createElement("div");
          item.className = "mention-item";
          item.dataset.pubkey = user.pubkey;
          item.textContent = user.name || "Anonymous";
          item.addEventListener("click", () => insertMention(user));
          mentionList.appendChild(item);
        });
        mentionPicker.classList.remove("hidden");
      } else {
        mentionPicker.classList.add("hidden");
      }
    } else {
      mentionPicker.classList.add("hidden");
    }
  }
  function insertMention(user) {
    const input = document.getElementById("message-input");
    const value = input.value;
    const beforeCursor = value.substring(0, input.selectionStart);
    const afterCursor = value.substring(input.selectionStart);
    const mentionStart = beforeCursor.lastIndexOf("@");
    const newValue = beforeCursor.substring(0, mentionStart) + `@${user.name || "Anonymous"} ` + afterCursor;
    input.value = newValue;
    input.focus();
    document.getElementById("mention-picker").classList.add("hidden");
  }
  function toggleEmojiPicker() {
    const picker = document.getElementById("emoji-picker");
    picker.classList.toggle("hidden");
  }
  function insertEmoji(emoji) {
    const input = document.getElementById("message-input");
    const start = input.selectionStart;
    const end = input.selectionEnd;
    const value = input.value;
    input.value = value.substring(0, start) + emoji + value.substring(end);
    input.focus();
    input.selectionStart = input.selectionEnd = start + emoji.length;
    document.getElementById("emoji-picker").classList.add("hidden");
  }
  async function handlePinChannel() {
    if (!state.currentChannel || typeof state.currentChannel !== "string") return;
    const url = state.currentChannel;
    if (state.pinnedChannels.has(url)) {
      state.pinnedChannels.delete(url);
    } else {
      state.pinnedChannels.add(url);
    }
    const pinBtn = document.getElementById("pin-btn");
    pinBtn.classList.toggle("active", state.pinnedChannels.has(url));
    updatePinnedList();
  }
  function updatePinnedList() {
    const pinnedList = document.getElementById("pinned-list");
    if (!pinnedList) return;
    pinnedList.innerHTML = "";
    if (state.pinnedChannels.size === 0) {
      pinnedList.innerHTML = '<div class="empty-state small">No pinned channels</div>';
      return;
    }
    state.pinnedChannels.forEach((url) => {
      const tab = state.tabs.get(url);
      if (tab) {
        const item = createTabItem({
          title: tab.title,
          url,
          userCount: 0,
          isPinned: true
        });
        pinnedList.appendChild(item);
      }
    });
  }
  async function handleSaveProfile() {
    const nameInput = document.getElementById("profile-name-input");
    const name = nameInput.value.trim();
    if (!name) return;
    const response = await chrome.runtime.sendMessage({
      type: "SET_USERNAME",
      name
    });
    if (response.success) {
      state.userName = name;
      alert("Profile updated!");
    }
  }
  async function handleProfileSearch() {
    const input = document.getElementById("profile-search-input");
    const query = input.value.trim();
    if (!query) return;
    let pubkey = query;
    if (query.startsWith("npub1")) {
      alert("npub decoding not yet implemented");
      return;
    }
    const response = await chrome.runtime.sendMessage({
      type: "FETCH_USER_METADATA",
      pubkey
    });
    if (response.metadata) {
      handleUserClick(pubkey);
    } else {
      alert("User not found");
    }
  }
  async function handleUserClick(pubkey) {
    console.log("User clicked:", pubkey);
    const isFollowing = state.following.has(pubkey);
    if (isFollowing) {
      const response = await chrome.runtime.sendMessage({
        type: "UNFOLLOW_USER",
        pubkey
      });
      if (response.success) {
        await loadFollowing();
      }
    } else {
      const response = await chrome.runtime.sendMessage({
        type: "FOLLOW_USER",
        pubkey
      });
      if (response.success) {
        await loadFollowing();
      }
    }
  }
  function updateProfileDisplay() {
    const pubkeyEl = document.getElementById("my-profile-pubkey");
    const nameInput = document.getElementById("profile-name-input");
    const pubkeyDisplay = document.getElementById("pubkey-display");
    if (pubkeyEl) {
      pubkeyEl.textContent = `${state.publicKey.substring(0, 8)}...${state.publicKey.substring(56)}`;
    }
    if (nameInput) {
      nameInput.value = state.userName || "";
    }
    if (pubkeyDisplay) {
      pubkeyDisplay.value = state.publicKey;
    }
  }
  function setupMessageListener() {
    chrome.runtime.onMessage.addListener((message) => {
      switch (message.type) {
        case "NEW_MESSAGE":
          if (message.url === state.currentChannel || state.currentChannel && state.currentChannel.website === message.url) {
            const msgEl = createMessageElement(message.message);
            document.getElementById("messages").appendChild(msgEl);
            const messages = document.getElementById("messages");
            messages.scrollTop = messages.scrollHeight;
          }
          break;
        case "PRESENCE_UPDATE":
          if (message.url === state.currentChannel || state.currentChannel && state.currentChannel.website === message.url) {
            displayUsers(message.users);
          }
          break;
        case "GLOBAL_ACTIVITY":
          updateGlobalActivity();
          break;
      }
    });
    setInterval(async () => {
      const response = await chrome.runtime.sendMessage({ type: "GET_STATUS" });
      const indicator = document.getElementById("connection-status");
      const statusText = indicator.querySelector(".status-text");
      if (response.connected) {
        indicator.classList.add("connected");
        indicator.classList.remove("disconnected");
        statusText.textContent = "Connected";
      } else {
        indicator.classList.remove("connected");
        indicator.classList.add("disconnected");
        statusText.textContent = "Disconnected";
      }
    }, 5e3);
  }
  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }
  function showModal(modalId) {
    document.getElementById(modalId).classList.remove("hidden");
  }
  function hideModal(modalId) {
    document.getElementById(modalId).classList.add("hidden");
  }
})();
