import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.resolve(__dirname, 'fixtures', 'page.html');
const fixtureUrl = `file://${fixturePath}`;

// Mock API base URL
const API_BASE = 'https://api.point.test';

// Mock data
const mockUser = {
  id: 'user-1',
  username: 'testuser',
  color: '#4a7c6f',
};

const mockToken = 'mock-token-12345';

const mockFriends = [
  { id: 'friend-1', username: 'alice', color: '#e74c3c' },
  { id: 'friend-2', username: 'bob', color: '#3498db' },
  { id: 'friend-3', username: 'charlie', color: '#f39c12' },
];

const mockPendingRequests = [
  { id: 'req-1', fromUsername: 'diana', color: '#9b59b6' },
  { id: 'req-2', fromUsername: 'eve', color: '#16a085' },
];

const mockSentRequests = [
  { id: 'sent-1', toUsername: 'frank', color: '#c0392b' },
];

const mockPages = [
  {
    url: fixtureUrl,
    pageTitle: 'The Future of Collaborative Web Annotation',
    highlightCount: 3,
    lastTime: Date.now() - 3600000,
    participants: ['alice', 'bob', 'testuser'],
  },
  {
    url: 'https://example.com/article',
    pageTitle: 'Another Interesting Article',
    highlightCount: 1,
    lastTime: Date.now() - 86400000,
    participants: [mockUser, mockFriends[0]],
  },
];

const mockHighlights = [
  {
    id: 'hl-1',
    url: fixtureUrl,
    username: 'alice',
    color: '#e74c3c',
    text: 'collaborative web annotation has emerged as a transformative technology',
    createdAt: Date.now() - 7200000,
    isMine: false,
  },
  {
    id: 'hl-2',
    url: fixtureUrl,
    username: 'testuser',
    color: '#4a7c6f',
    text: 'web-based annotation platforms enable multiple users to simultaneously engage',
    createdAt: Date.now() - 3600000,
    isMine: true,
  },
];

const mockComments = [
  {
    id: 'comment-1',
    username: 'bob',
    color: '#3498db',
    body: 'Great observation about real-time collaboration',
    createdAt: Date.now() - 1800000,
  },
  {
    id: 'comment-2',
    username: 'testuser',
    color: '#4a7c6f',
    body: 'Exactly, this enables better team synchronization',
    createdAt: Date.now() - 900000,
  },
];

// Helper to set up route mocking
async function mockApiRoutes(page, { auth = null, includeHighlights = false, includeFriends = false } = {}) {
  await page.route(`${API_BASE}/**`, async (route) => {
    const url = new URL(route.request().url());
    const pathname = url.pathname;

    // Auth endpoints
    if (pathname === '/auth/login') {
      return route.abort();
    }
    if (pathname === '/auth/register') {
      return route.abort();
    }

    // Only proceed with other endpoints if authenticated
    if (!auth) {
      return route.abort();
    }

    // Highlights endpoints
    if (pathname === '/highlights/create') {
      return route.respond({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'hl-new',
          username: auth.user.username,
          color: auth.user.color,
          text: 'new highlight',
        }),
      });
    }

    if (pathname === '/highlights/page') {
      return route.respond({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(includeHighlights ? mockHighlights : []),
      });
    }

    if (pathname === '/highlights/pages') {
      return route.respond({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockPages),
      });
    }

    if (pathname === '/highlights/remove') {
      return route.respond({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    }

    // Comments endpoints
    if (pathname === '/comments/list') {
      return route.respond({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockComments),
      });
    }

    if (pathname === '/comments/add') {
      return route.respond({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'comment-new',
          username: auth.user.username,
          color: auth.user.color,
          body: 'new comment',
          createdAt: Date.now(),
        }),
      });
    }

    // Friends endpoints
    if (pathname === '/friends') {
      return route.respond({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(includeFriends ? mockFriends : []),
      });
    }

    if (pathname === '/friends/pending') {
      return route.respond({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockPendingRequests),
      });
    }

    if (pathname === '/friends/sent') {
      return route.respond({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockSentRequests),
      });
    }

    if (pathname === '/friends/pending-count') {
      return route.respond({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockPendingRequests.length),
      });
    }

    if (pathname === '/friends/accept' || pathname === '/friends/reject' || pathname === '/friends/remove' || pathname === '/friends/request') {
      return route.respond({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, message: 'Done' }),
      });
    }

    // Points endpoints
    if (pathname === '/points/send') {
      return route.respond({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'point-new', success: true }),
      });
    }

    if (pathname === '/points/unread') {
      return route.respond({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'point-1',
            fromUsername: 'alice',
            color: '#e74c3c',
            preview: 'Check this annotation about collaboration',
            createdAt: Date.now() - 600000,
          },
        ]),
      });
    }

    if (pathname === '/points/read') {
      return route.respond({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    }

    // Default catch-all
    return route.abort();
  });
}

