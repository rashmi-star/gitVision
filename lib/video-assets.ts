/**
 * Built-in visual assets for demo video scenes.
 * AI chooses scene type; we map to our reusable visuals.
 */

export type SceneType = "summary" | "screen" | "architecture" | "cta";

/** Gradient + pattern for each scene type. Returns style object. */
export function getSceneBackground(type: SceneType, index: number): Record<string, string> {
  const base = {
    background: "",
    backgroundSize: "cover",
    backgroundPosition: "center",
  };

  switch (type) {
    case "summary":
      return {
        ...base,
        background: "linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, #0f172a 100%)",
      };
    case "screen":
      return {
        ...base,
        background: index === 1
          ? "linear-gradient(160deg, #1e293b 0%, #334155 40%, #0f172a 100%)"
          : "linear-gradient(200deg, #0f172a 0%, #1e3a5f 60%, #1e293b 100%)",
      };
    case "architecture":
      return {
        ...base,
        background: "linear-gradient(180deg, #0c4a6e 0%, #0f172a 50%, #1e293b 100%)",
      };
    case "cta":
      return {
        ...base,
        background: "linear-gradient(135deg, #14532d 0%, #0f172a 60%, #166534 100%)",
      };
    default:
      return {
        ...base,
        background: "linear-gradient(130deg, #0f172a, #1e293b)",
      };
  }
}
