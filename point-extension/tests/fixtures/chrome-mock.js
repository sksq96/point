/**
 * Chrome runtime mock for Point extension screenshot tests
 * Mocks chrome.runtime.sendMessage to handle message types without background script
 */

/**
 * Setup chrome.runtime mock in page context
 * Handles all message types that content.js sends to the background script
 *
 * This is called via page.addInitScript and has access to injected variables
 *
 * @param {Object} authState - Authentication state (injected by Playwright)
 * @param {Object} authState.user - User object with id, username, color
 * @param {string} authState.token - Session token
 * @param {string} apiBaseUrl - API base URL
 */
function setupChromeMock(authState, apiBaseUrl) {
  const user = authState?.user || { id: 'user-123', username: 'testuser', color: '#4a7c6f' };
  const token = authState?.token || 'mock-token-abc123xyz';

  // Only inject if chrome.runtime is not already properly defined
  if (!window.chrome || !window.chrome.runtime || !window.chrome.runtime.sendMessage) {
    window.chrome = window.chrome || {};
    window.chrome.runtime = window.chrome.runtime || {};

    window.chrome.runtime.sendMessage = function(msg, callback) {
      // Handle GET_AUTH message
      if (msg && msg.type === 'GET_AUTH') {
        setTimeout(() => {
          const response = {
            user: user,
            token: token
          };
          if (callback) callback(response);
        }, 0);
        return;
      }

      // Handle GET_API_BASE message
      if (msg && msg.type === 'GET_API_BASE') {
        setTimeout(() => {
          const response = {
            url: apiBaseUrl
          };
          if (callback) callback(response);
        }, 0);
        return;
      }

      // Handle SET_AUTH message (just acknowledge)
      if (msg && msg.type === 'SET_AUTH') {
        setTimeout(() => {
          if (callback) callback({ success: true });
        }, 0);
        return;
      }

      // Handle CLEAR_AUTH message (just acknowledge)
      if (msg && msg.type === 'CLEAR_AUTH') {
        setTimeout(() => {
          if (callback) callback({ success: true });
        }, 0);
        return;
      }

      // Fallback for unknown message types
      setTimeout(() => {
        if (callback) callback(null);
      }, 0);
    };

    // Mock chrome.runtime.onMessage if needed
    if (!window.chrome.runtime.onMessage) {
      window.chrome.runtime.onMessage = {
        addListener: function() {}
      };
    }

    // Mock lastError property
    if (!window.chrome.runtime.lastError) {
      Object.defineProperty(window.chrome.runtime, 'lastError', {
        get: function() { return null; },
        configurable: true
      });
    }
  }
}

/**
 * Get a function that sets up the chrome.runtime mock
 * Returns a tuple of [function, args] for use with page.addInitScript
 *
 * @param {Object} authState - Authentication state
 * @param {string} apiBase - API base URL
 * @returns {Array} [setupFunction, args] tuple
 */
export function getChromeRuntimeMock(authState = {}, apiBase = '') {
  return [setupChromeMock, [authState, apiBase]];
}

export default getChromeRuntimeMock;
