import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { routeHead } from "@/lib/route-head";

export const Route = createFileRoute("/install")({
  component: InstallPage,
  head: () => routeHead("/install"),
});

const TABS = [
  { id: "curl", label: "curl (universal)" },
  { id: "brew", label: "Homebrew (macOS)" },
  { id: "cargo", label: "cargo (devs)" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const COMMANDS: Record<TabId, string> = {
  curl: "curl -fsSL https://bloclawd.com/install.sh | sh",
  brew: "brew install bloclawd/tap/bloclawd",
  cargo: "cargo install bloclawd",
};

const TAB_NOTES: Record<TabId, ReactNode> = {
  curl: (
    <>
      The script verifies a per-target SHA-256 before extracting. Audit it
      first with{" "}
      <span className="font-mono text-foreground">
        curl https://bloclawd.com/install.sh
      </span>
      .
    </>
  ),
  brew: (
    <>
      The tap is hosted at{" "}
      <span className="font-mono text-foreground">bloclawd/homebrew-tap</span>.
      Bottles are signed.
    </>
  ),
  cargo: (
    <>
      Builds from source with the pinned toolchain in{" "}
      <span className="font-mono text-foreground">rust-toolchain.toml</span>.
    </>
  ),
};

const SENT = [
  "Provider · model IDs",
  "Tier (pro / max5 / max20)",
  "Coarse region (you confirm)",
  "Token counts, binned",
  "Window length (5h or week)",
];

const NEVER_SENT = [
  "Account ID, email, API key",
  "IP address (Worker drops it)",
  "Per-event timestamps",
  "Prompts, tool args, file paths",
  "Persistent device identifier",
];

function InstallPage() {
  const [tab, setTab] = useState<TabId>("curl");
  const [copied, setCopied] = useState(false);
  const copyTimeout = useRef<number | null>(null);
  const command = COMMANDS[tab];

  useEffect(
    () => () => {
      if (copyTimeout.current !== null) {
        window.clearTimeout(copyTimeout.current);
      }
    },
    [],
  );

  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      if (copyTimeout.current !== null) {
        window.clearTimeout(copyTimeout.current);
      }
      copyTimeout.current = window.setTimeout(() => setCopied(false), 1400);
    } catch {
      // Clipboard API rejected (insecure context, missing user activation, denied
      // permission). Skip the toast rather than surface a transient error.
    }
  }, [command]);

  return (
    <section className="mx-auto flex max-w-3xl flex-col gap-12 py-4">
      <header className="space-y-3">
        <span className="tag">macOS · Linux</span>
        <h1 className="text-3xl font-semibold leading-tight tracking-tight text-foreground sm:text-4xl">
          Install the CLI
        </h1>
        <p className="text-base leading-7 text-muted-foreground">
          <span className="font-mono text-foreground">bloclawd</span> is a
          small Rust binary. It reads local Claude Code or Codex session logs,
          builds a payload for a fixed time window, shows you the exact event,
          and only submits after you confirm.
        </p>
      </header>

      <div className="surface-card overflow-hidden">
        <div className="flex flex-wrap gap-1 border-b border-border/60 p-1.5">
          {TABS.map((t) => (
            <button
              className={`nav-link px-3.5 py-2 text-sm${
                tab === t.id ? " active" : ""
              }`}
              key={t.id}
              onClick={() => setTab(t.id)}
              type="button"
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="space-y-4 p-5">
          <div className="flex items-center gap-3 rounded-2xl border border-border bg-[var(--bg-1)] px-4 py-3.5">
            <div className="flex-1 overflow-x-auto font-mono text-sm text-foreground">
              <span className="text-muted-foreground">$ </span>
              {command}
            </div>
            <Button onClick={onCopy} size="sm" variant="outline" type="button">
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>

          <div className="rounded-xl border border-border/60 bg-[var(--bg-1)]/60 px-4 py-3 text-sm leading-6 text-muted-foreground">
            {TAB_NOTES[tab]}
          </div>
        </div>
      </div>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">
          Then submit a window
        </h2>
        <div className="surface-card p-5">
          <pre className="code-block">
{`# Dry run first — no network, just preview
`}<span className="c-cmd">bloclawd</span>{" "}<span className="c-flag">--cc --tier max20 --end 16:00 --5h --dry-run</span>{`

# Then actually submit (asks one [y/N])
`}<span className="c-cmd">bloclawd</span>{" "}<span className="c-flag">--cc --tier max20 --end 16:00 --5h</span>{`

`}<span className="c-com"># For Codex sessions, swap --cc for --codex.</span>
          </pre>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">
          What gets sent
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <SentCard
            heading="Sent"
            hue="teal"
            iconKind="check"
            items={SENT}
          />
          <SentCard
            heading="Never sent"
            hue="coral"
            iconKind="cross"
            items={NEVER_SENT}
          />
        </div>
      </section>
    </section>
  );
}

function SentCard({
  hue,
  heading,
  iconKind,
  items,
}: {
  hue: "teal" | "coral";
  heading: string;
  iconKind: "check" | "cross";
  items: string[];
}) {
  const baseColor = `var(--${hue === "teal" ? "success" : "coral"})`;
  return (
    <article className="surface-card p-5">
      <span className={`tag dot ${hue}`}>{heading}</span>
      <ul className="mt-4 flex flex-col gap-2">
        {items.map((item) => (
          <li
            className="flex items-start gap-2.5 text-sm leading-6 text-muted-foreground"
            key={item}
          >
            <span
              aria-hidden
              className="mt-1 inline-flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded-[4px]"
              style={{
                background: `color-mix(in oklch, ${baseColor} 18%, transparent)`,
                border: `1px solid color-mix(in oklch, ${baseColor} 45%, transparent)`,
              }}
            >
              <svg fill="none" height="9" viewBox="0 0 10 10" width="9">
                {iconKind === "check" ? (
                  <path
                    d="M2 5l2 2 4-4"
                    stroke={baseColor}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.6"
                  />
                ) : (
                  <path
                    d="M3 3l4 4M7 3l-4 4"
                    stroke={baseColor}
                    strokeLinecap="round"
                    strokeWidth="1.6"
                  />
                )}
              </svg>
            </span>
            {item}
          </li>
        ))}
      </ul>
    </article>
  );
}
