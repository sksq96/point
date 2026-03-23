// Point — background service worker

const DEFAULT_API_BASE = "https://hidden-warbler-881.convex.site";

function isValidHttpUrl(s) {
  return typeof s === "string" && (s.startsWith("http://") || s.startsWith("https://"));
}

function getHighlightsMap(callback) {
  chrome.storage.local.get(["highlights"], (result) => {
    callback(result.highlights || {});
  });
}

chrome.action.onClicked.addListener((tab) => {
  if (tab?.id) {
    chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_WIDGET" }).catch(() => {});
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  try {
    if (message.type === "GET_HIGHLIGHTS") {
      getHighlightsMap((all) => {
        sendResponse(all[message.url] || []);
      });
      return true;
    }

    if (message.type === "SAVE_HIGHLIGHT") {
      const { url, highlight } = message;
      getHighlightsMap((all) => {
        if (!all[url]) all[url] = [];
        all[url].push(highlight);
        chrome.storage.local.set({ highlights: all }, () => sendResponse({ success: true }));
      });
      return true;
    }

    if (message.type === "DELETE_HIGHLIGHT") {
      const { url, id } = message;
      getHighlightsMap((all) => {
        if (all[url]) {
          all[url] = all[url].filter((h) => h.id !== id);
          if (all[url].length === 0) delete all[url];
        }
        chrome.storage.local.set({ highlights: all }, () => sendResponse({ success: true }));
      });
      return true;
    }

    if (message.type === "UPDATE_HIGHLIGHT") {
      const { url, id, updates } = message;
      getHighlightsMap((all) => {
        if (all[url]) {
          const h = all[url].find((h) => h.id === id);
          if (h) Object.assign(h, updates);
        }
        chrome.storage.local.set({ highlights: all }, () => sendResponse({ success: true }));
      });
      return true;
    }

    if (message.type === "GET_API_BASE") {
      chrome.storage.local.get(["pointApiBase"], (result) => {
        const stored = result.pointApiBase;
        const t = typeof stored === "string" ? stored.trim() : "";
        const url = isValidHttpUrl(t) ? t.replace(/\/+$/, "") : DEFAULT_API_BASE;
        sendResponse({ url });
      });
      return true;
    }

    if (message.type === "SET_API_BASE") {
      const raw = message.url;
      const t = typeof raw === "string" ? raw.trim() : "";
      if (!isValidHttpUrl(t)) {
        sendResponse({ success: false, error: "invalid url" });
        return true;
      }
      const url = t.replace(/\/+$/, "");
      chrome.storage.local.set({ pointApiBase: url }, () => sendResponse({ success: true, url }));
      return true;
    }

    if (message.type === "GET_AUTH") {
      chrome.storage.local.get(["pointAuth"], (result) => {
        sendResponse(result.pointAuth || null);
      });
      return true;
    }

    if (message.type === "SET_AUTH") {
      chrome.storage.local.set({ pointAuth: message.auth }, () => sendResponse({ success: true }));
      return true;
    }

    if (message.type === "CLEAR_AUTH") {
      chrome.storage.local.remove("pointAuth", () => sendResponse({ success: true }));
      return true;
    }
  } catch (e) {
    console.warn("Point background error:", e);
  }
});
