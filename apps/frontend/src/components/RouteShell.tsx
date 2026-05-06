import { Menu, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";

import { Separator } from "@/components/ui/separator";

const headerLinks = [
  { label: "Make card", href: "/rank" },
  { label: "Live data", href: "/dashboard" },
  { label: "Install", href: "/install" },
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const closeMobileMenu = () => setMobileMenuOpen(false);

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

            <button
              aria-controls="mobile-primary-nav"
              aria-expanded={mobileMenuOpen}
              aria-label={
                mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"
              }
              className="nav-menu-toggle"
              onClick={() => setMobileMenuOpen((open) => !open)}
              type="button"
            >
              {mobileMenuOpen ? <X aria-hidden /> : <Menu aria-hidden />}
            </button>

            <a
              className="nav-cta nav-github-cta"
              href="https://github.com/bloclawd/bloclawd"
              rel="noreferrer"
              target="_blank"
            >
              GitHub
            </a>

            {mobileMenuOpen ? (
              <div className="nav-mobile-panel" id="mobile-primary-nav">
                {headerLinks.map((link) => (
                  <a
                    className={`nav-mobile-link${
                      isActiveLink(pathname, link.href) ? " active" : ""
                    }`}
                    href={link.href}
                    key={link.href}
                    onClick={closeMobileMenu}
                  >
                    {link.label}
                  </a>
                ))}
                <a
                  className="nav-mobile-link external"
                  href="https://github.com/bloclawd/bloclawd"
                  onClick={closeMobileMenu}
                  rel="noreferrer"
                  target="_blank"
                >
                  GitHub
                </a>
              </div>
            ) : null}
          </nav>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-12 sm:px-6 lg:px-8">
          {children}
        </main>

        <SubmitCtaStrip pathname={pathname} />

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

const SUBMIT_CTA_HIDDEN_PATHS = new Set(["/install", "/rank"]);

function SubmitCtaStrip({ pathname }: { pathname: string }) {
  if (SUBMIT_CTA_HIDDEN_PATHS.has(pathname)) return null;

  return (
    <aside
      aria-label="Contribute"
      className="mx-auto w-full max-w-6xl px-4 pb-8 sm:px-6 lg:px-8"
    >
      <div className="surface-card flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">
            Got rate-limited by Claude Code or Codex?
          </p>
          <p className="text-sm leading-6 text-muted-foreground">
            The normal CLI run submits an anonymous data point and prints the
            card block. No prompts, paths, or account info.
          </p>
        </div>
        <a
          className="nav-cta whitespace-nowrap"
          data-testid="submit-cta"
          href="/install"
        >
          Submit + card →
        </a>
      </div>
    </aside>
  );
}
