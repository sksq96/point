# Privacy Policy — Point (Chrome Extension)

**Last updated:** [DATE]

**Operator:** [YOUR COMPANY OR NAME] (“we”, “us”).  
**Contact:** [YOUR CONTACT EMAIL]

This policy describes how the **Point** browser extension (“Point”, “the extension”) and its associated online services handle information when you use Point. Point lets you highlight text on web pages, add comments, connect with friends, and receive notifications when others share content with you.

## Summary

Point works with a **backend service** hosted on **Convex** (a third-party cloud provider). When you use Point, we process account data, content you create (highlights and comments), friend relationships, and notification data as described below. The extension also stores a small amount of data **locally in your browser**.

## Information we collect and process

### Account and authentication

- **Username and password** are submitted when you sign in or create an account. Passwords are processed using industry-standard hashing on the server; we do not store plaintext passwords in a recoverable form in the live system described in our backend schema.
- **Session token** issued by the server after login is stored **locally** in the extension (`chrome.storage.local`, key `pointAuth`) so you stay signed in until you log out. Logging out removes that stored session from the browser.

### Content and activity on web pages

- **Highlights** include the **page URL**, **page title** (when available), the **selected text**, and **DOM location data** (XPath and offsets) so highlights can be shown in the correct place on the page.
- **Comments** are text you attach to a highlight; they are stored with your account on the backend and shown to users who can access that highlight per application rules.
- **“Points” (notifications)** may include **preview text**, **source URL**, **sender identity**, and related metadata so recipients see what was shared. Read/unread state is processed on the backend.

### Friends and social features

- We process **friend requests**, **accept/reject** actions, **friend lists**, and **identifiers** needed to connect accounts (e.g. usernames and internal user IDs).

### Optional local-only data in your browser

- **API base URL override**: If set, the custom backend base URL is stored under `pointApiBase` in `chrome.storage.local`.
- **UI preferences**: The extension may store **panel position** (and similar) in the page’s **`localStorage`** so the widget position persists on that site.
- **Legacy/local storage paths**: The extension’s service worker may support a **local highlights map** in `chrome.storage.local` for compatibility; the primary product flow syncs highlights through the server.

We do **not** sell your personal information. We use data to operate Point, provide collaboration features, and maintain security.

## Where data is stored

- **Convex (third-party processor):** User accounts, authentication tokens on the server, highlights, comments, friend relationships, and point/notification records are stored and processed in our Convex deployment. Convex’s own terms and security practices apply to their platform; see [Convex](https://www.convex.dev/) for their documentation.
- **Your device:** Session and settings in `chrome.storage.local`, and optional `localStorage` keys for UI layout, as described above.

## How we use information

- To authenticate you and keep your session.
- To store and display highlights and comments you create, and to show content shared with you.
- To operate friend requests, friend lists, and notifications.
- To troubleshoot, secure the service, and comply with law when required.

## Sharing

- We use **Convex** to host backend data and HTTP APIs; they process data on our behalf as a service provider.
- **Highlights and comments** are visible to other users according to how the product is designed (e.g. participants on a page or thread, friends you interact with—consistent with the app’s behavior).
- We may disclose information if required by law or to protect rights and safety.

## Data retention and deletion

Retention depends on how we operate the service. You may request deletion or export of personal data where applicable by contacting **[YOUR CONTACT EMAIL]**. Clearing extension data in Chrome or logging out affects **local** storage; server-side deletion may require a separate request or account tools if we provide them.

## Security

We use HTTPS for API traffic and protect passwords with hashing on the server. No method of transmission or storage is perfectly secure; use a strong, unique password and protect access to your device.

## Children

Point is not directed at children under 13 (or the minimum age in your jurisdiction). We do not knowingly collect personal information from children.

## International users

Data may be processed in the United States or other regions where Convex and our infrastructure operate. By using Point, you understand that your information may be transferred across borders.

## Changes

We may update this policy from time to time. We will post the updated policy with a new “Last updated” date and, where appropriate, notify you through the extension or listing.

## Contact

Questions about this policy or your data: **[YOUR CONTACT EMAIL]**.

---

*Replace bracketed placeholders and review with qualified counsel before publication.*
