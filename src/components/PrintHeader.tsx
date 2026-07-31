// Print-only letterhead for a ledger printout. Never renders on screen.
//
// A printed page leaves the system, so it has to identify itself on its own:
// which office, which ledger, what was filtered, how many rows, when, and by
// whom. Without that a printout is an anonymous table — useless as a record and
// impossible to reconcile against the app later.
//
// Deliberately text-only (no seal image): print rendering of remote/optimised
// images is unreliable across browsers, and a missing logo would leave a gap in
// an official document. Typography reuses the app's existing display/mono
// faces rather than introducing a separate print style.

export type PrintFilter = { label: string; value: string };

export function PrintHeader({
  officeName,
  title,
  filters,
  total,
  generatedBy,
  truncatedAt,
}: {
  officeName: string;
  title: string;
  filters: PrintFilter[];
  total: number;
  generatedBy: string;
  truncatedAt?: number;
}) {
  const active = filters.filter((f) => f.value);

  return (
    <header className="hidden print:mb-4 print:block">
      <p className="text-center font-display text-[10pt] leading-tight">Republic of the Philippines</p>
      <p className="text-center font-display text-[12pt] font-semibold uppercase leading-tight tracking-wide">
        Department of Migrant Workers
      </p>
      <p className="text-center font-display text-[10pt] leading-tight">{officeName}</p>

      <h1 className="mt-3 border-y border-black py-1.5 text-center font-display text-[13pt] font-semibold uppercase tracking-wide">
        {title}
      </h1>

      <div className="mt-2 flex justify-between gap-6 font-mono text-[8pt] uppercase tracking-wide">
        <p>
          {active.length > 0
            ? active.map((f) => `${f.label}: ${f.value}`).join("  ·  ")
            : "Filter: none — complete ledger"}
        </p>
        <p className="whitespace-nowrap">
          {total} record{total === 1 ? "" : "s"}
        </p>
      </div>

      <p className="mt-0.5 font-mono text-[8pt] uppercase tracking-wide">
        Generated {new Date().toLocaleString()} by {generatedBy}
      </p>

      {truncatedAt !== undefined && total > truncatedAt && (
        <p className="mt-1 font-mono text-[8pt] font-semibold uppercase tracking-wide">
          Showing the first {truncatedAt} of {total} records — narrow the filter to print the rest.
        </p>
      )}
    </header>
  );
}
