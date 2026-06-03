import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { AccessRequestSchema } from "@/lib/security";
import { verifyTurnstile } from "@/lib/turnstile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const parsed = AccessRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }

  try {
    const captchaOk = await verifyTurnstile(
      parsed.data.turnstileToken,
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    );
    if (!captchaOk) {
      return NextResponse.json({ error: "CAPTCHA verification failed" }, { status: 400 });
    }

    const existing = await prisma.accessRequest.findUnique({
      where: { email: parsed.data.email },
    });
    if (existing?.status === "approved") {
      return NextResponse.json({ error: "This email already has approved access" }, { status: 409 });
    }

    await prisma.accessRequest.upsert({
      where: { email: parsed.data.email },
      update: {
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        description: parsed.data.description,
        status: "pending",
        codeHash: null,
        approvedAt: null,
        requestedAt: new Date(),
      },
      create: {
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        email: parsed.data.email,
        description: parsed.data.description,
      },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
