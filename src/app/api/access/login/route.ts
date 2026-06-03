import { NextRequest, NextResponse } from "next/server";

import {
  ACCESS_COOKIE,
  accessCodeMatches,
  accessCookieOptions,
  createAccessSession,
} from "@/lib/access";
import { prisma } from "@/lib/db";
import { AccessLoginSchema } from "@/lib/security";
import { verifyTurnstile } from "@/lib/turnstile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const parsed = AccessLoginSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid login" }, { status: 400 });
  }

  try {
    const captchaOk = await verifyTurnstile(
      parsed.data.turnstileToken,
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    );
    if (!captchaOk) {
      return NextResponse.json({ error: "CAPTCHA verification failed" }, { status: 400 });
    }

    const access = await prisma.accessRequest.findUnique({
      where: { email: parsed.data.email },
    });
    if (
      !access ||
      access.status !== "approved" ||
      !access.codeHash ||
      !accessCodeMatches(parsed.data.email, parsed.data.code, access.codeHash)
    ) {
      return NextResponse.json({ error: "Invalid email or access code" }, { status: 401 });
    }

    const response = NextResponse.json({ ok: true });
    response.cookies.set(
      ACCESS_COOKIE,
      createAccessSession(parsed.data.email),
      accessCookieOptions()
    );
    return response;
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
