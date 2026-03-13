"use client";

import Image from "next/image";
import dynamic from "next/dynamic";
import { type ReactNode, useMemo, useState } from "react";
import { ArrowUp, ExternalLink, Link2, Loader2, Plus, Search, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AnalyzeResponse } from "@/lib/types";

const DemoVideoPlayer = dynamic(() => import("@/components/demo-video-player").then((m) => ({ default: m.DemoVideoPlayer })), {
  ssr: false,
  loading: () => <div className="aspect-video w-full animate-pulse rounded-xl bg-white/10" />,
});

type DemoScriptResponse = {
  scenes: string[];
  sceneTypes?: string[];
};

type UrlHistoryItem = {
  id: string;
  url: string;
};

export default function Home() {
  const [repositoryUrl, setRepositoryUrl] = useState("");
  const [submittedUrl, setSubmittedUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [demoScript, setDemoScript] = useState<DemoScriptResponse | null>(null);
  const [loadingScript, setLoadingScript] = useState(false);
  const [urlHistory, setUrlHistory] = useState<UrlHistoryItem[]>([]);
  const [activeHistoryId, setActiveHistoryId] = useState<string | null>(null);
  const [composerLocked, setComposerLocked] = useState(false);
  const [vercelDeployment, setVercelDeployment] = useState<{ url: string; status: string } | null>(null);
  const [vercelDeployLoading, setVercelDeployLoading] = useState(false);

  const previewLink = vercelDeployment?.url?.trim() || result?.previewUrl?.trim() || "";
  const hasConversation = Boolean(submittedUrl || result || isLoading || error);

  const mermaidSvgUrl = useMemo(() => {
    if (!result?.flowChartMermaid) return "";
    return `https://mermaid.ink/svg/${toBase64Url(result.flowChartMermaid)}`;
  }, [result]);

  async function analyzeRepository() {
    if (!repositoryUrl.trim()) return;
    const trimmedUrl = repositoryUrl.trim();
    const historyId = `${Date.now()}-${trimmedUrl}`;

    setIsLoading(true);
    setError("");
    setResult(null);
    setDemoScript(null);
    setVercelDeployment(null);
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
          deployToVercel: true,
        }),
      });
      const body = (await response.json()) as AnalyzeResponse & { error?: string };
      if (!response.ok) throw new Error(body.error || "Unable to analyze repository.");
      setResult(body);
      if (body.vercelDeployment) {
        setVercelDeployment({ url: body.vercelDeployment.url, status: body.vercelDeployment.status });
      }
    } catch (analysisError) {
      setError(analysisError instanceof Error ? analysisError.message : "Analysis failed.");
    } finally {
      setIsLoading(false);
    }
  }

  async function deployToVercel() {
    const repoUrl = submittedUrl || repositoryUrl;
    if (!repoUrl || !result?.vercelDeployable) return;
    setVercelDeployLoading(true);
    setVercelDeployment(null);
    try {
      const response = await fetch("/api/deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repositoryUrl: repoUrl,
          ref: result.repositoryRef || "main",
        }),
      });
      const body = (await response.json()) as { url?: string; status?: string; error?: string };
      if (!response.ok) throw new Error(body.error || "Vercel deployment failed");
      if (body.url) {
        setVercelDeployment({ url: body.url, status: body.status ?? "BUILDING" });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Vercel deployment failed");
    } finally {
      setVercelDeployLoading(false);
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
              setResult(null);
              setError("");
              setDemoScript(null);
              setVercelDeployment(null);
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

        <div className="flex-1 overflow-y-auto px-4 pb-24 pt-4 md:px-10">
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
                        {result.vercelDeployable ? (
                          <Badge variant="secondary" className="border-green-700/50 text-green-500">
                            Vercel deployable
                          </Badge>
                        ) : null}
                      </div>
                    </div>
                  </AssistantBubble>

                  <AssistantBubble>
                    <p className="mb-2 text-sm font-medium text-slate-100">Product Summary</p>
                    <p className="text-sm text-slate-300">{result.aiNotes}</p>
                    <div className="mt-2 space-y-1 text-sm text-slate-400">
                      <p>
                        <a href={result.repository} target="_blank" rel="noopener noreferrer" className="text-blue-400 underline">
                          {result.repository}
                        </a>
                      </p>
                      {previewLink ? (
                        <a href={previewLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-blue-400 underline">
                          <Link2 className="size-4" />
                          {previewLink}
                        </a>
                      ) : null}
                    </div>
                    {result.vercelDeployable && !previewLink ? (
                      <Button onClick={deployToVercel} disabled={vercelDeployLoading} className="mt-2 gap-2">
                        {vercelDeployLoading ? <><Loader2 className="size-4 animate-spin" />Deploying...</> : <><ExternalLink className="size-4" />Deploy to Vercel</>}
                      </Button>
                    ) : null}
                  </AssistantBubble>

                  <AssistantBubble>
                    <p className="mb-2 text-sm font-medium text-slate-100">Architecture</p>
                    <p className="text-sm text-slate-300">{result.architectureSummary}</p>
                    {mermaidSvgUrl ? (
                      <div className="mt-3 overflow-hidden rounded-xl border border-white/10 bg-white p-2">
                        <Image src={mermaidSvgUrl} alt="Flowchart" width={1200} height={700} className="h-auto w-full" unoptimized />
                      </div>
                    ) : null}
                  </AssistantBubble>

                  <AssistantBubble>
                    <p className="mb-2 text-sm font-medium text-slate-100">Screens</p>
                    <CompactList title="Detected" items={result.detectedScreens} />
                  </AssistantBubble>

                  <AssistantBubble>
                    <p className="mb-2 text-sm font-medium text-slate-100">Demo Video</p>
                    <Button variant="secondary" onClick={generateDemoScript} disabled={loadingScript} className="mb-3">
                      {loadingScript ? <Loader2 className="size-4 animate-spin" /> : null}
                      {loadingScript ? "Generating..." : "Generate demo video"}
                    </Button>
                    {demoScript?.scenes?.length ? (
                      <div className="overflow-hidden rounded-xl border border-white/10">
                        <DemoVideoPlayer scenes={demoScript.scenes} />
                      </div>
                    ) : null}
                  </AssistantBubble>
                </>
              ) : null}
            </div>
          )}
        </div>

        <form
          className="absolute inset-x-0 bottom-0 px-4 pb-4 md:px-10"
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
            <div className="mx-auto flex w-full max-w-3xl items-center gap-2 rounded-2xl border border-white/15 bg-white px-3 py-2">
              <Input
                placeholder="Paste GitHub repository URL..."
                value={repositoryUrl}
                onChange={(event) => setRepositoryUrl(event.target.value)}
                className="min-h-0 flex-1 border-0 bg-transparent py-2 text-black placeholder:text-slate-500 focus-visible:ring-0"
                disabled={composerLocked || isLoading}
              />
              <Button
                size="sm"
                className="h-9 w-9 shrink-0 rounded-full p-0"
                disabled={!repositoryUrl || isLoading || composerLocked}
              >
                {isLoading ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
              </Button>
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
