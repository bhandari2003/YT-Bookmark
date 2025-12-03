const STORAGE_KEY = "ytBookmarks";

const currentVideoTitleEl = document.getElementById("current-video-title");
const currentTimestampEl = document.getElementById("current-timestamp");
const topicSelectEl = document.getElementById("topic-select");
const newTopicInputEl = document.getElementById("new-topic-input");
const noteInputEl = document.getElementById("note-input");
const saveBookmarkBtn = document.getElementById("save-bookmark-btn");
const statusMessageEl = document.getElementById("status-message");
const bookmarksListEl = document.getElementById("bookmarks-list");
const searchInputEl = document.getElementById("search-input");

let currentVideoInfo = null;
let allBookmarks = [];

/* ---------- Helpers ---------- */

function formatTime(seconds) {
  const s = Number(seconds) || 0;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;

  const pad = (n) => n.toString().padStart(2, "0");
  if (h > 0) return `${h}:${pad(m)}:${pad(sec)}`;
  return `${m}:${pad(sec)}`;
}

function uuid() {
  return crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2);
}

async function getBookmarks() {
  const result = await chrome.storage.sync.get(STORAGE_KEY);
  return result[STORAGE_KEY] || [];
}

async function setBookmarks(bookmarks) {
  return chrome.storage.sync.set({ [STORAGE_KEY]: bookmarks });
}

function showStatus(msg, timeout = 1500) {
  statusMessageEl.textContent = msg;
  if (timeout > 0) {
    setTimeout(() => {
      if (statusMessageEl.textContent === msg) {
        statusMessageEl.textContent = "";
      }
    }, timeout);
  }
}

/* ---------- Rendering ---------- */

