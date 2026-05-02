import type { ReactNode } from "react";

import { Separator } from "@/components/ui/separator";

const headerLinks = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Methodology", href: "/methodology" },
  { label: "Data", href: "/data" },
] as const;

const footerLinks = [
  { label: "Methodology", href: "/methodology" },
  { label: "Data schema", href: "/data" },
  { label: "Source", href: "https://github.com/tibal/bloclawd" },
  { label: "License", href: "https://creativecommons.org/licenses/by/4.0/" },
] as const;

interface RouteShellProps {
  children: ReactNode;
}

export function RouteShell({ children }: RouteShellProps) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex min-h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <a
            className="inline-flex min-h-11 items-center text-xl font-semibold tracking-normal text-foreground"
            href="/"
          >
            bloclawd
          </a>
          <nav
            aria-label="Primary"
            className="hidden items-center gap-1 text-sm text-muted-foreground sm:flex"
          >
            {headerLinks.map((link) => (
              <a
                className="inline-flex min-h-11 items-center rounded-md px-3 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                href={link.href}
                key={link.href}
              >
                {link.label}
              </a>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto min-h-screen w-full max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        {children}
      </main>
      <Separator />
      <footer className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-6 text-sm text-muted-foreground sm:px-6 lg:px-8">
        <p>Anonymous. PoW-gated. Open data (CC BY 4.0).</p>
        <nav aria-label="Footer" className="flex flex-wrap items-center gap-2">
          {footerLinks.map((link, index) => (
            <span className="inline-flex items-center gap-2" key={link.href}>
              <a
                className="inline-flex min-h-11 items-center hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                href={link.href}
              >
                {link.label}
              </a>
              {index < footerLinks.length - 1 ? (
                <span aria-hidden="true">·</span>
              ) : null}
            </span>
          ))}
        </nav>
      </footer>
    </div>
  );
}
