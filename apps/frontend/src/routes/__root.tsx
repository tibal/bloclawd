import { HeadContent, Outlet, createRootRoute } from "@tanstack/react-router";

import { RouteShell } from "@/components/RouteShell";

function RootComponent() {
  return (
    <>
      <HeadContent />
      <RouteShell>
        <Outlet />
      </RouteShell>
    </>
  );
}

export const Route = createRootRoute({
  component: RootComponent,
});
