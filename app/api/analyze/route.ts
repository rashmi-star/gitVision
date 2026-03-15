import { mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextResponse } from "next/server";
import AdmZip from "adm-zip";
import { z } from "zod";

import { generateTextWithFallback, hasAIConfig } from "@/lib/openai";
import type { AnalyzeResponse } from "@/lib/types";
import { deployToVercel } from "@/lib/vercel";

function parseGithubRepo(repositoryUrl: string): { owner: string; repo: string } | null {
  const normalized = repositoryUrl.replace(/\.git$/i, "").trim();
  const match = normalized.match(/github\.com[/:]([^/]+)\/([^/]+)/i);
  if (!match) return null;
  return { owner: match[1], repo: match[2].replace(/\/$/, "") };
}

const requestSchema = z.object({
  repositoryUrl: z.string().url(),
  deploymentUrl: z.string().url().optional().or(z.literal("")),
  assetBaseUrl: z.string().url().optional().or(z.literal("")),
  openaiApiKey: z.string().optional(),
  geminiApiKey: z.string().optional(),
  deployToVercel: z.boolean().optional().default(true),
  vercelToken: z.string().optional(),
});

const MAX_FILES = 2500;
const MAX_CONTENT_FILES = 150;
const MAX_FILE_BYTES = 50_000;
const ANALYSIS_MODEL = process.env.OPENAI_ANALYSIS_MODEL || "gpt-4.1-mini";
const ANALYSIS_FALLBACK_MODELS = [
  process.env.OPENAI_ANALYSIS_FALLBACK_MODEL || "gpt-4o-mini",
];

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { repositoryUrl, deploymentUrl, assetBaseUrl, deployToVercel: shouldDeploy } = parsed.data;
  const openaiApiKey = parsed.data.openaiApiKey || parsed.data.geminiApiKey;
  const vercelToken = parsed.data.vercelToken || process.env.VERCEL_TOKEN;

  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "gitvision-job-"));

  try {
    const { repositoryRef, repoRoot } = await fetchRepoFromGitHub(repositoryUrl, tempRoot);

    const scan = await scanRepository(repoRoot);
    const base = buildHeuristicAnalysis(
      repositoryUrl,
      deploymentUrl || undefined,
      assetBaseUrl || undefined,
      repositoryRef,
      scan,
    );

    const aiResult = await enrichWithOpenAI(base, scan, openaiApiKey);

    let vercelDeployment: AnalyzeResponse["vercelDeployment"] | undefined;

    if (shouldDeploy && aiResult.vercelDeployable && vercelToken) {
      const deployResult = await deployToVercel(repositoryUrl, repositoryRef, vercelToken);
      if (deployResult.ok) {
        vercelDeployment = {
          url: deployResult.url,
          deploymentId: deployResult.deploymentId,
          status: deployResult.status,
          timestamp: new Date().toISOString(),
        };
      }
    }

    return NextResponse.json({
      ...aiResult,
      vercelDeployment,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to analyze repository." },
      { status: 500 },
    );
  } finally {
    // Delete temp clone after analysis and (if applicable) Vercel deployment triggered.
    // We only keep metadata (preview URL, deployment ID); no repo files on disk.
    await rm(tempRoot, { recursive: true, force: true });
  }
}

