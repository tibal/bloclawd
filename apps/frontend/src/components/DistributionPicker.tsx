import { useCallback, useMemo } from "react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { DIST_VALUES, type DistKey } from "@/lib/dashboard-search";
import { Route } from "@/routes/dashboard";

const LABEL: Record<DistKey, string> = {
  "p10-p90": "p10 — p90",
  "p25-p75": "p25 — p75",
};

const SUB: Record<DistKey, string> = {
  "p10-p90": "outer envelope",
  "p25-p75": "inter-quartile",
};

export function DistributionPicker() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  const selected = useMemo(
    () => new Set<DistKey>(search.dist),
    [search.dist],
  );

  const toggle = useCallback(
    (key: DistKey) => {
      void navigate({
        search: (prev) => {
          const cur = new Set<DistKey>(prev.dist);
          if (cur.has(key)) cur.delete(key);
          else cur.add(key);
          // Preserve display order from DIST_VALUES.
          const next = DIST_VALUES.filter((k) => cur.has(k));
          return { ...prev, dist: next };
        },
      });
    },
    [navigate],
  );

  const count = selected.size;
  const triggerLabel =
    count === 0
      ? "Distribution · off"
      : count === DIST_VALUES.length
        ? "Distribution · all"
        : `Distribution · ${count}`;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex h-11 items-center gap-2 rounded-full border border-border bg-[var(--surface)] px-3 text-[12.5px] font-medium text-foreground hover:bg-[var(--surface-2)] lg:h-8"
          aria-label="Distribution envelopes"
        >
          <span className="text-muted-foreground">Show</span>
          <span>{triggerLabel}</span>
          <Caret />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-56 p-1.5"
        sideOffset={6}
      >
        <ul className="flex flex-col gap-0.5 text-sm">
          {DIST_VALUES.map((key) => {
            const checked = selected.has(key);
            return (
              <li key={key}>
                <button
                  type="button"
                  onClick={() => toggle(key)}
                  className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left hover:bg-[var(--bg-1)]"
                  aria-pressed={checked}
                >
                  <Checkbox checked={checked} />
                  <span className="flex flex-col">
                    <span className="text-[12.5px] font-medium text-foreground">
                      {LABEL[key]}
                    </span>
                    <span className="font-mono text-[10.5px] text-muted-foreground">
                      {SUB[key]}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

function Caret() {
  return (
    <svg
      aria-hidden
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      className="text-muted-foreground"
    >
      <path
        d="M2.5 4l2.5 2.5L7.5 4"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Checkbox({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden
      className={
        "relative h-4 w-4 shrink-0 rounded-[5px] border " +
        (checked
          ? "border-primary bg-primary"
          : "border-border bg-transparent")
      }
    >
      {checked ? (
        <svg
          viewBox="0 0 12 12"
          className="absolute inset-0 m-auto h-3 w-3 text-primary-foreground"
          fill="none"
        >
          <path
            d="M3 6.5l2 2L9 4"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : null}
    </span>
  );
}
