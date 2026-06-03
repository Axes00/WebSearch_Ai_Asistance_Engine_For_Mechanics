"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale } from "next-intl";

type AccessRequest = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  description: string;
  status: string;
  requestedAt: string;
  approvedAt: string | null;
};

export default function AdminRequestsPanel() {
  const locale = useLocale();
  const c = copy(locale);
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const query = new URLSearchParams();
    if (from) query.set("from", from);
    if (to) query.set("to", to);
    const response = await fetch(`/api/admin/access-requests?${query}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load requests");
    setRequests(data.requests);
  }, [from, to]);

  useEffect(() => {
    void load().catch((loadError) => setError((loadError as Error).message));
  }, [load]);

  async function act(id: string, action: "approve" | "reject") {
    setBusyId(id);
    setError(null);
    try {
      const response = await fetch("/api/admin/access-requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Action failed");
      await load();
    } catch (actionError) {
      setError((actionError as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="card p-6 md:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-ink dark:text-paper">{c.title}</h2>
          <p className="mt-1 text-sm text-steel-500 dark:text-steel-300">{c.description}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <DateField label={c.from} value={from} onChange={setFrom} />
          <DateField label={c.to} value={to} onChange={setTo} />
        </div>
      </div>
      {error && <p className="mt-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      <div className="mt-5 space-y-3">
        {requests.length === 0 && <p className="text-sm text-steel-500">{c.empty}</p>}
        {requests.map((request) => (
          <article key={request.id} className="rounded-xl border border-steel-200 bg-white p-4 dark:border-steel-700 dark:bg-ink">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold text-ink dark:text-paper">{request.firstName} {request.lastName}</h3>
                  <span className="chip border-steel-200 text-steel-600">{request.status}</span>
                </div>
                <p className="mt-1 text-sm text-deepblue dark:text-cyan-soft">{request.email}</p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-steel-600 dark:text-steel-300">{request.description}</p>
                <p className="mt-3 text-xs text-steel-500">{c.requested}: {new Date(request.requestedAt).toLocaleString(locale)}</p>
              </div>
              <div className="flex gap-2">
                {request.status === "approved" ? (
                  <span className="inline-flex items-center rounded-xl border border-green-300 bg-green-50 px-4 py-3 text-sm font-semibold text-green-700">
                    {c.approved}
                  </span>
                ) : request.status === "rejected" ? (
                  <span className="inline-flex items-center rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                    {c.rejected}
                  </span>
                ) : (
                  <button type="button" disabled={busyId === request.id} onClick={() => void act(request.id, "approve")} className="btn-primary">
                    {c.approve}
                  </button>
                )}
                {request.status !== "rejected" && (
                  <button type="button" disabled={busyId === request.id} onClick={() => void act(request.id, "reject")} className="btn-secondary">
                    {c.reject}
                  </button>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="text-xs font-semibold uppercase tracking-wide text-steel-500">
      {label}
      <input type="date" value={value} onChange={(event) => onChange(event.target.value)} className="input-field mt-1 py-2" />
    </label>
  );
}

function copy(locale: string) {
  return locale === "el"
    ? { title: "Αιτήσεις πρόσβασης", description: "Έγκριση με αποστολή κωδικού email ή απόρριψη και ανάκληση πρόσβασης.", from: "Από", to: "Έως", empty: "Δεν υπάρχουν αιτήσεις για αυτό το διάστημα.", requested: "Ημερομηνία αίτησης", approve: "Έγκριση", approved: "Εγκρίθηκε", reject: "Απόρριψη", rejected: "Απορρίφθηκε" }
    : { title: "Access requests", description: "Approve and email an access code, or reject and revoke access.", from: "From", to: "To", empty: "No requests for this period.", requested: "Requested", approve: "Approve", approved: "Approved", reject: "Reject", rejected: "Rejected" };
}
