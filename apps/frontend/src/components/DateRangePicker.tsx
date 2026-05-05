import { useCallback, useMemo, useState } from "react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  RANGE_VALUES,
  rangeWindow,
  type RangeKey,
} from "@/lib/dashboard-search";
import { Route } from "@/routes/dashboard";

type Half = "start" | "end";

const PRESET_LABEL: Record<RangeKey, string> = {
  "1w": "Last week",
  "1m": "Last month",
  "3m": "Last 3 months",
  custom: "Custom",
};

const PRESET_SHORT: Record<RangeKey, string> = {
  "1w": "1w",
  "1m": "1m",
  "3m": "3m",
  custom: "custom",
};

export function DateRangePicker() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  const nowMs = Date.now();
  const { startMs, endMs } = useMemo(
    () => rangeWindow(search, nowMs),
    [search, nowMs],
  );

  const setPreset = useCallback(
    (range: RangeKey) => {
      void navigate({
        search: (prev) => ({
          ...prev,
          range,
          start: undefined,
          end: undefined,
        }),
      });
    },
    [navigate],
  );

  const setCustom = useCallback(
    (sec: { start: number; end: number }) => {
      void navigate({
        search: (prev) => ({
          ...prev,
          range: "custom" as const,
          start: sec.start,
          end: sec.end,
        }),
      });
    },
    [navigate],
  );

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Pick display window"
          className="inline-flex h-9 items-center gap-2 rounded-full border border-border bg-[var(--surface)] px-3.5 text-[12.5px] font-medium text-foreground hover:bg-[var(--surface-2)]"
        >
          <CalendarIcon />
          <span className="text-muted-foreground">
            {PRESET_SHORT[search.range]}
          </span>
          <span className="font-mono tabular-nums">
            {formatRangeShort(startMs, endMs)}
          </span>
          <Caret />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[640px] p-0" sideOffset={8}>
        <div className="grid grid-cols-[160px_1fr]">
          <div className="border-r border-border p-2">
            <div className="px-2 pb-2 pt-1 font-mono text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground">
              Presets
            </div>
            <ul className="flex flex-col gap-0.5">
              {RANGE_VALUES.map((key) => (
                <li key={key}>
                  <button
                    type="button"
                    onClick={() => {
                      if (key !== "custom") setPreset(key);
                    }}
                    className={
                      "w-full rounded-md px-2.5 py-2 text-left text-[12.5px] " +
                      (search.range === key
                        ? "bg-[var(--bg-1)] text-foreground"
                        : "text-foreground/80 hover:bg-[var(--bg-1)]")
                    }
                  >
                    {PRESET_LABEL[key]}
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <CustomRangeCalendar
            startMs={startMs}
            endMs={endMs}
            nowMs={nowMs}
            onCommit={setCustom}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface CustomCalendarProps {
  startMs: number;
  endMs: number;
  nowMs: number;
  onCommit: (sec: { start: number; end: number }) => void;
}

function CustomRangeCalendar({
  startMs,
  endMs,
  nowMs,
  onCommit,
}: CustomCalendarProps) {
  const [draft, setDraft] = useState<{ startMs: number | null; endMs: number | null }>(
    { startMs, endMs },
  );
  const [anchor, setAnchor] = useState<Half | null>(null);

  // Show two months centered on the end date.
  const initialMonth = useMemo(() => firstOfMonth(new Date(endMs)), [endMs]);
  const [monthCursor, setMonthCursor] = useState<Date>(
    () => addMonths(initialMonth, -1),
  );

  const months = useMemo(
    () => [monthCursor, addMonths(monthCursor, 1)],
    [monthCursor],
  );

  const onDayClick = (dayMs: number) => {
    if (dayMs > nowMs) return;
    if (anchor === null || draft.startMs === null) {
      setDraft({ startMs: dayMs, endMs: null });
      setAnchor("end");
      return;
    }
    if (anchor === "end") {
      const start = Math.min(draft.startMs, dayMs);
      const end = Math.max(draft.startMs, dayMs);
      setDraft({ startMs: start, endMs: end });
      setAnchor(null);
      return;
    }
  };

  const apply = () => {
    if (draft.startMs == null || draft.endMs == null) return;
    onCommit({
      start: Math.floor(draft.startMs / 1000),
      end: Math.floor(endOfDay(draft.endMs) / 1000),
    });
  };

  return (
    <div className="flex flex-col gap-2 p-3">
      <div className="flex items-center justify-between px-1">
        <button
          type="button"
          aria-label="Previous month"
          onClick={() => setMonthCursor(addMonths(monthCursor, -1))}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-[var(--bg-1)] hover:text-foreground"
        >
          <ChevronLeftIcon />
        </button>
        <div className="font-mono text-[11.5px] text-muted-foreground">
          {monthLabel(months[0]!)} — {monthLabel(months[1]!)}
        </div>
        <button
          type="button"
          aria-label="Next month"
          onClick={() => setMonthCursor(addMonths(monthCursor, 1))}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-[var(--bg-1)] hover:text-foreground"
        >
          <ChevronRightIcon />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {months.map((month) => (
          <CalendarMonth
            key={month.toISOString()}
            month={month}
            startMs={draft.startMs}
            endMs={draft.endMs}
            nowMs={nowMs}
            onDayClick={onDayClick}
          />
        ))}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-border pt-2.5">
        <span className="font-mono text-[11px] text-muted-foreground">
          {draft.startMs != null && draft.endMs != null
            ? `${formatDate(draft.startMs)} → ${formatDate(draft.endMs)}`
            : draft.startMs != null
              ? `${formatDate(draft.startMs)} → pick end`
              : "pick a start date"}
        </span>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => setDraft({ startMs: null, endMs: null })}
            className="rounded-md px-2.5 py-1.5 text-[12px] text-muted-foreground hover:text-foreground"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={apply}
            disabled={draft.startMs == null || draft.endMs == null}
            className="rounded-md bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}

interface CalendarMonthProps {
  month: Date;
  startMs: number | null;
  endMs: number | null;
  nowMs: number;
  onDayClick: (dayMs: number) => void;
}

function CalendarMonth({
  month,
  startMs,
  endMs,
  nowMs,
  onDayClick,
}: CalendarMonthProps) {
  const cells = useMemo(() => buildMonthGrid(month), [month]);
  return (
    <div>
      <div className="mb-1.5 px-1.5 font-mono text-[11px] font-medium text-foreground/80">
        {monthLabel(month)}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5 px-1">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <span
            key={`${d}-${i}`}
            className="text-center font-mono text-[10px] text-muted-foreground"
          >
            {d}
          </span>
        ))}
        {cells.map((cell) => {
          if (!cell) return <span key={Math.random()} />;
          const dayMs = cell.getTime();
          const inRange =
            startMs != null &&
            endMs != null &&
            dayMs >= startOfDay(startMs) &&
            dayMs <= startOfDay(endMs);
          const isStart = startMs != null && sameDay(dayMs, startMs);
          const isEnd = endMs != null && sameDay(dayMs, endMs);
          const disabled = dayMs > nowMs;
          return (
            <button
              key={dayMs}
              type="button"
              disabled={disabled}
              onClick={() => onDayClick(dayMs)}
              className={
                "relative h-7 rounded-md text-[11.5px] font-mono tabular-nums " +
                (disabled
                  ? "cursor-not-allowed text-muted-foreground/40"
                  : isStart || isEnd
                    ? "bg-primary text-primary-foreground"
                    : inRange
                      ? "bg-primary/20 text-foreground"
                      : "text-foreground/80 hover:bg-[var(--bg-1)]")
              }
            >
              {cell.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// --- helpers --------------------------------------------------------------

function buildMonthGrid(month: Date): Array<Date | null> {
  const first = firstOfMonth(month);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
  // Monday-first; Date#getDay returns 0=Sun..6=Sat.
  const firstWeekday = (first.getDay() + 6) % 7;
  const cells: Array<Date | null> = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= last.getDate(); d++) {
    cells.push(new Date(first.getFullYear(), first.getMonth(), d));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function firstOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function endOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

function sameDay(a: number, b: number): boolean {
  return startOfDay(a) === startOfDay(b);
}

function monthLabel(d: Date): string {
  return d.toLocaleString("en-US", { month: "short", year: "numeric" });
}

function formatDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function formatRangeShort(startMs: number, endMs: number): string {
  return `${formatDate(startMs)} → ${formatDate(endMs)}`;
}

function CalendarIcon() {
  return (
    <svg
      aria-hidden
      width="13"
      height="13"
      viewBox="0 0 16 16"
      fill="none"
      className="text-muted-foreground"
    >
      <rect
        x="2.5"
        y="3.5"
        width="11"
        height="10"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <path
        d="M2.5 6.5h11M5 2v3M11 2v3"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
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

function ChevronLeftIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path
        d="M10 4l-4 4 4 4"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path
        d="M6 4l4 4-4 4"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
