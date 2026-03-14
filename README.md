# GitVision

**See what a GitHub project actually does—instantly.** GitVision analyzes repositories and turns code into clear product understanding: architecture, screens, and live previews.

Built for the [Microsoft AI Dev Days Hackathon](https://aka.ms/aidevdayshackathon).

## Microsoft Technologies Used

| Technology | Usage |
|------------|-------|
| **Azure OpenAI** | AI-powered analysis and demo script generation (optional) |
| **Azure** | Deploy to Azure Static Web Apps or App Service |
| **GitHub** | Public repo, development, and deployment |
| **GitHub Copilot** | Built with GitHub Copilot for faster development |

## Features

- Repository classification (project type, frontend, backend)
- Architecture summary and Mermaid flowcharts
- Detected screens and user flows
- One-click Vercel deployment for instant preview
- AI-generated demo video script (OpenAI or Azure OpenAI)
- Remotion-powered demo video with customizable scenes

## Setup

1. Install dependencies:

```bash
npm install
```

2. Configure AI (optional):

```bash
cp .env.example .env.local
```

**Option A – OpenAI:**
- Set `OPENAI_API_KEY` in `.env.local`

**Option B – Azure OpenAI (recommended for hackathon):**
- Set `AZURE_OPENAI_ENDPOINT` (e.g. `https://your-resource.openai.azure.com`)
- Set `AZURE_OPENAI_API_KEY`
- Set `AZURE_OPENAI_DEPLOYMENT` (e.g. `gpt-4o-mini`)

Optional model overrides:
- `OPENAI_ANALYSIS_MODEL` / `OPENAI_ANALYSIS_FALLBACK_MODEL`
- `OPENAI_DEMO_MODEL` / `OPENAI_DEMO_FALLBACK_MODEL`

3. Configure Vercel (optional, for deploy):

- `VERCEL_TOKEN`: Create at [vercel.com/account/tokens](https://vercel.com/account/tokens)
- The GitHub repo must be accessible to your Vercel account
- All deployments use one project (`VERCEL_PREVIEW_PROJECT`, default `gitvision-preview`)
- `VERCEL_TEAM_ID`: Required if using a Vercel team
- `VERCEL_PREVIEW_URL`: Override the preview URL for teams

4. Run development server:

```bash
npm run dev
```

Open `http://localhost:3000`.

## Deploy to Azure

1. Create an [Azure free account](https://azure.microsoft.com/free)
2. In Azure Portal: **Create a resource** → **Static Web App**
3. Connect your GitHub repo
4. Build details:
   - **App location:** `.` (repo root)
   - **Build preset:** Next.js
5. Add environment variables in **Configuration** → **Application settings**

## API Routes

- `POST /api/analyze`: Clones repo, scans files, infers stack, returns preview plan. Optionally deploys to Vercel.
- `POST /api/demo-script`: Returns demo video scene list (OpenAI or Azure OpenAI if configured).
- `POST /api/deploy`: Deploys a GitHub repo to Vercel.

## Security & Privacy

- **No persistent storage:** Temporary repository clones are deleted after analysis. Only metadata (preview URL, deployment ID) is retained.
- **No code retention:** Repository contents are not stored on disk beyond the analysis session.
- **API keys:** Stored in environment variables; never exposed to the client.

## Responsible AI

- GitVision performs **analysis only**—it does not generate code, images, or other creative content.
- AI is used to summarize and explain existing repositories.
- No user data is used for model training.

## Notes

- Temp clone (`/tmp/gitvision-job-*`) is deleted after analysis.
- Vercel deployment is triggered directly after analysis when configured.
- OpenAI or Azure OpenAI key can be passed from UI input or from env vars.