async function scanRepository(root: string) {
  const files: string[] = [];
  const folders = new Set<string>();
  const limitedReads: Array<{ file: string; content: string }> = [];
  const packageJsonPaths: string[] = [];
  let readmeSummary = "";

  async function walk(current: string) {
    if (files.length >= MAX_FILES) {
      return;
    }

    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      if (files.length >= MAX_FILES) {
        return;
      }

      if (
        entry.name === ".git" ||
        entry.name === "node_modules" ||
        entry.name === ".next" ||
        entry.name === "dist" ||
        entry.name === "build" ||
        entry.name === "coverage"
      ) {
        continue;
      }

      const abs = path.join(current, entry.name);
      const rel = path.relative(root, abs).replaceAll("\\", "/");

      if (entry.isDirectory()) {
        const topLevel = rel.split("/")[0];
        if (topLevel) {
          folders.add(topLevel);
        }
        await walk(abs);
        continue;
      }

      files.push(rel);
      if (/^readme\.md$/i.test(entry.name) && !readmeSummary) {
        try {
          const text = await readFile(abs, "utf8");
          readmeSummary = summarizeReadme(text);
        } catch {
          // Ignore unreadable README.
        }
      }
      if (entry.name === "package.json") {
        packageJsonPaths.push(abs);
      }

      if (limitedReads.length >= MAX_CONTENT_FILES) {
        continue;
      }

      if (!/\.(tsx?|jsx?|vue|html|json|md|mjs|cjs)$/i.test(entry.name)) {
        continue;
      }

      const fileStats = await stat(abs);
      if (fileStats.size > MAX_FILE_BYTES) {
        continue;
      }

      const content = await readFile(abs, "utf8");
      limitedReads.push({ file: rel, content });
    }
  }

  await walk(root);

  const packageJson = await findBestPackageJson(packageJsonPaths);
  return { files, folders: [...folders], packageJson, limitedReads, readmeSummary };
}

async function findBestPackageJson(paths: string[]) {
  for (const filePath of paths) {
    try {
      const text = await readFile(filePath, "utf8");
      return JSON.parse(text) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
    } catch {
      continue;
    }
  }
  return {
    dependencies: {},
    devDependencies: {},
  };
}

function buildHeuristicAnalysis(
  repositoryUrl: string,
  deploymentUrl: string | undefined,
  assetBaseUrl: string | undefined,
  repositoryRef: string,
  scan: Awaited<ReturnType<typeof scanRepository>>,
): AnalyzeResponse {
  const deps = {
    ...(scan.packageJson.dependencies ?? {}),
    ...(scan.packageJson.devDependencies ?? {}),
  };

  const files = scan.files;
  const fileSet = new Set(files);
  const contentRows = scan.limitedReads;
  const contentBlob = contentRows.map((r) => `${r.file}\n${r.content.slice(0, 1200)}`).join("\n\n");

  const frontend = detectFrontend(deps, fileSet, contentBlob);
  const backend = detectBackend(deps, fileSet, contentBlob);
  const hasUi = frontend !== "None";
  const projectType = hasUi ? "Web Application" : backend !== "None" ? "Backend/API Tool" : "Library/SDK";
  const frameworkSignals = collectFrameworkSignals(deps, fileSet, contentBlob);
  const techStack = buildTechStack(frontend, backend, frameworkSignals);
  const apiEndpoints = detectApiEndpoints(contentRows);
  const uiComponents = detectUiComponents(contentRows);
  const detectedScreens = detectScreens(files);
  const screenPreviews = buildScreenPreviews(detectedScreens, contentRows);
  const repoVisualAssets = buildRepoAssetUrls(repositoryUrl, repositoryRef, files);
  const assetSources = detectAssetSources(contentRows, deploymentUrl, assetBaseUrl);
  const assetHints = detectAssetHints(contentRows);
  const missingAssetsDetected =
    assetHints.length > 0 && !files.some((f) => f.startsWith("public/") || f.startsWith("assets/"));
  const vercelDeployable = isVercelDeployable(frontend, deps, fileSet);
  const previewStrategy = hasUi
    ? {
        mode: "real-ui-with-mocks" as const,
        reason:
          "Repository appears to include a UI layer. Use real interface files and mock backend responses when needed.",
      }
    : {
        mode: "generated-demo-ui" as const,
        reason:
          "No clear UI implementation detected. Generate a demo dashboard that simulates the repository behavior.",
      };

  const mockResponses = apiEndpoints.slice(0, 6).map((endpoint) => {
    const [method, pathPart] = endpoint.split(" ");
    return {
      endpoint: pathPart ?? endpoint,
      method: method || "GET",
      response: JSON.stringify(
        [
          { id: 1, name: "Sample Item A", status: "active" },
          { id: 2, name: "Sample Item B", status: "pending" },
        ],
        null,
        2,
      ),
    };
  });

  const inferredPreview = inferPreviewUrl(
    repositoryUrl,
    deploymentUrl,
    scan.packageJson,
    contentRows,
    files,
  );

  return {
    repository: repositoryUrl,
    previewUrl: inferredPreview.url,
    previewUrlSource: inferredPreview.source,
    vercelDeployable,
    repositoryRef,
    readmeSummary: scan.readmeSummary,
    techStack,
    projectType,
    frontend,
    backend,
    hasUi,
    previewStrategy,
    frameworkSignals,
    folders: scan.folders.slice(0, 20),
    uiComponents: uiComponents.slice(0, 25),
    apiEndpoints: apiEndpoints.slice(0, 25),
    assetSources: assetSources.slice(0, 20),
    assetHints: assetHints.slice(0, 20),
    missingAssetsDetected,
    mockResponses,
    architectureSummary: [
      `Frontend: ${frontend}`,
      `Backend: ${backend}`,
      `Assets: ${assetSources.length ? assetSources[0] : "Unknown"}`,
    ].join(" | "),
    architectureDiagram: [
      "User",
      "Frontend UI",
      "Backend API",
      "Temporary Repo Clone",
      "Repo Analyzer",
      "AI Reasoning Engine",
      "Preview Generator",
      "Mock Backend",
      "Preview Renderer",
    ],
    flowChartMermaid: buildDefaultFlowChart([
      "Paste repository URL",
      "Analyze stack and structure",
      "Choose preview strategy",
      "Deploy to Vercel",
      "Review product insights",
    ]),
    detectedScreens: detectedScreens.slice(0, 12),
    screenPreviews,
    repoVisualAssets,
    userFlows: [
      "Paste repository URL",
      "Analyze codebase and classify stack",
      "Resolve assets via selected strategy",
      "Render preview and inspect architecture",
    ],
    aiNotes: "Analysis complete.",
  };
}

