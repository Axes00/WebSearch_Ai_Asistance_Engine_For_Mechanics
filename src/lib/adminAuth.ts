import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const ADMIN_COOKIE = "mechanica_admin";
const ADMIN_SESSION_SECONDS = 60 * 60 * 8;

function secret() {
  const value = process.env.ACCESS_SESSION_SECRET;
  if (!value || value.length < 32) {
    throw new Error("ACCESS_SESSION_SECRET must contain at least 32 characters");
  }
  return value;
}

function hmac(value: string) {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

export function hashAdminPassword(password: string) {
  return createHash("sha256").update(`${password}:${secret()}`).digest("hex");
}

export function adminPasswordMatches(password: string, expected: string) {
  const actual = Buffer.from(hashAdminPassword(password));
  const stored = Buffer.from(expected);
  return actual.length === stored.length && timingSafeEqual(actual, stored);
}

export function createAdminSession(email: string) {
  const payload = Buffer.from(
    JSON.stringify({
      email: email.toLowerCase(),
      role: "admin",
      exp: Math.floor(Date.now() / 1000) + ADMIN_SESSION_SECONDS,
    })
  ).toString("base64url");
  return `${payload}.${hmac(payload)}`;
}

export function adminCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ADMIN_SESSION_SECONDS,
  };
}
