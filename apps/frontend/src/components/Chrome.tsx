import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useStatus, type IngestHealth, type StatusJson } from "@/lib/r2";
import { cn } from "@/lib/utils";

const HEALTH_LABELS: Record<IngestHealth, string> = {
  healthy: "Healthy",
  degraded: "Degraded",
  down: "Down",
};

const HEALTH_CLASSES: Record<IngestHealth, string> = {
  healthy: "border-transparent bg-success text-background hover:bg-success",
  degraded: "border-transparent bg-warning text-background hover:bg-warning",
  down: "",
};

export function Chrome() {
  const { data, isLoading } = useStatus();

  if (isLoading) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-6 w-20 rounded-full" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-sm text-muted-foreground">
        Last updated unavailable
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
      <span>Last updated {relativeTime(data.last_cron_success_ts)}</span>
      <span aria-hidden="true">·</span>
      <span>{formatInteger(data.total_events_lifetime)} events</span>
      <span aria-hidden="true">·</span>
      <span>
        ~{formatInteger(data.approximate_contributors_30d)} contributors
      </span>
      <span aria-hidden="true">·</span>
      <HealthBadge health={data.ingest_health} />
    </div>
  );
}

function HealthBadge({ health }: { health: StatusJson["ingest_health"] }) {
  return (
    <Badge
      className={cn("gap-1", HEALTH_CLASSES[health])}
      data-health={health}
      variant={health === "down" ? "destructive" : "default"}
    >
      {HEALTH_LABELS[health]}
    </Badge>
  );
}

function relativeTime(timestamp: string): string {
  const minutes = Math.max(
    0,
    Math.floor((Date.now() - new Date(timestamp).getTime()) / 60_000),
  );

  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  return `${Math.floor(minutes / 60)}h ago`;
}

function formatInteger(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(
    value,
  );
}
