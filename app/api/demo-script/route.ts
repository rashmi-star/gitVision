import { NextResponse } from "next/server";
import { z } from "zod";
import { generateTextWithFallback } from "@/lib/openai";

const schema = z.object({
  repository: z.string(),
  summary: z.string(),
  userFlows: z.array(z.string()),
  projectType: z.string().optional(),
  frontend: z.string().optional(),
  backend: z.string().optional(),
  readmeSummary: z.string().optional(),
  techStack: z.array(z.string()).optional(),
  detectedScreens: z.array(z.string()).optional(),
  apiEndpoints: z.array(z.string()).optional(),
  uiComponents: z.array(z.string()).optional(),
  openaiApiKey: z.string().optional(),
  geminiApiKey: z.string().optional(),
});
const DEMO_SCRIPT_MODEL = process.env.OPENAI_DEMO_MODEL || "gpt-4.1-mini";
const DEMO_SCRIPT_FALLBACK_MODEL = process.env.OPENAI_DEMO_FALLBACK_MODEL || "gpt-4o-mini";

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const key = parsed.data.openaiApiKey || parsed.data.geminiApiKey || process.env.OPENAI_API_KEY;
  if (!key) {
    return NextResponse.json({
      scenes: [
        "SCENE 1: Product summary. Audio: 'Repository overview and purpose.'",
        "SCENE 2: Key screen. Audio: 'Primary user interface.'",
        "SCENE 3: Additional screen. Audio: 'Supporting screens and flows.'",
        "SCENE 4: Architecture. Audio: 'Tech stack and structure.'",
        "SCENE 5: Try it. Audio: 'Explore the repo.'",
      ],
      sceneTypes: ["summary", "screen", "screen", "architecture", "cta"],
      note: "Set OPENAI_API_KEY for AI-generated script.",
    });
  }

  try {
    const context = {
      repository: parsed.data.repository,
      projectType: parsed.data.projectType ?? "Unknown",
      frontend: parsed.data.frontend ?? "Unknown",
      backend: parsed.data.backend ?? "Unknown",
      summary: parsed.data.summary,
      readmeSummary: parsed.data.readmeSummary ?? "Unavailable",
      techStack: parsed.data.techStack ?? [],
      flows: parsed.data.userFlows,
      screens: parsed.data.detectedScreens ?? [],
      endpoints: parsed.data.apiEndpoints ?? [],
      uiComponents: parsed.data.uiComponents ?? [],
    };

    const prompt = [
      "Create exactly 5 scenes for a Remotion demo video. Return strict JSON: {\"scenes\": string[], \"sceneTypes\": string[]}.",
      "sceneTypes: for each scene use exactly one of: summary, screen, architecture, cta. AI picks best fit for the repo.",
      "Scene 1: summary. Scene 2-3: screen (or summary if no screens). Scene 4: architecture. Scene 5: cta.",
      "Each scene: SCENE X: <short headline, max 8 words>. Audio: '<voiceover>'. Headlines brief.",
      "Do not mention GitVision. Focus on the repository.",
      `Repository context JSON:\n${JSON.stringify(context, null, 2)}`,
    ].join("\n");

    const data = await generateScenesWithRetry(key, prompt);
    const candidateScenes =
      Array.isArray(data.scenes) && data.scenes.length ? data.scenes.slice(0, 5) : [];
    const scenes = isRepoGrounded(candidateScenes)
      ? candidateScenes
      : buildRepoGroundedFallback(context);
    const sceneTypes = (Array.isArray(data.sceneTypes) ? data.sceneTypes : []).slice(0, 5);
    const validTypes = ["summary", "screen", "architecture", "cta"] as const;
    const types = scenes.map((_, i) =>
      validTypes.includes(sceneTypes[i] as (typeof validTypes)[number])
        ? (sceneTypes[i] as (typeof validTypes)[number])
        : (["summary", "screen", "screen", "architecture", "cta"] as const)[i]
    );

    return NextResponse.json({
      scenes,
      sceneTypes: types,
    });
  } catch {
    const fallbackContext = {
      repository: parsed.data.repository,
      projectType: parsed.data.projectType ?? "Unknown",
      frontend: parsed.data.frontend ?? "Unknown",
      backend: parsed.data.backend ?? "Unknown",
      summary: parsed.data.summary,
      readmeSummary: parsed.data.readmeSummary ?? "Unavailable",
      techStack: parsed.data.techStack ?? [],
      flows: parsed.data.userFlows,
      screens: parsed.data.detectedScreens ?? [],
      endpoints: parsed.data.apiEndpoints ?? [],
      uiComponents: parsed.data.uiComponents ?? [],
    };
    const fallbackScenes = buildRepoGroundedFallback(fallbackContext);
    return NextResponse.json({
      scenes: fallbackScenes,
      sceneTypes: ["summary", "screen", "screen", "architecture", "cta"] as const,
      note: "OpenAI request failed. Fallback script returned.",
    });
  }
}

async function generateScenesWithRetry(apiKey: string, basePrompt: string) {
  let raw = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const prompt =
      attempt === 0
        ? basePrompt
        : `${basePrompt}\nPrevious output was too generic. Regenerate with explicit repository details only.`;
    raw = await generateTextWithFallback(apiKey, [DEMO_SCRIPT_MODEL, DEMO_SCRIPT_FALLBACK_MODEL], prompt, 1100);
    raw = raw.replace(/```json|```/gi, "").trim();
    try {
      const parsed = JSON.parse(raw) as { scenes?: string[]; sceneTypes?: string[] };
      if (Array.isArray(parsed.scenes) && parsed.scenes.length > 0) {
        return parsed;
      }
    } catch {
      // Retry with stricter instruction.
    }
  }
  throw new Error(`Invalid scene JSON from model: ${raw.slice(0, 300)}`);
}

function isRepoGrounded(scenes: string[]) {
  if (scenes.length === 0) return false;
  const blob = scenes.join(" ").toLowerCase();
  const forbidden = ["product vision", "analyzer", "preview tool", "our app"];
  if (forbidden.some((x) => blob.includes(x))) return false;
  return true;
}

function buildRepoGroundedFallback(context: {
  repository: string;
  projectType: string;
  frontend: string;
  backend: string;
  summary: string;
  readmeSummary: string;
  techStack: string[];
  flows: string[];
  screens: string[];
  endpoints: string[];
  uiComponents: string[];
}) {
  const stack = [context.frontend, context.backend, ...context.techStack]
    .filter((x) => x && x !== "Unknown" && x !== "None")
    .slice(0, 4)
    .join(", ");
  const screen = context.screens[0] || "primary interface";
  const endpoint = context.endpoints[0] || "core API endpoint";
  const flow = context.flows[0] || "main user workflow";
  const summary = (context.readmeSummary || context.summary).slice(0, 180);

  const screen2 = context.screens[1] || context.screens[0] || "main interface";
  return [
    `SCENE 1: Product summary card with repo name and purpose. Audio: '${summary}'.`,
    `SCENE 2: Visual of ${screen} with key UI elements. Audio: 'This screen shows the primary user flow.'`,
    `SCENE 3: Visual of ${screen2} with navigation. Audio: 'Additional screens support the full experience.'`,
    `SCENE 4: Architecture diagram with ${stack || "tech stack"}. Audio: 'Built with ${stack || "modern technologies"}.'`,
    `SCENE 5: CTA - Try it, explore the repo. Audio: 'Explore the repository and see it in action.'`,
  ];
}
