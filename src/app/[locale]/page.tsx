import { setRequestLocale } from "next-intl/server";

import Hero from "@/components/Hero";
import HighlightedDocumentsRow from "@/components/HighlightedDocumentsRow";
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
  const highlights = await getHighlights();

  return (
    <>
      <Hero />
      <HighlightedDocumentsRow items={highlights} locale={locale} />
    </>
  );
}
