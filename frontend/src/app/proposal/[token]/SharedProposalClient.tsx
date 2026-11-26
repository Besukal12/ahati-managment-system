"use client";

import { useEffect, useState, type FormEvent } from "react";

type CustomerSelection = "PENDING" | "SELECTED" | "NOT_SELECTED";

type SharedProposal = {
  title: string;
  eventType: string | null;
  eventDate: string | null;
  location: string | null;
  guestCount: number | null;
  validUntil: string | null;
  total: string;
  items: Array<{
    id: string;
    description: string | null;
    unitPrice: string;
    quantity: string;
    totalPrice: string;
    customerSelection: CustomerSelection;
    vendor: { name: string; categoryName: string };
  }>;
};

async function responseMessage(response: Response): Promise<string> {
  try {
    const body = await response.json();
    return typeof body.message === "string"
      ? body.message
      : "This proposal link is unavailable.";
  } catch {
    return "This proposal link is unavailable.";
  }
}

function formatAmount(value: string): string {
  const amount = Number(value);
  return Number.isFinite(amount)
    ? new Intl.NumberFormat(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(amount)
    : value;
}

function formatDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? null
    : new Intl.DateTimeFormat(undefined, { dateStyle: "long" }).format(date);
}

export default function SharedProposalClient({
  token,
}: {
  token: string;
}) {
  const [proposal, setProposal] = useState<SharedProposal | null>(null);
  const [selections, setSelections] = useState<
    Record<string, Exclude<CustomerSelection, "PENDING">>
  >({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [savingSelections, setSavingSelections] = useState(false);
  const [submittingChange, setSubmittingChange] = useState(false);
  const [changeMessage, setChangeMessage] = useState("");
  const [changeItemId, setChangeItemId] = useState("");

  useEffect(() => {
    let active = true;
    fetch(`/api/shared/proposals/${encodeURIComponent(token)}`, {
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(await responseMessage(response));
        return (await response.json()) as { proposal: SharedProposal };
      })
      .then(({ proposal: result }) => {
        if (!active) return;
        setProposal(result);
        setSelections(
          Object.fromEntries(
            result.items
              .filter((item) => item.customerSelection !== "PENDING")
              .map((item) => [item.id, item.customerSelection]),
          ),
        );
      })
      .catch((cause: unknown) => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "This proposal link is unavailable.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [token]);

  async function saveSelections() {
    if (!proposal) return;
    const payload = proposal.items
      .filter((item) => selections[item.id])
      .map((item) => ({
        itemId: item.id,
        selection: selections[item.id],
      }));
    if (payload.length === 0) {
      setError("Choose at least one item before saving your selections.");
      return;
    }

    setSavingSelections(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(
        `/api/shared/proposals/${encodeURIComponent(token)}/selections`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ selections: payload }),
        },
      );
      if (!response.ok) throw new Error(await responseMessage(response));
      const result = await response.json();
      setSelections(
        Object.fromEntries(
          result.selections
            .filter(
              (selection: {
                itemId: string;
                selection: CustomerSelection;
              }) => selection.selection !== "PENDING",
            )
            .map(
            (selection: {
              itemId: string;
              selection: CustomerSelection;
            }) => [selection.itemId, selection.selection],
            ),
        ),
      );
      setNotice("Your selections have been saved.");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to save selections.",
      );
    } finally {
      setSavingSelections(false);
    }
  }

  async function submitChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmittingChange(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(
        `/api/shared/proposals/${encodeURIComponent(token)}/changes`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            message: changeMessage,
            ...(changeItemId ? { proposalItemId: changeItemId } : {}),
          }),
        },
      );
      if (!response.ok) throw new Error(await responseMessage(response));
      setChangeMessage("");
      setChangeItemId("");
      setNotice("Your request has been sent to the Ahati team for review.");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to send your request.",
      );
    } finally {
      setSubmittingChange(false);
    }
  }

  if (loading) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-3xl items-center justify-center px-5">
        <p className="text-sm text-stone-600">Loading your proposal…</p>
      </main>
    );
  }

  if (!proposal) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-xl items-center justify-center px-5">
        <section className="w-full rounded-3xl border border-stone-200 bg-white p-8 text-center shadow-sm">
          <p className="mb-2 text-sm font-semibold uppercase tracking-[0.2em] text-emerald-800">
            Ahati
          </p>
          <h1 className="text-2xl font-semibold text-stone-900">
            Proposal unavailable
          </h1>
          <p className="mt-3 text-sm leading-6 text-stone-600">
            {error || "This private proposal link is invalid or has expired."}
          </p>
        </section>
      </main>
    );
  }

  const eventDate = formatDate(proposal.eventDate);
  const expiryDate = formatDate(proposal.validUntil);

  return (
    <main className="mx-auto min-h-screen w-full max-w-4xl px-4 py-8 text-stone-900 sm:px-6 sm:py-12">
      <header className="mb-8 text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-emerald-800">
          Ahati
        </p>
        <p className="mt-2 text-sm text-stone-500">A proposal made for you</p>
      </header>

      <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm sm:p-10">
        <div className="flex flex-col gap-5 border-b border-stone-200 pb-7 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-800">
              Your event proposal
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
              {proposal.title}
            </h1>
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-stone-600">
              {proposal.eventType && <span>{proposal.eventType}</span>}
              {eventDate && <span>{eventDate}</span>}
              {proposal.location && <span>{proposal.location}</span>}
              {proposal.guestCount !== null && (
                <span>{proposal.guestCount} guests</span>
              )}
            </div>
          </div>
          {expiryDate && (
            <p className="shrink-0 rounded-full bg-amber-50 px-4 py-2 text-sm text-amber-900">
              Valid until {expiryDate}
            </p>
          )}
        </div>

        <section className="py-7" aria-labelledby="items-heading">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <h2 id="items-heading" className="text-xl font-semibold">
                Your proposal items
              </h2>
              <p className="mt-1 text-sm text-stone-600">
                Review each item and save your preferences below.
              </p>
            </div>
          </div>

          <div className="divide-y divide-stone-200 rounded-2xl border border-stone-200">
            {proposal.items.map((item) => (
              <article key={item.id} className="p-5 sm:p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-800">
                      {item.vendor.categoryName}
                    </p>
                    <h3 className="mt-1 text-lg font-semibold">
                      {item.vendor.name}
                    </h3>
                    {item.description && (
                      <p className="mt-2 max-w-2xl whitespace-pre-wrap text-sm leading-6 text-stone-600">
                        {item.description}
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 text-left sm:text-right">
                    <p className="text-lg font-semibold">
                      {formatAmount(item.totalPrice)}
                    </p>
                    <p className="mt-1 text-xs text-stone-500">
                      {formatAmount(item.unitPrice)} per unit · quantity{" "}
                      {item.quantity}
                    </p>
                  </div>
                </div>

                <fieldset className="mt-5 flex flex-wrap gap-3">
                  <legend className="sr-only">
                    Select {item.vendor.name}
                  </legend>
                  {(
                    [
                      ["SELECTED", "I'd like this"],
                      ["NOT_SELECTED", "Not for me"],
                    ] as const
                  ).map(([value, label]) => (
                    <label
                      key={value}
                      className={`flex cursor-pointer items-center gap-2 rounded-full border px-4 py-2 text-sm transition ${
                        selections[item.id] === value
                          ? "border-emerald-800 bg-emerald-50 text-emerald-950"
                          : "border-stone-300 bg-white text-stone-700 hover:border-emerald-700"
                      }`}
                    >
                      <input
                        type="radio"
                        name={`selection-${item.id}`}
                        value={value}
                        checked={selections[item.id] === value}
                        onChange={() =>
                          setSelections((current) => ({
                            ...current,
                            [item.id]: value,
                          }))
                        }
                        className="accent-emerald-800"
                      />
                      {label}
                    </label>
                  ))}
                </fieldset>
              </article>
            ))}
            {proposal.items.length === 0 && (
              <p className="p-6 text-sm text-stone-600">
                No items have been added to this proposal yet.
              </p>
            )}
          </div>

          <div className="mt-5 flex flex-col gap-4 rounded-2xl bg-stone-50 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-stone-600">Proposal total</p>
              <p className="mt-1 text-2xl font-semibold">
                {formatAmount(proposal.total)}
              </p>
            </div>
            <button
              type="button"
              onClick={saveSelections}
              disabled={
                savingSelections || Object.keys(selections).length === 0
              }
              className="rounded-full bg-emerald-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {savingSelections ? "Saving…" : "Save my selections"}
            </button>
          </div>
        </section>

        <section className="border-t border-stone-200 pt-7">
          <h2 className="text-xl font-semibold">Request a change</h2>
          <p className="mt-1 text-sm leading-6 text-stone-600">
            Tell our team what you would like to discuss. A request does not
            automatically change your proposal.
          </p>
          <form onSubmit={submitChange} className="mt-4 space-y-4">
            <label className="block text-sm font-medium text-stone-800">
              Related item (optional)
              <select
                value={changeItemId}
                onChange={(event) => setChangeItemId(event.target.value)}
                className="mt-1.5 block w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 font-normal"
              >
                <option value="">General request</option>
                {proposal.items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.vendor.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium text-stone-800">
              Your request
              <textarea
                required
                minLength={1}
                maxLength={3000}
                rows={4}
                value={changeMessage}
                onChange={(event) => setChangeMessage(event.target.value)}
                className="mt-1.5 block w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 font-normal"
                placeholder="What would you like us to review?"
              />
            </label>
            <button
              type="submit"
              disabled={submittingChange || !changeMessage.trim()}
              className="rounded-full border border-emerald-900 px-6 py-3 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submittingChange ? "Sending…" : "Send change request"}
            </button>
          </form>
        </section>

        <p className="mt-7 border-t border-stone-200 pt-5 text-xs leading-5 text-stone-500">
          Your selections are preferences only and do not confirm a booking.
        </p>
      </section>

      {(error || notice) && (
        <p
          role={error ? "alert" : "status"}
          className={`mt-4 rounded-xl px-4 py-3 text-sm ${
            error
              ? "bg-red-50 text-red-800"
              : "bg-emerald-50 text-emerald-900"
          }`}
        >
          {error || notice}
        </p>
      )}
    </main>
  );
}
