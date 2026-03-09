import { NextResponse } from "next/server";
import { z } from "zod";

import { stopSession } from "@/lib/run-session";

const schema = z.object({
  sessionId: z.string().min(1),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid session ID." }, { status: 400 });
  }

  const session = await stopSession(parsed.data.sessionId);
  if (!session) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }

  return NextResponse.json({ session });
}
