"use client";

import { AbsoluteFill, Img, Sequence, interpolate, useCurrentFrame } from "remotion";
import { Player } from "@remotion/player";

type DemoVideoPlayerProps = {
  scenes: string[];
  assets?: Array<{ file: string; url: string }>;
  screenPreviews?: Array<{
    route: string;
    file: string;
    headings: string[];
    actions: string[];
    snippet: string;
  }>;
};

type SceneParts = {
  title: string;
  visual: string;
  audio: string;
};

const FPS = 30;
const SCENE_SECONDS = 5;
const SCENE_FRAMES = FPS * SCENE_SECONDS;

function parseScene(scene: string, index: number): SceneParts {
  const clean = scene.replace(/\s+/g, " ").trim();
  const [beforeAudio, afterAudio] = clean.split(/Audio:\s*/i);
  const titleMatch = beforeAudio.match(/SCENE\s*\d+[:\-\s]*/i);
  const visual = (titleMatch ? beforeAudio.replace(titleMatch[0], "") : beforeAudio).trim();
  return {
    title: `Scene ${index + 1}`,
    visual: visual || "Generated product walkthrough scene.",
    audio: (afterAudio || "Narration unavailable.").trim(),
  };
}

function SceneCard({
  scene,
  assetUrl,
  screenPreview,
}: {
  scene: SceneParts;
  assetUrl?: string;
  screenPreview?: {
    route: string;
    file: string;
    headings: string[];
    actions: string[];
    snippet: string;
  };
}) {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 10, SCENE_FRAMES - 10, SCENE_FRAMES], [0, 1, 1, 0]);
  const zoom = interpolate(frame, [0, SCENE_FRAMES], [1.03, 1]);
  const cleanAudio = scene.audio.replace(/^['"]|['"]$/g, "");
  const heading = screenPreview?.headings?.[0] ?? "Repository Preview";
  const actions = (screenPreview?.actions ?? []).slice(0, 4);

  return (
    <AbsoluteFill
      style={{
        background: "linear-gradient(130deg, #0f172a, #1e293b)",
        color: "#e2e8f0",
        padding: 36,
        opacity,
        fontFamily: "var(--font-geist-sans), sans-serif",
      }}
    >
      {assetUrl ? (
        <Img
          src={assetUrl}
          alt="Repository visual asset"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            opacity: 0.75,
            transform: `scale(${zoom})`,
          }}
        />
      ) : null}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(180deg, rgba(2,6,23,0.18), rgba(2,6,23,0.76))",
        }}
      />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
        <div
          style={{
            display: "inline-block",
            padding: "8px 14px",
            borderRadius: 999,
            background: "rgba(2, 6, 23, 0.62)",
            fontSize: 14,
            fontWeight: 600,
            border: "1px solid rgba(226,232,240,0.2)",
          }}
        >
          {screenPreview?.route || scene.title}
        </div>
        <div
          style={{
            display: "inline-block",
            padding: "8px 12px",
            borderRadius: 10,
            background: "rgba(2, 6, 23, 0.62)",
            fontSize: 12,
            border: "1px solid rgba(226,232,240,0.2)",
          }}
        >
          {screenPreview?.file || "repo scene"}
        </div>
      </div>

      <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
        <div
          style={{
            fontSize: 34,
            fontWeight: 700,
            maxWidth: "85%",
            textShadow: "0 4px 18px rgba(2, 6, 23, 0.55)",
          }}
        >
          {heading}
        </div>
        {actions.length > 0 ? (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {actions.map((action) => (
              <div
                key={action}
                style={{
                  padding: "6px 10px",
                  borderRadius: 999,
                  background: "rgba(15,23,42,0.72)",
                  border: "1px solid rgba(148,163,184,0.4)",
                  fontSize: 13,
                }}
              >
                {action}
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div
        style={{
          marginTop: 14,
          fontSize: 15,
          lineHeight: 1.35,
          color: "#e2e8f0",
          borderTop: "1px solid rgba(226,232,240,0.25)",
          paddingTop: 10,
          opacity: 0.92,
          textShadow: "0 2px 8px rgba(2, 6, 23, 0.7)",
        }}
      >
        {cleanAudio}
      </div>
    </AbsoluteFill>
  );
}

function DemoVideo({ scenes, assets = [], screenPreviews = [] }: DemoVideoPlayerProps) {
  const parsed = scenes.length
    ? scenes.map((scene, index) => parseScene(scene, index))
    : [parseScene("SCENE 1: Product walkthrough. Audio: Overview narration.", 0)];

  return (
    <AbsoluteFill>
      {parsed.map((scene, index) => (
        <Sequence key={`${scene.title}-${index}`} from={index * SCENE_FRAMES} durationInFrames={SCENE_FRAMES}>
          <SceneCard
            scene={scene}
            assetUrl={assets[index % Math.max(1, assets.length)]?.url}
            screenPreview={screenPreviews[index % Math.max(1, screenPreviews.length)]}
          />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
}

export function DemoVideoPlayer({ scenes, assets, screenPreviews }: DemoVideoPlayerProps) {
  const sceneCount = Math.max(1, scenes.length);

  return (
    <Player
      component={DemoVideo}
      durationInFrames={sceneCount * SCENE_FRAMES}
      compositionWidth={1280}
      compositionHeight={720}
      fps={FPS}
      controls
      style={{
        width: "100%",
        aspectRatio: "16 / 9",
        borderRadius: 12,
        overflow: "hidden",
        border: "1px solid #cbd5e1",
      }}
      inputProps={{ scenes, assets, screenPreviews }}
    />
  );
}
