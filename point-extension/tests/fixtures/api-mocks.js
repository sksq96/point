/**
 * API mocks for Point extension screenshot tests
 * Intercepts and responds to all API calls the extension makes
 */

const MOCK_DATA = {
  currentUser: {
    id: 'user-123',
    username: 'testuser',
    color: '#4a7c6f',
  },
  sessionToken: 'mock-token-abc123xyz',
  highlights: [
    {
      id: 'hl-1',
      username: 'alice',
      color: '#e74c3c',
      text: 'collaborative web annotation has emerged as a transformative technology',
      createdAt: Date.now() - 3600000, // 1 hour ago
      isMine: false,
    },
    {
      id: 'hl-2',
      username: 'bob',
      color: '#3498db',
      text: 'enables multiple users to simultaneously engage with the same content',
      createdAt: Date.now() - 7200000, // 2 hours ago
      isMine: false,
    },
  ],
  pages: [
    {
      url: 'https://example.com/article',
      pageTitle: 'The Future of Collaborative Web Annotation',
      highlightCount: 2,
      participants: [
        { username: 'alice', color: '#e74c3c' },
        { username: 'bob', color: '#3498db' },
      ],
      lastTime: Date.now() - 1800000, // 30 minutes ago
    },
    {
      url: 'https://example.com/guide',
      pageTitle: 'Getting Started with Annotations',
      highlightCount: 1,
      participants: [
        { username: 'charlie', color: '#2ecc71' },
      ],
      lastTime: Date.now() - 86400000, // 1 day ago
    },
  ],
  comments: [
    {
      id: 'cmt-1',
      username: 'alice',
      color: '#e74c3c',
      body: 'Great point! This aligns with our research findings.',
      createdAt: Date.now() - 1800000, // 30 minutes ago
    },
    {
      id: 'cmt-2',
      username: 'bob',
      color: '#3498db',
      body: 'Agree. The transparency aspect is especially important for our workflow.',
      createdAt: Date.now() - 900000, // 15 minutes ago
    },
  ],
  friends: [
    {
      id: 'friend-1',
      username: 'alice',
      color: '#e74c3c',
    },
  ],
  friendRequests: {
    pending: [
      {
        id: 'req-1',
        fromUsername: 'david',
        color: '#f39c12',
      },
    ],
    sent: [
      {
        id: 'req-2',
        toUsername: 'eve',
        color: '#9b59b6',
      },
    ],
  },
  unreadPoints: [
    {
      id: 'pt-1',
      fromUsername: 'alice',
      color: '#e74c3c',
      text: 'collaborative approach to knowledge management',
    },
  ],
};

/**
 * Setup API mocks for a Playwright page
 * Intercepts all API calls and returns mock responses
 *
 * @param {import('@playwright/test').Page} page - The Playwright page object
 * @returns {Promise<void>}
 */
export async function setupApiMocks(page) {
  // Intercept all API requests to the Convex endpoint
  await page.route('**/convex.site/**', async (route) => {
    const request = route.request();
    const url = request.url();
    const method = request.method();
    const body = request.postDataJSON?.() || {};

    // Extract the path from the URL
    const pathMatch = url.match(/convex\.site([^?]*)/);
    const path = pathMatch ? pathMatch[1] : '';

    // Route to appropriate mock handler
    try {
      if (path.includes('/auth/login')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            user: MOCK_DATA.currentUser,
            token: MOCK_DATA.sessionToken,
          }),
        });
      }

      if (path.includes('/auth/register')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            user: MOCK_DATA.currentUser,
            token: MOCK_DATA.sessionToken,
          }),
        });
      }

      if (path.includes('/highlights/page')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(MOCK_DATA.highlights),
        });
      }

      if (path.includes('/highlights/pages')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(MOCK_DATA.pages),
        });
      }

      if (path.includes('/highlights/create')) {
        const newHighlight = {
          id: `hl-${Date.now()}`,
          username: MOCK_DATA.currentUser.username,
          color: MOCK_DATA.currentUser.color,
          text: body.text || 'Mock highlight',
          createdAt: Date.now(),
          isMine: true,
        };
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(newHighlight),
        });
      }

      if (path.includes('/highlights/remove')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true }),
        });
      }

      if (path.includes('/comments/list')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(MOCK_DATA.comments),
        });
      }

      if (path.includes('/comments/add')) {
        const newComment = {
          id: `cmt-${Date.now()}`,
          username: MOCK_DATA.currentUser.username,
          color: MOCK_DATA.currentUser.color,
          body: body.body || 'Mock comment',
          createdAt: Date.now(),
        };
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(newComment),
        });
      }

      if (path.includes('/friends') && method === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(MOCK_DATA.friends),
        });
      }

      if (path.includes('/friends/pending')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(MOCK_DATA.friendRequests.pending),
        });
      }

      if (path.includes('/friends/sent')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(MOCK_DATA.friendRequests.sent),
        });
      }

      if (path.includes('/friends/pending-count')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(MOCK_DATA.friendRequests.pending.length),
        });
      }

      if (path.includes('/friends/accept')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true }),
        });
      }

      if (path.includes('/friends/reject')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true }),
        });
      }

      if (path.includes('/friends/request')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Friend request sent!' }),
        });
      }

      if (path.includes('/friends/remove')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true }),
        });
      }

      if (path.includes('/points/send')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true }),
        });
      }

      if (path.includes('/points/unread')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(MOCK_DATA.unreadPoints),
        });
      }

      if (path.includes('/points/read')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true }),
        });
      }

      // Default fallback for any unhandled API calls
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    } catch (error) {
      console.error('Mock API error:', error);
      return route.abort('failed');
    }
  });
}

export default setupApiMocks;
