import { setRequestLocale, getTranslations } from "next-intl/server";

import ExplorerGrid from "@/components/ExplorerGrid";
import { listChildren, toDTO } from "@/lib/library";

export default async function LibraryRootPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("library");

  // Top-level children of the archive root (no parent).
  const { folders, files } = await listChildren(null);

  const folderDTOs = folders.map((f) => ({
    ...toDTO(f),
    href: `/${locale}/library/${f.slug}`,
  }));

  return (
    <ExplorerGrid
      locale={locale}
      title={t("groupsTitle")}
      subtitle={t("groupsSubtitle")}
      breadcrumbs={[]}
      folders={folderDTOs}
      files={files.map(toDTO)}
      searchPlaceholderKey="library.searchPlaceholderRoot"
    />
  );
}
