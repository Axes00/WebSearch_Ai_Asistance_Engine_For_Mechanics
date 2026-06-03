import { z } from "zod";

const suspiciousMarkup =
  /[<>]|javascript\s*:|data\s*:\s*text\/html|on[a-z]+\s*=|&#x?[0-9a-f]+;/i;
const controlChars = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const personName = /^[\p{L}\p{M}][\p{L}\p{M}\s.'-]*$/u;

export function rejectUnsafeText(value: string, label = "Text") {
  const text = value.normalize("NFC").trim();
  if (suspiciousMarkup.test(text) || controlChars.test(text)) {
    throw new Error(`${label} contains unsupported characters`);
  }
  return text;
}

const safeText = (max: number, label: string) =>
  z
    .string()
    .min(1)
    .max(max)
    .transform((value, ctx) => {
      try {
        return rejectUnsafeText(value, label);
      } catch (error) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: (error as Error).message,
        });
        return z.NEVER;
      }
    });

const safeName = (label: string) =>
  safeText(60, label).refine((value) => personName.test(value), {
    message: `${label} contains unsupported characters`,
  });

export const AccessRequestSchema = z.object({
  firstName: safeName("First name"),
  lastName: safeName("Last name"),
  email: z.string().trim().toLowerCase().email().max(254),
  description: safeText(300, "Description"),
  turnstileToken: z.string().min(1).max(4096),
});

export const AccessLoginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^(?=.*[A-Z])(?=.*\d)[A-Z0-9]{8}$/, "Enter the 8-character alphanumeric access code"),
  turnstileToken: z.string().min(1).max(4096),
});

export function safeSearchText(value: string, max = 500) {
  const text = rejectUnsafeText(value, "Search text");
  if (text.length > max) throw new Error("Search text is too long");
  return text;
}
