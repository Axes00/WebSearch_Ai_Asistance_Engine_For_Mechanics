"use client";

import { useLocale } from "next-intl";

import { useRouter } from "@/lib/routing";

export default function CustomerLogoutButton({
  surface = "header",
}: {
  surface?: "header" | "hero";
}) {
  const locale = useLocale();
  const router = useRouter();

  async function logout() {
    await fetch("/api/access/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={logout}
      className={
        surface === "hero"
          ? "inline-flex items-center gap-2 rounded-xl border border-white/35 bg-white/10 px-6 py-3 text-sm font-semibold text-white backdrop-blur-md transition hover:-translate-y-0.5 hover:border-white/60 hover:bg-white/20"
          : "btn-secondary"
      }
    >
      {locale === "el" ? "Αποσύνδεση" : "Log out"}
    </button>
  );
}
