# Point

Point is a Chrome extension for **collaborative text highlights on any webpage**: select text, save highlights tied to the page URL and DOM location, exchange threaded comments, send “points” to friends when you highlight something for them, and manage friends and notifications. The backend is a **Convex** HTTP deployment; the extension talks to it over HTTPS.

## Repository layout

| Path | Purpose |
|------|---------|
| `point-extension/` | Chrome extension (Manifest V3): `manifest.json`, `api-config.js`, `content.js`, `background.js`, assets. |
| `convex/` | Convex schema and HTTP actions (TypeScript). Used for typechecking and as the reference for server behavior; deployment is separate from this repo. |

## Development

From the repository root:

```bash
npm install
npm run typecheck
```

`npm run typecheck` runs the Convex project TypeScript compiler (`convex/tsconfig.json`).

Before you merge a branch locally, run **`npm run verify`** — it typechecks the Convex code and builds `dist/point-extension.zip` so you catch breakage without using GitHub Actions.

### Git hooks (pre-commit)

After **`npm install`**, [Husky](https://typicode.github.io/husky/) runs **`prepare`** and wires **`pre-commit`**. On each commit, the hook runs:

1. **[lint-staged](https://github.com/lint-staged/lint-staged)** — ESLint with `--fix` on staged `*.js` / `*.ts` / `*.mjs` / `*.cjs` files (see `eslint.config.mjs`).
2. **`npm run typecheck`** — Convex TypeScript project check.

To run the same checks by hand: **`npm run lint`** (whole tree) and **`npm run typecheck`**. Skip a hook once (not recommended): **`git commit --no-verify`**.

To build a **Chrome Web Store** zip from the repo root:

```bash
npm run package:extension
```

This writes `dist/point-extension.zip` with `manifest.json` at the archive root (see [docs/chrome-web-store.md](docs/chrome-web-store.md)).

**Chrome Web Store screenshots:** capture them manually (e.g. 1280×800) from Chrome with the unpacked extension — Friends tab, selection + “Point to” picker, open comment thread, etc. See **[docs/chrome-web-store.md](docs/chrome-web-store.md)** for listing asset notes.

**Demo accounts + friendship** (optional; uses the production API from `point-extension/api-config.js`):

```bash
npm run setup:demo-friends
```

Defaults: **`marko_margin`** and **`penny_point`**, password **`PointDemo2026`**. Override with **`POINT_DEMO_USER_A`**, **`POINT_DEMO_USER_B`**, **`POINT_DEMO_PASSWORD`**.

## Load the unpacked extension

1. Open Chrome and go to `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select the `point-extension/` directory (the folder that contains `manifest.json`).

## API base URL (production default and override)

The extension defaults to the production Convex HTTP URL in **`point-extension/api-config.js`**. You can override it without rebuilding by storing a custom base URL under the key **`pointApiBase`** in `chrome.storage.local`.

**Message flow (background service worker):**

- **`GET_API_BASE`**: Any context (e.g. the content script) sends this via `chrome.runtime.sendMessage`. The background script reads `pointApiBase` from `chrome.storage.local`. If the value is missing or not a valid `http://` or `https://` URL, the built-in default is used. Trailing slashes are stripped. The response is `{ url: "<resolved base>" }`.
- **`SET_API_BASE`**: Send `{ type: "SET_API_BASE", url: "<https://...>" }`. The background script validates the URL, normalizes it, writes `pointApiBase`, and responds with `{ success: true, url }` or `{ success: false, error: "invalid url" }`.

After changing the base URL, reload affected tabs or the extension so all parts pick up the new value.

## Chrome Web Store

See **[docs/chrome-web-store.md](docs/chrome-web-store.md)** for a submission checklist (privacy policy, permissions, screenshots, packaging). For Google’s own preparation and policy references, use the [Chrome Web Store developer documentation](https://developer.chrome.com/docs/webstore/).

Public-facing privacy text for hosting (e.g. GitHub Pages) is in **[docs/PRIVACY_POLICY.md](docs/PRIVACY_POLICY.md)**—replace placeholders before publishing.
