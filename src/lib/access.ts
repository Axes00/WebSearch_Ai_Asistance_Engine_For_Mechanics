import { createHash, createHmac, randomInt, timingSafeEqual } from "node:crypto";

export const ACCESS_COOKIE = "mechanica_access";
const SESSION_SECONDS = 60 * 60 * 24;

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

export function generateAccessCode() {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "23456789";
  const alphabet = letters + digits;
  const code = [
    letters[randomInt(0, letters.length)],
    digits[randomInt(0, digits.length)],
    ...Array.from({ length: 6 }, () => alphabet[randomInt(0, alphabet.length)]),
  ];
  for (let index = code.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(0, index + 1);
    [code[index], code[swapIndex]] = [code[swapIndex], code[index]];
  }
  return code.join("");
}

export function hashAccessCode(email: string, code: string) {
  return createHash("sha256")
    .update(`${email.toLowerCase()}:${code.toUpperCase()}:${secret()}`)
    .digest("hex");
}

export function accessCodeMatches(email: string, code: string, expected: string) {
  const actual = Buffer.from(hashAccessCode(email, code));
  const stored = Buffer.from(expected);
  return actual.length === stored.length && timingSafeEqual(actual, stored);
}

export function createAccessSession(email: string) {
  const payload = Buffer.from(
    JSON.stringify({
      email: email.toLowerCase(),
      exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS,
    })
  ).toString("base64url");
  return `${payload}.${hmac(payload)}`;
}

export function accessSessionEmail(token?: string) {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  try {
    const expected = Buffer.from(hmac(payload));
    const actual = Buffer.from(signature);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      return null;
    }
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      email?: string;
      exp?: number;
    };
    if (
      typeof decoded.email !== "string" ||
      typeof decoded.exp !== "number" ||
      decoded.exp <= Math.floor(Date.now() / 1000)
    ) {
      return null;
    }
    return decoded.email.toLowerCase();
  } catch {
    return null;
  }
}

export function accessCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_SECONDS,
  };
}
