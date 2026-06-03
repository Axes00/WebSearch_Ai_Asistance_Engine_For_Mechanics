"use client";

import { FormEvent, useState } from "react";
import { useLocale } from "next-intl";

import TurnstileWidget from "@/components/TurnstileWidget";
import { Link, useRouter } from "@/lib/routing";

export default function AdminLoginPage() {
  const locale = useLocale();
  const router = useRouter();
  const copy = locale === "el" ? greek : english;
  const [token, setToken] = useState("");
  const [captchaKey, setCaptchaKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/admin-auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.get("email"),
          password: form.get("password"),
          turnstileToken: token,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Login failed");
      router.push("/admin");
      router.refresh();
    } catch (loginError) {
      setError((loginError as Error).message);
      setToken("");
      setCaptchaKey((value) => value + 1);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="explorer-bg min-h-[calc(100vh-4rem)] px-5 py-12 md:px-8">
      <section className="card mx-auto max-w-md p-6 md:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-deepblue">Mechanica</p>
        <h1 className="section-heading mt-2">{copy.title}</h1>
        <p className="section-subtle mt-2">{copy.subtitle}</p>
        <form className="mt-6 space-y-4" onSubmit={submit}>
          <label className="block text-sm font-semibold text-ink dark:text-paper">
            Email
            <input name="email" type="email" required maxLength={254} className="input-field mt-2" />
          </label>
          <label className="block text-sm font-semibold text-ink dark:text-paper">
            {copy.password}
            <input name="password" type="password" required maxLength={200} className="input-field mt-2" />
          </label>
          <TurnstileWidget key={captchaKey} onToken={setToken} />
          {error && <p className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
          <button type="submit" disabled={busy || !token} className="btn-primary disabled:cursor-not-allowed disabled:opacity-50">
            {busy ? copy.working : copy.button}
          </button>
        </form>
        <Link href="/" target="_blank" rel="noopener noreferrer" className="mt-5 inline-flex text-sm font-semibold text-deepblue hover:underline">
          {copy.customerSite}
        </Link>
      </section>
    </div>
  );
}

const greek = {
  title: "Σύνδεση διαχειριστή",
  subtitle: "Η είσοδος προστατεύεται με Cloudflare Turnstile.",
  password: "Κωδικός πρόσβασης",
  button: "Σύνδεση",
  working: "Έλεγχος...",
  customerSite: "Επιστροφή στην ιστοσελίδα πελατών",
};

const english = {
  title: "Administrator login",
  subtitle: "Login is protected with Cloudflare Turnstile.",
  password: "Password",
  button: "Log in",
  working: "Checking...",
  customerSite: "Return to customer website",
};
