"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BellIcon, InboxIcon } from "./icons";

type RoutedDoc = { id: string; routingNumber: string; documentTitle: string };

type Summary = {
  overdue: number;
  dueSoon: number;
  routedToMe: number;
  routedDocs: RoutedDoc[];
  // The Chief's side of the reply review and the staff's side of it. Both
  // are derived from document status on every fetch (see
  // getOutgoingReviewQueues), so they outlive the toast that announced them.
  forChecking: number;
  forCheckingDocs: RoutedDoc[];
  returnedToMe: number;
  returnedDocs: RoutedDoc[];
  // Documents another division has released to this office and nobody here
  // has filed yet.
  deliveries: number;
  deliveryDocs: RoutedDoc[];
};

// The toast carries its own heading and destination rather than assuming the
// incoming ledger, because work now changes hands in three places: a document
// routed to you, a reply submitted for your checking, and a reply coming back
// approved or returned.
type Toast = {
  id: string;
  heading: string;
  routingNumber: string;
  documentTitle: string;
  href: string;
};

// What each event is called on screen, and where pressing it should land. The
// headings are written from the reader's side — the Chief is told something
// needs checking, the author is told what came back.
const TOAST_COPY: Record<string, string> = {
  "incoming-routed": "Routed to you",
  "outgoing-submitted": "Ready for checking",
  "outgoing-returned": "Returned for revision",
  "outgoing-approved": "Approved",
  "delivery-arrived": "Delivered to your division",
  "delivery-received": "Received by",
};

const TOAST_TTL_MS = 7000;

