// Point — content script v7
// Google Docs-style collaborative annotations on any webpage.

(() => {
  "use strict";

  const API = "https://secret-horse-321.convex.site";
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

  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function escapeHtml(s) { const d = document.createElement("div"); d.textContent = s; return d.innerHTML; }
  function timeAgo(d) {
    const ms = typeof d === "number" ? d : new Date(d).getTime();
    const m = Math.floor((Date.now() - ms) / 60000);
    if (m < 1) return "now"; if (m < 60) return `${m}m`; const h = Math.floor(m / 60); if (h < 24) return `${h}h`; return `${Math.floor(h / 24)}d`;
  }

  async function apiCall(path, opts = {}) {
    const headers = { "Content-Type": "application/json" };
    if (auth?.token) headers["Authorization"] = `Bearer ${auth.token}`;
    const res = await fetch(`${API}${path}`, { ...opts, headers });
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
      m.style.backgroundColor = color + "40"; // 25% opacity
      m.style.borderBottom = `2px solid ${color}`;
      m.title = `@${username}`;
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

  // ── Selection tooltip (simple "Point" button) ────────────────────
  function showTooltip(rect) {
    removeTooltip();
    tooltip = document.createElement("div");
    tooltip.id = "point-tooltip";
    const btn = document.createElement("button");
    btn.textContent = "@ Point";
    btn.addEventListener("mousedown", e => { e.preventDefault(); e.stopPropagation(); createHighlight(); });
    tooltip.appendChild(btn);
    document.body.appendChild(tooltip);
    const x = rect.left + rect.width / 2 - 40 + window.scrollX;
    const y = rect.top - 40 + window.scrollY;
    tooltip.style.left = Math.max(4, x) + "px";
    tooltip.style.top = Math.max(4, y) + "px";
  }
  function removeTooltip() { if (tooltip) { tooltip.remove(); tooltip = null; } }

  // ── Create highlight (saves to server) ───────────────────────────
  async function createHighlight() {
    if (!auth) { togglePanel(); return; }
    const sel = window.getSelection(); if (!sel || sel.isCollapsed) return;
    const range = sel.getRangeAt(0); const text = sel.toString().trim(); if (!text) return;

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
  function closeThread() {
    if (activeThread) {
      activeThread.element?.remove();
      activeThread.anchor?.remove();
      activeThread = null;
    }
  }

  async function openThread(hlId, anchorMark) {
    closeThread();

    // Wrap the mark in a relative container so the thread is anchored to it
    const anchor = document.createElement("span");
    anchor.className = "point-thread-anchor";
    anchor.style.position = "relative";
    anchor.style.display = "inline";
    anchorMark.parentNode.insertBefore(anchor, anchorMark.nextSibling);

    const thread = document.createElement("div");
    thread.className = "point-thread";
    thread.innerHTML = `<div class="point-thread-loading">Loading...</div>`;
    anchor.appendChild(thread);

    // Position: to the right of the mark, or left if not enough space
    const rect = anchorMark.getBoundingClientRect();
    if (rect.right + 320 < window.innerWidth) {
      thread.style.left = "12px";
    } else {
      thread.style.right = "12px";
    }
    thread.style.top = "0";

    activeThread = { highlightId: hlId, element: thread, anchor };

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

    } catch (err) {
      thread.innerHTML = `<div class="point-thread-empty">Failed to load</div>`;
    }
  }

  // ── Load all highlights for this page ────────────────────────────
  async function loadPageHighlights() {
    if (!auth?.token) return;
    try {
      const highlights = await apiCall("/highlights/page", { method: "POST", body: JSON.stringify({ url: PAGE_URL }) });
      for (const h of highlights) {
        // Don't re-render if already on page
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

  // ── Widget (FAB + panel for conversations list & friends) ────────
  let widget, panel, fab;

  function createWidget() {
    if (widget) return;
    widget = document.createElement("div"); widget.id = "point-widget";
    widget.innerHTML = `
      <div id="point-panel">
        <div class="pp-header">
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
  }

  function togglePanel() {
    createWidget(); panelOpen = !panelOpen; panel.classList.toggle("open", panelOpen);
    if (panelOpen) {
      updateLogout();
      panel.querySelectorAll(".pp-tab").forEach(tab => tab.classList.toggle("active", tab.dataset.tab === "pages"));
      if (!auth) renderAuth(); else renderPages();
      startLivePoll();
    } else { stopLivePoll(); }
  }
  function switchTab(t) { panel.querySelectorAll(".pp-tab").forEach(tab => tab.classList.toggle("active", tab.dataset.tab === t)); if (t === "pages") renderPages(); else renderFriends(); }
  function updateLogout() { if (panel) { const b = panel.querySelector('[data-action="logout"]'); if (b) b.style.display = auth ? "" : "none"; } }
  function updateBadge(count) {
    createWidget();
    let badge = fab.querySelector(".point-badge");
    if (count > 0) { if (!badge) { badge = document.createElement("div"); badge.className = "point-badge"; fab.appendChild(badge); } badge.textContent = count; }
    else if (badge) badge.remove();
  }

  function startLivePoll() { stopLivePoll(); livePollTimer = setInterval(() => { if (panelOpen && auth) { const t = panel.querySelector(".pp-tab.active")?.dataset.tab; if (t === "pages") renderPages(); else renderFriends(); } loadPageHighlights(); }, 4000); }
  function stopLivePoll() { if (livePollTimer) { clearInterval(livePollTimer); livePollTimer = null; } }

  function doLogout() { auth = null; friends = []; sendMsg({ type: "CLEAR_AUTH" }); updateBadge(0); updateLogout(); renderAuth(); }

  // ── Auth ─────────────────────────────────────────────────────────
  function renderAuth() {
    const body = document.getElementById("pp-body"); panel.querySelector(".pp-tabs").style.display = "none"; updateLogout();
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
      updateLogout(); loadFriends(); loadPageHighlights(); renderPages();
    } catch (e) { err.textContent = e.message; err.style.display = "block"; }
  }

  async function loadFriends() { try { friends = await apiCall("/friends"); } catch { friends = []; } }

  // ── Pages view (all conversations) ───────────────────────────────
  async function renderPages() {
    const body = document.getElementById("pp-body");
    try {
      const [pages, pending] = await Promise.all([
        apiCall("/highlights/pages").catch(() => []),
        apiCall("/friends/pending-count").catch(() => 0),
      ]);
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
              <div class="pp-thread-participants">${p.participants.map(x => "@" + escapeHtml(x)).join(", ")}</div>
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
          if (url === PAGE_URL) { togglePanel(); } // Close panel, highlights are on this page
          else window.open(url, "_blank");
        });
      });
    } catch { body.innerHTML = `<div class="pp-empty">Could not load pages.</div>`; }
  }

  // ── Friends view ─────────────────────────────────────────────────
  async function renderFriends() {
    const body = document.getElementById("pp-body"); await loadFriends();
    let pendingHtml = "", sentHtml = "";
    try {
      const [pending, sent] = await Promise.all([apiCall("/friends/pending"), apiCall("/friends/sent")]);
      if (pending.length > 0) pendingHtml = `<div class="pp-section-label">Requests</div>` + pending.map(r => `<div class="pp-friend-request"><div class="pp-fr-avatar" style="border-color:${r.color || "#78b450"}">${escapeHtml(r.fromUsername.charAt(0).toUpperCase())}</div><div class="pp-fr-name">${escapeHtml(r.fromUsername)}</div><button class="pp-accept-btn" data-rid="${r.id}">Accept</button><button class="pp-reject-btn" data-rid="${r.id}">&times;</button></div>`).join("");
      if (sent.length > 0) sentHtml = `<div class="pp-section-label">Waiting</div>` + sent.map(r => `<div class="pp-friend-waiting"><div class="pp-fr-avatar">${escapeHtml(r.toUsername.charAt(0).toUpperCase())}</div><div class="pp-fr-name">${escapeHtml(r.toUsername)}</div><div class="pp-waiting-label">pending</div></div>`).join("");
    } catch {}

    body.innerHTML = `
      <div class="pp-add-friend"><input type="text" id="pp-add-input" placeholder="Add friend by username..." /><button id="pp-add-btn">Send</button></div>
      ${pendingHtml}${sentHtml}
      ${friends.length > 0 ? `<div class="pp-section-label">Friends</div>` : ""}
      ${friends.length === 0 && !pendingHtml && !sentHtml ? `<div class="pp-empty">No friends yet.</div>` :
        friends.map(f => `<div class="pp-friend-row"><div class="pp-fr-avatar" style="background:${f.color || "#c8e6b4"}40;border-color:${f.color || "#c8e6b4"}">${escapeHtml(f.username.charAt(0).toUpperCase())}</div><div class="pp-fr-name">${escapeHtml(f.username)}</div><button class="pp-fr-remove" data-uid="${f.id}">&times;</button></div>`).join("")}
      ${auth ? `<div style="padding:18px 20px;font-size:13px;color:#bbb;text-align:center;font-family:-apple-system,sans-serif;">@${escapeHtml(auth.user.username)}</div>` : ""}`;

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
  sendMsg({ type: "GET_AUTH" }, (saved) => {
    if (saved?.token) {
      auth = saved;
      loadFriends();
      loadPageHighlights();
      // Poll for new highlights periodically
      setInterval(() => loadPageHighlights(), 10000);
    }
  });

  createWidget();
})();
