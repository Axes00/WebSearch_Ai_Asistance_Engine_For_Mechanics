"use client";

import { useLocale } from "next-intl";

import { Link, useRouter } from "@/lib/routing";

export default function AdminSessionActions() {
  const locale = useLocale();
  const router = useRouter();
  const isGreek = locale === "el";

  async function logout() {
    await fetch("/api/admin-auth/logout", { method: "POST" });
    router.push("/admin-login");
    router.refresh();
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Link href="/" target="_blank" rel="noopener noreferrer" className="btn-secondary">
        {isGreek ? "Ιστοσελίδα πελατών" : "Customer website"}
      </Link>
      <button type="button" className="btn-secondary" onClick={logout}>
        {isGreek ? "Αποσύνδεση" : "Log out"}
      </button>
    </div>
  );
}
