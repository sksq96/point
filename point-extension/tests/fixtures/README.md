# Point Extension Test Fixtures

Test helper utilities for Point extension screenshot and integration tests.

## Files

### `api-mocks.js`
Playwright API mock helpers that intercept HTTP requests to the Convex backend and return realistic mock responses.

**Exported function:**
```javascript
export async function setupApiMocks(page)
```

**Usage:**
```javascript
import { setupApiMocks } from './fixtures/api-mocks.js';

test('extension UI', async ({ page }) => {
  await setupApiMocks(page);
  await page.goto('https://example.com');
  // API calls are now mocked
});
```

**Mock endpoints covered:**
- `/auth/login` - Returns user object and session token
- `/auth/register` - Returns user object and session token
- `/highlights/page` - Returns 2 mock highlights for current page
- `/highlights/pages` - Returns 2-3 mock page/conversation rows
- `/highlights/create` - Returns newly created highlight
- `/highlights/remove` - Returns success
- `/comments/list` - Returns 2 mock comments for a highlight
- `/comments/add` - Returns newly added comment
- `/friends` - Returns 1 accepted friend
- `/friends/pending` - Returns 1 incoming friend request
- `/friends/sent` - Returns 1 outgoing friend request
- `/friends/pending-count` - Returns count of pending requests
- `/friends/accept`, `/reject`, `/request`, `/remove` - Return success
- `/points/send` - Returns success
- `/points/unread` - Returns 1 unread point
- `/points/read` - Returns success

### `seed-state.js`
Injects auth state and storage values to simulate a logged-in user without going through the login UI flow.

**Exported functions:**

```javascript
export async function seedAuthState(page, options)
export async function clearAuthState(page)
```

**seedAuthState usage:**
```javascript
import { seedAuthState } from './fixtures/seed-state.js';

test('logged-in user', async ({ page }) => {
  // Simulate logged-in state
  await seedAuthState(page);
  await page.goto('https://example.com');
  // Extension sees auth token in storage
});
```

**seedAuthState options:**
```javascript
await seedAuthState(page, {
  username: 'alice',           // default: 'testuser'
  color: '#e74c3c',            // default: '#4a7c6f'
  token: 'custom-token',       // default: 'mock-token-abc123xyz'
  apiBase: 'https://api.test', // default: Convex production
});
```

**clearAuthState usage:**
```javascript
import { clearAuthState } from './fixtures/seed-state.js';

test('logged-out user', async ({ page }) => {
  await clearAuthState(page);
  await page.goto('https://example.com');
  // Extension shows login UI
});
```

## Complete Test Example

```javascript
import { test } from '@playwright/test';
import { setupApiMocks } from './fixtures/api-mocks.js';
import { seedAuthState } from './fixtures/seed-state.js';

test('screenshot: logged-in with highlights', async ({ page }) => {
  // Setup API mocks before auth state
  await setupApiMocks(page);

  // Inject auth state
  await seedAuthState(page, {
    username: 'testuser',
    color: '#4a7c6f',
  });

  // Navigate to test page
  await page.goto('file://path/to/fixtures/page.html');

  // Wait for extension to initialize
  await page.waitForSelector('#point-fab', { timeout: 5000 });

  // Take screenshot
  await page.screenshot({ path: 'screenshots/logged-in.png' });
});
```

## Mock Data Structure

The mocks provide realistic test data:

**Current User:**
- `id`: 'user-123'
- `username`: 'testuser'
- `color`: '#4a7c6f'

**Highlights:** 2 sample highlights with:
- Realistic text snippets from test page
- Different authors (alice, bob)
- Different colors
- Timestamps (1-2 hours ago)

**Pages/Conversations:** 2-3 sample conversation rows with:
- Page titles and URLs
- Multiple participants
- Highlight counts
- Timestamps

**Friends:**
- 1 accepted friend (alice)
- 1 incoming request (david)
- 1 outgoing request (eve)

**Comments:** 2 sample comments with:
- Different authors and colors
- Realistic discussion content
- Recent timestamps

## Storage Keys Used

The extension stores auth state in Chrome's `chrome.storage.local`:
- `pointAuth` - User session object with `{ user, token }`
- `pointApiBase` - API endpoint URL

The `seedAuthState` function injects these values via `page.addInitScript`.

## Notes

- API mocks intercept all requests to `convex.site` URLs
- Mock responses match the real API shape from `content.js` parsing
- Timestamps use `Date.now()` for realistic "just now", "1h ago" displays
- The mock data includes a mix of accepted/pending friend states for testing
