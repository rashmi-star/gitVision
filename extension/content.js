(function () {
  const GITVISION_URL_KEY = "gitvision_app_url";
  const DEFAULT_APP_URL = "https://git-vision-pi.vercel.app";

  function getRepoUrl() {
    const pathMatch = window.location.pathname.match(/^\/([^/]+)\/([^/]+)(?:\/|$)/);
    if (!pathMatch) return null;
    const [, owner, repo] = pathMatch;
    if (owner === "orgs" || owner === "settings" || owner === "new") return null;
    return `https://github.com/${owner}/${repo}`;
  }

  function getAppUrl() {
    return new Promise((resolve) => {
      if (typeof chrome !== "undefined" && chrome.storage?.local) {
        chrome.storage.local.get([GITVISION_URL_KEY], (data) => {
          resolve(data[GITVISION_URL_KEY] || DEFAULT_APP_URL);
        });
      } else {
        resolve(DEFAULT_APP_URL);
      }
    });
  }

  function createButton() {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "gitvision-deploy-btn gitvision-icon-btn";
    btn.title = "Preview URL (Ctrl+G)";
    btn.innerHTML = "🔗";
    return btn;
  }

  function createFlowchartButton(onClick) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "gitvision-flowchart-btn";
    btn.title = "View architecture flowchart";
    btn.innerHTML = "📊";
    btn.addEventListener("click", onClick);
    return btn;
  }

  function createVideoButton(onClick) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "gitvision-video-btn";
    btn.title = "Generate demo video";
    btn.innerHTML = "🎬";
    btn.addEventListener("click", onClick);
    return btn;
  }

  function showSpinner(wrapper) {
    wrapper.innerHTML = `
      <span class="gitvision-deploy-btn gitvision-deploy-btn-loading">
        <span class="gitvision-deploy-btn-icon"></span>
        <span class="gitvision-deploy-btn-text">Deploying...</span>
      </span>
    `;
  }

  function toBase64Url(input) {
    const bytes = new TextEncoder().encode(input);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    const base64 = btoa(binary);
    return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  const DEFAULT_FLOWCHART = "flowchart TD\n  A[Repository] --> B[Analyze]\n  B --> C[Deploy]\n  C --> D[Preview]";

  function showResult(wrapper, urlOrMsg, flowChartMermaid, isError, onRetry, cachedMermaid, onVideoClick) {
    const mermaid = (flowChartMermaid && flowChartMermaid.trim().length > 0) ? flowChartMermaid : (cachedMermaid || DEFAULT_FLOWCHART);
    const deployPart = isError
      ? `<span class="gitvision-deploy-btn gitvision-deploy-btn-error" title="${(urlOrMsg || "").replace(/</g, "&lt;").replace(/"/g, "&quot;")}">
          <span class="gitvision-deploy-btn-icon">!</span>
          <span class="gitvision-deploy-btn-text">${(urlOrMsg && urlOrMsg.length > 40 ? urlOrMsg.slice(0, 37) + "…" : urlOrMsg) || "Deploy failed"}</span>
        </span>`
      : `<a href="${urlOrMsg}" target="_blank" rel="noopener noreferrer" class="gitvision-deploy-btn gitvision-deploy-btn-card" title="${(urlOrMsg || "").replace(/"/g, "&quot;")}">
          <span class="gitvision-deploy-btn-icon">🔗</span>
          <span class="gitvision-deploy-btn-text">Open Preview</span>
        </a>`;
    wrapper.innerHTML = `
      ${deployPart}
      <button type="button" class="gitvision-flowchart-btn" title="View architecture flowchart">📊</button>
      <button type="button" class="gitvision-video-btn" title="Generate demo video">🎬</button>
      ${isError && onRetry ? `<button type="button" class="gitvision-retry-btn" title="Retry">↻</button>` : ""}
    `;
    wrapper.querySelector(".gitvision-flowchart-btn").addEventListener("click", () => showFlowchartModal(mermaid, false));
    wrapper.querySelector(".gitvision-video-btn").addEventListener("click", () => onVideoClick && onVideoClick());
    if (isError && onRetry) {
      wrapper.querySelector(".gitvision-retry-btn").addEventListener("click", onRetry);
    }
  }

  function showFlowchartModal(mermaidCode, isLoading) {
    const existing = document.getElementById("gitvision-flowchart-modal");
    if (existing) {
      existing.remove();
      if (!isLoading) return;
    }
    const modal = document.createElement("div");
    modal.id = "gitvision-flowchart-modal";
    modal.className = "gitvision-modal-overlay";
    const bodyContent = isLoading
      ? '<div class="gitvision-modal-loading">Loading flowchart...</div>'
      : `<img src="https://mermaid.ink/svg/${toBase64Url(mermaidCode)}" alt="Flowchart" class="gitvision-flowchart-img" />`;
    modal.innerHTML = `
      <div class="gitvision-modal gitvision-modal-flowchart">
        <div class="gitvision-modal-header">
          <span>Architecture Flowchart</span>
          <button type="button" class="gitvision-modal-close" title="Close">×</button>
        </div>
        <div class="gitvision-modal-body">${bodyContent}</div>
      </div>
    `;
    modal.querySelector(".gitvision-modal-close").addEventListener("click", () => modal.remove());
    modal.addEventListener("click", (e) => { if (e.target === modal) modal.remove(); });
    document.body.appendChild(modal);
  }

  function updateFlowchartModal(mermaidCode) {
    const body = document.querySelector("#gitvision-flowchart-modal .gitvision-modal-body");
    if (body) body.innerHTML = `<img src="https://mermaid.ink/svg/${toBase64Url(mermaidCode)}" alt="Flowchart" class="gitvision-flowchart-img" />`;
  }

  function showRelatedReposModal(appUrl, repoUrl) {
    const existing = document.getElementById("gitvision-related-modal");
    if (existing) {
      existing.remove();
      return;
    }
    const modal = document.createElement("div");
    modal.id = "gitvision-related-modal";
    modal.className = "gitvision-modal-overlay";
    modal.innerHTML = `
      <div class="gitvision-modal gitvision-modal-summary">
        <div class="gitvision-modal-header">
          <span>Related Repos (Ctrl+R)</span>
          <button type="button" class="gitvision-modal-close" title="Close">×</button>
        </div>
        <div class="gitvision-modal-body gitvision-modal-body-summary">
          <div class="gitvision-summary-loading">Loading related repos...</div>
        </div>
      </div>
    `;
    modal.querySelector(".gitvision-modal-close").addEventListener("click", () => modal.remove());
    modal.addEventListener("click", (e) => { if (e.target === modal) modal.remove(); });
    document.body.appendChild(modal);

    chrome.runtime.sendMessage({ type: "GITVISION_RELATED_REPOS", appUrl: appUrl.replace(/\/$/, ""), repositoryUrl: repoUrl })
      .then((res) => {
        const body = document.querySelector("#gitvision-related-modal .gitvision-modal-body-summary");
        if (!body) return;
        if (!res?.ok || !res?.data?.relatedRepos?.length) {
          body.innerHTML = `<p class="gitvision-modal-error">${(res?.data?.error || "No related repos found").replace(/</g, "&lt;")}</p>`;
          return;
        }
        const esc = (x) => String(x || "").replace(/</g, "&lt;").replace(/"/g, "&quot;");
        body.innerHTML = `
          <div class="gitvision-related-cards">
            ${res.data.relatedRepos.map((r) => `
              <a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer" class="gitvision-related-card">
                <span class="gitvision-related-card-name">${esc(r.fullName)}</span>
                ${r.description ? `<span class="gitvision-related-card-desc">${esc(r.description.slice(0, 80))}${r.description.length > 80 ? "…" : ""}</span>` : ""}
                <span class="gitvision-related-card-meta">
                  ${r.stars ? `<span class="gitvision-related-stars">★ ${r.stars}</span>` : ""}
                  ${r.language ? `<span class="gitvision-related-lang">${esc(r.language)}</span>` : ""}
                </span>
              </a>
            `).join("")}
          </div>
        `;
      })
      .catch((err) => {
        const body = document.querySelector("#gitvision-related-modal .gitvision-modal-body-summary");
        if (body) body.innerHTML = `<p class="gitvision-modal-error">${(err?.message || "Failed to load").replace(/</g, "&lt;")}</p>`;
      });
  }

  function showVideoModal(appUrl, repoUrl) {
    const existing = document.getElementById("gitvision-video-modal");
    if (existing) {
      existing.remove();
      return;
    }
    const videoUrl = `${appUrl.replace(/\/$/, "")}/studio/video?repo=${encodeURIComponent(repoUrl)}`;
    const modal = document.createElement("div");
    modal.id = "gitvision-video-modal";
    modal.className = "gitvision-modal-overlay";
    modal.innerHTML = `
      <div class="gitvision-modal gitvision-modal-video">
        <div class="gitvision-modal-header">
          <span>🎬 Demo Video</span>
          <button type="button" class="gitvision-modal-close" title="Close">×</button>
        </div>
        <div class="gitvision-modal-body gitvision-modal-body-video">
          <iframe src="${videoUrl}" class="gitvision-video-iframe" title="Demo video"></iframe>
        </div>
      </div>
    `;
    modal.querySelector(".gitvision-modal-close").addEventListener("click", () => modal.remove());
    modal.addEventListener("click", (e) => { if (e.target === modal) modal.remove(); });
    document.body.appendChild(modal);
  }


  function injectButton() {
    if (document.querySelector(".gitvision-deploy-wrapper")) return;

    const repoUrl = getRepoUrl();
    if (!repoUrl) return;

    const actionsBar =
      document.querySelector(".pagehead-actions") ||
      document.querySelector('[data-testid="page-header-actions"]') ||
      document.querySelector(".flex-1.flex.items-center.gap-2");

    if (!actionsBar) {
      setTimeout(injectButton, 500);
      return;
    }

    const wrapper = document.createElement("div");
    wrapper.className = "gitvision-deploy-wrapper";

    let cachedFlowchart = DEFAULT_FLOWCHART;

    const btn = createButton();
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      if (wrapper.querySelector(".gitvision-deploy-btn-loading")) return;

      const appUrl = await getAppUrl();
      const apiUrl = `${appUrl.replace(/\/$/, "")}/api/analyze`;

      showSpinner(wrapper);

      const doDeploy = () => {
        showSpinner(wrapper);
        chrome.runtime.sendMessage({
          type: "GITVISION_DEPLOY",
          apiUrl,
          repositoryUrl: repoUrl,
        }).then((result) => {
          const { ok, data } = result || {};
          if (!ok || !data) {
            cachedFlowchart = (data && data.flowChartMermaid && data.flowChartMermaid.trim()) ? data.flowChartMermaid : DEFAULT_FLOWCHART;
            const onVideo = () => getAppUrl().then((appUrl) => showVideoModal(appUrl, repoUrl));
            showResult(wrapper, (data && data.error) || "Failed to fetch. Is the app running?", data && data.flowChartMermaid, true, () => { showSpinner(wrapper); doDeploy(); }, cachedFlowchart, onVideo);
            return;
          }
          if (data.error) {
            cachedFlowchart = (data.flowChartMermaid && data.flowChartMermaid.trim()) ? data.flowChartMermaid : DEFAULT_FLOWCHART;
            const onVideo = () => getAppUrl().then((appUrl) => showVideoModal(appUrl, repoUrl));
            showResult(wrapper, data.error, data.flowChartMermaid, true, () => { showSpinner(wrapper); doDeploy(); }, cachedFlowchart, onVideo);
            return;
          }
          const url = data.vercelDeployment?.url || `${appUrl}/studio?repo=${encodeURIComponent(repoUrl)}`;
          const isError = !!data.vercelDeployError;
          const msg = data.vercelDeployError || (data.error || "");
          const onRetry = () => { showSpinner(wrapper); doDeploy(); };
          cachedFlowchart = (data.flowChartMermaid && data.flowChartMermaid.trim()) ? data.flowChartMermaid : DEFAULT_FLOWCHART;
          const onVideo = () => getAppUrl().then((appUrl) => showVideoModal(appUrl, repoUrl));
          showResult(wrapper, isError ? msg : url, data.flowChartMermaid, isError, isError ? onRetry : null, cachedFlowchart, onVideo);
        }).catch((err) => {
          const msg = err?.message || "Failed to fetch. Check app URL and CORS.";
          const onVideo = () => getAppUrl().then((appUrl) => showVideoModal(appUrl, repoUrl));
          showResult(wrapper, msg, null, true, () => { showSpinner(wrapper); doDeploy(); }, DEFAULT_FLOWCHART, onVideo);
        });
      };

      doDeploy();
    });

    const flowchartBtn = createFlowchartButton(async () => {
      if (cachedFlowchart !== DEFAULT_FLOWCHART) {
        showFlowchartModal(cachedFlowchart, false);
        return;
      }
      showFlowchartModal(DEFAULT_FLOWCHART, true);
      const appUrl = await getAppUrl();
      const apiUrl = `${appUrl.replace(/\/$/, "")}/api/analyze`;
      try {
        const result = await chrome.runtime.sendMessage({
          type: "GITVISION_DEPLOY",
          apiUrl,
          repositoryUrl: repoUrl,
          deployToVercel: false,
        });
        const { ok, data } = result || {};
        const mermaid = (data?.flowChartMermaid?.trim()) ? data.flowChartMermaid : DEFAULT_FLOWCHART;
        cachedFlowchart = mermaid;
        updateFlowchartModal(mermaid);
      } catch (err) {
        const body = document.querySelector("#gitvision-flowchart-modal .gitvision-modal-body");
        if (body) body.innerHTML = `<p class="gitvision-modal-error">${(err?.message || "Failed to load flowchart").replace(/</g, "&lt;")}</p>`;
      }
    });
    const videoBtn = createVideoButton(() => {
      getAppUrl().then((appUrl) => showVideoModal(appUrl, repoUrl));
    });
    wrapper.appendChild(btn);
    wrapper.appendChild(flowchartBtn);
    wrapper.appendChild(videoBtn);
    actionsBar.prepend(wrapper);
  }

  function showSummaryModal(appUrl, repoUrl) {
    const existing = document.getElementById("gitvision-summary-modal");
    if (existing) {
      existing.remove();
      return;
    }
    const modal = document.createElement("div");
    modal.id = "gitvision-summary-modal";
    modal.className = "gitvision-modal-overlay";
    modal.innerHTML = `
      <div class="gitvision-modal gitvision-modal-summary">
        <div class="gitvision-modal-header">
          <span>Project Summary</span>
          <button type="button" class="gitvision-modal-close" title="Close">×</button>
        </div>
        <div class="gitvision-modal-body gitvision-modal-body-summary">
          <div class="gitvision-summary-loading">Loading summary...</div>
        </div>
      </div>
    `;
    modal.querySelector(".gitvision-modal-close").addEventListener("click", () => modal.remove());
    modal.addEventListener("click", (e) => { if (e.target === modal) modal.remove(); });
    document.body.appendChild(modal);

    const apiUrl = `${appUrl.replace(/\/$/, "")}/api/analyze`;
    const baseUrl = appUrl.replace(/\/$/, "");

    const renderRelated = (bodyEl, repos) => {
      if (!bodyEl || !Array.isArray(repos) || repos.length === 0) return;
      const esc = (x) => String(x || "").replace(/</g, "&lt;").replace(/"/g, "&quot;");
      const section = document.createElement("div");
      section.className = "gitvision-summary-section gitvision-related-repos";
      section.innerHTML = `<strong>Related repos</strong><div class="gitvision-related-cards">${repos.map((r) => `
        <a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer" class="gitvision-related-card">
          <span class="gitvision-related-card-name">${esc(r.fullName)}</span>
          ${r.description ? `<span class="gitvision-related-card-desc">${esc(r.description.slice(0, 80))}${r.description.length > 80 ? "…" : ""}</span>` : ""}
          <span class="gitvision-related-card-meta">
            ${r.stars ? `<span class="gitvision-related-stars">★ ${r.stars}</span>` : ""}
            ${r.language ? `<span class="gitvision-related-lang">${esc(r.language)}</span>` : ""}
          </span>
        </a>
      `).join("")}</div>`;
      bodyEl.appendChild(section);
    };

    chrome.runtime.sendMessage({
      type: "GITVISION_DEPLOY",
      apiUrl,
      repositoryUrl: repoUrl,
      deployToVercel: false,
    }).then((result) => {
      const body = document.querySelector("#gitvision-summary-modal .gitvision-modal-body-summary");
      if (!body) return;
      const { ok, data } = result || {};
      if (!ok || data?.error) {
        body.innerHTML = `<p class="gitvision-modal-error">${(data?.error || "Failed to load summary").replace(/</g, "&lt;")}</p>`;
        return;
      }
      const s = data;
      const toStr = (v) => {
        if (v == null) return "";
        if (typeof v === "string") return v;
        if (typeof v === "object") {
          const t = v.step ?? v.name ?? v.flow ?? v.description ?? v.text ?? (Array.isArray(v) ? v.join(" → ") : null);
          return t != null ? String(t) : JSON.stringify(v);
        }
        return String(v);
      };
      const arch = (s.architectureSummary || "").trim();
      const stack = (Array.isArray(s.techStack) ? s.techStack : []).map(toStr).filter(Boolean);
      const screens = (Array.isArray(s.detectedScreens) ? s.detectedScreens : []).map(toStr).filter(Boolean);
      const esc = (x) => String(x).replace(/</g, "&lt;").replace(/"/g, "&quot;");
      body.innerHTML = `
        <div class="gitvision-summary-content">
          ${s.projectType ? `<p class="gitvision-summary-type">${esc(toStr(s.projectType))}</p>` : ""}
          ${arch ? `<p class="gitvision-summary-arch">${esc(arch)}</p>` : ""}
          ${s.frontend || s.backend ? `<p class="gitvision-summary-stack"><strong>Stack:</strong> ${esc([s.frontend, s.backend].filter(Boolean).join(" · "))}</p>` : ""}
          ${stack.length ? `<p class="gitvision-summary-tech"><strong>Tech:</strong> ${esc(stack.slice(0, 8).join(", "))}</p>` : ""}
          ${screens.length ? `<div class="gitvision-summary-section"><strong>Screens:</strong><ul>${screens.slice(0, 6).map((sc) => `<li>${esc(sc)}</li>`).join("")}</ul></div>` : ""}
        </div>
      `;
      chrome.runtime.sendMessage({ type: "GITVISION_RELATED_REPOS", appUrl: baseUrl, repositoryUrl: repoUrl })
        .then((res) => {
          const b = document.querySelector("#gitvision-summary-modal .gitvision-modal-body-summary");
          if (res?.ok && res?.data?.relatedRepos) renderRelated(b, res.data.relatedRepos);
        })
        .catch(() => {});
    }).catch((err) => {
      const body = document.querySelector("#gitvision-summary-modal .gitvision-modal-body-summary");
      if (body) body.innerHTML = `<p class="gitvision-modal-error">${(err?.message || "Failed to load").replace(/</g, "&lt;")}</p>`;
    });
  }

  document.addEventListener("keydown", (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    const repoUrl = getRepoUrl();
    if (!repoUrl) return;
    if (e.key === "g") {
      e.preventDefault();
      getAppUrl().then((appUrl) => showSummaryModal(appUrl, repoUrl));
    } else if (e.key === "r") {
      e.preventDefault();
      getAppUrl().then((appUrl) => showRelatedReposModal(appUrl, repoUrl));
    }
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", injectButton);
  } else {
    injectButton();
  }

  const observer = new MutationObserver(() => injectButton());
  observer.observe(document.body, { childList: true, subtree: true });
})();
