import { setRequestLocale, getTranslations } from "next-intl/server";

import AdminTabs from "@/components/admin/AdminTabs";

/**
 * /[locale]/admin
 *
 * TODO (auth, v3):
 *   - Protect this route and every /api/admin/* endpoint with a middleware
 *     guard (env-based password, or NextAuth credentials once user
 *     management is required).
 *   - Until then, the page is reachable without credentials. The README
 *     documents this caveat explicitly; run behind localhost only.
 */
export default async function AdminPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("admin");

  return (
    <div className="explorer-bg min-h-[calc(100vh-4rem)] pb-20">
      <div className="mx-auto max-w-6xl px-5 pt-10 md:px-8 md:pt-14">
        <div className="mb-8">
          <h1 className="section-heading">{t("title")}</h1>
          <p className="section-subtle mt-1">{t("subtitle")}</p>
        </div>
        <AdminTabs />
      </div>
    </div>
  );
}
