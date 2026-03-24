import { defineConfig } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionPath = path.resolve(__dirname, '..');

export default defineConfig({
  testDir: '.',
  timeout: 60000,
  use: {
    headless: false, // extensions require headed mode
    viewport: { width: 1280, height: 800 },
  },
  projects: [
    {
      name: 'chrome-extension',
      use: {
        channel: 'chrome',
        launchOptions: {
          args: [
            `--disable-extensions-except=${extensionPath}`,
            `--load-extension=${extensionPath}`,
          ],
        },
      },
    },
  ],
  reporter: [['list']],
});
