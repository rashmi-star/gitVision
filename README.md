# GitVision

Next.js + shadcn/ui app that analyzes a GitHub repository and generates:

- Repository classification (project type, frontend, backend, signals)
- Preview strategy (real UI with mocks vs generated demo UI)
- Asset resolution options and asset-source detection
- Mock backend response samples
- Architecture summary + diagram nodes + user flow
- Optional OpenAI-powered enrichment and demo video script text

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

3. Run development server:

```bash
npm run dev
```

Open `http://localhost:3000`.

## API Routes

- `POST /api/analyze`: clones repo to temporary workspace, scans files, infers stack, endpoints, assets, and returns preview plan.
- `POST /api/demo-script`: returns a short demo-script scene list (OpenAI if key available, fallback otherwise).

## Notes

- Temp repository clone is cleaned up after analysis.
- If backend cannot be executed, the app returns mock response payloads for preview.
- OpenAI key can be passed from UI input or from `OPENAI_API_KEY`.