/** Fetch repo from GitHub archive (no git binary required - works on Vercel). */
async function fetchRepoFromGitHub(
  repositoryUrl: string,
  tempRoot: string,
): Promise<{ repositoryRef: string; repoRoot: string }> {
  const repo = parseGithubRepo(repositoryUrl);
  if (!repo) throw new Error("Invalid GitHub repository URL");

  const apiRes = await fetch(`https://api.github.com/repos/${repo.owner}/${repo.repo}`, {
    headers: { Accept: "application/vnd.github.v3+json" },
  });
  if (!apiRes.ok) throw new Error("Repository not found or inaccessible");
  const apiData = (await apiRes.json()) as { default_branch?: string };
  const defaultBranch = apiData.default_branch || "main";

  const archiveUrl = `https://github.com/${repo.owner}/${repo.repo}/archive/${defaultBranch}.zip`;
  const zipRes = await fetch(archiveUrl);
  if (!zipRes.ok) throw new Error("Failed to download repository");

  const buffer = Buffer.from(await zipRes.arrayBuffer());
  const zip = new AdmZip(buffer);
  zip.extractAllTo(tempRoot, true);

  const entries = await readdir(tempRoot);
  const extractedDir = entries.find((e) => !e.startsWith("."));
  const repoRoot = extractedDir ? path.join(tempRoot, extractedDir) : tempRoot;

  return { repositoryRef: defaultBranch, repoRoot };
}

