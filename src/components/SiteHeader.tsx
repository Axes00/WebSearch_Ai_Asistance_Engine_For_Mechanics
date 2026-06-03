"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/lib/routing";
import clsx from "clsx";

import AdminSessionActions from "./admin/AdminSessionActions";
import CustomerLogoutButton from "./CustomerLogoutButton";
import LanguageSwitcher from "./LanguageSwitcher";

/**
 * Global top bar.
 *
 * - Transparent over the homepage hero (first load above the fold)
 * - Solid steel/graphite when scrolled or on inner pages
 *
 * Rendering is intentionally minimal; the homepage hero supplies its own
 * over-image language switcher and this top bar takes over everywhere else.
 */
export default function SiteHeader({ customerLoggedIn }: { customerLoggedIn: boolean }) {
  const t = useTranslations("common");
  const pathname = usePathname();
  // Homepage renders its own hero-embedded header; hide the global one there.
  const isHome = pathname === "/";
  const isAdminPanel = pathname === "/admin";
  const isAdmin = isAdminPanel || pathname === "/admin-login";
  if (isHome) return null;

  return (
    <header
      className={clsx(
        "sticky top-0 z-40 transition-colors",
        "border-b border-steel-200 bg-white/80 backdrop-blur-md dark:border-steel-700 dark:bg-ink-soft/80"
      )}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 md:px-8">
        <Link
          href={isAdminPanel ? "/admin" : "/"}
          className="flex items-center gap-3 text-ink hover:text-deepblue dark:text-paper"
        >
          <Image
            src="/mechanica-logo.png"
            alt=""
            width={40}
            height={40}
            className="h-10 w-10 rounded-md bg-white object-cover shadow-sm"
          />
          <span className="font-display text-sm font-semibold uppercase tracking-wide">
            {t("appName")}
          </span>
        </Link>
        <nav className="flex items-center gap-3">
          {isAdminPanel && <AdminSessionActions />}
          {!isAdmin && customerLoggedIn && <CustomerLogoutButton />}
          <LanguageSwitcher surface="header" />
        </nav>
      </div>
    </header>
  );
}
