import { useCallback, useMemo } from "react";

import { FilterRowFields } from "@/components/FilterRowFields";
import { primaryRowFromSearch, type FilterRow } from "@/lib/dashboard-search";
import { Route } from "@/routes/dashboard";

export function Filters() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  const row = useMemo(() => primaryRowFromSearch(search), [search]);

  const onChange = useCallback(
    (next: FilterRow) => {
      void navigate({
        search: (prev) => ({
          ...prev,
          provider: next.provider,
          plan: next.plan,
          model: next.model,
          tier: next.tier,
          harness: next.harness,
          region: next.region,
          limit_type: next.limit_type,
        }),
      });
    },
    [navigate],
  );

  return <FilterRowFields row={row} onChange={onChange} />;
}
