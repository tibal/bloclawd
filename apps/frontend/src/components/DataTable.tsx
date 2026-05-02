import { EmptyState } from "@/components/EmptyState";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type DataTableRow = {
  ts: string;
  p10: number | null;
  p25: number | null;
  p50: number | null;
  p75: number | null;
  p90: number | null;
};

interface DataTableProps {
  rows: DataTableRow[];
  ariaLabel: string;
  className?: string;
}

const PERCENTILE_COLUMNS = ["p10", "p25", "p50", "p75", "p90"] as const;

export function DataTable({ rows, ariaLabel, className }: DataTableProps) {
  if (rows.length === 0) {
    return (
      <EmptyState
        heading="No data"
        subhead="No aggregate rows are available for this chart yet."
      />
    );
  }

  return (
    <Table
      aria-label={ariaLabel}
      className={cn("text-foreground", className)}
    >
      <TableHeader className="sticky top-0 bg-background">
        <TableRow>
          <TableHead>Timestamp</TableHead>
          {PERCENTILE_COLUMNS.map((column) => (
            <TableHead key={column} className="text-right">
              {column}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.ts}>
            <TableCell className="whitespace-nowrap font-mono tabular-nums">
              {row.ts}
            </TableCell>
            {PERCENTILE_COLUMNS.map((column) => (
              <TableCell key={column} className="text-right tabular-nums">
                {formatCell(row[column])}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function formatCell(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return "NA";
  }
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 2,
  }).format(value);
}
