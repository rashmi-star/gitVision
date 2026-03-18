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

  function toBase64Url(input) {
    const bytes = new TextEncoder().encode(input);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    const base64 = btoa(binary);
    return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  const DEFAULT_FLOWCHART = "flowchart TD\n  A[Repository] --> B[Analyze]\n  B --> C[Deploy]\n  C --> D[Preview]";

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

  function showMenuModal(repoUrl) {
    const existing = document.getElementById("gitvision-menu-modal");
    if (existing) {
      existing.remove();
      return;
    }

    let cachedFlowchart = DEFAULT_FLOWCHART;

    const modal = document.createElement("div");
    modal.id = "gitvision-menu-modal";
    modal.className = "gitvision-modal-overlay";
    modal.innerHTML = `
      <div class="gitvision-modal gitvision-modal-menu">
        <div class="gitvision-modal-header">
          <span>GitVision</span>
          <button type="button" class="gitvision-modal-close" title="Close">×</button>
        </div>
        <div class="gitvision-modal-body gitvision-modal-body-menu">
          <div class="gitvision-menu-grid">
            <button type="button" class="gitvision-menu-item" data-action="preview" title="Preview & deploy">
              <span class="gitvision-menu-icon">🔗</span>
              <span class="gitvision-menu-label">Preview</span>
            </button>
            <button type="button" class="gitvision-menu-item" data-action="flowchart" title="Architecture flowchart">
              <span class="gitvision-menu-icon">📊</span>
              <span class="gitvision-menu-label">Flowchart</span>
            </button>
            <button type="button" class="gitvision-menu-item" data-action="video" title="Demo video">
              <span class="gitvision-menu-icon">🎬</span>
              <span class="gitvision-menu-label">Video</span>
            </button>
            <button type="button" class="gitvision-menu-item" data-action="summary" title="Project summary (Ctrl+G)">
              <span class="gitvision-menu-icon">📋</span>
              <span class="gitvision-menu-label">Summary</span>
            </button>
            <button type="button" class="gitvision-menu-item" data-action="related" title="Related repos (Ctrl+R)">
              <span class="gitvision-menu-icon">📁</span>
              <span class="gitvision-menu-label">Related</span>
            </button>
          </div>
        </div>
      </div>
    `;

    const body = modal.querySelector(".gitvision-modal-body-menu");
    const renderMenu = () => {
      body.innerHTML = `
        <div class="gitvision-menu-grid">
          <button type="button" class="gitvision-menu-item" data-action="preview" title="Preview & deploy">
            <span class="gitvision-menu-icon">🔗</span>
            <span class="gitvision-menu-label">Preview</span>
          </button>
          <button type="button" class="gitvision-menu-item" data-action="flowchart" title="Architecture flowchart">
            <span class="gitvision-menu-icon">📊</span>
            <span class="gitvision-menu-label">Flowchart</span>
          </button>
          <button type="button" class="gitvision-menu-item" data-action="video" title="Demo video">
            <span class="gitvision-menu-icon">🎬</span>
            <span class="gitvision-menu-label">Video</span>
          </button>
          <button type="button" class="gitvision-menu-item" data-action="summary" title="Project summary (Ctrl+G)">
            <span class="gitvision-menu-icon">📋</span>
            <span class="gitvision-menu-label">Summary</span>
          </button>
          <button type="button" class="gitvision-menu-item" data-action="related" title="Related repos (Ctrl+R)">
            <span class="gitvision-menu-icon">📁</span>
            <span class="gitvision-menu-label">Related</span>
          </button>
        </div>
      `;
      attachMenuHandlers();
    };

    const attachMenuHandlers = () => {
      body.querySelectorAll(".gitvision-menu-item").forEach((btn) => {
        btn.addEventListener("click", onClick);
      });
    };

    const onClick = async (e) => {
      const action = e.currentTarget.getAttribute("data-action");
      const appUrl = await getAppUrl();

      if (action === "summary") {
        modal.remove();
        showSummaryModal(appUrl, repoUrl);
        return;
      }
      if (action === "related") {
        modal.remove();
        showRelatedReposModal(appUrl, repoUrl);
        return;
      }
      if (action === "video") {
        modal.remove();
        showVideoModal(appUrl, repoUrl);
        return;
      }
      if (action === "flowchart") {
        modal.remove();
        showFlowchartModal(DEFAULT_FLOWCHART, true);
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
          updateFlowchartModal(mermaid);
        } catch (err) {
          const fm = document.getElementById("gitvision-flowchart-modal");
          if (fm) {
            const bodyEl = fm.querySelector(".gitvision-modal-body");
            if (bodyEl) bodyEl.innerHTML = `<p class="gitvision-modal-error">${(err?.message || "Failed to load flowchart").replace(/</g, "&lt;")}</p>`;
          }
        }
        return;
      }
      if (action === "preview") {
        body.innerHTML = '<div class="gitvision-modal-loading">Analyzing & deploying...</div>';
        const apiUrl = `${appUrl.replace(/\/$/, "")}/api/analyze`;
        chrome.runtime.sendMessage({
          type: "GITVISION_DEPLOY",
          apiUrl,
          repositoryUrl: repoUrl,
        }).then((result) => {
          const { ok, data } = result || {};
          if (!ok || !data) {
            cachedFlowchart = (data && data.flowChartMermaid?.trim()) ? data.flowChartMermaid : DEFAULT_FLOWCHART;
            body.innerHTML = `
              <div class="gitvision-menu-result">
                <p class="gitvision-modal-error">${(data?.error || "Failed to fetch").replace(/</g, "&lt;")}</p>
                <button type="button" class="gitvision-menu-back">← Back</button>
              </div>
            `;
            body.querySelector(".gitvision-menu-back").addEventListener("click", renderMenu);
            return;
          }
          if (data.error) {
            cachedFlowchart = (data.flowChartMermaid?.trim()) ? data.flowChartMermaid : DEFAULT_FLOWCHART;
            body.innerHTML = `
              <div class="gitvision-menu-result">
                <p class="gitvision-modal-error">${(data.error || "").replace(/</g, "&lt;")}</p>
                <button type="button" class="gitvision-menu-back">← Back</button>
              </div>
            `;
            body.querySelector(".gitvision-menu-back").addEventListener("click", renderMenu);
            return;
          }
          const url = data.vercelDeployment?.url || `${appUrl}/studio?repo=${encodeURIComponent(repoUrl)}`;
          cachedFlowchart = (data.flowChartMermaid?.trim()) ? data.flowChartMermaid : DEFAULT_FLOWCHART;
          body.innerHTML = `
            <div class="gitvision-menu-result">
              <a href="${url}" target="_blank" rel="noopener noreferrer" class="gitvision-deploy-btn gitvision-deploy-btn-card gitvision-menu-preview-btn">
                <span class="gitvision-deploy-btn-icon">🔗</span>
                <span class="gitvision-deploy-btn-text">Open Preview</span>
              </a>
              <div class="gitvision-menu-result-actions">
                <button type="button" class="gitvision-menu-item gitvision-menu-item-sm" data-action="flowchart">📊 Flowchart</button>
                <button type="button" class="gitvision-menu-item gitvision-menu-item-sm" data-action="video">🎬 Video</button>
              </div>
              <button type="button" class="gitvision-menu-back">← Back</button>
            </div>
          `;
          body.querySelector(".gitvision-menu-preview-btn").addEventListener("click", () => modal.remove());
          body.querySelector("[data-action='flowchart']").addEventListener("click", () => {
            modal.remove();
            showFlowchartModal(cachedFlowchart, false);
          });
          body.querySelector("[data-action='video']").addEventListener("click", () => {
            modal.remove();
            showVideoModal(appUrl, repoUrl);
          });
          body.querySelector(".gitvision-menu-back").addEventListener("click", renderMenu);
        }).catch((err) => {
          body.innerHTML = `
            <div class="gitvision-menu-result">
              <p class="gitvision-modal-error">${(err?.message || "Failed to fetch").replace(/</g, "&lt;")}</p>
              <button type="button" class="gitvision-menu-back">← Back</button>
            </div>
          `;
          body.querySelector(".gitvision-menu-back").addEventListener("click", renderMenu);
        });
      }
    };

    attachMenuHandlers();

    modal.querySelector(".gitvision-modal-close").addEventListener("click", () => modal.remove());
    modal.addEventListener("click", (e) => { if (e.target === modal) modal.remove(); });
    document.body.appendChild(modal);
  }

  function injectFloatingButton() {
    if (document.querySelector(".gitvision-floating-btn")) return;

    const repoUrl = getRepoUrl();
    if (!repoUrl) return;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "gitvision-floating-btn";
    btn.title = "GitVision (Ctrl+G summary, Ctrl+R related)";
    btn.innerHTML = "✨";
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      showMenuModal(repoUrl);
    });
    document.body.appendChild(btn);
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
    document.addEventListener("DOMContentLoaded", injectFloatingButton);
  } else {
    injectFloatingButton();
  }

  const observer = new MutationObserver(() => injectFloatingButton());
  observer.observe(document.body, { childList: true, subtree: true });
})();
