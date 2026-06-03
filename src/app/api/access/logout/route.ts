import { NextResponse } from "next/server";

import { ACCESS_COOKIE, accessCookieOptions } from "@/lib/access";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ACCESS_COOKIE, "", { ...accessCookieOptions(), maxAge: 0 });
  return response;
}
