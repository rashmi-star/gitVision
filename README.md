# GitVision

**See what a repository actually does—instantly.** GitVision analyzes repos and turns code into clear product understanding: architecture, Mermaid flowcharts, live Vercel previews, and optional demo videos.

- **Live app (example):** [git-vision-pi.vercel.app](https://git-vision-pi.vercel.app)
- **License:** [MIT](LICENSE) (see **Project information** on GitLab for hackathon visibility)

---

## GitLab AI Hackathon

This project is structured for the **[GitLab AI Hackathon](https://gitlab.devpost.com/)** submission:

| Requirement | How GitVision satisfies it |
|-------------|----------------------------|
| **Public GitLab repo** in the hackathon group | Mirror or push this repo to your group project (steps below). |
| **Custom public agent or flow** | Build a **GitLab Duo** agent/flow that calls `POST /api/analyze` with `{ "repositoryUrl": "<https URL>" }` and posts results (summary + preview URL) on a merge request—not chat-only. |
| **SDLC automation** | Speeds up **code review** by summarizing the repo and surfacing a **deployable preview** on MR context. |

**Hackathon links:** [Devpost](https://gitlab.devpost.com/) · [Rules](https://gitlab.devpost.com/rules) · [Duo access form](https://docs.google.com/forms/d/e/1FAIpQLSeZH1aGJKV9i02Ig63EA8n9d9bLbdfkLIWT-IUphyoNxbR6YA/viewform) (after registering on Devpost)

### Put this repo on GitLab (after you have group access)

**Option A — Import from GitHub**

1. In the **GitLab AI Hackathon** group: **New project** → **Import project** → **Repository by URL** or **GitHub**.
2. Set visibility to **Public**.
3. Confirm **LICENSE** and **README** appear on the project home page.

**Option B — Add a second remote and push**

```bash
# From your local clone (replace with your GitLab project URL)
git remote add gitlab https://gitlab.com/<hackathon-group>/<your-project>.git
git push -u gitlab master   # or main
```

**Option C — Mirror (keep GitHub + GitLab in sync)**  
GitLab: **Settings → Repository → Mirroring repositories** → enter your GitHub repo URL + credentials.

---

## Features

- Repository classification (project type, frontend, backend)
- Architecture summary and **Mermaid** flowcharts
- Detected screens and user flows
- One-click **Vercel** deployment for instant preview (`deployToVercel` on analyze)
- AI-generated demo video (OpenAI, Azure OpenAI, or Google GenAI—see `.env.example`)
- **Chrome extension** for GitHub: floating menu (preview, flowchart, summary, related repos, deploy toast)

---

## Setup

1. Install dependencies:

```bash
npm install
```

2. Configure environment:

```bash
cp .env.example .env.local
```

**AI (pick one or more—see `.env.example`):**

- **OpenAI:** `OPENAI_API_KEY`
- **Azure OpenAI:** `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_DEPLOYMENT`
- **Google:** `GOOGLE_API_KEY` / GenAI as documented in `.env.example`

**Vercel (optional, for deploy from API):**

- `VERCEL_TOKEN` — [vercel.com/account/tokens](https://vercel.com/account/tokens)
- `VERCEL_PREVIEW_PROJECT` (default `gitvision-preview`), `VERCEL_TEAM_ID` if on a team

3. Run locally:

```bash
npm run dev
```

Open `http://localhost:3000`.

---

## API (for GitLab Duo agent / integrations)

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/analyze` | Body: `{ "repositoryUrl": "https://github.com/owner/repo", "deployToVercel": true }`. Returns analysis, optional `vercelDeployment.url`, flowchart Mermaid, etc. |
| `POST` | `/api/demo-script` | Demo video scene script (when AI keys configured). |
| `POST` | `/api/deploy` | Deploy a GitHub repo to Vercel. |

Base URL: your deployment (e.g. `https://git-vision-pi.vercel.app`) or `http://localhost:3000` in dev.

**Example:**

```bash
curl -X POST https://YOUR_APP/api/analyze \
  -H "Content-Type: application/json" \
  -d '{"repositoryUrl":"https://gitlab.com/group/project","deployToVercel":true}'
```

---

## Browser extension

See **[extension/README.md](extension/README.md)** for install steps.  
Default app URL in `extension/content.js`: `DEFAULT_APP_URL` → `https://git-vision-pi.vercel.app`.

---

## Deploy to Azure (optional)

1. [Azure free account](https://azure.microsoft.com/free)
2. **Static Web App** or **App Service** → connect repo
3. Build: Next.js from repo root
4. Copy env vars from `.env.example` into **Application settings**

---

## Microsoft AI Dev Days (legacy note)

Originally submitted with Azure OpenAI / GitHub stack. Current README prioritizes **GitLab hackathon** + general OSS use.

---

## Security & privacy

- Analysis uses **temporary** clones; clones are removed after processing.
- API keys only in **server** environment variables.
- GitVision **summarizes** existing repos; it does not train on your data.

---

## Responsible AI

- Analysis and explanation of **existing** repositories only.
- No use of customer data for model training by this codebase.
