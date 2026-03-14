"use client";

import Image from "next/image";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { ArrowUp, ExternalLink, GitBranch, Layout, Link2, Loader2, Search, Sparkles, Video } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { AnalyzeResponse } from "@/lib/types";

const DemoVideoPlayer = dynamic(() => import("@/components/demo-video-player").then((m) => ({ default: m.DemoVideoPlayer })), {
  ssr: false,
  loading: () => <div className="aspect-video w-full animate-pulse rounded-lg bg-white/10" />,
});

type DemoScriptResponse = {
  scenes: string[];
  sceneTypes?: string[];
};

export default function StudioPage() {
  const [repositoryUrl, setRepositoryUrl] = useState("");
  const [submittedUrl, setSubmittedUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [demoScript, setDemoScript] = useState<DemoScriptResponse | null>(null);
  const [loadingScript, setLoadingScript] = useState(false);
  const [vercelDeployment, setVercelDeployment] = useState<{ url: string; status: string } | null>(null);
  const [vercelDeployLoading, setVercelDeployLoading] = useState(false);

  const previewLink = vercelDeployment?.url?.trim() || result?.previewUrl?.trim() || "";
  const hasResult = Boolean(result);

  const mermaidSvgUrl = useMemo(() => {
    if (!result?.flowChartMermaid) return "";
    return `https://mermaid.ink/svg/${toBase64Url(result.flowChartMermaid)}`;
  }, [result]);

  async function analyzeRepository() {
    if (!repositoryUrl.trim()) return;
    const trimmedUrl = repositoryUrl.trim();

    setIsLoading(true);
    setError("");
    setResult(null);
    setDemoScript(null);
    setVercelDeployment(null);
    setSubmittedUrl(trimmedUrl);
    setRepositoryUrl("");

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
        setVercelDeployment({ url: body.url, status: body.status ?? "READY" });
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

  function startNew() {
    setSubmittedUrl("");
    setRepositoryUrl("");
    setResult(null);
    setError("");
    setDemoScript(null);
    setVercelDeployment(null);
  }

  return (
    <main className="flex h-screen w-full overflow-hidden bg-[#0c0c0c] text-slate-100">
      {/* Main content */}
      <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Header */}
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-white/5 bg-[#080808]/90 px-6 py-4 backdrop-blur-xl">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-indigo-500/20 p-1.5">
              <Sparkles className="size-4 text-indigo-400" />
            </div>
            <h1 className="text-lg font-semibold tracking-tight text-slate-200">GitVision Studio</h1>
          </div>
          <form
            className="flex max-w-xl flex-1 items-center gap-2 md:ml-8"
            onSubmit={(e) => {
              e.preventDefault();
              void analyzeRepository();
            }}
          >
            <div className="group relative flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500 transition-colors duration-200 group-focus-within:text-indigo-400" />
              <Input
                placeholder="Paste GitHub repository URL..."
                value={repositoryUrl}
                onChange={(e) => setRepositoryUrl(e.target.value)}
                className="h-10 border-white/10 bg-white/5 pl-9 text-slate-200 placeholder:text-slate-500 transition-all duration-200 focus:border-indigo-500/20 focus:bg-white/10 focus:ring-2 focus:ring-indigo-500/20"
                disabled={isLoading}
              />
            </div>
            <Button
              type="submit"
              size="sm"
              className="h-10 shrink-0 gap-2 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
              disabled={!repositoryUrl.trim() || isLoading}
            >
              {isLoading ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
              {isLoading ? "Analyzing..." : "Analyze"}
            </Button>
          </form>
        </header>

        {/* Dashboard body */}
        <div className="flex-1 overflow-y-auto bg-gradient-to-b from-[#0c0c0c] via-[#0c0c0c] to-[#080808] p-6">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-24 animate-fade-in">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
                <Loader2 className="size-12 animate-spin text-indigo-400" />
              </div>
              <p className="mt-4 text-sm text-slate-400 animate-pulse-soft">Analyzing repository...</p>
              <div className="mt-6 flex gap-1">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="size-2 rounded-full bg-indigo-500/60 animate-bounce"
                    style={{ animationDelay: `${i * 150}ms`, animationDuration: "0.6s" }}
                  />
                ))}
              </div>
            </div>
          ) : error ? (
            <Card className="animate-fade-in-scale border-red-500/30 bg-red-500/5">
              <CardContent className="py-6">
                <p className="text-red-300">{error}</p>
                <Button variant="outline" size="sm" className="mt-4 transition-all duration-200 hover:scale-[1.02]" onClick={startNew}>
                  Try again
                </Button>
              </CardContent>
            </Card>
          ) : !hasResult ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="animate-fade-in-scale rounded-2xl border border-white/10 bg-gradient-to-b from-white/5 to-transparent p-10 shadow-xl">
                <div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-indigo-500/10">
                  <GitBranch className="size-8 text-indigo-400" />
                </div>
                <h2 className="mt-6 text-xl font-medium text-slate-200">Analyze a repository</h2>
                <p className="mt-2 max-w-sm text-sm text-slate-400">
                  Paste a GitHub URL above to get product summary, architecture, screens, and deploy to Vercel.
                </p>
                <div className="mt-6 flex gap-2">
                  <div className="h-1 w-1 rounded-full bg-indigo-500/40 animate-pulse" style={{ animationDelay: "0ms" }} />
                  <div className="h-1 w-1 rounded-full bg-indigo-500/40 animate-pulse" style={{ animationDelay: "200ms" }} />
                  <div className="h-1 w-1 rounded-full bg-indigo-500/40 animate-pulse" style={{ animationDelay: "400ms" }} />
                </div>
              </div>
            </div>
          ) : result ? (
            <div className="mx-auto max-w-6xl space-y-6">
              {/* Top row: Summary + Deployment */}
              <div className="grid gap-6 lg:grid-cols-3">
                <Card
                  className="animate-fade-in border-white/10 bg-white/5 transition-all duration-300 hover:border-white/15 hover:bg-white/[0.07] lg:col-span-2"
                  style={{ animationDelay: "0ms" }}
                >
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base text-slate-200">
                      <div className="rounded-md bg-indigo-500/20 p-1">
                        <Sparkles className="size-3.5 text-indigo-400" />
                      </div>
                      Product Summary
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="secondary" className="border-white/10 text-slate-300 transition-all duration-200 hover:scale-105">
                        {result.projectType}
                      </Badge>
                      <Badge variant="secondary" className="border-white/10 text-slate-300 transition-all duration-200 hover:scale-105">
                        {result.frontend}
                      </Badge>
                      {result.vercelDeployable && (
                        <Badge variant="secondary" className="border-green-700/50 text-green-500 transition-all duration-200 hover:scale-105">
                          Vercel deployable
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm leading-relaxed text-slate-300">{result.aiNotes}</p>
                    <a
                      href={result.repository}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm text-blue-400 transition-colors hover:text-indigo-400 hover:underline"
                    >
                      <Link2 className="size-3.5" />
                      {result.repository}
                    </a>
                  </CardContent>
                </Card>

                <Card
                  className="animate-fade-in border-white/10 bg-white/5 transition-all duration-300 hover:border-white/15 hover:bg-white/[0.07]"
                  style={{ animationDelay: "50ms" }}
                >
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base text-slate-200">
                      <div className="rounded-md bg-emerald-500/20 p-1">
                        <ExternalLink className="size-3.5 text-emerald-400" />
                      </div>
                      Deployment
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {previewLink ? (
                      <a
                        href={previewLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 truncate rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-blue-400 transition-all duration-200 hover:border-indigo-500/30 hover:bg-white/10"
                      >
                        <Link2 className="size-4 shrink-0" />
                        <span className="truncate">{previewLink}</span>
                      </a>
                    ) : result.vercelDeployable ? (
                      <Button
                        onClick={deployToVercel}
                        disabled={vercelDeployLoading}
                        className="w-full gap-2 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                      >
                        {vercelDeployLoading ? (
                          <>
                            <Loader2 className="size-4 animate-spin" />
                            Deploying...
                          </>
                        ) : (
                          <>
                            <ExternalLink className="size-4" />
                            Deploy to Vercel
                          </>
                        )}
                      </Button>
                    ) : (
                      <p className="text-sm text-slate-500">Not deployable to Vercel</p>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Architecture */}
              <Card
                className="animate-fade-in border-white/10 bg-white/5 transition-all duration-300 hover:border-white/15 hover:bg-white/[0.07]"
                style={{ animationDelay: "100ms" }}
              >
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base text-slate-200">
                    <div className="rounded-md bg-amber-500/20 p-1">
                      <Layout className="size-3.5 text-amber-400" />
                    </div>
                    Architecture
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="mb-4 text-sm leading-relaxed text-slate-300">{result.architectureSummary}</p>
                  {mermaidSvgUrl ? (
                    <div className="overflow-hidden rounded-lg border border-white/10 bg-white p-3 transition-all duration-300 hover:border-white/20">
                      <Image src={mermaidSvgUrl} alt="Architecture diagram" width={1200} height={700} className="h-auto w-full" unoptimized />
                    </div>
                  ) : null}
                </CardContent>
              </Card>

              {/* Screens + Demo Video */}
              <div className="grid gap-6 lg:grid-cols-2">
                <Card
                  className="animate-fade-in border-white/10 bg-white/5 transition-all duration-300 hover:border-white/15 hover:bg-white/[0.07]"
                  style={{ animationDelay: "150ms" }}
                >
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base text-slate-200">
                      <div className="rounded-md bg-cyan-500/20 p-1">
                        <Layout className="size-3.5 text-cyan-400" />
                      </div>
                      Detected Screens
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CompactList items={result.detectedScreens} />
                  </CardContent>
                </Card>

                <Card
                  className="animate-fade-in border-white/10 bg-white/5 transition-all duration-300 hover:border-white/15 hover:bg-white/[0.07]"
                  style={{ animationDelay: "200ms" }}
                >
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base text-slate-200">
                      <div className="rounded-md bg-rose-500/20 p-1">
                        <Video className="size-3.5 text-rose-400" />
                      </div>
                      Demo Video
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Button
                      variant="secondary"
                      onClick={generateDemoScript}
                      disabled={loadingScript}
                      className="mb-4 gap-2 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                    >
                      {loadingScript ? <Loader2 className="size-4 animate-spin" /> : null}
                      {loadingScript ? "Generating..." : "Generate demo video"}
                    </Button>
                    {demoScript?.scenes?.length ? (
                      <div className="overflow-hidden rounded-lg border border-white/10 transition-all duration-300 hover:border-white/20">
                        <DemoVideoPlayer scenes={demoScript.scenes} />
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              </div>
            </div>
          ) : null}
        </div>
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

function CompactList({ items }: { items: unknown[] }) {
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

  return normalized.length ? (
    <div className="flex flex-wrap gap-2">
      {normalized.slice(0, 12).map((item, index) => (
        <Badge
          key={`${index}-${item}`}
          variant="outline"
          className="animate-fade-in border-white/20 text-slate-300 transition-all duration-200 hover:border-indigo-500/30 hover:bg-indigo-500/10 hover:text-slate-200"
          style={{ animationDelay: `${index * 30}ms` }}
        >
          {item}
        </Badge>
      ))}
    </div>
  ) : (
    <p className="text-sm text-slate-500">No screens detected</p>
  );
}
