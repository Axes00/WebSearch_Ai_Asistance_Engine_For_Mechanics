import { getRequestConfig } from "next-intl/server";
import { notFound } from "next/navigation";

export const locales = ["el", "en"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale =
  ((process.env.DEFAULT_LOCALE as Locale) &&
  (locales as readonly string[]).includes(process.env.DEFAULT_LOCALE as string)
    ? (process.env.DEFAULT_LOCALE as Locale)
    : "el");

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale: Locale = (locales as readonly string[]).includes(
    requested as string
  )
    ? (requested as Locale)
    : defaultLocale;

  // next-intl 3 expects `notFound()` for invalid locales so the user
  // hits the 404 page rather than an empty translation dictionary.
  if (!requested || !(locales as readonly string[]).includes(requested)) {
    if (requested) notFound();
  }

  const messages = (await import(`../../messages/${locale}.json`)).default;
  return { locale, messages };
});
