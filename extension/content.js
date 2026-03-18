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
    modal.className = "gitvision-modal-overlay gitvision-modal-overlay-transparent";
    const bodyContent = isLoading
      ? '<div class="gitvision-modal-loading">Loading flowchart...</div>'
      : `<img src="https://mermaid.ink/svg/${toBase64Url(mermaidCode)}" alt="Flowchart" class="gitvision-flowchart-img" />`;
    modal.innerHTML = `
      <div class="gitvision-modal gitvision-modal-flowchart gitvision-modal-transparent">
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
    modal.className = "gitvision-modal-overlay gitvision-modal-overlay-transparent";
    modal.innerHTML = `
      <div class="gitvision-modal gitvision-modal-summary gitvision-modal-transparent">
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

  function showDeployModal(appUrl, repoUrl) {
    const existing = document.getElementById("gitvision-deploy-toast");
    if (existing) existing.remove();

    const toast = document.createElement("div");
    toast.id = "gitvision-deploy-toast";
    toast.className = "gitvision-deploy-toast";
    toast.innerHTML = `
      <div class="gitvision-deploy-toast-loading">
        <span class="gitvision-deploy-toast-spinner"></span>
        <span>Deploying...</span>
      </div>
    `;
    document.body.appendChild(toast);

    const apiUrl = `${appUrl.replace(/\/$/, "")}/api/analyze`;
    chrome.runtime.sendMessage({ type: "GITVISION_DEPLOY", apiUrl, repositoryUrl: repoUrl })
      .then((result) => {
        const { data } = result || {};
        const url = data?.vercelDeployment?.url;
        const error = data?.error;
        if (url && !error) {
          toast.innerHTML = `
            <div class="gitvision-deploy-toast-result">
              <p class="gitvision-deploy-success">✓ Deployed to Vercel</p>
              <a href="${url}" target="_blank" rel="noopener noreferrer" class="gitvision-deploy-link">${url}</a>
              <button type="button" class="gitvision-deploy-copy">Copy</button>
              <button type="button" class="gitvision-deploy-toast-close" title="Close">×</button>
            </div>
          `;
          toast.querySelector(".gitvision-deploy-copy")?.addEventListener("click", () => {
            navigator.clipboard.writeText(url);
            const btn = toast.querySelector(".gitvision-deploy-copy");
            if (btn) { btn.textContent = "Copied!"; setTimeout(() => { btn.textContent = "Copy"; }, 1500); }
          });
          toast.querySelector(".gitvision-deploy-toast-close")?.addEventListener("click", () => toast.remove());
        } else {
          toast.innerHTML = `
            <div class="gitvision-deploy-toast-result gitvision-deploy-toast-error">
              <p>${(error || "Deployment failed").replace(/</g, "&lt;")}</p>
              <button type="button" class="gitvision-deploy-toast-close" title="Close">×</button>
            </div>
          `;
          toast.querySelector(".gitvision-deploy-toast-close")?.addEventListener("click", () => toast.remove());
        }
      })
      .catch((err) => {
        toast.innerHTML = `
          <div class="gitvision-deploy-toast-result gitvision-deploy-toast-error">
            <p>${(err?.message || "Failed to deploy").replace(/</g, "&lt;")}</p>
            <button type="button" class="gitvision-deploy-toast-close" title="Close">×</button>
          </div>
        `;
        toast.querySelector(".gitvision-deploy-toast-close")?.addEventListener("click", () => toast.remove());
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
    modal.className = "gitvision-modal-overlay gitvision-modal-overlay-transparent";
    modal.innerHTML = `
      <div class="gitvision-modal gitvision-modal-summary gitvision-modal-transparent">
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

  const MENU_ITEMS = [
    { action: "preview", icon: "🔗", label: "Preview", shortcut: "Ctrl+P", title: "Preview & deploy" },
    { action: "flowchart", icon: "📊", label: "Flowchart", shortcut: "Ctrl+F", title: "Architecture flowchart" },
    // { action: "video", icon: "🎬", label: "Video", title: "Demo video" },
    { action: "summary", icon: "📋", label: "Summary", shortcut: "Ctrl+G", title: "Project summary" },
    { action: "related", icon: "📁", label: "Related", shortcut: "Ctrl+R", title: "Related repos" },
  ];

  function showSemiCircleMenu(repoUrl) {
    const existing = document.getElementById("gitvision-semicircle-menu");
    if (existing) {
      existing.remove();
      return;
    }

    let cachedFlowchart = DEFAULT_FLOWCHART;

    const menu = document.createElement("div");
    menu.id = "gitvision-semicircle-menu";
    menu.className = "gitvision-semicircle-menu";
    menu.innerHTML = `
      <div class="gitvision-semicircle-backdrop"></div>
      <div class="gitvision-menu-box">
        ${MENU_ITEMS.map((item) => `
          <button type="button" class="gitvision-menu-box-item" data-action="${item.action}" title="${item.title}">
            <span class="gitvision-menu-box-icon">${item.icon}</span>
            <span class="gitvision-menu-box-label">${item.label}${item.shortcut ? ` <span class="gitvision-menu-box-shortcut">${item.shortcut}</span>` : ""}</span>
          </button>
        `).join("")}
      </div>
    `;

    const runAction = async (action) => {
      const appUrl = await getAppUrl();
      menu.remove();

      if (action === "summary") {
        showSummaryModal(appUrl, repoUrl);
        return;
      }
      if (action === "related") {
        showRelatedReposModal(appUrl, repoUrl);
        return;
      }
      // if (action === "video") {
      //   showVideoModal(appUrl, repoUrl);
      //   return;
      // }
      if (action === "flowchart") {
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
        showDeployModal(appUrl, repoUrl);
      }
    };

    menu.querySelector(".gitvision-semicircle-backdrop").addEventListener("click", () => menu.remove());
    menu.querySelectorAll(".gitvision-menu-box-item").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        runAction(btn.getAttribute("data-action"));
      });
    });

    document.body.appendChild(menu);
  }

  function injectFloatingButton() {
    if (document.querySelector(".gitvision-floating-btn")) return;

    const repoUrl = getRepoUrl();
    if (!repoUrl) return;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "gitvision-floating-btn";
    btn.title = "GitVision (Ctrl+G summary, Ctrl+R related, Ctrl+P preview, Ctrl+F flowchart)";
    btn.innerHTML = `<svg class="gitvision-github-icon" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>`;
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      showSemiCircleMenu(repoUrl);
    });
    document.body.appendChild(btn);
  }

  document.addEventListener("keydown", (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    const repoUrl = getRepoUrl();
    if (!repoUrl) return;
    const key = e.key?.toLowerCase();
    if (key === "g") {
      e.preventDefault();
      getAppUrl().then((appUrl) => showSummaryModal(appUrl, repoUrl));
    } else if (key === "r") {
      e.preventDefault();
      getAppUrl().then((appUrl) => showRelatedReposModal(appUrl, repoUrl));
    } else if (key === "p") {
      e.preventDefault();
      getAppUrl().then((appUrl) => showDeployModal(appUrl, repoUrl));
    } else if (key === "f") {
      e.preventDefault();
      getAppUrl().then((appUrl) => {
        showFlowchartModal(DEFAULT_FLOWCHART, true);
        const apiUrl = `${appUrl.replace(/\/$/, "")}/api/analyze`;
        chrome.runtime.sendMessage({ type: "GITVISION_DEPLOY", apiUrl, repositoryUrl: repoUrl, deployToVercel: false })
          .then((result) => {
            const { data } = result || {};
            const mermaid = (data?.flowChartMermaid?.trim()) ? data.flowChartMermaid : DEFAULT_FLOWCHART;
            updateFlowchartModal(mermaid);
          })
          .catch((err) => {
            const fm = document.getElementById("gitvision-flowchart-modal");
            if (fm) {
              const bodyEl = fm.querySelector(".gitvision-modal-body");
              if (bodyEl) bodyEl.innerHTML = `<p class="gitvision-modal-error">${(err?.message || "Failed to load flowchart").replace(/</g, "&lt;")}</p>`;
            }
          });
      });
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
