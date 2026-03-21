# GitVision Browser Extension

Adds **GitVision** to **GitHub** repository pages: a floating action button (bottom-left) opens a menu for **Preview & deploy**, **Flowchart**, **Summary**, **Related repos**, and keyboard shortcuts.

## Install (Chrome / Edge)

1. Open `chrome://extensions` or `edge://extensions`
2. Turn on **Developer mode**
3. **Load unpacked** → select this **`extension`** folder (the one containing `manifest.json`)

## Usage

1. Open any public GitHub repo, e.g. `https://github.com/owner/repo`
2. Click the **floating button** (GitVision icon, bottom-left)
3. Choose an action:
   - **Preview** — runs analyze/deploy; shows a **bottom-right toast** with loading, then **Vercel preview link**
   - **Flowchart** — opens modal with Mermaid architecture diagram
   - **Summary** — project summary modal (transparent overlay)
   - **Related** — related repositories

### Keyboard shortcuts (on a repo page)

| Shortcut | Action |
|----------|--------|
| **Ctrl+G** (Cmd+G on Mac) | Summary |
| **Ctrl+R** | Related repos |
| **Ctrl+P** | Preview / deploy (toast) |
| **Ctrl+F** | Flowchart |

## Configure app URL

Default: `https://git-vision-pi.vercel.app` in `content.js` (`DEFAULT_APP_URL`).

To use your own deployment, either:

- Change `DEFAULT_APP_URL` in `content.js`, or  
- Use `chrome.storage.local` key `gitvision_app_url` (set via a small snippet in DevTools or a future options page).

## Files

| File | Role |
|------|------|
| `manifest.json` | Permissions, content scripts, host permissions |
| `content.js` | UI injection, modals, menu, API calls via background |
| `content.css` | Extension styles |
| `background.js` | `fetch` to GitVision API (avoids CORS on github.com) |

## GitLab

This extension targets **github.com** today. For the **GitLab AI Hackathon**, automation is expected via a **GitLab Duo agent or flow** calling the same **`POST /api/analyze`** endpoint; see the root [README.md](../README.md).
