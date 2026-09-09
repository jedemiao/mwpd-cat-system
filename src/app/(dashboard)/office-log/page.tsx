import { getServerSession } from "next-auth";
import Link from "next/link";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  ACTION_FILTERS,
  ENTITY_FILTERS,
  getOfficeLog,
  groupByDay,
  officeDayEnd,
  officeDayStart,
  officeTime,
} from "@/lib/officeLog";
import { Pagination } from "@/components/Pagination";
import { PrintLink, listHref } from "@/components/PrintLink";
import { PrintToolbar } from "@/components/PrintToolbar";
import { PrintHeader } from "@/components/PrintHeader";
import { SearchIcon } from "@/components/icons";

const PAGE_SIZE = 50;
const PRINT_MAX = 1000;

type SearchParams = {
  q?: string;
  who?: string;
  module?: string;
  action?: string;
  from?: string;
  to?: string;
  page?: string;
  print?: string;
};

/**
 * The office log — every recorded action in this division, newest first.
 *
 * Read-only by construction: there is no API route, no form and no mutation
 * anywhere in this module. It renders AuditLog, which nothing in the app edits
 * or prunes, and it is scoped to the signed-in user's own office like every
 * other query in the app.
 *
 * Everyone in the division sees the whole division. That was the point of
 * asking for it — a Chief watching the day and staff seeing where a document
 * has got to are the same need, and a log only some people can read is a log
 * nobody trusts.
 */
