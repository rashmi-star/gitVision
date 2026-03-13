/**
 * Vercel deployment integration.
 * Deploys GitHub repos that Vercel can host (Next.js, React/Vite, static sites).
 * Disables deployment protection so preview URLs are publicly accessible.
 */

const VERCEL_API = "https://api.vercel.com/v13";
const VERCEL_PROJECTS_API = "https://api.vercel.com/v9";

function parseGithubRepo(repositoryUrl: string): { owner: string; repo: string } | null {
  const normalized = repositoryUrl.replace(/\.git$/i, "").trim();
  const match = normalized.match(/github\.com[/:]([^/]+)\/([^/]+)/i);
  if (!match) return null;
  return { owner: match[1], repo: match[2].replace(/\/$/, "") };
}

/** Vercel project names: lowercase, max 100 chars, letters/digits/._- only, no '---' */
function toVercelProjectName(repo: string): string {
  let name = repo
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  if (name.includes("---")) {
    name = name.replace(/---+/g, "--");
  }
  return name.slice(0, 100) || "project";
}

/** Disable deployment protection so preview URLs are publicly accessible. */
async function disableDeploymentProtection(
  projectName: string,
  vercelToken: string,
): Promise<void> {
  try {
    const teamId = process.env.VERCEL_TEAM_ID;
    const url = new URL(`${VERCEL_PROJECTS_API}/projects/${encodeURIComponent(projectName)}`);
    if (teamId) url.searchParams.set("teamId", teamId);
    const response = await fetch(url.toString(), {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${vercelToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ssoProtection: null,
        passwordProtection: null,
      }),
    });
    if (!response.ok) {
      // Log but don't fail deployment - protection may already be off or token lacks permission
      console.warn("[vercel] Could not disable deployment protection:", response.status, await response.text());
    }
  } catch {
    // Ignore - deployment already succeeded
  }
}

export type VercelDeployResult =
  | { ok: true; url: string; status: string; deploymentId: string }
  | { ok: false; error: string };

export async function deployToVercel(
  repositoryUrl: string,
  ref: string,
  vercelToken: string,
): Promise<VercelDeployResult> {
  const repo = parseGithubRepo(repositoryUrl);
  if (!repo) {
    return { ok: false, error: "Invalid GitHub repository URL" };
  }

  try {
    const endpoint = `${VERCEL_API}/deployments?skipAutoDetectionConfirmation=1`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${vercelToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: toVercelProjectName(repo.repo),
        gitSource: {
          type: "github",
          ref,
          org: repo.owner,
          repo: repo.repo,
        },
      }),
    });

    const data = (await response.json()) as {
      id?: string;
      url?: string;
      state?: string;
      error?: { message?: string };
      message?: string;
    };

    if (!response.ok) {
      const msg = data.error?.message ?? data.message ?? "Vercel deployment failed";
      return { ok: false, error: msg };
    }

    const deploymentId = data.id ?? "";
    const status = data.state ?? "QUEUED";
    const url = data.url ? `https://${data.url}` : "";

    // Disable deployment protection so preview URLs are publicly accessible
    await disableDeploymentProtection(toVercelProjectName(repo.repo), vercelToken);

    return { ok: true, url, status, deploymentId };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to deploy to Vercel",
    };
  }
}

/** Deploy from a local directory (e.g. after applying build fixes). Uses Vercel CLI. */
export async function deployFromDirectory(
  projectDir: string,
  vercelToken: string,
): Promise<VercelDeployResult> {
  try {
    const { spawnSync } = await import("node:child_process");
    const npm = process.platform === "win32" ? "npx.cmd" : "npx";
    const result = spawnSync(npm, ["vercel", "deploy", "--yes", "--token", vercelToken], {
      cwd: projectDir,
      encoding: "utf8",
      timeout: 300_000,
    });
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
    const urlMatch = output.match(/https:\/\/[^\s"'<>]+\.vercel\.app/);
    const url = urlMatch?.[0] ?? "";
    if (result.status === 0 && url) {
      return { ok: true, url, status: "READY", deploymentId: "" };
    }
    return { ok: false, error: output.slice(-500) || "Vercel CLI deploy failed" };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to deploy from directory",
    };
  }
}

export async function getDeploymentStatus(
  deploymentId: string,
  vercelToken: string,
): Promise<{ status: string; url?: string }> {
  try {
    const response = await fetch(`${VERCEL_API}/deployments/${deploymentId}`, {
      headers: { Authorization: `Bearer ${vercelToken}` },
    });
    const data = (await response.json()) as { state?: string; url?: string };
    return {
      status: data.state ?? "UNKNOWN",
      url: data.url ? `https://${data.url}` : undefined,
    };
  } catch {
    return { status: "UNKNOWN" };
  }
}