export function NotificationBell({ initial }: { initial: Summary }) {
  const [summary, setSummary] = useState(initial);
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  useEffect(() => {
    async function refreshSummary() {
      const res = await fetch("/api/notifications/summary", { cache: "no-store" });
      if (res.ok) setSummary(await res.json());
    }

    const source = new EventSource("/api/notifications/stream");

    source.onmessage = (e) => {
      const event = JSON.parse(e.data);

      const heading = TOAST_COPY[event.type];
      if (heading) {
        const toast: Toast = {
          id: `${event.documentId}-${Date.now()}`,
          heading,
          // A reply is not numbered until it is released, so an early version
          // has nothing to show here; the version number is what the two of
          // them will actually call it in the meantime.
          routingNumber:
            event.officeCode ??
            event.routingNumber ??
            `v${event.versionNumber}`,
          documentTitle: event.documentTitle,
          href:
            event.type === "incoming-routed"
              ? `/incoming/${event.documentId}`
              : event.type === "delivery-arrived"
                ? // The tray lives on the register page; the document has no
                  // id here until it is filed.
                  "/incoming"
                : `/outgoing/${event.documentId}`,
        };
        setToasts((prev) => [...prev, toast]);
        setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== toast.id));
        }, TOAST_TTL_MS);
        setSeen(false);
      }

      refreshSummary();
    };

    return () => source.close();
  }, []);

  const artaCount = summary.overdue + summary.dueSoon;
  const totalCount =
    artaCount + summary.routedToMe + summary.forChecking + summary.returnedToMe + summary.deliveries;
  const badgeTone = "bg-danger";

  return (
    <>
      <div ref={ref} className="relative">
        <button
          type="button"
          onClick={() =>
            setOpen((v) => {
              const next = !v;
              if (next) setSeen(true);
              return next;
            })
          }
          className="relative flex h-9 w-9 items-center justify-center rounded-full text-ink-500 hover:bg-surface hover:text-ink-900 dark:text-white/60 dark:hover:bg-white/5 dark:hover:text-white"
          title="Notifications"
        >
          <BellIcon className="h-5 w-5" />
          {totalCount > 0 && !seen && (
            <span
              className={`absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold leading-none text-white ${badgeTone}`}
            >
              {totalCount}
            </span>
          )}
        </button>

        {open && (
          <div className="absolute right-0 top-full z-20 mt-2 w-80 overflow-hidden rounded-md border border-ink-400/15 bg-white shadow-lg dark:border-white/10 dark:bg-ink-800">
            <QueueSection
              heading="Routed to you"
              empty="Nothing routed to you right now."
              docs={summary.routedDocs}
              hrefFor={(id) => `/incoming/${id}`}
              onNavigate={() => setOpen(false)}
            />

            {/* Only rendered when there is something in it: a staff account
                never has a checking queue, and an empty "Returned" heading on
                a Chief's bell would read as a state the office was in rather
                than the absence of one. */}
            {summary.forCheckingDocs.length > 0 && (
              <QueueSection
                heading="For your checking"
                empty=""
                docs={summary.forCheckingDocs}
                hrefFor={(id) => `/outgoing/${id}`}
                onNavigate={() => setOpen(false)}
              />
            )}

            {summary.deliveryDocs.length > 0 && (
              <QueueSection
                heading="Delivered to your division"
                empty=""
                docs={summary.deliveryDocs}
                hrefFor={() => "/incoming"}
                onNavigate={() => setOpen(false)}
              />
            )}

            {summary.returnedDocs.length > 0 && (
              <QueueSection
                heading="Returned for your revision"
                empty=""
                docs={summary.returnedDocs}
                hrefFor={(id) => `/outgoing/${id}`}
                onNavigate={() => setOpen(false)}
              />
            )}

            <div className="border-t border-ink-400/10 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-ink-500 dark:border-white/8 dark:text-white/40">
              ARTA compliance
            </div>
            <Link
              href="/incoming"
              onClick={() => setOpen(false)}
              className="block px-4 py-2.5 text-sm hover:bg-surface dark:hover:bg-white/5"
            >
              {artaCount === 0 ? (
                <span className="text-ink-500 dark:text-white/40">Nothing overdue or due soon.</span>
              ) : (
                <span className="text-ink-700 dark:text-white/70">
                  {summary.overdue > 0 && <span className="font-medium text-danger">{summary.overdue} overdue</span>}
                  {summary.overdue > 0 && summary.dueSoon > 0 && " · "}
                  {summary.dueSoon > 0 && <span className="font-medium text-[#92660c] dark:text-warning">{summary.dueSoon} due soon</span>}
                </span>
              )}
            </Link>
          </div>
        )}
      </div>

      <div className="fixed right-6 top-20 z-50 space-y-2">
        {toasts.map((toast) => (
          <Link
            key={toast.id}
            href={toast.href}
            className="flex w-80 items-start gap-3 rounded-md border border-ink-400/15 bg-white p-3.5 shadow-lg transition-opacity hover:bg-surface dark:border-white/10 dark:bg-ink-800 dark:hover:bg-white/5"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-700 dark:bg-primary/20 dark:text-primary-100">
              <InboxIcon className="h-4 w-4" />
            </span>
            <span>
              <span className="block text-xs font-semibold uppercase tracking-wide text-ink-500 dark:text-white/40">{toast.heading}</span>
              <span className="block font-mono text-xs text-ink-500 dark:text-white/40">{toast.routingNumber}</span>
              <span className="block text-sm text-ink-900 dark:text-white">{toast.documentTitle}</span>
            </span>
          </Link>
        ))}
      </div>
    </>
  );
}


// One labelled list in the bell. Three queues share it so a document waiting
// on you looks the same wherever it came from — the reader is scanning for
// "what is mine", not for which module produced the row.
function QueueSection({
  heading,
  empty,
  docs,
  hrefFor,
  onNavigate,
}: {
  heading: string;
  empty: string;
  docs: RoutedDoc[];
  hrefFor: (id: string) => string;
  onNavigate: () => void;
}) {
  return (
    <>
      <div className="border-b border-ink-400/10 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-ink-500 dark:border-white/8 dark:text-white/40">
        {heading}
      </div>
      {docs.length === 0 ? (
        <p className="px-4 py-3 text-sm text-ink-500 dark:text-white/40">{empty}</p>
      ) : (
        <ul className="max-h-56 overflow-y-auto">
          {docs.map((doc) => (
            <li key={doc.id}>
              <Link
                href={hrefFor(doc.id)}
                onClick={onNavigate}
                className="block border-b border-ink-400/10 px-4 py-2.5 text-sm last:border-0 hover:bg-surface dark:border-white/8 dark:hover:bg-white/5"
              >
                <span className="block font-mono text-xs text-ink-500 dark:text-white/40">{doc.routingNumber}</span>
                <span className="text-ink-900 dark:text-white">{doc.documentTitle}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}