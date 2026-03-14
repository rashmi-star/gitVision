# GitVision

Next.js + shadcn/ui app that analyzes a GitHub repository and generates:

- Repository classification (project type, frontend, backend, signals)
- Preview strategy (real UI with mocks vs generated demo UI)
- Asset resolution options and asset-source detection
- Mock backend response samples
- Architecture summary + diagram nodes + user flow
- Optional OpenAI-powered enrichment and demo video script text
- **Vercel deployment**: One-click deploy for Next.js, React/Vite, Vue, and static sites

## Setup

1. Install dependencies:

```bash
npm install
```

2. Configure OpenAI (optional):

```bash
cp .env.example .env.local
```

Set `OPENAI_API_KEY` in `.env.local`.
Optional model overrides:

- `OPENAI_ANALYSIS_MODEL` (default: `gpt-4.1-mini`)
- `OPENAI_ANALYSIS_FALLBACK_MODEL` (default: `gpt-4o-mini`)
- `OPENAI_DEMO_MODEL` (default: `gpt-4.1-mini`)
- `OPENAI_DEMO_FALLBACK_MODEL` (default: `gpt-4o-mini`)

3. Configure Vercel (optional, for deploy):

   - `VERCEL_TOKEN`: Create at [vercel.com/account/tokens](https://vercel.com/account/tokens)
   - The GitHub repo must be accessible to your Vercel account (GitHub integration)
   - All deployments use one project (`VERCEL_PREVIEW_PROJECT`, default `gitvision-preview`)—same URL, latest repo each time
   - `VERCEL_TEAM_ID`: Required if using a Vercel team
   - `VERCEL_PREVIEW_URL`: Override the preview URL (e.g. for teams: `https://gitvision-preview-yourteam.vercel.app`)

4. Run development server:

```bash
npm run dev
```

Open `http://localhost:3000`.

## API Routes

- `POST /api/analyze`: clones repo to temporary workspace, scans files, infers stack, endpoints, assets, and returns preview plan.
- `POST /api/demo-script`: returns a short demo-script scene list (OpenAI if key available, fallback otherwise).
- `POST /api/deploy`: deploys a GitHub repo to Vercel (Next.js, React/Vite, Vue, static sites). Requires `VERCEL_TOKEN`.

## Notes

- Temp repository clone (`/tmp/gitvision-job-*`) is deleted after analysis and Vercel deployment is triggered. Only metadata (preview URL, deployment ID) is stored—no repo files on disk.
- Vercel deployment is triggered directly after analysis (no local build check).
- OpenAI key can be passed from UI input or from `OPENAI_API_KEY`.
