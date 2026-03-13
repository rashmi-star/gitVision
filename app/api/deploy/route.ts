import { NextResponse } from "next/server";
import { z } from "zod";

import { deployToVercel } from "@/lib/vercel";

const requestSchema = z.object({
  repositoryUrl: z.string().url(),
  ref: z.string().optional().default("main"),
  vercelToken: z.string().optional(),
});

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { repositoryUrl, ref } = parsed.data;
  const vercelToken = parsed.data.vercelToken || process.env.VERCEL_TOKEN;

  if (!vercelToken) {
    return NextResponse.json(
      { error: "Vercel token required. Add VERCEL_TOKEN to .env or pass vercelToken in the request." },
      { status: 400 },
    );
  }

  const result = await deployToVercel(repositoryUrl, ref, vercelToken);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({
    url: result.url,
    status: result.status,
    deploymentId: result.deploymentId,
  });
}
