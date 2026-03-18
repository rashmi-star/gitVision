"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { VideoContent } from "./video-content";
import { HomePageContent } from "./home-content";

function PageRouter() {
  const searchParams = useSearchParams();
  const videoMode = searchParams.get("video") === "1";
  const repo = searchParams.get("repo");

  if (videoMode && repo) {
    return <VideoContent />;
  }
  return <HomePageContent />;
}

export function PageWrapper() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-black" />}>
      <PageRouter />
    </Suspense>
  );
}
