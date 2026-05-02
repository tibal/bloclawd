import { useCallback } from "react";

import { Toggle } from "@/components/ui/toggle";
import { Route } from "@/routes/dashboard";

export function TierToggle() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  const handlePressedChange = useCallback(() => {
    void navigate({
      search: (prev) => ({
        ...prev,
        compare: !prev.compare,
      }),
    });
  }, [navigate]);

  return (
    <Toggle
      aria-label="Toggle tier comparison"
      onPressedChange={handlePressedChange}
      pressed={search.compare}
      variant="outline"
    >
      {search.compare ? "Single tier" : "Compare tiers"}
    </Toggle>
  );
}
