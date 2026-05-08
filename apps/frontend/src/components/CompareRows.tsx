import { useCallback } from "react";

import { FilterRowFields } from "@/components/FilterRowFields";
import { resolveRow } from "@/lib/catalog";
import { primaryRowFromSearch, type FilterRow } from "@/lib/dashboard-search";
import { Route } from "@/routes/dashboard";

export function CompareRows() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  const updateRow = useCallback(
    (idx: number, next: FilterRow) => {
      void navigate({
        search: (prev) => ({
          ...prev,
          rows: prev.rows.map((row, i) => (i === idx ? next : row)),
        }),
      });
    },
    [navigate],
  );

  const removeRow = useCallback(
    (idx: number) => {
      void navigate({
        search: (prev) => ({
          ...prev,
          rows: prev.rows.filter((_, i) => i !== idx),
        }),
      });
    },
    [navigate],
  );

  const addRow = useCallback(() => {
    void navigate({
      search: (prev) => {
        // Seed each new row from the resolved primary so the chart gets a
        // well-formed second curve immediately. Users tweak from there.
        const primary = resolveRow(primaryRowFromSearch(prev));
        const seed: FilterRow = {
          provider: primary.provider,
          plan: primary.plan,
          model: primary.model,
          tier: primary.tier,
          harness: primary.harness,
          region: primary.region,
          limit_type: primary.limit_type,
        };
        return { ...prev, rows: [...prev.rows, seed] };
      },
    });
  }, [navigate]);

  if (!search.compare) return null;

  return (
    <div className="flex flex-col gap-2 border-t border-border/60 px-5 py-4">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground">
          Compare against
        </span>
        <button
          type="button"
          onClick={addRow}
          className="inline-flex h-11 items-center gap-1.5 rounded-full border border-border bg-[var(--surface)] px-3 text-[11.5px] font-medium text-foreground hover:bg-[var(--surface-2)] lg:h-7"
        >
          <PlusIcon /> Add comparison
        </button>
      </div>

      {search.rows.length === 0 ? (
        <p className="text-[12px] text-muted-foreground">
          Add a row to overlay another cohort on the chart.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {search.rows.map((row, idx) => (
            <li
              key={idx}
              className="relative flex items-start gap-2 rounded-lg border border-border/60 bg-[var(--bg-1)]/60 px-2.5 py-2 pr-14"
            >
              <span className="mt-1.5 inline-flex h-5 items-center justify-center rounded-md bg-[var(--surface-2)] px-1.5 font-mono text-[10px] text-muted-foreground">
                {idx + 2}
              </span>
              <div className="min-w-0 grow">
                <FilterRowFields
                  row={row}
                  onChange={(next) => updateRow(idx, next)}
                  compact
                />
              </div>
              <button
                type="button"
                aria-label={`Remove comparison row ${idx + 1}`}
                onClick={() => removeRow(idx)}
                className="absolute right-1.5 top-1.5 inline-flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-[var(--bg-1)] hover:text-foreground sm:right-2 sm:top-2"
              >
                <XIcon />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PlusIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
      <path
        d="M6 2.5v7M2.5 6h7"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
      <path
        d="M3 3l6 6M9 3l-6 6"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
