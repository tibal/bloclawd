import { useCallback } from "react";

import { Route } from "@/routes/dashboard";

export function EnvelopeToggle() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  const onPick = useCallback(
    (next: "off" | "neighbors" | "wide") => {
      void navigate({ search: (prev) => ({ ...prev, envelope: next }) });
    },
    [navigate],
  );

  const value = search.envelope;
  const options: Array<{ value: "off" | "neighbors" | "wide"; label: string }> = [
    { value: "off", label: "Off" },
    { value: "neighbors", label: "Neighbors" },
    { value: "wide", label: "p10–p90" },
  ];

  return (
    <div className="inline-flex items-center gap-0.5 rounded-full border border-border bg-[var(--bg-1)] p-[3px]">
      <span className="px-2 text-[11px] text-muted-foreground">Envelope</span>
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onPick(opt.value)}
            className={
              "rounded-full px-3 py-1 text-[12px] font-medium transition-colors " +
              (active
                ? "bg-[var(--surface)] text-foreground shadow-[0_0_0_1px_var(--line)_inset]"
                : "text-muted-foreground hover:text-foreground")
            }
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
