/**
 * Seed auth state for Point extension screenshot tests
 * Injects chrome.runtime mock to simulate extension messaging
 */

import { getChromeRuntimeMock } from './chrome-mock.js';

/**
 * Seed authentication state without going through the login flow
 * This injects chrome.runtime.sendMessage mock that the extension uses
 *
 * @param {import('@playwright/test').Page} page - The Playwright page object
 * @param {Object} options - Configuration options
 * @param {string} options.username - Username (default: 'testuser')
 * @param {string} options.color - User color hex code (default: '#4a7c6f')
 * @param {string} options.token - Session token (default: 'mock-token-abc123xyz')
 * @param {string} options.apiBase - API base URL (default: 'https://hidden-warbler-881.convex.site')
 * @returns {Promise<void>}
 */
export async function seedAuthState(page, options = {}) {
  const {
    username = 'testuser',
    color = '#4a7c6f',
    token = 'mock-token-abc123xyz',
    apiBase = 'https://hidden-warbler-881.convex.site',
  } = options;

  // Inject the chrome.runtime mock BEFORE navigating to the page
  // This ensures extension messaging works from the start
  const authState = {
    user: {
      id: 'user-123',
      username,
      color,
    },
    token,
  };

  const [setupFunc, args] = getChromeRuntimeMock(authState, apiBase);
  // args is already an object { authState, apiBase }
  await page.addInitScript(setupFunc, args);
}

/**
 * Clear authentication state
 * Clears all auth-related storage
 *
 * @param {import('@playwright/test').Page} page - The Playwright page object
 * @returns {Promise<void>}
 */
export async function clearAuthState(page) {
  // Inject a chrome mock with no auth state
  const [setupFunc, args] = getChromeRuntimeMock({}, '');
  await page.addInitScript(setupFunc, args);

  // Also clear localStorage as backup
  await page.addInitScript(() => {
    localStorage.removeItem('point-auth');
    localStorage.removeItem('point-api-base');
    localStorage.removeItem('point-pos-panel');
    Object.keys(localStorage)
      .filter((key) => key.startsWith('point-'))
      .forEach((key) => localStorage.removeItem(key));
  });
}

export default seedAuthState;
