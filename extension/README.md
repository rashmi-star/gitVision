# GitVision Browser Extension

Adds a **"Deploy with GitVision"** button to GitHub repo pages. When clicked, opens GitVision Studio with that repo pre-loaded for analysis and deployment.

## Install (Chrome / Edge)

1. Go to `chrome://extensions` (or `edge://extensions`)
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `extension` folder

## Usage

1. Open any GitHub repo (e.g. `https://github.com/anirxdh/Treeline`)
2. Click **Deploy with GitVision** in the repo header
3. GitVision Studio opens in a new tab and automatically analyzes and deploys that repo

## Configure App URL

By default the extension opens `https://git-vision.vercel.app`. To use your own deployment:

1. Open DevTools → Application → Storage → Local Storage
2. Or add an options page (future enhancement)

For now, edit `content.js` and change `DEFAULT_APP_URL` to your Vercel URL.