export default async function OfficeLogPage(props: { searchParams: Promise<SearchParams> }) {
  const searchParams = await props.searchParams;
  const session = await getServerSession(authOptions);
  const officeId = session!.user.officeId;

  const q = searchParams.q?.trim() ?? "";
  const who = searchParams.who ?? "";
  const entityType = ENTITY_FILTERS.some((f) => f.value === searchParams.module)
    ? searchParams.module!
    : "";
  const action = ACTION_FILTERS.some((f) => f.value === searchParams.action)
    ? searchParams.action!
    : "";
  const from = searchParams.from ?? "";
  const to = searchParams.to ?? "";
  const isPrint = searchParams.print === "1";
  const page = Math.max(1, Number(searchParams.page) || 1);

  const [{ entries, total }, office, staff] = await Promise.all([
    getOfficeLog({
      officeId,
      q: q || undefined,
      userId: who || undefined,
      entityType: entityType || undefined,
      action: action || undefined,
      from: from ? officeDayStart(from) : undefined,
      // Inclusive of the day the reader typed: they mean "up to and including
      // the 9th", not "up to midnight as the 9th begins".
      to: to ? officeDayEnd(to) : undefined,
      skip: isPrint ? 0 : (page - 1) * PAGE_SIZE,
      take: isPrint ? PRINT_MAX : PAGE_SIZE,
    }),
    prisma.office.findUnique({ where: { id: officeId }, select: { name: true } }),
    // Deactivated staff included: their entries stay in the log forever, so the
    // filter has to be able to reach them.
    prisma.user.findMany({
      where: { officeId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, isActive: true },
    }),
  ]);

  const days = groupByDay(entries);

  const query = {
    ...(q ? { q } : {}),
    ...(who ? { who } : {}),
    ...(entityType ? { module: entityType } : {}),
    ...(action ? { action } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  };
  const filtered = Object.keys(query).length > 0;

  return (
    <main className="space-y-4 p-6 lg:p-8">
      {isPrint ? (
        <div className="flex items-center justify-between print:hidden">
          <h1 className="text-xl font-semibold text-ink-900 dark:text-white">
            Office log <span className="text-ink-400 dark:text-white/30">· print preview</span>
          </h1>
          <PrintToolbar backHref={listHref("/office-log", query)} />
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-ink-900 dark:text-white">Office log</h1>
            <p className="font-mono text-xs uppercase tracking-wide text-ink-500 dark:text-white/40">
              {total} entr{total === 1 ? "y" : "ies"} · {filtered ? "filtered" : "everything recorded"}
            </p>
          </div>
          <PrintLink basePath="/office-log" searchParams={query} />
        </div>
      )}

      {isPrint && (
        <PrintHeader
          officeName={office?.name ?? ""}
          title="Office Activity Log"
          filters={[
            { label: "Period", value: from || to ? `${from || "start"} to ${to || "today"}` : "All dates" },
            { label: "Staff", value: staff.find((s) => s.id === who)?.name ?? "Everyone" },
            { label: "Module", value: ENTITY_FILTERS.find((f) => f.value === entityType)?.label ?? "All" },
            { label: "Action", value: ACTION_FILTERS.find((f) => f.value === action)?.label ?? "All" },
            { label: "Search", value: q || "—" },
          ]}
          total={total}
          generatedBy={session!.user.name ?? "—"}
        />
      )}

      {!isPrint && (
        <form action="/office-log" method="get" className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400 dark:text-white/30" />
            <input
              type="text"
              name="q"
              defaultValue={q}
              placeholder="Who did it"
              className="field-input w-52 pl-9"
            />
          </div>
          <select name="who" defaultValue={who} className="field-input w-auto" aria-label="Staff">
            <option value="">Everyone</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.isActive ? "" : " (inactive)"}
              </option>
            ))}
          </select>
          <select name="module" defaultValue={entityType} className="field-input w-auto" aria-label="Module">
            <option value="">All modules</option>
            {ENTITY_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
          <select name="action" defaultValue={action} className="field-input w-auto" aria-label="Action">
            <option value="">All actions</option>
            {ACTION_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-xs text-ink-500 dark:text-white/40">
            From
            <input type="date" name="from" defaultValue={from} className="field-input w-auto" />
          </label>
          <label className="flex items-center gap-1.5 text-xs text-ink-500 dark:text-white/40">
            to
            <input type="date" name="to" defaultValue={to} className="field-input w-auto" />
          </label>
          <button type="submit" className="btn-dark">
            Search
          </button>
          <Link href="/office-log" className="btn-secondary">
            Clear
          </Link>
        </form>
      )}

      {entries.length === 0 && (
        <div className="card p-6 text-sm text-ink-500 dark:text-white/40">
          {filtered ? "Nothing recorded matches those filters." : "Nothing has been recorded yet."}
        </div>
      )}

      {/* A day-book, not a table: the office asked to watch the day, so the day
          is the unit that organises the page. Each heading is a date in office
          time, and entries run newest-first within it. */}
      {days.map((day) => (
        <section key={day.key} className="card overflow-hidden break-inside-avoid">
          <h2 className="border-b border-ink-400/15 bg-surface px-4 py-2 font-mono text-[11px] uppercase tracking-wider text-ink-500 dark:border-white/10 dark:bg-white/[0.03] dark:text-white/40">
            {day.heading}
            <span className="ml-2 text-ink-400 dark:text-white/25">
              {day.entries.length} entr{day.entries.length === 1 ? "y" : "ies"}
            </span>
          </h2>

          <ol className="divide-y divide-ink-400/15 dark:divide-white/10">
            {day.entries.map((entry) => (
              <li
                key={entry.id}
                className="flex flex-wrap items-baseline gap-x-2 gap-y-1 px-4 py-2 text-sm"
              >
                {/* Fixed width so the times form a readable column down the
                    left, the way they do in a paper logbook. */}
                <span className="w-20 shrink-0 font-mono text-xs tabular-nums text-ink-400 dark:text-white/30">
                  {officeTime(entry.at)}
                </span>

                <span className="font-medium text-ink-900 dark:text-white">{entry.actor}</span>

                {/* Deletions are the entries a Chief scans for, so the verb
                    carries the only colour on the line. */}
                <span
                  className={
                    entry.action === "DELETE"
                      ? "font-medium text-danger"
                      : "text-ink-500 dark:text-white/40"
                  }
                >
                  {entry.verb}
                </span>

                <span className="text-ink-500 dark:text-white/40">{entry.entityLabel}</span>

                {entry.subject &&
                  (entry.href ? (
                    <Link
                      href={entry.href}
                      className="font-medium text-primary hover:text-primary-600 print:text-ink-900"
                    >
                      {entry.subject}
                    </Link>
                  ) : (
                    <span className="text-ink-700 dark:text-white/70">{entry.subject}</span>
                  ))}

                {/* Said plainly rather than left as a link that 404s. */}
                {entry.gone && (
                  <span className="font-mono text-[10px] uppercase tracking-wider text-ink-400 dark:text-white/25">
                    no longer on file
                  </span>
                )}
              </li>
            ))}
          </ol>
        </section>
      ))}

      {!isPrint && (
        <Pagination
          basePath="/office-log"
          page={page}
          totalPages={Math.max(1, Math.ceil(total / PAGE_SIZE))}
          total={total}
          searchParams={query}
        />
      )}
    </main>
  );
}
