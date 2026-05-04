import type { ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";

import { Separator } from "@/components/ui/separator";

const headerLinks = [
  { label: "Home", href: "/" },
  { label: "Dashboard", href: "/dashboard" },
  { label: "Install", href: "/install" },
  { label: "Methodology", href: "/methodology" },
  { label: "Data", href: "/data" },
] as const;

const footerLinks = [
  { label: "Methodology", href: "/methodology" },
  { label: "Data schema", href: "/data" },
  { label: "Source", href: "https://github.com/bloclawd/bloclawd" },
  { label: "License", href: "https://creativecommons.org/licenses/by/4.0/" },
] as const;

interface RouteShellProps {
  children: ReactNode;
}

export function RouteShell({ children }: RouteShellProps) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  return (
    <div className="relative min-h-screen text-foreground">
      <div aria-hidden className="aurora" />

      <div className="relative z-10 flex min-h-screen flex-col">
        <header className="nav-wrap">
          <nav aria-label="Primary" className="nav-pill">
            <div className="nav-brand-group">
              <a aria-label="bloclawd home" className="nav-brand-link" href="/">
                <img
                  alt=""
                  className="nav-mark"
                  decoding="async"
                  height={26}
                  src="/logo.png"
                  width={26}
                />
                <span>bloclawd</span>
              </a>
              <span aria-hidden className="nav-brand-tag">public dataset</span>
            </div>

            <div className="nav-links">
              {headerLinks.map((link) => (
                <a
                  className={`nav-link${
                    isActiveLink(pathname, link.href) ? " active" : ""
                  }`}
                  href={link.href}
                  key={link.href}
                >
                  {link.label}
                </a>
              ))}
            </div>

            <a
              className="nav-cta"
              href="https://github.com/bloclawd/bloclawd"
              rel="noreferrer"
              target="_blank"
            >
              GitHub
            </a>
          </nav>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-12 sm:px-6 lg:px-8">
          {children}
        </main>

        <Separator />
        <footer className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-6 text-sm text-muted-foreground sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <img
              alt=""
              aria-hidden
              className="footer-mark"
              decoding="async"
              height={20}
              src="/logo.png"
              width={20}
            />
            <p>Anonymous. PoW-gated. Open data (CC BY 4.0).</p>
          </div>
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
    </div>
  );
}

function isActiveLink(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}
