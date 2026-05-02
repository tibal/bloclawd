import { Outlet, createRootRoute } from "@tanstack/react-router";

import { RouteShell } from "@/components/RouteShell";

function RootComponent() {
  return (
    <RouteShell>
      <Outlet />
    </RouteShell>
  );
}

export const Route = createRootRoute({
  component: RootComponent,
});
