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
        "Scene 1: Intro card with repository URL.",
        "Scene 2: Analyzer identifies stack and APIs.",
        "Scene 3: Preview renders UI with mock backend.",
        "Scene 4: Architecture summary and final callout.",
      ],
      note: "Set OPENAI_API_KEY (or provide key in the form) for AI-generated script text.",
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
      "Create a concise 4-scene demo video script about WHAT THE REPOSITORY SOFTWARE DOES.",
      "Return strict JSON only: {\"scenes\": string[]}.",
      "Each scene must follow this format: SCENE X: <visual>. Audio: '<voiceover>'.",
      "Do not mention GitVision, analyzer, preview tool, or prompt/system details.",
      "Do not describe 'this app' unless the repository itself is that app.",
      "Ground scenes in repository use case and tech stack from README/code signals.",
      "At least 2 scenes must mention concrete stack elements or endpoints/screens from provided context.",
      `Repository context JSON:\n${JSON.stringify(context, null, 2)}`,
    ].join("\n");

    const data = await generateScenesWithRetry(key, prompt);
    const candidateScenes =
      Array.isArray(data.scenes) && data.scenes.length ? data.scenes.slice(0, 6) : [];
    const scenes = isRepoGrounded(candidateScenes)
      ? candidateScenes
      : buildRepoGroundedFallback(context);

    return NextResponse.json({
      scenes,
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
    return NextResponse.json({
      scenes: buildRepoGroundedFallback(fallbackContext),
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
      const parsed = JSON.parse(raw) as { scenes?: string[] };
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

  return [
    `SCENE 1: Open repository ${context.repository} and highlight the ${context.projectType} purpose from README. Audio: '${summary}'.`,
    `SCENE 2: Navigate to ${screen} and show key UI behavior tied to ${flow}. Audio: 'This screen demonstrates the repository's main use case from the codebase.'`,
    `SCENE 3: Inspect runtime stack and code modules using ${stack || "detected stack signals"}. Audio: 'The implementation combines these technologies to deliver the core experience.'`,
    `SCENE 4: Trigger ${endpoint} and display expected result flow in the app. Audio: 'This endpoint interaction shows how data moves through the repository system.'`,
  ];
}
