"use client";

import { AbsoluteFill, Sequence, interpolate, useCurrentFrame, Video } from "remotion";
import { Player } from "@remotion/player";


type DemoVideoPlayerProps = {
  scenes: string[];
};

type SceneParts = {
  visual: string;
  audio: string;
};

const FPS = 30;
const SCENE_SECONDS = 5;
const SCENE_FRAMES = FPS * SCENE_SECONDS;

function parseScene(scene: string): SceneParts {
  const clean = scene.replace(/\s+/g, " ").trim();
  const [beforeAudio, afterAudio] = clean.split(/Audio:\s*/i);
  const titleMatch = beforeAudio.match(/SCENE\s*\d+[:\-\s]*/i);
  const visual = (titleMatch ? beforeAudio.replace(titleMatch[0], "") : beforeAudio).trim();
  return {
    visual: visual || "Product overview.",
    audio: (afterAudio || "Narration unavailable.").trim().replace(/^['"]|['"]$/g, ""),
  };
}

function SceneCard({
  scene,
}: {
  scene: SceneParts;
}) {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 12, SCENE_FRAMES - 12, SCENE_FRAMES], [0, 1, 1, 0]);

  return (
    <AbsoluteFill
      style={{
        color: "#e2e8f0",
        padding: 48,
        opacity,
        fontFamily: "system-ui, sans-serif",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(180deg, transparent 0%, rgba(2,6,23,0.85) 60%)",
          pointerEvents: "none",
        }}
      />
      <div style={{ position: "relative", zIndex: 1, textAlign: "center", maxWidth: "90%" }}>
        <h2
          style={{
            fontSize: 42,
            fontWeight: 700,
            marginBottom: 16,
            textShadow: "0 2px 20px rgba(0,0,0,0.5)",
            lineHeight: 1.2,
          }}
        >
          {scene.visual.length > 80 ? scene.visual.slice(0, 80) + "…" : scene.visual}
        </h2>
        <p
          style={{
            fontSize: 20,
            lineHeight: 1.5,
            opacity: 0.95,
            textShadow: "0 1px 10px rgba(0,0,0,0.5)",
          }}
        >
          {scene.audio}
        </p>
      </div>
    </AbsoluteFill>
  );
}

function DemoVideo({ scenes }: DemoVideoPlayerProps) {
  const parsed = scenes.length
    ? scenes.map((s) => parseScene(s))
    : [parseScene("SCENE 1: Product overview. Audio: 'Repository introduction.'")];

  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ backgroundColor: "#0f172a" }}>
        <Video
          src="/background.mp4"
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
          loop
        />
      </AbsoluteFill>
      <AbsoluteFill
        style={{
          background: "linear-gradient(180deg, transparent 0%, rgba(2,6,23,0.6) 100%)",
          pointerEvents: "none",
        }}
      />
      {parsed.map((scene, index) => (
          <Sequence key={index} from={index * SCENE_FRAMES} durationInFrames={SCENE_FRAMES}>
            <SceneCard scene={scene} />
          </Sequence>
      ))}
    </AbsoluteFill>
  );
}

export function DemoVideoPlayer({ scenes }: DemoVideoPlayerProps) {
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
        border: "1px solid rgba(255,255,255,0.15)",
      }}
      inputProps={{ scenes }}
    />
  );
}
