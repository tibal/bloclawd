import { useCallback } from "react";

import { Toggle } from "@/components/ui/toggle";
import { Route } from "@/routes/dashboard";

export function BandToggle() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const isWideBand = search.bands === "p10-p90";

  const handlePressedChange = useCallback(() => {
    void navigate({
      search: (prev) => ({
        ...prev,
        bands: prev.bands === "p10-p90" ? "p25-p75" : "p10-p90",
      }),
    });
  }, [navigate]);

  return (
    <Toggle
      aria-label="Toggle percentile band"
      onPressedChange={handlePressedChange}
      pressed={isWideBand}
      variant="outline"
    >
      {isWideBand ? "Show p10 / p90" : "Show p25 / p75"}
    </Toggle>
  );
}
