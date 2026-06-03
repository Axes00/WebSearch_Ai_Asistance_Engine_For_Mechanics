"use client";

import { FormEvent, useState } from "react";
import { useLocale } from "next-intl";
import { useRouter } from "@/lib/routing";

import TurnstileWidget from "@/components/TurnstileWidget";

type Mode = "login" | "request";

export default function AccessPage() {
  const locale = useLocale();
  const router = useRouter();
  const copy = text(locale);
  const [mode, setMode] = useState<Mode>("login");
  const [token, setToken] = useState("");
  const [captchaKey, setCaptchaKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function resetCaptcha() {
    setToken("");
    setCaptchaKey((value) => value + 1);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setBusy(true);
    setError(null);
    setMessage(null);
    const form = new FormData(formElement);
    const body =
      mode === "login"
        ? {
            email: form.get("email"),
            code: form.get("code"),
            turnstileToken: token,
          }
        : {
            firstName: form.get("firstName"),
            lastName: form.get("lastName"),
            email: form.get("email"),
            description: form.get("description"),
            turnstileToken: token,
          };

    try {
      const response = await fetch(`/api/access/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Request failed");
      if (mode === "login") {
        router.push("/library");
        router.refresh();
      } else {
        formElement.reset();
        setMessage(copy.requestSuccess);
      }
    } catch (submitError) {
      setError((submitError as Error).message);
    } finally {
      resetCaptcha();
      setBusy(false);
    }
  }

  return (
    <div className="explorer-bg min-h-[calc(100vh-4rem)] px-5 py-12 md:px-8">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-deepblue">Mechanica</p>
          <h1 className="section-heading mt-2">{copy.title}</h1>
          <p className="section-subtle mt-2">{copy.subtitle}</p>
        </div>
        <section className="card p-6 md:p-8">
          <div className="mb-6 flex gap-2 border-b border-steel-200 pb-3 dark:border-steel-700">
            {(["login", "request"] as const).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => {
                  setMode(item);
                  setError(null);
                  setMessage(null);
                  resetCaptcha();
                }}
                className={mode === item ? "btn-primary" : "btn-secondary"}
              >
                {item === "login" ? copy.loginTab : copy.requestTab}
              </button>
            ))}
          </div>
          <form className="space-y-4" onSubmit={submit}>
            {mode === "request" && (
              <div className="grid gap-4 md:grid-cols-2">
                <Field label={copy.firstName} name="firstName" maxLength={60} />
                <Field label={copy.lastName} name="lastName" maxLength={60} />
              </div>
            )}
            <Field label={copy.email} name="email" type="email" maxLength={254} />
            {mode === "login" ? (
              <Field label={copy.code} name="code" pattern="[A-Za-z0-9]{8}" maxLength={8} />
            ) : (
              <label className="block text-sm font-semibold text-ink dark:text-paper">
                {copy.description}
                <textarea name="description" required maxLength={300} rows={5} className="input-field mt-2 resize-y" />
                <span className="mt-1 block text-xs font-normal text-steel-500">{copy.maxCharacters}</span>
              </label>
            )}
            <TurnstileWidget key={captchaKey} onToken={setToken} />
            {error && <p className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
            {message && <p className="rounded-xl border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-700">{message}</p>}
            <button type="submit" disabled={busy || !token} className="btn-primary disabled:cursor-not-allowed disabled:opacity-50">
              {busy ? copy.working : mode === "login" ? copy.loginButton : copy.requestButton}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}

function Field(props: {
  label: string;
  name: string;
  type?: string;
  maxLength: number;
  pattern?: string;
}) {
  return (
    <label className="block text-sm font-semibold text-ink dark:text-paper">
      {props.label}
      <input {...props} required className="input-field mt-2" />
    </label>
  );
}

function text(locale: string) {
  return locale === "el"
    ? {
        title: "Πρόσβαση πελατών",
        subtitle: "Συνδεθείτε με τον κωδικό που λάβατε ή στείλτε αίτηση πρόσβασης.",
        loginTab: "Σύνδεση",
        requestTab: "Νέα αίτηση",
        firstName: "Όνομα",
        lastName: "Επώνυμο",
        email: "Email",
        code: "Αλφαριθμητικός κωδικός πρόσβασης 8 χαρακτήρων",
        description: "Περιγράψτε γιατί χρειάζεστε πρόσβαση",
        maxCharacters: "Έως 300 χαρακτήρες.",
        loginButton: "Σύνδεση στη βιβλιοθήκη",
        requestButton: "Αποστολή αίτησης",
        working: "Αποστολή...",
        requestSuccess: "Η αίτησή σας καταχωρήθηκε και θα εξεταστεί από τον διαχειριστή.",
      }
    : {
        title: "Customer access",
        subtitle: "Log in with your emailed code or submit a new access request.",
        loginTab: "Log in",
        requestTab: "New request",
        firstName: "First name",
        lastName: "Last name",
        email: "Email",
        code: "8-character alphanumeric access code",
        description: "Describe why you need access",
        maxCharacters: "Maximum 300 characters.",
        loginButton: "Enter the library",
        requestButton: "Submit request",
        working: "Submitting...",
        requestSuccess: "Your request was saved and will be reviewed by the administrator.",
      };
}
