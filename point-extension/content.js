// Point — content script v7
// Google Docs-style collaborative annotations on any webpage.

(() => {
  "use strict";

  let apiBase = null;
  let apiBaseLoadPromise = null;

  function isValidHttpUrl(s) {
    return typeof s === "string" && (s.startsWith("http://") || s.startsWith("https://"));
  }

  function stripTrailingSlashes(s) {
    return s.replace(/\/+$/, "");
  }

  const PAGE_URL = location.href.split("#")[0];

  let panelOpen = false;
  let auth = null;
  let friends = [];
  let tooltip = null;
  let activeThread = null; // { highlightId, element }
  let contextValid = true;
  let livePollTimer = null;

  function sendMsg(msg, cb) {
    if (!contextValid) return;
    try { chrome.runtime.sendMessage(msg, (r) => { if (chrome.runtime.lastError) { contextValid = false; return; } if (cb) cb(r); }); } catch { contextValid = false; }
  }

  async function loadApiBase() {
    if (apiBase !== null) return;
    if (!apiBaseLoadPromise) {
      apiBaseLoadPromise = new Promise((resolve) => {
        sendMsg({ type: "GET_API_BASE" }, (r) => {
          const stored = typeof r?.url === "string" ? r.url.trim() : "";
          const fallback =
            typeof globalThis.POINT_API_BASE === "string" ? globalThis.POINT_API_BASE.trim() : "";
          const raw = stored !== "" ? stored : fallback;
          const normalized = stripTrailingSlashes(raw);
          apiBase = isValidHttpUrl(normalized) ? normalized : "";
          resolve();
        });
      });
    }
    await apiBaseLoadPromise;
  }

  function escapeHtml(s) { const d = document.createElement("div"); d.textContent = s; return d.innerHTML; }
  function timeAgo(d) {
    const ms = typeof d === "number" ? d : new Date(d).getTime();
    const m = Math.floor((Date.now() - ms) / 60000);
    if (m < 1) return "now"; if (m < 60) return `${m}m`; const h = Math.floor(m / 60); if (h < 24) return `${h}h`; return `${Math.floor(h / 24)}d`;
  }

  async function apiCall(path, opts = {}) {
    await loadApiBase();
    if (!isValidHttpUrl(apiBase)) {
      throw new Error("Point API base URL missing or invalid — check api-config or storage.");
    }
    const headers = { "Content-Type": "application/json" };
    if (auth?.token) headers["Authorization"] = `Bearer ${auth.token}`;
    const res = await fetch(`${apiBase}${path}`, { ...opts, headers });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "request failed");
    return data;
  }

  // ── XPath ────────────────────────────────────────────────────────
  function getXPath(n) {
    if (n.nodeType === Node.TEXT_NODE) { const p = n.parentElement; const c = Array.from(p.childNodes).filter(x => x.nodeType === Node.TEXT_NODE); return getXPath(p) + `/text()[${c.indexOf(n) + 1}]`; }
    if (n === document.body) return "/html/body"; const p = n.parentElement; if (!p) return "";
    const s = Array.from(p.children).filter(x => x.tagName === n.tagName); return getXPath(p) + `/${n.tagName.toLowerCase()}[${s.indexOf(n) + 1}]`;
  }
  function resolveXP(x) { try { return document.evaluate(x, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue; } catch { return null; } }

  // ── DOM highlight ────────────────────────────────────────────────
  function wrapRange(range, hlId, color, username) {
    const marks = [];
    const container = range.commonAncestorContainer.nodeType === Node.TEXT_NODE ? range.commonAncestorContainer.parentElement : range.commonAncestorContainer;
    function makeMark() {
      const m = document.createElement("mark");
      m.className = "point-hl";
      m.dataset.hlId = hlId;
      m.title = `@${username}`;
      // Detect light vs dark background
      requestAnimationFrame(() => {
        let el = m.parentElement || document.body;
        let bg = "rgb(255,255,255)";
        while (el) {
          const c = window.getComputedStyle(el).backgroundColor;
          if (c && c !== "rgba(0, 0, 0, 0)" && c !== "transparent") { bg = c; break; }
          el = el.parentElement;
        }
        const match = bg.match(/\d+/g);
        const isDark = match && (parseInt(match[0]) + parseInt(match[1]) + parseInt(match[2])) / 3 < 128;
        if (isDark) {
          m.style.backgroundColor = "transparent";
          m.style.borderBottom = `2px solid ${color}`;
        } else {
          m.style.backgroundColor = color + "25";
          m.style.borderBottom = `2px solid ${color}`;
        }
      });
      // Default to light mode styling
      m.style.backgroundColor = color + "25";
      m.style.borderBottom = `2px solid ${color}`;
      return m;
    }
    if (range.startContainer === range.endContainer) {
      try { const m = makeMark(); range.surroundContents(m); marks.push(m); } catch {}
    } else {
      const tns = []; const w = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null); let n, inR = false;
      while ((n = w.nextNode())) { if (n === range.startContainer) inR = true; if (inR) tns.push(n); if (n === range.endContainer) break; }
      for (const tn of tns) {
        try {
          let wn = tn, s = 0, e = tn.textContent.length;
          if (tn === range.startContainer) s = range.startOffset; if (tn === range.endContainer) e = range.endOffset;
          if (s > 0) { wn = tn.splitText(s); e -= s; } if (e < wn.textContent.length) wn.splitText(e);
          if (wn.textContent.length > 0 && wn.parentNode) { const m = makeMark(); wn.parentNode.insertBefore(m, wn); m.appendChild(wn); marks.push(m); }
        } catch {}
      }
    }
    // Click to open thread
    marks.forEach(m => m.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); openThread(hlId, m); }));
    return marks;
  }

  function removeMarks(hlId) {
    document.querySelectorAll(`mark.point-hl[data-hl-id="${hlId}"]`).forEach(m => {
      const p = m.parentNode; while (m.firstChild) p.insertBefore(m.firstChild, m); p.removeChild(m); p.normalize();
    });
  }

  // ── Drag helper ─────────────────────────────────────────────────
  function makeDraggable(el, saveKey) {
    let dragging = false, hasMoved = false, startLeft, startTop, startX, startY;
    const handle = el.querySelector(".point-drag-handle") || el;

    // Restore saved position
    if (saveKey) {
      try {
        const saved = JSON.parse(localStorage.getItem("point-pos-" + saveKey));
        if (saved) {
          el.style.top = saved.top + "px";
          el.style.left = saved.left + "px";
          el.style.right = "auto";
          el.style.bottom = "auto";
        }
      } catch {}
    }

    handle.addEventListener("mousedown", e => {
      if (e.target.closest("input,button,textarea")) return;
      e.preventDefault(); e.stopPropagation();
      const rect = el.getBoundingClientRect();
      startLeft = rect.left;
      startTop = rect.top;
      startX = e.clientX; startY = e.clientY;
      dragging = true; hasMoved = false;
      handle.style.cursor = "grabbing";
    });
    window.addEventListener("mousemove", e => {
      if (!dragging) return;
      e.preventDefault();
      hasMoved = true;
      const newLeft = startLeft + e.clientX - startX;
      const newTop = startTop + e.clientY - startY;
      el.style.left = newLeft + "px";
      el.style.top = newTop + "px";
      el.style.right = "auto";
      el.style.bottom = "auto";
    });
    window.addEventListener("mouseup", () => {
      if (!dragging) return;
      dragging = false;
      handle.style.cursor = "";
      if (hasMoved && saveKey) {
        const rect = el.getBoundingClientRect();
        localStorage.setItem("point-pos-" + saveKey, JSON.stringify({ top: rect.top, left: rect.left }));
      }
    });
  }

  // ── Selection tooltip (friend picker) ───────────────────────────
  function showTooltip(rect) {
    removeTooltip();
    tooltip = document.createElement("div");
    tooltip.id = "point-tooltip";

    if (!auth) {
      // Not logged in — simple button to open panel
      const btn = document.createElement("button");
      btn.textContent = "@ Point";
      btn.addEventListener("mousedown", e => { e.preventDefault(); e.stopPropagation(); togglePanel(); });
      tooltip.appendChild(btn);
    } else {
      // Header
      const header = document.createElement("div");
      header.className = "point-tooltip-header";
      header.textContent = "Point to";
      tooltip.appendChild(header);

      // Friend list
      if (friends.length === 0) {
        const empty = document.createElement("div");
        empty.className = "point-tooltip-empty";
        empty.textContent = "No friends yet";
        tooltip.appendChild(empty);
      } else {
        friends.forEach(f => {
          const row = document.createElement("div");
          row.className = "point-tooltip-friend";
          row.innerHTML = `<span class="point-tooltip-avatar" style="background:${f.color || "#ccc"}40;border-color:${f.color || "#ccc"}">${escapeHtml(f.username.charAt(0).toUpperCase())}</span><span class="point-tooltip-name">${escapeHtml(f.username)}</span>`;
          row.addEventListener("mousedown", e => {
            e.preventDefault(); e.stopPropagation();
            createHighlight(f.username);
          });
          tooltip.appendChild(row);
        });
      }
    }

    document.body.appendChild(tooltip);
    // Position to the right of selection
    const x = rect.right + 8 + window.scrollX;
    const y = rect.top + window.scrollY;
    if (rect.right + 180 > window.innerWidth) {
      tooltip.style.left = Math.max(4, rect.left - 180 + window.scrollX) + "px";
    } else {
      tooltip.style.left = x + "px";
    }
    tooltip.style.top = Math.max(4, y) + "px";
  }
  function removeTooltip() { if (tooltip) { tooltip.remove(); tooltip = null; } }

  // ── Create highlight (saves to server) ───────────────────────────
  // Clamp range so it doesn't extend beyond the selected text
  function clampRange(range) {
    const r = range.cloneRange();
    // If end container is an element (not text), walk back to the last text node within the range
    if (r.endContainer.nodeType !== Node.TEXT_NODE) {
      const walker = document.createTreeWalker(r.commonAncestorContainer, NodeFilter.SHOW_TEXT);
      let last = null, n;
      while ((n = walker.nextNode())) {
        if (r.intersectsNode(n)) last = n;
      }
      if (last) { r.setEnd(last, last.textContent.length); }
    }
    // Same for start
    if (r.startContainer.nodeType !== Node.TEXT_NODE) {
      const walker = document.createTreeWalker(r.commonAncestorContainer, NodeFilter.SHOW_TEXT);
      const n = walker.nextNode();
      if (n && r.intersectsNode(n)) { r.setStart(n, 0); }
    }
    return r;
  }

  async function createHighlight(toUsername) {
    if (!auth) { togglePanel(); return; }
    const sel = window.getSelection(); if (!sel || sel.isCollapsed) return;
    const range = clampRange(sel.getRangeAt(0)); const text = sel.toString().trim(); if (!text) return;

    const rangeData = {
      url: PAGE_URL,
      pageTitle: document.title,
      text,
      rangeStart: getXPath(range.startContainer),
      rangeStartOffset: range.startOffset,
      rangeEnd: getXPath(range.endContainer),
      rangeEndOffset: range.endOffset,
    };

    sel.removeAllRanges(); removeTooltip();

    try {
      const result = await apiCall("/highlights/create", { method: "POST", body: JSON.stringify(rangeData) });
      // Notify the friend
      if (toUsername) {
        apiCall("/points/send", { method: "POST", body: JSON.stringify({
          toUsername,
          text,
          message: `Pointed you to "${text.length > 80 ? text.slice(0, 80) + "..." : text}"`,
          url: PAGE_URL,
          color: auth.user.color || "#4a7c6f",
        })}).catch(err => console.error("Point send failed:", err));
      }
      // Render the highlight on page
      const newRange = document.createRange();
      const s = resolveXP(rangeData.rangeStart), e = resolveXP(rangeData.rangeEnd);
      if (s && e) {
        newRange.setStart(s, rangeData.rangeStartOffset);
        newRange.setEnd(e, rangeData.rangeEndOffset);
        const marks = wrapRange(newRange, result.id, result.color || auth.user.color, result.username || auth.user.username);
        if (marks.length > 0) openThread(result.id, marks[0]);
      }
    } catch (err) { console.error("Failed to create highlight:", err); }
  }

  // ── Thread popup (Google Docs-style, positioned on page) ─────────
  async function refreshActiveThread() {
    if (!activeThread?.element || !activeThread.highlightId) return;
    const commentsEl = activeThread.element.querySelector(".point-thread-comments");
    if (!commentsEl) return;
    try {
      const comments = await apiCall("/comments/list", { method: "POST", body: JSON.stringify({ highlightId: activeThread.highlightId }) });
      const currentCount = commentsEl.querySelectorAll(".point-thread-comment").length;
      if (comments.length === currentCount) return; // no change
      commentsEl.innerHTML = comments.map(c => `
        <div class="point-thread-comment">
          <span class="point-thread-comment-author" style="color: ${c.color}">@${escapeHtml(c.username)}</span>
          <span class="point-thread-comment-body">${escapeHtml(c.body)}</span>
          <span class="point-thread-comment-time">${timeAgo(c.createdAt)}</span>
        </div>
      `).join("");
      commentsEl.scrollTop = commentsEl.scrollHeight;
    } catch {}
  }

  function closeThread() {
    if (activeThread) {
      activeThread.element?.remove();
      activeThread = null;
    }
  }

  async function openThread(hlId, anchorMark) {
    closeThread();

    const thread = document.createElement("div");
    thread.className = "point-thread";
    thread.innerHTML = `<div class="point-drag-handle point-thread-drag">⠿</div><div class="point-thread-loading">Loading...</div>`;
    document.body.appendChild(thread);

    // Position: absolute (scrolls with page), to the right of the containing block
    const block = anchorMark.closest("p, div, li, td, section, article, blockquote, h1, h2, h3, h4, h5, h6") || anchorMark.parentElement;
    const blockRect = block.getBoundingClientRect();
    const markRect = anchorMark.getBoundingClientRect();

    thread.style.position = "absolute";
    thread.style.top = (markRect.top + window.scrollY) + "px";
    if (blockRect.right + 400 < window.innerWidth) {
      thread.style.left = (blockRect.right + 12 + window.scrollX) + "px";
    } else if (blockRect.left - 400 > 0) {
      thread.style.left = (blockRect.left - 400 - 12 + window.scrollX) + "px";
    } else {
      thread.style.left = (markRect.right + 12 + window.scrollX) + "px";
    }

    activeThread = { highlightId: hlId, element: thread, anchor: null };

    try {
      const [comments, highlights] = await Promise.all([
        apiCall("/comments/list", { method: "POST", body: JSON.stringify({ highlightId: hlId }) }),
        apiCall("/highlights/page", { method: "POST", body: JSON.stringify({ url: PAGE_URL }) }),
      ]);

      const hl = highlights.find(h => h.id === hlId);
      if (!hl) { thread.innerHTML = `<div class="point-thread-empty">Highlight not found</div>`; return; }

      thread.innerHTML = `
                <div class="point-thread-header">
          <span class="point-thread-author" style="color: ${hl.color}">@${escapeHtml(hl.username)}</span>
          <span class="point-thread-time">${timeAgo(hl.createdAt)}</span>
          ${hl.isMine ? `<button class="point-thread-delete" data-hlid="${hlId}">&times;</button>` : ""}
        </div>
        <div class="point-thread-quote">${escapeHtml(hl.text.length > 200 ? hl.text.slice(0, 200) + "..." : hl.text)}</div>
        <div class="point-thread-comments" id="pt-comments-${hlId}">
          ${comments.length === 0 ? "" : comments.map(c => `
            <div class="point-thread-comment">
              <span class="point-thread-comment-author" style="color: ${c.color}">@${escapeHtml(c.username)}</span>
              <span class="point-thread-comment-body">${escapeHtml(c.body)}</span>
              <span class="point-thread-comment-time">${timeAgo(c.createdAt)}</span>
            </div>
          `).join("")}
        </div>
        <div class="point-thread-input">
          <input type="text" placeholder="Reply..." id="pt-input-${hlId}" />
          <button id="pt-send-${hlId}">&#x27A4;</button>
        </div>
      `;

      // Delete highlight
      thread.querySelector(".point-thread-delete")?.addEventListener("click", async () => {
        await apiCall("/highlights/remove", { method: "POST", body: JSON.stringify({ highlightId: hlId }) });
        removeMarks(hlId);
        closeThread();
      });

      // Send comment
      const input = thread.querySelector(`#pt-input-${hlId}`);
      const sendBtn = thread.querySelector(`#pt-send-${hlId}`);
      const doSend = async () => {
        const body = input.value.trim(); if (!body) return;
        input.value = "";
        await apiCall("/comments/add", { method: "POST", body: JSON.stringify({ highlightId: hlId, body }) });
        openThread(hlId, anchorMark); // Refresh
      };
      sendBtn.addEventListener("click", doSend);
      input.addEventListener("keydown", e => { if (e.key === "Enter") doSend(); });
      input.focus();
    } catch {
      thread.innerHTML = `<div class="point-thread-empty">Failed to load</div>`;
    }
  }

  // ── Load all highlights for this page ────────────────────────────
  async function loadPageHighlights() {
    if (!auth?.token) return;
    try {
      const highlights = await apiCall("/highlights/page", { method: "POST", body: JSON.stringify({ url: PAGE_URL }) });
      // Show presence banner for friends on this page
      const others = [...new Map(highlights.filter(h => !h.isMine).map(h => [h.username, h])).values()];
      updatePresenceBanner(others);
      for (const h of highlights) {
        if (document.querySelector(`mark.point-hl[data-hl-id="${h.id}"]`)) continue;
        const s = resolveXP(h.rangeStart), e = resolveXP(h.rangeEnd);
        if (!s || !e) continue;
        try {
          const range = document.createRange();
          range.setStart(s, h.rangeStartOffset);
          range.setEnd(e, h.rangeEndOffset);
          wrapRange(range, h.id, h.color, h.username);
        } catch {}
      }
    } catch {}
  }

  function updatePresenceBanner(others) {
    let banner = document.getElementById("point-presence");
    if (others.length === 0) { if (banner) banner.remove(); return; }
    if (!banner) {
      banner = document.createElement("div");
      banner.id = "point-presence";
      document.body.appendChild(banner);
    }
    banner.innerHTML = others.map(h =>
      `<span class="point-presence-name" style="color:${h.color}" data-username="${escapeHtml(h.username)}">@${escapeHtml(h.username)}</span>`
    ).join(" ");
    banner.querySelectorAll(".point-presence-name").forEach(el => {
      el.addEventListener("click", () => {
        const mark = document.querySelector(`mark.point-hl[title="@${el.dataset.username}"]`);
        if (mark) { mark.scrollIntoView({ behavior: "smooth", block: "center" }); mark.click(); }
      });
    });
  }

  // ── Widget (FAB + panel for conversations list & friends) ────────
  let widget, panel, fab;

  function createWidget() {
    if (widget) return;
    widget = document.createElement("div"); widget.id = "point-widget";
    widget.innerHTML = `
      <div id="point-panel">
        <div class="pp-resize-handle"></div>
        <div class="pp-header point-drag-handle">
          <div class="pp-title">@ Point</div>
          <button class="pp-header-btn pp-logout-btn" data-action="logout" title="Log out" style="display:none;">&#x23FB;</button>
          <button class="pp-header-btn" data-action="close" title="Close">&times;</button>
        </div>
        <div class="pp-tabs">
          <button class="pp-tab active" data-tab="pages">Pages</button>
          <button class="pp-tab" data-tab="friends">Friends</button>
        </div>
        <div class="pp-body" id="pp-body"></div>
      </div>
      <div id="point-fab">@</div>
    `;
    document.body.appendChild(widget);
    panel = document.getElementById("point-panel"); fab = document.getElementById("point-fab");
    fab.addEventListener("click", togglePanel);
    panel.querySelector('[data-action="close"]').addEventListener("click", togglePanel);
    panel.querySelector('[data-action="logout"]').addEventListener("click", doLogout);
    panel.querySelectorAll(".pp-tab").forEach(tab => tab.addEventListener("click", () => switchTab(tab.dataset.tab)));
    widget.addEventListener("mousedown", e => e.stopPropagation());

    // Panel draggable
    makeDraggable(panel, "panel");

    // Panel resizable from left edge
    const resizeHandle = panel.querySelector(".pp-resize-handle");
    let resizing = false, resizeStartX, resizeStartW, resizeStartL;
    resizeHandle.addEventListener("mousedown", e => {
      e.preventDefault(); e.stopPropagation();
      resizing = true;
      resizeStartX = e.clientX;
      resizeStartW = panel.offsetWidth;
      resizeStartL = panel.getBoundingClientRect().left;
    });
    window.addEventListener("mousemove", e => {
      if (!resizing) return;
      e.preventDefault();
      const dx = resizeStartX - e.clientX;
      const newW = Math.max(300, resizeStartW + dx);
      panel.style.width = newW + "px";
      panel.style.left = (resizeStartL - dx) + "px";
      panel.style.right = "auto";
    });
    window.addEventListener("mouseup", () => { resizing = false; });
  }

  function togglePanel() {
    createWidget(); panelOpen = !panelOpen; panel.classList.toggle("open", panelOpen);
    // fab stays visible always
    if (panelOpen) {
      updateLogout();
      panel.querySelectorAll(".pp-tab").forEach(tab => tab.classList.toggle("active", tab.dataset.tab === "pages"));
      if (!auth) renderAuth(); else renderPages();
      ensureAuthPollTimer();
    }
  }
  function switchTab(t) { panel.querySelectorAll(".pp-tab").forEach(tab => tab.classList.toggle("active", tab.dataset.tab === t)); if (t === "pages") renderPages(); else renderFriends(); }
  function updateLogout() { if (panel) { const b = panel.querySelector('[data-action="logout"]'); if (b) b.style.display = auth ? "" : "none"; } }
  function updateBadge() { /* replaced by showNotifDot */ }

  function authPollTick() {
    if (!auth) return;
    if (panelOpen) {
      const t = panel?.querySelector(".pp-tab.active")?.dataset.tab;
      if (t === "pages") renderPages();
      else renderFriends();
    }
    loadPageHighlights();
    pollNotifications();
    refreshActiveThread();
  }

  // One poll interval while logged in; cleared on logout.
  function ensureAuthPollTimer() {
    if (!auth || livePollTimer) return;
    livePollTimer = setInterval(authPollTick, 4000);
  }

  function stopAuthPollTimer() {
    if (livePollTimer) {
      clearInterval(livePollTimer);
      livePollTimer = null;
    }
  }

  // ── Toast notifications ─────────────────────────────────────────
  let seenPointIds = null; // null = first poll (seed only, no toasts)
  let seenPendingCount = -1;

  function showToast(html, duration = 5000) {
    let toast = document.getElementById("point-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "point-toast";
      document.body.appendChild(toast);
    }
    toast.innerHTML = html;
    toast.classList.add("show");
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.remove("show"), duration);
  }

  function showNotifDot(show) {
    createWidget();
    let dot = fab.querySelector(".point-notif-dot");
    if (show) {
      if (!dot) { dot = document.createElement("div"); dot.className = "point-notif-dot"; fab.appendChild(dot); }
    } else if (dot) { dot.remove(); }
  }

  async function pollNotifications() {
    if (!auth?.token) return;
    try {
      const unread = await apiCall("/points/unread");
      const pending = await apiCall("/friends/pending-count").catch(() => 0);
      const pendingNum = typeof pending === "number" ? pending : 0;

      if (seenPointIds === null) {
        // First poll — seed seen set, no toasts
        seenPointIds = new Set(unread.map(p => p.id));
        seenPendingCount = pendingNum;
      } else {
        // Show toasts for new points
        for (const p of unread) {
          if (!seenPointIds.has(p.id)) {
            seenPointIds.add(p.id);
            const preview = p.text.length > 60 ? p.text.slice(0, 60) + "..." : p.text;
            showToast(`<b style="color:${p.color || "#4a7c6f"}">@${escapeHtml(p.fromUsername)}</b> pointed you to: <i>"${escapeHtml(preview)}"</i>`);
            apiCall("/points/read", { method: "POST", body: JSON.stringify({ pointId: p.id }) }).catch(() => {});
          }
        }
        // Show toast for new friend requests
        if (pendingNum > seenPendingCount && seenPendingCount >= 0) {
          showToast(`<b>New friend request!</b> Open @ Point to accept.`);
        }
        seenPendingCount = pendingNum;
      }

      // Red dot if anything unread
      showNotifDot(unread.length > 0 || pendingNum > 0);
    } catch {}
  }

  function doLogout() {
    stopAuthPollTimer();
    auth = null;
    friends = [];
    seenPointIds = null;
    seenPendingCount = -1;
    sendMsg({ type: "CLEAR_AUTH" });
    showNotifDot(false);
    updateLogout();
    renderAuth();
  }

  // ── Auth ─────────────────────────────────────────────────────────
  function renderAuth() {
    const body = document.getElementById("pp-body"); if (!body || !panel) return; panel.querySelector(".pp-tabs").style.display = "none"; updateLogout();
    body.innerHTML = `
      <div class="pp-auth">
        <h3>@ Point</h3>
        <p>Enter username and password</p>
        <div class="pp-auth-error" id="pp-auth-error" style="display:none"></div>
        <input type="text" id="pp-auth-username" placeholder="Username" autocomplete="username" />
        <input type="password" id="pp-auth-password" placeholder="Password" autocomplete="current-password" />
        <button id="pp-auth-submit">Continue</button>
      </div>`;
    document.getElementById("pp-auth-submit").addEventListener("click", doAuth);
    body.querySelectorAll("input").forEach(i => i.addEventListener("keydown", e => { if (e.key === "Enter") doAuth(); }));
  }

  async function doAuth() {
    const err = document.getElementById("pp-auth-error"); err.style.display = "none";
    const u = document.getElementById("pp-auth-username").value.trim(), p = document.getElementById("pp-auth-password").value;
    if (!u || !p) { err.textContent = "Enter username and password"; err.style.display = "block"; return; }
    try {
      let data;
      try { data = await apiCall("/auth/login", { method: "POST", body: JSON.stringify({ username: u, password: p }) }); }
      catch (e) { if (e.message.includes("not found")) data = await apiCall("/auth/register", { method: "POST", body: JSON.stringify({ username: u, password: p }) }); else throw e; }
      auth = { user: data.user, token: data.token };
      sendMsg({ type: "SET_AUTH", auth }); panel.querySelector(".pp-tabs").style.display = "flex";
      updateLogout(); applyUserColor(); loadFriends(); loadPageHighlights(); renderPages();
      ensureAuthPollTimer();
    } catch (e) { err.textContent = e.message; err.style.display = "block"; }
  }

  async function loadFriends() { try { friends = await apiCall("/friends"); } catch { friends = []; } }

  // ── Pages view (all conversations) ───────────────────────────────
  async function renderPages() {
    if (!document.getElementById("pp-body")) return;
    try {
      const [pages, pending] = await Promise.all([
        apiCall("/highlights/pages").catch(() => []),
        apiCall("/friends/pending-count").catch(() => 0),
      ]);
      const body = document.getElementById("pp-body"); if (!body) return;
      updateBadge(typeof pending === "number" ? pending : 0);
      const friendsTab = panel?.querySelector('[data-tab="friends"]');
      if (friendsTab) friendsTab.textContent = pending > 0 ? `Friends (${pending})` : "Friends";

      if (pages.length === 0) {
        body.innerHTML = `<div class="pp-empty">No conversations yet.<br>Select text on any page and click <b>@ Point</b> to start.</div>`;
        return;
      }

      body.innerHTML = pages.map(p => {
        let title = p.pageTitle;
        if (!title) { try { title = new URL(p.url).hostname; } catch { title = "Page"; } }
        return `
          <div class="pp-thread-row" data-url="${escapeHtml(p.url)}">
            <div class="pp-thread-info">
              <div class="pp-thread-title">${escapeHtml(title.length > 50 ? title.slice(0, 50) + "..." : title)}</div>
              <div class="pp-thread-participants">${p.participants.map(x => typeof x === "string" ? `<span>@${escapeHtml(x)}</span>` : `<span style="color:${x.color}">@${escapeHtml(x.username)}</span>`).join(", ")}</div>
              <div class="pp-thread-preview">${p.highlightCount} highlight${p.highlightCount !== 1 ? "s" : ""}</div>
            </div>
            <div class="pp-thread-meta">
              <div class="pp-thread-time">${timeAgo(p.lastTime)}</div>
            </div>
          </div>`;
      }).join("");

      body.querySelectorAll(".pp-thread-row").forEach(el => {
        el.addEventListener("click", () => {
          const url = el.dataset.url;
          if (url === PAGE_URL) { togglePanel(); }
          else window.open(url, "_blank");
        });
      });
    } catch { const b = document.getElementById("pp-body"); if (b) b.innerHTML = `<div class="pp-empty">Could not load pages.</div>`; }
  }

  // ── Friends view ─────────────────────────────────────────────────
  async function renderFriends() {
    const body = document.getElementById("pp-body"); if (!body) return; await loadFriends();
    let pendingHtml = "", sentHtml = "";
    try {
      const [pending, sent] = await Promise.all([apiCall("/friends/pending"), apiCall("/friends/sent")]);
      if (pending.length > 0) pendingHtml = `<div class="pp-section-label">Requests</div>` + pending.map(r => `<div class="pp-friend-request"><div class="pp-fr-avatar" style="background:${r.color}20;border-color:${r.color};color:${r.color}">${escapeHtml(r.fromUsername.charAt(0).toUpperCase())}</div><div class="pp-fr-name" style="color:${r.color}">${escapeHtml(r.fromUsername)}</div><button class="pp-accept-btn" data-rid="${r.id}">Accept</button><button class="pp-reject-btn" data-rid="${r.id}">&times;</button></div>`).join("");
      if (sent.length > 0) sentHtml = `<div class="pp-section-label">Waiting</div>` + sent.map(r => `<div class="pp-friend-waiting"><div class="pp-fr-avatar" style="background:${r.color}20;border-color:${r.color};color:${r.color}">${escapeHtml(r.toUsername.charAt(0).toUpperCase())}</div><div class="pp-fr-name" style="color:${r.color}">${escapeHtml(r.toUsername)}</div><div class="pp-waiting-label">pending</div></div>`).join("");
    } catch {}

    body.innerHTML = `
      <div class="pp-add-friend"><input type="text" id="pp-add-input" placeholder="Add friend by username..." /><button id="pp-add-btn">Send</button></div>
      ${pendingHtml}${sentHtml}
      ${friends.length > 0 ? `<div class="pp-section-label">Friends</div>` : ""}
      ${friends.length === 0 && !pendingHtml && !sentHtml ? `<div class="pp-empty">No friends yet.</div>` :
        friends.map(f => { const c = f.color || "#4a7c6f"; return `<div class="pp-friend-row"><div class="pp-fr-avatar" style="background:${c}20;border-color:${c};color:${c}">${escapeHtml(f.username.charAt(0).toUpperCase())}</div><div class="pp-fr-name" style="color:${c}">${escapeHtml(f.username)}</div><button class="pp-fr-remove" data-uid="${f.id}">&times;</button></div>`; }).join("")}
      ${auth ? `<div style="padding:18px 20px;font-size:13px;color:${auth.user.color || "#bbb"};text-align:center;font-family:-apple-system,sans-serif;font-weight:600;">@${escapeHtml(auth.user.username)}</div>` : ""}`;

    const addInput = document.getElementById("pp-add-input"), addBtn = document.getElementById("pp-add-btn");
    const doAdd = async () => { const u = addInput.value.trim(); if (!u) return; try { const r = await apiCall("/friends/request", { method: "POST", body: JSON.stringify({ username: u }) }); addInput.value = ""; addInput.placeholder = r.message || "Sent!"; setTimeout(() => { addInput.placeholder = "Add friend by username..."; }, 2000); renderFriends(); } catch (e) { alert(e.message); } };
    addBtn?.addEventListener("click", doAdd); addInput?.addEventListener("keydown", e => { if (e.key === "Enter") doAdd(); });
    body.querySelectorAll(".pp-accept-btn").forEach(b => b.addEventListener("click", async () => { await apiCall("/friends/accept", { method: "POST", body: JSON.stringify({ requestId: b.dataset.rid }) }); renderFriends(); loadPageHighlights(); }));
    body.querySelectorAll(".pp-reject-btn").forEach(b => b.addEventListener("click", async () => { await apiCall("/friends/reject", { method: "POST", body: JSON.stringify({ requestId: b.dataset.rid }) }); renderFriends(); }));
    body.querySelectorAll(".pp-fr-remove").forEach(b => b.addEventListener("click", async () => { await apiCall("/friends/remove", { method: "POST", body: JSON.stringify({ userId: b.dataset.uid }) }); renderFriends(); }));
  }

  // ── Events ───────────────────────────────────────────────────────
  document.addEventListener("mouseup", e => {
    if (e.target.closest("#point-tooltip") || e.target.closest("#point-widget") || e.target.closest(".point-thread")) return;
    setTimeout(() => {
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed && sel.toString().trim().length > 0) showTooltip(sel.getRangeAt(0).getBoundingClientRect());
      else removeTooltip();
    }, 10);
  });

  document.addEventListener("mousedown", e => {
    if (tooltip && !e.target.closest("#point-tooltip")) removeTooltip();
    if (activeThread && !e.target.closest(".point-thread") && !e.target.closest("mark.point-hl")) closeThread();
  });

  document.addEventListener("keydown", e => {
    // @ (Shift+2) toggles panel
    if ((e.key === "@" || (e.shiftKey && e.key === "2")) && !e.target.matches("input,textarea,[contenteditable]")) {
      e.preventDefault(); togglePanel();
    }
    // Cmd+2 to point selection
    if ((e.metaKey || e.ctrlKey) && e.key === "2") { e.preventDefault(); createHighlight(); }
  });

  try { chrome.runtime.onMessage.addListener(msg => { if (msg.type === "TOGGLE_WIDGET") togglePanel(); }); } catch { contextValid = false; }

  // ── Init ─────────────────────────────────────────────────────────
  function applyUserColor() {
    const c = auth?.user?.color;
    if (!c) return;
    document.documentElement.style.setProperty("--point-accent", c);
    document.documentElement.style.setProperty("--point-accent-bg", c + "20");
  }

  async function init() {
    await loadApiBase();
    sendMsg({ type: "GET_AUTH" }, (saved) => {
      if (saved?.token) {
        auth = saved;
        loadFriends();
        loadPageHighlights();
        applyUserColor();
        pollNotifications();
        ensureAuthPollTimer();
      }
    });
    createWidget();
  }

  init();
})();
