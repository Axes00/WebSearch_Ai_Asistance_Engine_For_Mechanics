import createMiddleware from "next-intl/middleware";
import { NextRequest, NextResponse } from "next/server";
import { routing } from "./lib/routing";

const intlMiddleware = createMiddleware(routing);
const encoder = new TextEncoder();
const protectedApi = /^\/api\/(library|search|ai|files|viewer|highlights)(\/|$)/;
const protectedPage = /^\/(el|en)\/(library|viewer)(\/|$)/;
const protectedAdminApi = /^\/api\/admin(\/|$)/;
const protectedAdminPage = /^\/(el|en)\/admin(\/|$)/;

function decodeBase64Url(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

async function hasValidSession(req: NextRequest) {
  const token = req.cookies.get("mechanica_access")?.value;
  const secret = process.env.ACCESS_SESSION_SECRET;
  if (!token || !secret || secret.length < 32) return false;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;

  try {
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      decodeBase64Url(signature),
      encoder.encode(payload)
    );
    if (!valid) return false;
    const decoded = JSON.parse(new TextDecoder().decode(decodeBase64Url(payload))) as {
      email?: string;
      exp?: number;
    };
    if (
      typeof decoded.email !== "string" ||
      typeof decoded.exp !== "number" ||
      decoded.exp <= Math.floor(Date.now() / 1000)
    ) {
      return false;
    }
    const statusUrl = new URL("/api/access/session-status", req.url);
    statusUrl.searchParams.set("email", decoded.email);
    const status = await fetch(statusUrl, {
      headers: { "x-mechanica-session-secret": secret },
      cache: "no-store",
    });
    return status.ok;
  } catch {
    return false;
  }
}

async function hasValidAdminSession(req: NextRequest) {
  const token = req.cookies.get("mechanica_admin")?.value;
  const secret = process.env.ACCESS_SESSION_SECRET;
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (!token || !secret || secret.length < 32 || !adminEmail) return false;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;

  try {
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      decodeBase64Url(signature),
      encoder.encode(payload)
    );
    if (!valid) return false;
    const decoded = JSON.parse(new TextDecoder().decode(decodeBase64Url(payload))) as {
      email?: string;
      role?: string;
      exp?: number;
    };
    return (
      decoded.email?.toLowerCase() === adminEmail &&
      decoded.role === "admin" &&
      typeof decoded.exp === "number" &&
      decoded.exp > Math.floor(Date.now() / 1000)
    );
  } catch {
    return false;
  }
}

export default async function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;
  if ((protectedAdminApi.test(pathname) || protectedAdminPage.test(pathname)) && !(await hasValidAdminSession(req))) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Administrator login required" }, { status: 401 });
    }
    const locale = pathname.split("/")[1] || "el";
    return NextResponse.redirect(new URL(`/${locale}/admin-login`, req.url));
  }
  if ((protectedApi.test(pathname) || protectedPage.test(pathname)) && !(await hasValidSession(req))) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Customer access required" }, { status: 401 });
    }
    const locale = pathname.split("/")[1] || "el";
    return NextResponse.redirect(new URL(`/${locale}/access`, req.url));
  }
  if (pathname.startsWith("/api/")) return NextResponse.next();
  return intlMiddleware(req);
}

export const config = {
  matcher: ["/((?!_next|_vercel|favicon.ico|hero.jpg|icons|.*\\..*).*)"],
};
