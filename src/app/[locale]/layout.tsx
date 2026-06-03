import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";

import SiteHeader from "@/components/SiteHeader";
import { ACCESS_COOKIE } from "@/lib/access";
import { hasCustomerAccess } from "@/lib/customerAccess";
import { locales, type Locale } from "@/lib/i18n";

export function generateStaticParams() {
  return (locales as readonly string[]).map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!(locales as readonly string[]).includes(locale)) notFound();

  setRequestLocale(locale);
  const [messages, cookieStore] = await Promise.all([getMessages(), cookies()]);
  const customerLoggedIn = await hasCustomerAccess(
    cookieStore.get(ACCESS_COOKIE)?.value
  );

  return (
    <NextIntlClientProvider locale={locale as Locale} messages={messages}>
      <div className="flex min-h-screen flex-col">
        <SiteHeader customerLoggedIn={customerLoggedIn} />
        <main className="flex-1">{children}</main>
      </div>
    </NextIntlClientProvider>
  );
}
