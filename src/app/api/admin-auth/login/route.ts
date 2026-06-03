import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  ADMIN_COOKIE,
  adminCookieOptions,
  adminPasswordMatches,
  createAdminSession,
} from "@/lib/adminAuth";
import { verifyTurnstile } from "@/lib/turnstile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AdminLoginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(200),
  turnstileToken: z.string().min(1).max(4096),
});

export async function POST(req: NextRequest) {
  const parsed = AdminLoginSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid login details" }, { status: 400 });
  }

  try {
    const captchaOk = await verifyTurnstile(
      parsed.data.turnstileToken,
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    );
    if (!captchaOk) {
      return NextResponse.json({ error: "CAPTCHA verification failed" }, { status: 400 });
    }

    const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    const passwordHash = process.env.ADMIN_PASSWORD_HASH?.trim();
    if (
      !adminEmail ||
      !passwordHash ||
      parsed.data.email !== adminEmail ||
      !adminPasswordMatches(parsed.data.password, passwordHash)
    ) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    const response = NextResponse.json({ ok: true });
    response.cookies.set(ADMIN_COOKIE, createAdminSession(adminEmail), adminCookieOptions());
    return response;
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
