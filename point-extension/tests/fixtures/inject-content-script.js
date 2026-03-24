/**
 * Inject the extension's content.js directly into the page for testing
 * This is needed because Playwright doesn't properly load extension content scripts
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Inject content.js and api-config.js into the page
 * Call this before page.goto() to ensure it runs
 *
 * @param {import('@playwright/test').Page} page - The Playwright page object
 * @returns {Promise<void>}
 */
export async function injectContentScript(page) {
  // Read the script files
  const apiConfigPath = path.resolve(__dirname, '..', '..', 'api-config.js');
  const contentPath = path.resolve(__dirname, '..', '..', 'content.js');

  const apiConfig = fs.readFileSync(apiConfigPath, 'utf-8');
  const content = fs.readFileSync(contentPath, 'utf-8');

  // Inject api-config first
  await page.addInitScript(apiConfig);

  // Wrap content.js in a DOMContentLoaded handler to ensure DOM is ready
  // addInitScript runs early, before the DOM is fully populated
  await page.addInitScript(`
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function() {
        ${content}
      });
    } else {
      // DOM is already loaded
      ${content}
    }
  `);
}

export default injectContentScript;
