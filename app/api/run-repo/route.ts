import { NextResponse } from "next/server";
import { z } from "zod";

import { getSession, listSessions, startRepoSession } from "@/lib/run-session";

const startSchema = z.object({
  repositoryUrl: z.string().url(),
  openaiApiKey: z.string().optional(),
  geminiApiKey: z.string().optional(),
});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("sessionId");
  if (sessionId) {
    const session = getSession(sessionId);
    if (!session) {
      return NextResponse.json({ error: "Session not found." }, { status: 404 });
    }
    return NextResponse.json({
      session: {
        ...session,
        previewUrl:
          session.status === "running"
            ? `http://127.0.0.1:${session.port}${session.previewPath ?? ""}`
            : undefined,
      },
    });
  }

  return NextResponse.json({
    sessions: listSessions().map((session) => ({
      id: session.id,
      repositoryUrl: session.repositoryUrl,
      status: session.status,
      port: session.port,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    })),
  });
}

export async function POST(request: Request) {
  const parsed = startSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid repository URL." }, { status: 400 });
  }

  const session = await startRepoSession(
    parsed.data.repositoryUrl,
    parsed.data.openaiApiKey || parsed.data.geminiApiKey,
  );
  return NextResponse.json({
    session: {
      ...session,
      previewUrl:
        session.status === "running"
          ? `http://127.0.0.1:${session.port}${session.previewPath ?? ""}`
          : undefined,
    },
  });
}