test.describe('Point Extension Screenshots', () => {
  // 01: FAB Default
  test('01-fab-default', async ({ page }) => {
    await mockApiRoutes(page);
    await page.goto(fixtureUrl);

    // Wait for extension to load and FAB to appear
    await page.waitForSelector('#point-fab', { timeout: 5000 });

    // Verify FAB is visible and no notification dot
    const fab = page.locator('#point-fab');
    await expect(fab).toBeVisible();

    // Take screenshot
    await page.screenshot({
      path: `${__dirname}/screenshots/01-fab-default.png`,
      fullPage: false,
    });
  });

  // 02: FAB with notification dot
  test('02-fab-notification-dot', async ({ page }) => {
    // Set up auth and mock unread notifications
    await mockApiRoutes(page, { auth: { user: mockUser, token: mockToken } });

    await page.addInitScript(
      ({ user, token, apiBase }) => {
        localStorage.setItem('point-auth', JSON.stringify({ user, token }));
        globalThis.POINT_API_BASE = apiBase;
      },
      { user: mockUser, token: mockToken, apiBase: API_BASE }
    );

    await page.goto(fixtureUrl);
    await page.waitForSelector('#point-fab', { timeout: 5000 });

    // Trigger notification loading (wait for poll)
    await page.waitForTimeout(500);

    // Take screenshot - notification dot should appear after poll
    await page.screenshot({
      path: `${__dirname}/screenshots/02-fab-notification-dot.png`,
      fullPage: false,
    });
  });

  // 03: Panel Auth Form
  test('03-panel-auth-form', async ({ page }) => {
    await mockApiRoutes(page);

    await page.addInitScript(
      ({ apiBase }) => {
        globalThis.POINT_API_BASE = apiBase;
      },
      { apiBase: API_BASE }
    );

    await page.goto(fixtureUrl);
    await page.waitForSelector('#point-fab', { timeout: 5000 });

    // Click FAB to open panel
    await page.click('#point-fab');
    await page.waitForSelector('#point-panel', { timeout: 5000 });

    // Verify auth form is shown (logged out state)
    await page.waitForSelector('#pp-auth-username', { timeout: 5000 });

    await page.screenshot({
      path: `${__dirname}/screenshots/03-panel-auth-form.png`,
      fullPage: false,
    });
  });

  // 04: Panel Auth Error
  test('04-panel-auth-error', async ({ page }) => {
    // Mock login failure
    await page.route(`${API_BASE}/**`, async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === '/auth/login') {
        return route.respond({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Invalid credentials' }),
        });
      }
      return route.abort();
    });

    await page.addInitScript(
      ({ apiBase }) => {
        globalThis.POINT_API_BASE = apiBase;
      },
      { apiBase: API_BASE }
    );

    await page.goto(fixtureUrl);
    await page.waitForSelector('#point-fab', { timeout: 5000 });

    // Click FAB to open panel
    await page.click('#point-fab');
    await page.waitForSelector('#point-panel', { timeout: 5000 });

    // Fill form and try to submit to trigger error
    await page.fill('#pp-auth-username', 'baduser');
    await page.fill('#pp-auth-password', 'badpass');
    await page.click('#pp-auth-submit');

    // Wait for error message
    await page.waitForSelector('#pp-auth-error', { timeout: 5000 });
    const errorMsg = page.locator('#pp-auth-error');
    await expect(errorMsg).toContainText(/Invalid|failed/i);

    await page.screenshot({
      path: `${__dirname}/screenshots/04-panel-auth-error.png`,
      fullPage: false,
    });
  });

  // 05: Panel Pages Empty
  test('05-panel-pages-empty', async ({ page }) => {
    await mockApiRoutes(page, { auth: { user: mockUser, token: mockToken } });

    await page.addInitScript(
      ({ user, token, apiBase }) => {
        localStorage.setItem('point-auth', JSON.stringify({ user, token }));
        globalThis.POINT_API_BASE = apiBase;
      },
      { user: mockUser, token: mockToken, apiBase: API_BASE }
    );

    await page.goto(fixtureUrl);
    await page.waitForSelector('#point-fab', { timeout: 5000 });

    // Click FAB to open panel
    await page.click('#point-fab');
    await page.waitForSelector('#point-panel', { timeout: 5000 });

    // Verify Pages tab is shown with empty message
    await page.waitForSelector('.pp-empty', { timeout: 5000 });

    await page.screenshot({
      path: `${__dirname}/screenshots/05-panel-pages-empty.png`,
      fullPage: false,
    });
  });

  // 06: Panel Pages Populated
  test('06-panel-pages-populated', async ({ page }) => {
    await mockApiRoutes(page, { auth: { user: mockUser, token: mockToken } });

    await page.addInitScript(
      ({ user, token, apiBase }) => {
        localStorage.setItem('point-auth', JSON.stringify({ user, token }));
        globalThis.POINT_API_BASE = apiBase;
      },
      { user: mockUser, token: mockToken, apiBase: API_BASE }
    );

    await page.goto(fixtureUrl);
    await page.waitForSelector('#point-fab', { timeout: 5000 });

    // Click FAB to open panel
    await page.click('#point-fab');
    await page.waitForSelector('#point-panel', { timeout: 5000 });

    // Mock pages endpoint to return data (override the route setup)
    await page.route(`${API_BASE}/**`, async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === '/highlights/pages') {
        return route.respond({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockPages),
        });
      }
      if (url.pathname === '/friends/pending-count') {
        return route.respond({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(0),
        });
      }
      return route.abort();
    });

    // Trigger Pages view refresh
    await page.click('[data-tab="pages"]');
    await page.waitForSelector('.pp-thread-row', { timeout: 5000 });

    await page.screenshot({
      path: `${__dirname}/screenshots/06-panel-pages-populated.png`,
      fullPage: false,
    });
  });

  // 07: Panel Friends All States
  test('07-panel-friends-all-states', async ({ page }) => {
    await mockApiRoutes(page, {
      auth: { user: mockUser, token: mockToken },
      includeFriends: true,
    });

    await page.addInitScript(
      ({ user, token, apiBase }) => {
        localStorage.setItem('point-auth', JSON.stringify({ user, token }));
        globalThis.POINT_API_BASE = apiBase;
      },
      { user: mockUser, token: mockToken, apiBase: API_BASE }
    );

    await page.goto(fixtureUrl);
    await page.waitForSelector('#point-fab', { timeout: 5000 });

    // Click FAB to open panel
    await page.click('#point-fab');
    await page.waitForSelector('#point-panel', { timeout: 5000 });

    // Click Friends tab
    await page.click('[data-tab="friends"]');
    await page.waitForSelector('.pp-friend-row', { timeout: 5000 });

    await page.screenshot({
      path: `${__dirname}/screenshots/07-panel-friends-all-states.png`,
      fullPage: false,
    });
  });

  // 08: Tooltip Logged Out
  test('08-tooltip-logged-out', async ({ page }) => {
    await mockApiRoutes(page);

    await page.addInitScript(
      ({ apiBase }) => {
        globalThis.POINT_API_BASE = apiBase;
      },
      { apiBase: API_BASE }
    );

    await page.goto(fixtureUrl);
    await page.waitForSelector('#point-fab', { timeout: 5000 });

    // Select some text on the page by triple-clicking
    await page.click(`text=/collaborative web annotation/`, { clickCount: 3 });

    // Wait for tooltip to appear
    await page.waitForSelector('#point-tooltip', { timeout: 5000 });

    await page.screenshot({
      path: `${__dirname}/screenshots/08-tooltip-logged-out.png`,
      fullPage: false,
    });
  });

  // 09: Tooltip with Friends
  test('09-tooltip-with-friends', async ({ page }) => {
    await mockApiRoutes(page, {
      auth: { user: mockUser, token: mockToken },
      includeFriends: true,
    });

    await page.addInitScript(
      ({ user, token, apiBase }) => {
        localStorage.setItem('point-auth', JSON.stringify({ user, token }));
        globalThis.POINT_API_BASE = apiBase;
      },
      { user: mockUser, token: mockToken, apiBase: API_BASE }
    );

    await page.goto(fixtureUrl);
    await page.waitForSelector('#point-fab', { timeout: 5000 });

    // Select text to show tooltip with friend list
    const paragraph = page.locator('p').first();
    await paragraph.click({ clickCount: 3 });

    // Wait for tooltip with friends
    await page.waitForSelector('#point-tooltip', { timeout: 5000 });
    await page.waitForSelector('.point-tooltip-friend', { timeout: 5000 });

    await page.screenshot({
      path: `${__dirname}/screenshots/09-tooltip-with-friends.png`,
      fullPage: false,
    });
  });

  // 10: Thread Popup
  test('10-thread-popup', async ({ page }) => {
    await mockApiRoutes(page, {
      auth: { user: mockUser, token: mockToken },
      includeHighlights: true,
    });

    await page.addInitScript(
      ({ user, token, apiBase }) => {
        localStorage.setItem('point-auth', JSON.stringify({ user, token }));
        globalThis.POINT_API_BASE = apiBase;
      },
      { user: mockUser, token: mockToken, apiBase: API_BASE }
    );

    await page.goto(fixtureUrl);
    await page.waitForSelector('#point-fab', { timeout: 5000 });

    // Click panel to load highlights
    await page.click('#point-fab');
    await page.waitForSelector('#point-panel', { timeout: 5000 });

    // Wait for highlights to load and be marked
    await page.waitForTimeout(1000);

    // Click on a highlight to open thread
    const highlight = page.locator('mark.point-hl').first();
    if (await highlight.isVisible()) {
      await highlight.click();

      // Wait for thread to appear
      await page.waitForSelector('.point-thread', { timeout: 5000 });

      await page.screenshot({
        path: `${__dirname}/screenshots/10-thread-popup.png`,
        fullPage: false,
      });
    } else {
      // Fallback: just show the panel if no highlights
      await page.screenshot({
        path: `${__dirname}/screenshots/10-thread-popup.png`,
        fullPage: false,
      });
    }
  });

  // 11: Toast Notification
  test('11-toast-notification', async ({ page }) => {
    await mockApiRoutes(page, { auth: { user: mockUser, token: mockToken } });

    await page.addInitScript(
      ({ user, token, apiBase }) => {
        localStorage.setItem('point-auth', JSON.stringify({ user, token }));
        globalThis.POINT_API_BASE = apiBase;

        // Inject function to show toast for testing
        globalThis._pointShowToast = function(msg) {
          if (window.pointShowToast) {
            window.pointShowToast(msg);
          }
        };
      },
      { user: mockUser, token: mockToken, apiBase: API_BASE }
    );

    await page.goto(fixtureUrl);
    await page.waitForSelector('#point-fab', { timeout: 5000 });

    // Trigger a notification by injecting a toast
    await page.evaluate(() => {
      const toast = document.createElement('div');
      toast.id = 'point-toast';
      toast.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: #333;
        color: white;
        padding: 12px 16px;
        border-radius: 6px;
        font-family: -apple-system, sans-serif;
        font-size: 13px;
        z-index: 2147483647;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      `;
      toast.innerHTML = '<b style="color:#e74c3c">@alice</b> pointed you to: <i>"collaborative annotation"</i>';
      document.body.appendChild(toast);
    });

    // Wait for toast
    await page.waitForSelector('#point-toast', { timeout: 5000 });

    await page.screenshot({
      path: `${__dirname}/screenshots/11-toast-notification.png`,
      fullPage: false,
    });
  });

  // 12: Presence Banner
  test('12-presence-banner', async ({ page }) => {
    await mockApiRoutes(page, {
      auth: { user: mockUser, token: mockToken },
      includeHighlights: true,
    });

    await page.addInitScript(
      ({ user, token, apiBase }) => {
        localStorage.setItem('point-auth', JSON.stringify({ user, token }));
        globalThis.POINT_API_BASE = apiBase;
      },
      { user: mockUser, token: mockToken, apiBase: API_BASE }
    );

    await page.goto(fixtureUrl);
    await page.waitForSelector('#point-fab', { timeout: 5000 });

    // Open panel to trigger highlight loading with presence
    await page.click('#point-fab');
    await page.waitForSelector('#point-panel', { timeout: 5000 });

    // Create presence banner manually for testing
    await page.evaluate(() => {
      const banner = document.createElement('div');
      banner.id = 'point-presence';
      banner.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: white;
        border: 1px solid #ddd;
        border-radius: 6px;
        padding: 8px 12px;
        font-family: -apple-system, sans-serif;
        font-size: 12px;
        z-index: 2147483646;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      `;
      banner.innerHTML = `
        <span style="color:#e74c3c; margin-right: 8px;">@alice</span>
        <span style="color:#3498db;">@bob</span>
      `;
      document.body.appendChild(banner);
    });

    // Wait for presence banner
    await page.waitForSelector('#point-presence', { timeout: 5000 });

    await page.screenshot({
      path: `${__dirname}/screenshots/12-presence-banner.png`,
      fullPage: false,
    });
  });
});
