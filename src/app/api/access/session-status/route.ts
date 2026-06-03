import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const secret = process.env.ACCESS_SESSION_SECRET;
  if (
    !secret ||
    req.headers.get("x-mechanica-session-secret") !== secret
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const email = req.nextUrl.searchParams.get("email")?.trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ error: "Missing email" }, { status: 400 });
  }

  const access = await prisma.accessRequest.findUnique({
    where: { email },
    select: { status: true },
  });
  if (access?.status !== "approved") {
    return NextResponse.json({ error: "Access revoked" }, { status: 401 });
  }
  return NextResponse.json({ ok: true });
}
