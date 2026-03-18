const DEFAULT_APP_URL = "https://git-vision-pi.vercel.app";

chrome.action.onClicked.addListener(() => {
  chrome.storage.local.get(["gitvision_app_url"], (data) => {
    const url = data.gitvision_app_url || DEFAULT_APP_URL;
    chrome.tabs.create({ url });
  });
});

async function parseJsonResponse(res) {
  const text = await res.text();
  if (!text || !text.trim()) {
    return { error: `Empty response (${res.status} ${res.statusText})` };
  }
  try {
    return JSON.parse(text);
  } catch (_) {
    const preview = text.length > 120 ? text.slice(0, 120) + "…" : text;
    return { error: `Invalid server response (${res.status}): ${preview.replace(/\s+/g, " ")}` };
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "GITVISION_DEPLOY") {
    const { apiUrl, repositoryUrl, deployToVercel = true } = msg;
    fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repositoryUrl, deployToVercel }),
    })
      .then(async (res) => {
        const data = await parseJsonResponse(res);
        return { ok: res.ok, data };
      })
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ ok: false, data: { error: err.message || "Failed to fetch" } }));
    return true;
  }
  if (msg.type === "GITVISION_RELATED_REPOS") {
    const { appUrl, repositoryUrl } = msg;
    const base = (appUrl || "").replace(/\/$/, "");
    fetch(`${base}/api/related-repos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repositoryUrl }),
    })
      .then(async (res) => {
        const data = await parseJsonResponse(res);
        return { ok: res.ok, data };
      })
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ ok: false, data: { error: err.message || "Failed to fetch" } }));
    return true;
  }
});
