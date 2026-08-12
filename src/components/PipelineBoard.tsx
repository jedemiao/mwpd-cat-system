import Link from "next/link";
import {
  PIPELINE_STAGE_HINTS,
  PIPELINE_STAGE_LABELS,
  type PipelineCounts,
  type PipelineStage,
} from "@/lib/correspondencePipeline";

// Rendered as one continuous strip rather than four separate cards, because the
// stages are a sequence a document travels, not four unrelated metrics. The
// dividers between cells read as the handovers; a gap between cards would say
// these are independent numbers, which is exactly the wrong reading.
//
// Deliberately colourless. Every count here is a neutral fact about where work
// sits — a large "With staff" is a healthy office, and tinting the cells amber
// would invent an alarm the data does not support. The ARTA board below is the
// page's only red, so it keeps its meaning.
export function PipelineBoard({
  stages,
  counts,
}: {
  // Which stages this office actually has — an office with no Division Chief
  // sign-off step gets three rather than four (see correspondencePipeline.ts).
  stages: readonly PipelineStage[];
  counts: PipelineCounts;
}) {
  const total = stages.reduce((sum, stage) => sum + (counts[stage] ?? 0), 0);

  return (
    <section className="card overflow-hidden">
      <div className="card-header">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-wider text-ink-500 dark:text-white/40">
            Where documents are sitting
          </p>
          <h2 className="font-display text-base font-semibold text-ink-900 dark:text-white">
            Correspondence pipeline
          </h2>
        </div>
        <Link
          href="/incoming"
          className="text-sm text-civic hover:text-civic-600 dark:text-civic-300 dark:hover:text-white"
        >
          Open ledger
        </Link>
      </div>

      {total === 0 ? (
        <p className="p-5 text-sm text-ink-500 dark:text-white/40">
          Nothing in the pipeline — every document is routed, signed off, closed and answered.
        </p>
      ) : (
        <div
          className={`grid grid-cols-2 divide-ink-400/10 dark:divide-white/10 sm:divide-x ${
            stages.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-4"
          }`}
        >
          {stages.map((stage) => {
            const count = counts[stage] ?? 0;
            return (
              <Link
                key={stage}
                href={`/incoming?stage=${stage}`}
                className="group border-b border-ink-400/10 p-5 transition-colors last:border-b-0 hover:bg-surface dark:border-white/10 dark:hover:bg-white/[0.03] sm:border-b-0"
              >
                {/* An empty stage is stated as a dash rather than a zero: at a
                    glance a column of zeroes and a column of counts should not
                    compete for the eye, and "nothing here" is not a quantity. */}
                <p
                  className={`font-mono text-2xl font-semibold leading-tight ${
                    count === 0
                      ? "text-ink-400 dark:text-white/25"
                      : "text-ink-900 dark:text-white"
                  }`}
                >
                  {count === 0 ? "—" : count}
                </p>
                <p className="mt-0.5 text-xs font-medium uppercase tracking-wide text-ink-900 group-hover:text-civic dark:text-white/70 dark:group-hover:text-civic-300">
                  {PIPELINE_STAGE_LABELS[stage]}
                </p>
                <p className="mt-1 text-[11px] leading-snug text-ink-500 dark:text-white/40">
                  {PIPELINE_STAGE_HINTS[stage]}
                </p>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