async function enrichWithOpenAI(
  analysis: AnalyzeResponse,
  scan: Awaited<ReturnType<typeof scanRepository>>,
  openaiApiKey?: string,
) {
  const key = openaiApiKey || process.env.OPENAI_API_KEY;
  if (!key && !hasAIConfig()) {
    return {
      ...analysis,
      aiNotes:
        "Heuristic analysis complete. Add an OpenAI or Azure OpenAI API key to generate richer architecture and product behavior explanations.",
    };
  }

  try {
    const prompt = [
      "You are a software repository analysis engine.",
      "Return strict JSON with keys: architectureSummary, userFlows, aiNotes, detectedScreens, flowChartMermaid, previewStrategy.",
      "Keep detectedScreens and userFlows arrays concise (max 6 each).",
      "flowChartMermaid must be valid Mermaid syntax starting with 'flowchart TD'. Keep it compact.",
      "previewStrategy must be an object: { mode, reason }.",
      "mode must be exactly one of: real-ui-with-mocks, generated-demo-ui.",
      "If repository has UI screens/components, prefer real-ui-with-mocks.",
      "Repository signals:",
      JSON.stringify(
        {
          projectType: analysis.projectType,
          frontend: analysis.frontend,
          backend: analysis.backend,
          frameworkSignals: analysis.frameworkSignals,
          folders: analysis.folders,
          apiEndpoints: analysis.apiEndpoints,
          assetSources: analysis.assetSources,
          filesSample: scan.files.slice(0, 120),
        },
        null,
        2,
      ),
    ].join("\n");

    const modelsToTry = [ANALYSIS_MODEL, ...ANALYSIS_FALLBACK_MODELS].filter(
      (model, index, list) => list.indexOf(model) === index,
    );
    const raw = await generateWithFallback(modelsToTry, prompt, key || "");
    const parsed = safeParseJson(raw);

    return {
      ...analysis,
      architectureSummary:
        typeof parsed.architectureSummary === "string"
          ? parsed.architectureSummary
          : analysis.architectureSummary,
      userFlows:
        Array.isArray(parsed.userFlows) && parsed.userFlows.length
          ? parsed.userFlows.slice(0, 6).map(String)
          : analysis.userFlows,
      detectedScreens:
        Array.isArray(parsed.detectedScreens) && parsed.detectedScreens.length
          ? parsed.detectedScreens.slice(0, 12).map(String)
          : analysis.detectedScreens,
      flowChartMermaid:
        typeof parsed.flowChartMermaid === "string" && parsed.flowChartMermaid.includes("flowchart")
          ? parsed.flowChartMermaid
          : buildDefaultFlowChart(
              Array.isArray(parsed.userFlows) && parsed.userFlows.length
                ? parsed.userFlows.slice(0, 6).map(String)
                : analysis.userFlows,
            ),
      previewStrategy: parsePreviewStrategy(parsed.previewStrategy, analysis.previewStrategy),
      aiNotes: typeof parsed.aiNotes === "string" ? parsed.aiNotes : "AI-enriched analysis complete.",
    };
  } catch {
    return {
      ...analysis,
      aiNotes:
        "OpenAI response was unavailable for this run, so GitVision used standard heuristic analysis instead.",
    };
  }
}

function parsePreviewStrategy(
  value: unknown,
  fallback: AnalyzeResponse["previewStrategy"],
): AnalyzeResponse["previewStrategy"] {
  if (!value || typeof value !== "object") {
    return fallback;
  }

  const candidate = value as { mode?: unknown; reason?: unknown };
  const mode =
    candidate.mode === "real-ui-with-mocks" || candidate.mode === "generated-demo-ui"
      ? candidate.mode
      : fallback.mode;
  const reason = typeof candidate.reason === "string" && candidate.reason.trim() ? candidate.reason : fallback.reason;

  return { mode, reason };
}

function buildDefaultFlowChart(flows: string[]) {
  const steps = flows.length ? flows : ["Analyze repository", "Generate product insights", "Provide preview strategy"];
  const labels = steps.map((step, index) => `S${index + 1}[\"${step.replace(/"/g, "'")}\"]`);
  const links = steps
    .slice(0, -1)
    .map((_, index) => `S${index + 1} --> S${index + 2}`);

  return ["flowchart TD", ...labels, ...links].join("\n");
}

async function generateWithFallback(models: string[], prompt: string, apiKey: string) {
  return generateTextWithFallback(apiKey, models, prompt, 1300);
}

