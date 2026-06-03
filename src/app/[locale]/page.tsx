import { setRequestLocale } from "next-intl/server";
import { cookies } from "next/headers";

import Hero from "@/components/Hero";
import HighlightedDocumentsRow from "@/components/HighlightedDocumentsRow";
import { ACCESS_COOKIE } from "@/lib/access";
import { hasCustomerAccess } from "@/lib/customerAccess";
import { prisma } from "@/lib/db";
import { toDTO } from "@/lib/library";

/**
 * Fetch highlighted documents directly from the DB on the server so the
 * homepage can render without hitting its own HTTP API first.
 */
async function getHighlights() {
  const rows = await prisma.libraryItem.findMany({
    where: {
      isHighlighted: true,
      isHidden: false,
      isAdminHidden: false,
      isBrowsable: true,
      itemType: "file",
    },
    orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
    take: 24,
  });
  return rows.map(toDTO);
}

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [highlights, customerLoggedIn] = await Promise.all([
    getHighlights(),
    cookies().then((store) => hasCustomerAccess(store.get(ACCESS_COOKIE)?.value)),
  ]);

  return (
    <>
      <Hero customerLoggedIn={customerLoggedIn} />
      <HighlightedDocumentsRow items={highlights} locale={locale} />
    </>
  );
}
