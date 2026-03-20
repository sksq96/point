// Point — background service worker

chrome.action.onClicked.addListener((tab) => {
  if (tab?.id) {
    chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_WIDGET" }).catch(() => {});
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  try {
    if (message.type === "GET_HIGHLIGHTS") {
      chrome.storage.local.get(["highlights"], (result) => {
        const all = result.highlights || {};
        sendResponse(all[message.url] || []);
      });
      return true;
    }

    if (message.type === "SAVE_HIGHLIGHT") {
      const { url, highlight } = message;
      chrome.storage.local.get(["highlights"], (result) => {
        const all = result.highlights || {};
        if (!all[url]) all[url] = [];
        all[url].push(highlight);
        chrome.storage.local.set({ highlights: all }, () => sendResponse({ success: true }));
      });
      return true;
    }

    if (message.type === "DELETE_HIGHLIGHT") {
      const { url, id } = message;
      chrome.storage.local.get(["highlights"], (result) => {
        const all = result.highlights || {};
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
      chrome.storage.local.get(["highlights"], (result) => {
        const all = result.highlights || {};
        if (all[url]) {
          const h = all[url].find((h) => h.id === id);
          if (h) Object.assign(h, updates);
        }
        chrome.storage.local.set({ highlights: all }, () => sendResponse({ success: true }));
      });
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