function getTopicsFromBookmarks(bookmarks) {
  const set = new Set();
  bookmarks.forEach((b) => {
    if (b.topic && b.topic.trim()) set.add(b.topic.trim());
  });
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

function populateTopicSelect(bookmarks) {
  const topics = getTopicsFromBookmarks(bookmarks);
  topicSelectEl.innerHTML = "";

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Select existing topic (optional)";
  topicSelectEl.appendChild(placeholder);

  topics.forEach((t) => {
    const opt = document.createElement("option");
    opt.value = t;
    opt.textContent = t;
    topicSelectEl.appendChild(opt);
  });
}

function applySearchFilter(bookmarks, query) {
  if (!query) return bookmarks;
  const q = query.toLowerCase();
  return bookmarks.filter((b) => {
    return (
      (b.topic && b.topic.toLowerCase().includes(q)) ||
      (b.note && b.note.toLowerCase().includes(q)) ||
      (b.videoTitle && b.videoTitle.toLowerCase().includes(q))
    );
  });
}

function renderBookmarks(bookmarks, searchQuery = "") {
  bookmarksListEl.innerHTML = "";

  const filtered = applySearchFilter(bookmarks, searchQuery);

  if (filtered.length === 0) {
    const empty = document.createElement("div");
    empty.textContent = searchQuery
      ? "No bookmarks match your search."
      : "No bookmarks yet. Save one from a YouTube video.";
    empty.style.fontSize = "11px";
    empty.style.color = "#9ca3af";
    bookmarksListEl.appendChild(empty);
    return;
  }

  const grouped = new Map();
  filtered.forEach((b) => {
    const topic = b.topic || "Untitled";
    if (!grouped.has(topic)) grouped.set(topic, []);
    grouped.get(topic).push(b);
  });

  Array.from(grouped.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .forEach(([topic, items]) => {
      const groupEl = document.createElement("div");
      groupEl.className = "topic-group";

      const headerEl = document.createElement("div");
      headerEl.className = "topic-header";

      const nameEl = document.createElement("div");
      nameEl.className = "topic-name";

      const pill = document.createElement("span");
      pill.className = "topic-pill";
      pill.textContent = topic;

      const count = document.createElement("span");
      count.className = "topic-count";
      count.textContent = `${items.length} bookmark${items.length > 1 ? "s" : ""}`;

      nameEl.appendChild(pill);
      nameEl.appendChild(count);

      const toggle = document.createElement("span");
      toggle.className = "topic-toggle";
      toggle.textContent = "▼";

      headerEl.appendChild(nameEl);
      headerEl.appendChild(toggle);

      const itemsContainer = document.createElement("div");
      itemsContainer.className = "bookmark-items";

      items
        .sort((a, b) => a.timestamp - b.timestamp)
        .forEach((b) => {
          const item = document.createElement("div");
          item.className = "bookmark-item";

          const mainRow = document.createElement("div");
          mainRow.className = "bookmark-main-row";

          const timeBtn = document.createElement("button");
          timeBtn.className = "bookmark-time-btn";
          timeBtn.textContent = formatTime(b.timestamp);
          timeBtn.addEventListener("click", () => {
            const url = `https://www.youtube.com/watch?v=${b.videoId}&t=${b.timestamp}`;
            chrome.tabs.create({ url });
          });

          const noteEl = document.createElement("div");
          noteEl.className = "bookmark-note";
          noteEl.textContent = b.note || "(No note)";

          mainRow.appendChild(timeBtn);
          mainRow.appendChild(noteEl);

          const meta = document.createElement("div");
          meta.className = "bookmark-meta";
          meta.textContent = b.videoTitle || b.videoId;

          const actions = document.createElement("div");
          actions.className = "bookmark-actions";

          const deleteBtn = document.createElement("button");
          deleteBtn.className = "icon-btn delete";
          deleteBtn.textContent = "Delete";
          deleteBtn.addEventListener("click", async () => {
            allBookmarks = allBookmarks.filter((x) => x.id !== b.id);
            await setBookmarks(allBookmarks);
            populateTopicSelect(allBookmarks);
            renderBookmarks(allBookmarks, searchInputEl.value.trim());
          });

          actions.appendChild(deleteBtn);

          item.appendChild(mainRow);
          item.appendChild(meta);
          item.appendChild(actions);
          itemsContainer.appendChild(item);
        });

      let collapsed = false;
      headerEl.addEventListener("click", () => {
        collapsed = !collapsed;
        itemsContainer.style.display = collapsed ? "none" : "block";
        toggle.textContent = collapsed ? "▶" : "▼";
      });

      groupEl.appendChild(headerEl);
      groupEl.appendChild(itemsContainer);
      bookmarksListEl.appendChild(groupEl);
    });
}

/* ---------- Core Flow ---------- */

async function initCurrentVideoInfo() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) {
      currentVideoTitleEl.textContent = "No active tab.";
      saveBookmarkBtn.disabled = true;
      return;
    }

    const isYoutube = tab.url && tab.url.includes("youtube.com");
    if (!isYoutube) {
      currentVideoTitleEl.textContent = "Open a YouTube video to save a bookmark.";
      currentTimestampEl.textContent = "";
      saveBookmarkBtn.disabled = true;
      return;
    }

    chrome.tabs.sendMessage(
      tab.id,
      { type: "GET_VIDEO_INFO" },
      (response) => {
        // Check for errors from chrome.runtime
        if (chrome.runtime.lastError) {
          console.error("Message error:", chrome.runtime.lastError);
          currentVideoTitleEl.textContent = "Could not connect to YouTube page.";
          currentTimestampEl.textContent = "";
          saveBookmarkBtn.disabled = true;
          return;
        }
        
        if (!response || !response.ok) {
          currentVideoTitleEl.textContent = "Could not read video info.";
          currentTimestampEl.textContent = "";
          saveBookmarkBtn.disabled = true;
          return;
        }

        currentVideoInfo = response;
        currentVideoTitleEl.textContent = response.title || "YouTube video";
        currentTimestampEl.textContent = "Current time: " + formatTime(response.timestamp);
        saveBookmarkBtn.disabled = false;
      }
    );
  } catch (e) {
    currentVideoTitleEl.textContent = "Error getting video info.";
    currentTimestampEl.textContent = "";
    saveBookmarkBtn.disabled = true;
  }
}

async function handleSaveBookmark() {
  if (!currentVideoInfo) {
    showStatus("No YouTube video detected.");
    return;
  }

  const selectedTopic = topicSelectEl.value.trim();
  const newTopic = newTopicInputEl.value.trim();
  const finalTopic = newTopic || selectedTopic || "General";

  const note = noteInputEl.value.trim();

  const bookmark = {
    id: uuid(),
    videoId: currentVideoInfo.videoId,
    timestamp: currentVideoInfo.timestamp,
    topic: finalTopic,
    note,
    videoTitle: currentVideoInfo.title || "",
    createdAt: Date.now()
  };

  allBookmarks.push(bookmark);
  await setBookmarks(allBookmarks);

  noteInputEl.value = "";
  newTopicInputEl.value = "";

  populateTopicSelect(allBookmarks);
  renderBookmarks(allBookmarks, searchInputEl.value.trim());
  showStatus("Bookmark saved ✅");
}

/* ---------- Init ---------- */

async function init() {
  saveBookmarkBtn.disabled = true;
  showStatus("");

  allBookmarks = await getBookmarks();
  populateTopicSelect(allBookmarks);
  renderBookmarks(allBookmarks);

  await initCurrentVideoInfo();

  saveBookmarkBtn.addEventListener("click", handleSaveBookmark);

  searchInputEl.addEventListener("input", () => {
    renderBookmarks(allBookmarks, searchInputEl.value.trim());
  });
}

init();
