import { useCallback } from "react";

import { Segmented } from "@/components/ui/segmented";
import { Route } from "@/routes/dashboard";

type EnvelopeMode = "off" | "neighbors" | "wide";

const OPTIONS: ReadonlyArray<{ value: EnvelopeMode; label: string }> = [
  { value: "off", label: "Off" },
  { value: "neighbors", label: "Neighbors" },
  { value: "wide", label: "p10–p90" },
];

export function EnvelopeToggle() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  const onPick = useCallback(
    (next: EnvelopeMode) => {
      void navigate({ search: (prev) => ({ ...prev, envelope: next }) });
    },
    [navigate],
  );

  return (
    <Segmented
      label="Envelope"
      value={search.envelope}
      options={OPTIONS}
      onChange={onPick}
    />
  );
}
