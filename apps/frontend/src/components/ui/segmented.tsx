interface SegmentedOption<V extends string> {
  value: V;
  label: string;
}

interface SegmentedProps<V extends string> {
  label?: string;
  ariaLabel?: string;
  value: V;
  options: ReadonlyArray<SegmentedOption<V>>;
  onChange: (next: V) => void;
}

export function Segmented<V extends string>({
  label,
  ariaLabel,
  value,
  options,
  onChange,
}: SegmentedProps<V>) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="inline-flex min-w-0 items-center gap-0.5 rounded-full border border-border bg-[var(--bg-1)] p-[3px]"
    >
      {label ? (
        <span className="px-2 text-[11px] text-muted-foreground">{label}</span>
      ) : null}
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={
              "min-h-11 rounded-full px-3 py-1 text-[12px] font-medium transition-colors lg:min-h-0 " +
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