function safeParseJson(raw: string): Record<string, unknown> {
  const cleaned = raw
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();

  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function isVercelDeployable(
  frontend: string,
  deps: Record<string, string>,
  files: Set<string>,
): boolean {
  if (frontend === "Next.js") return true;
  if (frontend === "React + Vite" || frontend === "React") return true;
  if (frontend === "Vue") return true;
  if ([...files].some((f) => f.endsWith(".html") && !f.includes("templates"))) return true;
  if (deps["@11ty/eleventy"] || deps.astro || deps.svelte) return true;
  return false;
}

function detectFrontend(
  deps: Record<string, string>,
  files: Set<string>,
  blob: string,
) {
  if (deps.next || files.has("next.config.js") || files.has("next.config.ts")) {
    return "Next.js";
  }
  if (deps.react || deps["react-dom"]) {
    if ([...files].some((f) => f.includes("vite.config"))) {
      return "React + Vite";
    }
    return "React";
  }
  if (deps.vue || [...files].some((f) => f.endsWith(".vue"))) {
    return "Vue";
  }
  if (deps["@angular/core"]) {
    return "Angular";
  }
  if (deps.electron || blob.includes("BrowserWindow")) {
    return "Electron";
  }
  if ([...files].some((f) => f.endsWith(".html") && f.includes("templates"))) {
    return "Server-rendered HTML";
  }
  return "None";
}

function detectBackend(
  deps: Record<string, string>,
  files: Set<string>,
  blob: string,
) {
  if (deps.express || blob.includes("express()")) {
    return "Node + Express";
  }
  if (deps.fastify) {
    return "Node + Fastify";
  }
  if (deps["@nestjs/core"]) {
    return "NestJS";
  }
  if (deps.flask || files.has("app.py")) {
    return "Python Flask";
  }
  if (files.has("manage.py") || deps.django) {
    return "Python Django";
  }
  if (deps.rails || files.has("config/routes.rb")) {
    return "Ruby on Rails";
  }
  if ([...files].some((f) => f.startsWith("app/api/") && f.endsWith("route.ts"))) {
    return "Next.js API Routes";
  }
  return "None";
}

function collectFrameworkSignals(
  deps: Record<string, string>,
  files: Set<string>,
  blob: string,
) {
  const signals = new Set<string>();

  if (deps.react || deps.next) signals.add("React");
  if (deps.next) signals.add("Next.js");
  if (deps.vue) signals.add("Vue");
  if (deps.express || blob.includes("express()")) signals.add("Express");
  if (deps.mongodb || deps.mongoose) signals.add("MongoDB");
  if (deps.pg || deps.prisma) signals.add("Relational Database");
  if (deps["firebase-admin"] || deps.firebase) signals.add("Firebase");
  if (deps.supabase || blob.toLowerCase().includes("supabase")) signals.add("Supabase");
  if ([...files].some((f) => f.includes("tailwind.config"))) signals.add("Tailwind CSS");
  if ([...files].some((f) => f.includes("dockerfile"))) signals.add("Docker");

  return [...signals];
}

function detectApiEndpoints(rows: Array<{ file: string; content: string }>) {
  const endpoints = new Set<string>();
  const routeRegex = /\b(get|post|put|patch|delete)\s*\(\s*["'`](\/[^"'`)]*)["'`]/gi;

  for (const row of rows) {
    if (
      !/\.(tsx?|jsx?|mjs|cjs)$/i.test(row.file) &&
      !row.file.startsWith("app/api/") &&
      !row.file.startsWith("pages/api/")
    ) {
      continue;
    }

    let match: RegExpExecArray | null = routeRegex.exec(row.content);
    while (match) {
      endpoints.add(`${match[1].toUpperCase()} ${match[2]}`);
      match = routeRegex.exec(row.content);
    }

    if (row.file.startsWith("app/api/") && row.file.endsWith("route.ts")) {
      const route = `/${row.file.replace("app/api/", "").replace("/route.ts", "")}`;
      const upper = row.content.toUpperCase();
      const methods = ["GET", "POST", "PUT", "PATCH", "DELETE"].filter((m) =>
        upper.includes(`EXPORT ASYNC FUNCTION ${m}`),
      );
      if (methods.length === 0) {
        endpoints.add(`GET /api${route}`);
      } else {
        for (const method of methods) {
          endpoints.add(`${method} /api${route}`);
        }
      }
    }
  }

  return [...endpoints];
}

function detectUiComponents(rows: Array<{ file: string; content: string }>) {
  const components = new Set<string>();
  const jsxTagRegex = /<([A-Z][A-Za-z0-9]+)/g;

  for (const row of rows) {
    if (!/\.(tsx|jsx|vue)$/i.test(row.file)) {
      continue;
    }

    let match: RegExpExecArray | null = jsxTagRegex.exec(row.content);
    while (match) {
      components.add(match[1]);
      match = jsxTagRegex.exec(row.content);
    }
  }

  return [...components];
}

function detectScreens(files: string[]) {
  const screens = new Set<string>();

  for (const file of files) {
    if (
      /\/(page|index)\.(tsx|jsx|vue|html)$/i.test(file) ||
      /^pages\/.*\.(tsx|jsx)$/i.test(file)
    ) {
      screens.add(file);
    }
  }

  return [...screens];
}

function buildScreenPreviews(
  detectedScreens: string[],
  rows: Array<{ file: string; content: string }>,
) {
  const byFile = new Map(rows.map((row) => [row.file, row.content]));

  return detectedScreens.slice(0, 8).map((file) => {
    const content = byFile.get(file) ?? "";
    const route = toRoutePath(file);
    const headings = extractTextByTag(content, "h1").concat(extractTextByTag(content, "h2")).slice(0, 3);
    const actions = extractButtonLikeActions(content).slice(0, 5);
    const snippet = content
      .split(/\r?\n/)
      .slice(0, 35)
      .join("\n")
      .trim();

    return {
      route,
      file,
      headings,
      actions,
      snippet: snippet || "// Source content unavailable in scan window.",
    };
  });
}

function toRoutePath(file: string) {
  if (file.startsWith("app/")) {
    const route = file
      .replace(/^app\//, "")
      .replace(/\/page\.(tsx|jsx|mdx)$/i, "")
      .replace(/\/index\.(tsx|jsx|mdx)$/i, "");
    return route ? `/${route}` : "/";
  }

  if (file.startsWith("pages/")) {
    const route = file
      .replace(/^pages\//, "")
      .replace(/\.(tsx|jsx|js|ts)$/i, "")
      .replace(/\/index$/i, "");
    return route ? `/${route}` : "/";
  }

  return `/${file.replace(/\.(tsx|jsx|html|vue)$/i, "")}`;
}

function extractTextByTag(content: string, tag: "h1" | "h2") {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi");
  const values: string[] = [];
  let match = regex.exec(content);
  while (match) {
    const text = stripMarkup(match[1]).trim();
    if (text) values.push(text);
    match = regex.exec(content);
  }
  return values;
}

function extractButtonLikeActions(content: string) {
  const results = new Set<string>();
  const buttonRegex = /<(button|a)[^>]*>([\s\S]*?)<\/(button|a)>/gi;
  let match = buttonRegex.exec(content);
  while (match) {
    const text = stripMarkup(match[2]).trim();
    if (text && text.length <= 60) results.add(text);
    match = buttonRegex.exec(content);
  }
  return [...results];
}

function stripMarkup(value: string) {
  return value.replace(/<[^>]+>/g, " ").replace(/\{[^}]+\}/g, " ").replace(/\s+/g, " ");
}

function detectAssetSources(
  rows: Array<{ file: string; content: string }>,
  deploymentUrl?: string,
  assetBaseUrl?: string,
) {
  const sources = new Set<string>();
  if (deploymentUrl) sources.add(`Deployment URL: ${deploymentUrl}`);
  if (assetBaseUrl) sources.add(`Asset base URL: ${assetBaseUrl}`);

  for (const row of rows) {
    if (/https?:\/\/[^"'\s]+\.(png|jpg|jpeg|svg|gif|webp)/gi.test(row.content)) {
      sources.add("External image links in source");
    }
    if (/process\.env\.[A-Z0-9_]*(CDN|ASSET|IMAGE|MEDIA|STORAGE)[A-Z0-9_]*/gi.test(row.content)) {
      sources.add("Environment variable based assets");
    }
    if (/cloudinary|supabase|firebase|s3\.amazonaws|cdn\./gi.test(row.content)) {
      sources.add("Cloud storage / CDN references");
    }
  }

  if (sources.size === 0) {
    sources.add("Local repository files");
  }

  return [...sources];
}

function detectAssetHints(rows: Array<{ file: string; content: string }>) {
  const hints = new Set<string>();

  for (const row of rows) {
    const matches = row.content.match(/process\.env\.[A-Z0-9_]+/g) ?? [];
    for (const match of matches) {
      if (/(CDN|ASSET|IMAGE|MEDIA|STORAGE)/.test(match)) {
        hints.add(match);
      }
    }
  }

  return [...hints];
}

function summarizeReadme(text: string) {
  const cleaned = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#>*`]/g, " ")
    .replace(/\[(.*?)\]\((.*?)\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.slice(0, 900);
}

function buildTechStack(frontend: string, backend: string, frameworkSignals: string[]) {
  const set = new Set<string>();
  if (frontend && frontend !== "None") set.add(frontend);
  if (backend && backend !== "None") set.add(backend);
  for (const signal of frameworkSignals) set.add(signal);
  return [...set];
}

function inferPreviewUrl(
  repositoryUrl: string,
  deploymentUrl: string | undefined,
  packageJson: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> } | undefined,
  rows: Array<{ file: string; content: string }>,
  files: string[],
) {
  if (deploymentUrl) {
    return { url: deploymentUrl, source: "Provided by user (Deployment URL input)" };
  }

  const homepage = (packageJson as { homepage?: string } | undefined)?.homepage;
  if (homepage && /^https?:\/\//i.test(homepage)) {
    return { url: homepage, source: "Detected from package.json homepage" };
  }

  const readme = rows.find((row) => /readme\.md$/i.test(row.file));
  if (readme) {
    const links = readme.content.match(/https?:\/\/[^\s)"'<>]+/gi) ?? [];
    const preferred = links.find((link) =>
      /(vercel\.app|netlify\.app|pages\.dev|github\.io|onrender\.com|fly\.dev)/i.test(link),
    );
    if (preferred) {
      return { url: preferred, source: "Detected from README deployment link" };
    }
  }

  const gh = parseGithubRepo(repositoryUrl);
  if (gh) {
    const hasPagesSignal =
      files.some((file) => /^\.github\/workflows\/.*pages.*\.ya?ml$/i.test(file)) ||
      rows.some(
        (row) =>
          /^\.github\/workflows\//i.test(row.file) &&
          /(pages|actions\/deploy-pages|peaceiris\/actions-gh-pages)/i.test(row.content),
      );

    if (hasPagesSignal) {
      return {
        url: `https://${gh.owner}.github.io/${gh.repo}`,
        source: "Inferred from GitHub Pages workflow",
      };
    }
  }

  const vercelProjectSignal = files.some((file) => /(^|\/)vercel\.json$/i.test(file));
  if (vercelProjectSignal && gh) {
    return {
      url: `https://${gh.repo}.vercel.app`,
      source: "Inferred probable Vercel URL from vercel.json (best guess)",
    };
  }

  return { url: undefined, source: "No reliable deployment URL found in repository files" };
}

function buildRepoAssetUrls(repositoryUrl: string, repositoryRef: string, files: string[]) {
  const repo = parseGithubRepo(repositoryUrl);
  if (!repo) return [];

  const imageFiles = files
    .filter((file) => /\.(png|jpe?g|gif|webp|svg)$/i.test(file))
    .filter((file) => !/(^|\/)(node_modules|dist|build)\//i.test(file))
    .slice(0, 16);

  return imageFiles.map((file) => ({
    file,
    url: `https://raw.githubusercontent.com/${repo.owner}/${repo.repo}/${repositoryRef}/${file}`,
  }));
}
