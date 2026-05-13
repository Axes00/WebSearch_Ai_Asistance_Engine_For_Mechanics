import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";

import ExplorerGrid from "@/components/ExplorerGrid";
import {
  breadcrumbsFor,
  listChildren,
  resolveBySlugPath,
  toDTO,
} from "@/lib/library";
import { prettyDisplayName } from "@/lib/format";

export default async function LibraryNestedPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string[] }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const current = await resolveBySlugPath(slug);
  if (!current) notFound();

  // If the user lands on a file URL we redirect into the viewer; cleaner UX
  // than trying to render a file as an explorer page.
  if (current.itemType === "file") {
    const { redirect } = await import("next/navigation");
    redirect(`/${locale}/viewer/${current.id}`);
  }

  const { folders, files } = await listChildren(current.id);
  const breadcrumbs = await breadcrumbsFor(current, locale);

  const basePath = `/${locale}/library/${slug.join("/")}`;
  const folderDTOs = folders.map((f) => ({
    ...toDTO(f),
    href: `${basePath}/${f.slug}`,
  }));

  return (
    <ExplorerGrid
      locale={locale}
      title={prettyDisplayName(current.name, "folder")}
      breadcrumbs={breadcrumbs}
      folders={folderDTOs}
      files={files.map(toDTO)}
    />
  );
}
