# Chrome Web Store — Point submission checklist

Use this list when preparing a production submission. Requirements change; verify the latest fields in [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole) and [Chrome Web Store developer documentation](https://developer.chrome.com/docs/webstore/).

## Account and listing

- **Developer account**: One-time registration fee (if not already paid).
- **Listing details**: Name, short description (132 characters or fewer), detailed description, category, language, regions.
- **Privacy policy URL**: Must be publicly reachable HTTPS. Host the completed policy from `docs/PRIVACY_POLICY.md` (with placeholders replaced) on your site or GitHub Pages and paste the URL into the listing.

## Privacy and data

- **Privacy practices questionnaire**: Answer accurately for data the extension and backend collect (see `docs/PRIVACY_POLICY.md`). Declare authentication, user-generated content (highlights, comments), social features (friends), and notifications.
- **Single purpose**: The extension has one clear purpose: collaborative highlighting and sharing selections with friends on web pages. Keep the listing text aligned with that.

## Permissions (justify in the listing or review notes)

- **`storage`**: Persist session and optional settings (e.g. API base override) in `chrome.storage.local`.
- **`activeTab`**: Interact with the tab when the user invokes the extension action (e.g. toggle widget).

`content_scripts.matches` in `manifest.json` is **`["<all_urls>"]`** (not a permission key, but reviewers care). **Draft justification (2–3 sentences you can paste):**  
Point injects its UI only to let users select text, render highlights, and open comment threads on the pages they visit. Matching all URLs is required because highlights and comments are tied to arbitrary sites; the extension does not collect browsing history for its own sake and only processes page content in service of on-page collaboration initiated by the user.

## Icons and promotional images

Provide icons as in `manifest.json` (16, 48, 128). For the store listing, prepare assets per current dashboard specs (sizes and aspect ratios are updated periodically). Typical needs include **screenshots** (e.g. 1280×800 or 1400×560 for many listings—confirm in the upload UI), and optional **small promo tile**, **marquee**, and **large promo** images if you use featured placement. Use clear screenshots that show the highlight UI, panel, and friend flow without sensitive user data. Capture store-sized PNGs manually in Chrome (e.g. 1280×800) with the unpacked extension; optional **`npm run setup:demo-friends`** can create demo accounts for a realistic friends + thread setup (see root `README.md`).

## Version and package

- **Version**: Bump `"version"` in `point-extension/manifest.json` for each submission (semantic versioning is conventional: `MAJOR.MINOR.PATCH`).
- **Zip the extension**: Create a zip whose **root contains** `manifest.json` (zip the *contents* of `point-extension/`, not a parent folder named `point-extension`, unless you intend the extra directory level—Chrome expects `manifest.json` at the top level of the archive).
- **Testing**: Test the exact zipped build in a clean Chrome profile before upload.

## Review expectations

- Be ready to explain login/sign-up, what is stored on your backend (Convex), and that users can log out (clears stored session in the extension).
