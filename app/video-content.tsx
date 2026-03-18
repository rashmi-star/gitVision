"use client";

import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

const DemoVideoPlayer = dynamic(
  () => import("@/components/demo-video-player").then((m) => ({ default: m.DemoVideoPlayer })),
  { ssr: false, loading: () => <div className="flex h-64 items-center justify-center bg-[#0c0c0c] text-slate-400">Loading video...</div> },
);

function VideoContentInner() {
  const searchParams = useSearchParams();
  const repoParam = searchParams.get("repo");
  const [scenes, setScenes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!repoParam) {
      setError("No repo specified");
      setLoading(false);
      return;
    }
    const repoUrl = decodeURIComponent(repoParam).replace(/^([^/]+)\/([^/]+)$/, "https://github.com/$1/$2");
    if (!/github\.com/i.test(repoUrl)) {
      setError("Invalid GitHub URL");
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const analyzeRes = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ repositoryUrl: repoUrl, deployToVercel: false }),
        });
        const analysis = await analyzeRes.json();
        if (!analyzeRes.ok || analysis.error) {
          setError(analysis.error || "Analysis failed");
          return;
        }

        const scriptRes = await fetch("/api/demo-script", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            repository: analysis.repository,
            summary: analysis.architectureSummary,
            userFlows: analysis.userFlows,
            projectType: analysis.projectType,
            frontend: analysis.frontend,
            backend: analysis.backend,
            readmeSummary: analysis.readmeSummary,
            techStack: analysis.techStack,
            detectedScreens: analysis.detectedScreens,
            apiEndpoints: analysis.apiEndpoints,
            uiComponents: analysis.uiComponents,
          }),
        });
        const scriptData = await scriptRes.json();
        setScenes(scriptData.scenes || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load video");
      } finally {
        setLoading(false);
      }
    })();
  }, [repoParam]);

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center bg-[#0c0c0c]">
        <div className="animate-pulse text-slate-400">Generating video...</div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex min-h-[400px] items-center justify-center bg-[#0c0c0c] p-6">
        <p className="text-red-400">{error}</p>
      </div>
    );
  }
  if (!scenes?.length) {
    return (
      <div className="flex min-h-[400px] items-center justify-center bg-[#0c0c0c]">
        <p className="text-slate-400">No scenes generated</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0c0c0c] p-4">
      <div className="mx-auto max-w-4xl">
        <DemoVideoPlayer scenes={scenes} />
      </div>
    </div>
  );
}

export function VideoContent() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[400px] items-center justify-center bg-[#0c0c0c]">
          <div className="animate-pulse text-slate-400">Loading...</div>
        </div>
      }
    >
      <VideoContentInner />
    </Suspense>
  );
}
