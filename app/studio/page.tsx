"use client";

import Image from "next/image";
import { type ReactNode, useMemo, useState } from "react";
import { ArrowUp, Link2, Loader2, Plus, Search, Square, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AnalyzeResponse } from "@/lib/types";

type DemoScriptResponse = {
  scenes: string[];
};

type SandboxSession = {
  id: string;
  status: "starting" | "running" | "failed" | "stopped";
  logs: string[];
  error?: string;
  previewUrl?: string;
};

type UrlHistoryItem = {
  id: string;
  url: string;
};

const ASSET_OPTIONS = ["Smart mock assets", "Placeholders", "Upload assets", "Deployed URL", "Asset base URL"];

export default function Home() {
  const [repositoryUrl, setRepositoryUrl] = useState("");
  const [submittedUrl, setSubmittedUrl] = useState("");
  const [deploymentUrl, setDeploymentUrl] = useState("");
  const [assetBaseUrl, setAssetBaseUrl] = useState("");
  const [openaiApiKey, setOpenaiApiKey] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [assetChoice, setAssetChoice] = useState(ASSET_OPTIONS[0]);
  const [demoScript, setDemoScript] = useState<DemoScriptResponse | null>(null);
  const [loadingScript, setLoadingScript] = useState(false);
  const [sandboxSession, setSandboxSession] = useState<SandboxSession | null>(null);
  const [sandboxLoading, setSandboxLoading] = useState(false);
  const [sandboxStopping, setSandboxStopping] = useState(false);
  const [urlHistory, setUrlHistory] = useState<UrlHistoryItem[]>([]);
  const [activeHistoryId, setActiveHistoryId] = useState<string | null>(null);
  const [composerLocked, setComposerLocked] = useState(false);

  const previewLink = sandboxSession?.previewUrl?.trim() || result?.previewUrl?.trim() || "";
  const hasConversation = Boolean(submittedUrl || result || isLoading || error);

  const previewTitle = useMemo(() => {
    if (!result) return "";
    return result.previewStrategy.mode === "real-ui-with-mocks"
      ? "Real UI preview with mocked backend"
      : "Generated demo interface";
  }, [result]);
  const mermaidSvgUrl = useMemo(() => {
    if (!result?.flowChartMermaid) return "";
    return `https://mermaid.ink/svg/${toBase64Url(result.flowChartMermaid)}`;
  }, [result]);

  async function pollSandboxSession(sessionId: string) {
    for (let attempt = 0; attempt < 60; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const response = await fetch(`/api/run-repo?sessionId=${encodeURIComponent(sessionId)}`);
      const body = (await response.json()) as { session?: SandboxSession };
      if (!body.session) continue;
      setSandboxSession(body.session);
      if (body.session.status === "running" || body.session.status === "failed" || body.session.status === "stopped") {
        break;
      }
    }
  }

  async function startSandboxForUrl(repoUrl: string) {
    if (!repoUrl) return;
    setSandboxLoading(true);
    try {
      const response = await fetch("/api/run-repo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repositoryUrl: repoUrl, openaiApiKey }),
      });
      const body = (await response.json()) as { session?: SandboxSession; error?: string };
      if (!response.ok) throw new Error(body.error || "Sandbox run failed.");
      if (body.session) {
        setSandboxSession(body.session);
        if (body.session.status === "starting") {
          void pollSandboxSession(body.session.id);
        }
      }
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "Sandbox run failed.");
    } finally {
      setSandboxLoading(false);
    }
  }

  async function analyzeRepository() {
    if (!repositoryUrl.trim()) return;
    const trimmedUrl = repositoryUrl.trim();
    const historyId = `${Date.now()}-${trimmedUrl}`;

    setIsLoading(true);
    setError("");
    setResult(null);
    setDemoScript(null);
    setSandboxSession(null);
    setSubmittedUrl(trimmedUrl);
    setActiveHistoryId(historyId);
    setComposerLocked(true);
    setRepositoryUrl("");
    setUrlHistory((current) => [{ id: historyId, url: trimmedUrl }, ...current]);

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repositoryUrl: trimmedUrl,
          deploymentUrl,
          assetBaseUrl,
          openaiApiKey,
        }),
      });
      const body = (await response.json()) as AnalyzeResponse & { error?: string };
      if (!response.ok) throw new Error(body.error || "Unable to analyze repository.");
      setResult(body);
      await startSandboxForUrl(trimmedUrl);
    } catch (analysisError) {
      setError(analysisError instanceof Error ? analysisError.message : "Analysis failed.");
    } finally {
      setIsLoading(false);
    }
  }

  async function runSandboxPreview() {
    await startSandboxForUrl(submittedUrl || repositoryUrl);
  }

  async function stopSandboxPreview() {
    if (!sandboxSession?.id) return;
    setSandboxStopping(true);
    try {
      await fetch("/api/run-repo/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: sandboxSession.id }),
      });
      setSandboxSession((current) => (current ? { ...current, status: "stopped" } : current));
    } finally {
      setSandboxStopping(false);
    }
  }

  async function generateDemoScript() {
    if (!result) return;
    setLoadingScript(true);
    try {
      const response = await fetch("/api/demo-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repository: result.repository,
          summary: result.architectureSummary,
          userFlows: result.userFlows,
          projectType: result.projectType,
          frontend: result.frontend,
          backend: result.backend,
          readmeSummary: result.readmeSummary,
          techStack: result.techStack,
          detectedScreens: result.detectedScreens,
          apiEndpoints: result.apiEndpoints,
          uiComponents: result.uiComponents,
          openaiApiKey,
        }),
      });
      const body = (await response.json()) as DemoScriptResponse;
      setDemoScript(body);
    } finally {
      setLoadingScript(false);
    }
  }

  return (
    <main className="flex h-screen w-full bg-[#1f1f1f] text-slate-100">
      <aside className="hidden w-64 flex-col border-r border-white/10 bg-[#171717] md:flex">
        <div className="p-3">
          <button
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-white/10"
            onClick={() => {
              setSubmittedUrl("");
              setRepositoryUrl("");
              setDeploymentUrl("");
              setAssetBaseUrl("");
              setOpenaiApiKey("");
              setResult(null);
              setError("");
              setDemoScript(null);
              setSandboxSession(null);
              setComposerLocked(false);
            }}
          >
            <Plus className="size-4" />
            New chat
          </button>
          <button className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-white/10">
            <Search className="size-4" />
            Search chats
          </button>
        </div>

        <div className="border-t border-white/10 px-3 py-2">
          <p className="text-xs text-slate-400">Your chats</p>
        </div>
        <div className="flex-1 space-y-1 overflow-y-auto px-2 pb-3">
          {urlHistory.length === 0 ? (
            <p className="px-2 py-2 text-xs text-slate-500">No URLs yet.</p>
          ) : (
            urlHistory.map((item) => (
              <button
                key={item.id}
                className={`w-full truncate rounded-lg px-3 py-2 text-left text-xs transition ${
                  activeHistoryId === item.id ? "bg-white/15" : "hover:bg-white/10"
                }`}
                onClick={() => {
                  setActiveHistoryId(item.id);
                  setRepositoryUrl(item.url);
                  setSubmittedUrl(item.url);
                }}
              >
                {item.url}
              </button>
            ))
          )}
        </div>
      </aside>

      <section className="relative flex min-w-0 flex-1 flex-col">
        <div className="flex h-14 items-center px-5 text-sm text-slate-300">GitVision Auto</div>

        <div className="flex-1 overflow-y-auto px-4 pb-40 pt-4 md:px-10">
          {!hasConversation ? (
            <div className="flex h-full items-center justify-center">
              <h2 className="text-4xl font-medium tracking-tight text-slate-200">How can I help?</h2>
            </div>
          ) : (
            <div className="mx-auto w-full max-w-3xl space-y-4">
              {submittedUrl ? <UserBubble>{submittedUrl}</UserBubble> : null}

              {isLoading ? (
                <AssistantBubble>
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="size-4 animate-spin" />
                    Analyzing repository...
                  </span>
                </AssistantBubble>
              ) : null}

              {error ? <AssistantBubble tone="error">{error}</AssistantBubble> : null}

              {result ? (
                <>
                  <AssistantBubble>
                    <div className="space-y-3">
                      <div className="inline-flex items-center gap-2 text-slate-200">
                        <Sparkles className="size-4" />
                        <span className="font-medium">Analysis complete</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="secondary">Type: {result.projectType}</Badge>
                        <Badge variant="secondary">Frontend: {result.frontend}</Badge>
                      </div>
                      <p className="text-sm text-slate-300">{result.aiNotes}</p>
                    </div>
                  </AssistantBubble>

                  <AssistantBubble>
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-slate-100">Preview strategy</p>
                      <p className="text-sm text-slate-300">{previewTitle}</p>
                      <p className="text-sm text-slate-400">{result.previewStrategy.reason}</p>
                      {previewLink ? (
                        <a
                          href={previewLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 text-sm text-blue-400 underline"
                        >
                          <Link2 className="size-4" />
                          {previewLink}
                        </a>
                      ) : null}
                      <div className="flex flex-wrap gap-2 pt-1">
                        <Button onClick={runSandboxPreview} disabled={!repositoryUrl || sandboxLoading}>
                          {sandboxLoading ? "Running..." : "Run in sandbox"}
                        </Button>
                        {sandboxSession ? (
                          <Button variant="outline" onClick={stopSandboxPreview} disabled={sandboxStopping}>
                            <Square className="size-4" />
                            {sandboxStopping ? "Stopping..." : "Stop"}
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </AssistantBubble>

                  {sandboxSession ? (
                    <AssistantBubble>
                      <p className="text-sm text-slate-300">
                        Sandbox status: {sandboxSession.status}
                        {sandboxSession.error ? ` | ${sandboxSession.error}` : ""}
                      </p>
                      <details className="mt-2">
                        <summary className="cursor-pointer text-sm text-slate-400">Runtime logs</summary>
                        <pre className="mt-2 max-h-60 overflow-auto rounded-md bg-black/50 p-3 text-xs text-slate-200">
                          {(sandboxSession.logs || []).slice(-80).join("\n")}
                        </pre>
                      </details>
                    </AssistantBubble>
                  ) : null}

                  <AssistantBubble>
                    <p className="mb-2 text-sm font-medium text-slate-100">Detected screens</p>
                    <CompactList title="Screens" items={result.detectedScreens} />
                  </AssistantBubble>

                  <AssistantBubble>
                    <p className="mb-2 text-sm font-medium text-slate-100">Asset resolution mode</p>
                    <div className="flex flex-wrap gap-2">
                      {ASSET_OPTIONS.map((option) => (
                        <button
                          key={option}
                          className={`rounded-full border px-3 py-1 text-xs transition ${
                            assetChoice === option
                              ? "border-white/60 bg-white/15 text-white"
                              : "border-white/20 text-slate-300"
                          }`}
                          onClick={() => setAssetChoice(option)}
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                  </AssistantBubble>

                  <AssistantBubble>
                    <p className="mb-2 text-sm font-medium text-slate-100">Architecture summary</p>
                    <p className="text-sm text-slate-300">{result.architectureSummary}</p>
                    {mermaidSvgUrl ? (
                      <div className="mt-3 overflow-hidden rounded-xl border border-white/10 bg-white p-2">
                        <Image
                          src={mermaidSvgUrl}
                          alt="Flowchart"
                          width={1200}
                          height={700}
                          className="h-auto w-full"
                          unoptimized
                        />
                      </div>
                    ) : null}
                  </AssistantBubble>

                  <AssistantBubble>
                    <Button variant="secondary" onClick={generateDemoScript} disabled={loadingScript}>
                      {loadingScript ? <Loader2 className="size-4 animate-spin" /> : null}
                      {loadingScript ? "Generating script..." : "Generate demo script"}
                    </Button>
                    {demoScript?.scenes?.length ? (
                      <div className="mt-3 space-y-2">
                        {demoScript.scenes.slice(0, 6).map((scene) => (
                          <p key={scene} className="text-sm text-slate-300">
                            {scene}
                          </p>
                        ))}
                      </div>
                    ) : null}
                  </AssistantBubble>
                </>
              ) : null}
            </div>
          )}
        </div>

        <form
          className="absolute inset-x-0 bottom-0 px-4 pb-6 md:px-10"
          onSubmit={(event) => {
            event.preventDefault();
            void analyzeRepository();
          }}
        >
          {composerLocked ? (
            <div className="mx-auto flex w-full max-w-3xl items-center justify-between rounded-2xl border border-white/15 bg-[#2a2a2a] px-4 py-3 text-sm text-slate-300">
              <span>Message sent. Start a new chat to analyze another repository.</span>
              <Button
                size="sm"
                variant="outline"
                type="button"
                onClick={() => {
                  setComposerLocked(false);
                  setRepositoryUrl("");
                }}
              >
                New chat
              </Button>
            </div>
          ) : (
            <div className="mx-auto w-full max-w-3xl rounded-3xl border border-white/15 bg-white p-3">
              <Input
                placeholder="Paste GitHub repository URL..."
                value={repositoryUrl}
                onChange={(event) => setRepositoryUrl(event.target.value)}
                className="border-0 bg-transparent text-black placeholder:text-slate-500 focus-visible:ring-0"
                disabled={composerLocked || isLoading}
              />
              <details className="mt-2 rounded-lg border border-white/10 p-2">
                <summary className="cursor-pointer text-xs text-slate-400">Advanced options</summary>
                <div className="mt-2 space-y-2">
                  <Input
                    placeholder="Deployment URL"
                    value={deploymentUrl}
                    onChange={(event) => setDeploymentUrl(event.target.value)}
                    className="border-slate-200 bg-white text-black placeholder:text-slate-500"
                    disabled={composerLocked || isLoading}
                  />
                  <Input
                    placeholder="Asset Base URL"
                    value={assetBaseUrl}
                    onChange={(event) => setAssetBaseUrl(event.target.value)}
                    className="border-slate-200 bg-white text-black placeholder:text-slate-500"
                    disabled={composerLocked || isLoading}
                  />
                  <Input
                    type="password"
                    placeholder="OpenAI API Key"
                    value={openaiApiKey}
                    onChange={(event) => setOpenaiApiKey(event.target.value)}
                    className="border-slate-200 bg-white text-black placeholder:text-slate-500"
                    disabled={composerLocked || isLoading}
                  />
                </div>
              </details>
              <div className="mt-2 flex justify-end">
                <Button
                  size="sm"
                  className="h-9 w-9 shrink-0 rounded-full p-0"
                  disabled={!repositoryUrl || isLoading || composerLocked}
                >
                  {isLoading ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
                </Button>
              </div>
            </div>
          )}
        </form>
      </section>
    </main>
  );
}

function toBase64Url(input: string) {
  const bytes = new TextEncoder().encode(input);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  const base64 = btoa(binary);
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function AssistantBubble({ children, tone = "normal" }: { children: ReactNode; tone?: "normal" | "error" }) {
  return (
    <div
      className={`rounded-2xl border p-4 ${
        tone === "error" ? "border-red-500/40 bg-red-500/10 text-red-200" : "border-white/10 bg-[#242424]"
      }`}
    >
      {children}
    </div>
  );
}

function UserBubble({ children }: { children: ReactNode }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[90%] rounded-2xl border border-white/20 bg-[#2e2e2e] px-4 py-3 text-sm">{children}</div>
    </div>
  );
}

function CompactList({ title, items }: { title: string; items: unknown[] }) {
  const normalized = items
    .map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object") {
        const value = item as Record<string, unknown>;
        if (typeof value.route === "string") return value.route;
        if (typeof value.file === "string") return value.file;
        if (typeof value.name === "string") return value.name;
        return JSON.stringify(value);
      }
      return String(item);
    })
    .filter((value) => value && value !== "undefined");

  return (
    <div className="mb-2">
      <p className="mb-1 text-xs uppercase tracking-wide text-slate-500">{title}</p>
      {normalized.length ? (
        <div className="flex flex-wrap gap-1.5">
          {normalized.slice(0, 12).map((item, index) => (
            <Badge key={`${title}-${index}-${item}`} variant="outline">
              {item}
            </Badge>
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate-500">No items detected.</p>
      )}
    </div>
  );
}
