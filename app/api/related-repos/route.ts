import { NextResponse } from "next/server";
import { z } from "zod";

function parseGithubRepo(repositoryUrl: string): { owner: string; repo: string } | null {
  const normalized = repositoryUrl.replace(/\.git$/i, "").trim();
  const match = normalized.match(/github\.com[/:]([^/]+)\/([^/]+)/i);
  if (!match) return null;
  return { owner: match[1], repo: match[2].replace(/\/$/, "") };
}

const requestSchema = z.object({
  repositoryUrl: z.string().url(),
});

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export type RelatedRepo = {
  fullName: string;
  url: string;
  description: string | null;
  stars: number;
  language: string | null;
};

export async function OPTIONS() {
  return NextResponse.json(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid repositoryUrl" }, { status: 400, headers: CORS_HEADERS });
  }

  const repo = parseGithubRepo(parsed.data.repositoryUrl);
  if (!repo) {
    return NextResponse.json({ error: "Invalid GitHub URL" }, { status: 400, headers: CORS_HEADERS });
  }

  const excludeQuery = `-repo:${repo.owner}/${repo.repo}`;
  const results: RelatedRepo[] = [];
  const seen = new Set<string>([`${repo.owner}/${repo.repo}`]);

  try {
    const topicsRes = await fetch(
      `https://api.github.com/repos/${repo.owner}/${repo.repo}/topics`,
      { headers: { Accept: "application/vnd.github.mercy-preview+json" } },
    );
    const topics: string[] = topicsRes.ok
      ? ((await topicsRes.json()) as { names?: string[] })?.names ?? []
      : [];

    if (topics.length > 0) {
      const topicQuery = topics.slice(0, 3).map((t) => `topic:${t}`).join(" ");
      const searchRes = await fetch(
        `https://api.github.com/search/repositories?q=${encodeURIComponent(`${topicQuery} ${excludeQuery}`)}&sort=stars&per_page=6`,
        { headers: { Accept: "application/vnd.github.v3+json" } },
      );
      if (searchRes.ok) {
        const data = (await searchRes.json()) as { items?: Array<{ full_name: string; html_url: string; description: string | null; stargazers_count: number; language: string | null }> };
        for (const item of data.items ?? []) {
          if (!seen.has(item.full_name)) {
            seen.add(item.full_name);
            results.push({
              fullName: item.full_name,
              url: item.html_url,
              description: item.description,
              stars: item.stargazers_count,
              language: item.language,
            });
          }
        }
      }
    }

    if (results.length < 6) {
      const repoRes = await fetch(`https://api.github.com/repos/${repo.owner}/${repo.repo}`, {
        headers: { Accept: "application/vnd.github.v3+json" },
      });
      const repoData = repoRes.ok ? (await repoRes.json()) as { language?: string } : null;
      const lang = repoData?.language ?? null;
      const langQuery = lang ? `language:${lang}` : `user:${repo.owner}`;
      const searchRes = await fetch(
        `https://api.github.com/search/repositories?q=${encodeURIComponent(`${langQuery} ${excludeQuery}`)}&sort=stars&per_page=${6 - results.length}`,
        { headers: { Accept: "application/vnd.github.v3+json" } },
      );
      if (searchRes.ok) {
        const data = (await searchRes.json()) as { items?: Array<{ full_name: string; html_url: string; description: string | null; stargazers_count: number; language: string | null }> };
        for (const item of data.items ?? []) {
          if (!seen.has(item.full_name)) {
            seen.add(item.full_name);
            results.push({
              fullName: item.full_name,
              url: item.html_url,
              description: item.description,
              stars: item.stargazers_count,
              language: item.language,
            });
          }
        }
      }
    }

    return NextResponse.json({ relatedRepos: results.slice(0, 6) }, { headers: CORS_HEADERS });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch related repos" },
      { status: 500, headers: CORS_HEADERS },
    );
  }
}
