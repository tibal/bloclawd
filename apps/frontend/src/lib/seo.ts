/**
 * Single source of truth for site-wide SEO metadata.
 * Dependency-free so both browser code and the Node prerender script
 * import from here.
 */

export const SITE_URL = "https://bloclawd.com" as const;
export const SITE_NAME = "bloclawd" as const;
export const SITE_TAGLINE =
  "Got rate-limited by Claude Code or Codex?" as const;
export const SITE_DESCRIPTION =
  "Submit your last Claude Code or Codex limit hit as an anonymous public data point, then turn it into a shareable card. Prompts, paths, account IDs, and API keys are never sent." as const;
export const SITE_KEYWORDS = [
  "claude code rate limit",
  "codex rate limit",
  "claude max20",
  "claude max5",
  "claude pro",
  "5 hour limit",
  "weekly limit",
  "api equivalent cost",
  "ai subscription tracker",
  "rate limit drift",
  "anthropic",
  "openai",
  "open dataset",
] as const;
export const TWITTER_HANDLE = "@bloclawd" as const;
export const OG_IMAGE_PATH = "/og-image.png" as const;
export const OG_IMAGE_ALT = `${SITE_NAME} — ${SITE_TAGLINE}` as const;
export const BRAND_BG_HEX = "#0b0d12" as const;

export type RouteSeo = {
  /** Path with leading slash, no trailing slash (except "/"). */
  path: string;
  /** Route-specific title (will be combined with site name in template). */
  title: string;
  /** 140–160 char meta description. */
  description: string;
  /** Optional JSON-LD payload (object — will be serialized). */
  jsonLd?: object | object[];
  /** Optional plain-text noscript fallback shown to non-JS bots. */
  noscript?: string;
  /** Whether to allow indexing (false → noindex). Defaults to true. */
  index?: boolean;
};

const SITE_JSON_LD = [
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    url: SITE_URL,
    logo: `${SITE_URL}/logo.png`,
    sameAs: ["https://github.com/bloclawd/bloclawd"],
  },
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: SITE_URL,
    description: SITE_DESCRIPTION,
    potentialAction: {
      "@type": "SearchAction",
      target: `${SITE_URL}/dashboard?model={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  },
] as const;

export const ROUTES: RouteSeo[] = [
  {
    path: "/",
    title: SITE_TAGLINE,
    description: SITE_DESCRIPTION,
    jsonLd: SITE_JSON_LD,
    noscript:
      "bloclawd submits your last Claude Code or Codex limit hit as an anonymous public data point, then turns it into a shareable card. Prompts, file paths, account IDs, API keys, and per-event timestamps are never sent. Public cells require k ≥ 5.",
  },
  {
    path: "/dashboard",
    title: "Dashboard · Claude Code & Codex limits by tier (Pro / Max5 / Max20)",
    description:
      "Where your tier's limits actually fire. Live p10–p90 envelope of API-equivalent cost before Claude Code and Codex rate limits trigger, broken down by Pro, Max5, and Max20.",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Dataset",
      name: "bloclawd — AI subscription rate-limit dataset",
      description:
        "Community-sourced, rounded aggregates of Claude Code and Codex rate-limit events: API-equivalent cost, token mix, harness, tier, region, and model. Updated every 15 minutes.",
      url: `${SITE_URL}/dashboard`,
      keywords: SITE_KEYWORDS.join(", "),
      license: "https://creativecommons.org/licenses/by/4.0/",
      isAccessibleForFree: true,
      creator: {
        "@type": "Organization",
        name: SITE_NAME,
        url: SITE_URL,
      },
      distribution: [
        {
          "@type": "DataDownload",
          encodingFormat: "application/json",
          contentUrl: `${SITE_URL}/reports/v1/manifest.json`,
        },
      ],
      variableMeasured: [
        "api_cost_usd_p10",
        "api_cost_usd_p25",
        "api_cost_usd_p50",
        "api_cost_usd_p75",
        "api_cost_usd_p90",
      ],
    },
    noscript:
      "Where your tier's limits actually fire. Pick Pro, Max5, or Max20 for the live rounded percentile envelope, or compare tiers side-by-side to spot drift.",
  },
  {
    path: "/methodology",
    title: "Methodology · how bloclawd computes what you see",
    description:
      "How bloclawd derives public aggregates from local CLI submissions: canonicalization, rounded API-cost percentiles, token redaction, outlier trimming, and the cron pipeline.",
    noscript:
      "How bloclawd computes what you see: canonicalization of submissions, proof-of-work admission control, rounded API-cost percentiles, token redaction, and the 15-minute aggregation pipeline.",
  },
  {
    path: "/methodology/changelog",
    title: "Methodology changelog",
    description:
      "Versioned record of changes to the bloclawd aggregation methodology, schema, and public API-cost policy.",
    noscript:
      "Methodology changelog: versioned record of every change to the bloclawd aggregation methodology, schema, and public API-cost policy.",
  },
  {
    path: "/install",
    title: "Install bloclawd · macOS & Linux",
    description:
      "Install the bloclawd CLI via curl, cargo, or Homebrew. One command after a 5-hour or weekly rate-limit hit submits an anonymous event and prints a rank block for your card.",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "bloclawd CLI",
      operatingSystem: "macOS, Linux",
      applicationCategory: "DeveloperApplication",
      url: `${SITE_URL}/install`,
      downloadUrl: `${SITE_URL}/install.sh`,
      softwareVersion: "1.x",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      author: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
    },
    noscript:
      "Install the bloclawd CLI on macOS or Linux: curl -fsSL https://bloclawd.com/install.sh | sh — or cargo install bloclawd, or brew install bloclawd/tap/bloclawd. One command after you hit a rate limit submits an anonymous event and prints a rank block for your card.",
  },
  {
    path: "/data",
    title: "Data contract · what your CLI submits",
    description:
      "The exact wire payload bloclawd sends, before signing: fields, types, canonical ordering, redacted values, and the diff a dry-run shows.",
    noscript:
      "Data contract: the exact wire payload your CLI submits, the canonical ordering applied before signing, redacted fields, and the diff a dry-run shows you before any network call.",
  },
  {
    path: "/rank",
    title: "Make a shareable Claude Code or Codex limit card",
    description:
      "Run the normal bloclawd command to submit an anonymous limit hit, then paste the rank block it prints for a shareable card and cohort comparison.",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: "bloclawd Rank",
      url: `${SITE_URL}/rank`,
      applicationCategory: "DeveloperApplication",
      operatingSystem: "Any",
      description:
        "Client-side tool that turns a submitted bloclawd rank block into a shareable limit card with profile, cohort comparison, token mix, model mix, and recommendations.",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    },
    noscript:
      "Make a shareable Claude Code or Codex limit card: run the normal bloclawd command to contribute anonymously, then paste the rank block for your profile and cohort comparison.",
  },
  {
    path: "/compare",
    title: "Compare moved to Rank",
    description:
      "The old tier comparison page now redirects to bloclawd Rank, the shareable CLI rate-limit card.",
    index: false,
    noscript:
      "Compare moved to Rank. Open /rank to paste bloclawd CLI output and generate a shareable rate-limit card.",
  },
];

export function buildPageTitle(routeTitle: string): string {
  if (routeTitle === SITE_TAGLINE) {
    return `${SITE_NAME} — ${SITE_TAGLINE}`;
  }
  return `${routeTitle} · ${SITE_NAME}`;
}

export function canonicalUrl(path: string): string {
  return path === "/" ? `${SITE_URL}/` : `${SITE_URL}${path}`;
}

export type KnownPath = (typeof ROUTES)[number]["path"];

export type MetaEntry =
  | { kind: "title"; content: string }
  | { kind: "name"; name: string; content: string }
  | { kind: "property"; property: string; content: string }
  | { kind: "link"; rel: string; href: string }
  | { kind: "ld"; payload: object };

export function composeMeta(route: RouteSeo): MetaEntry[] {
  const title = buildPageTitle(route.title);
  const canonical = canonicalUrl(route.path);
  const ogImage = `${SITE_URL}${OG_IMAGE_PATH}`;
  const robots =
    route.index === false
      ? "noindex, nofollow"
      : "index, follow, max-image-preview:large, max-snippet:-1";

  const entries: MetaEntry[] = [
    { kind: "title", content: title },
    { kind: "name", name: "description", content: route.description },
    { kind: "name", name: "robots", content: robots },
    { kind: "link", rel: "canonical", href: canonical },
    { kind: "property", property: "og:type", content: "website" },
    { kind: "property", property: "og:site_name", content: SITE_NAME },
    { kind: "property", property: "og:title", content: title },
    { kind: "property", property: "og:description", content: route.description },
    { kind: "property", property: "og:url", content: canonical },
    { kind: "property", property: "og:image", content: ogImage },
    { kind: "property", property: "og:image:width", content: "1200" },
    { kind: "property", property: "og:image:height", content: "630" },
    { kind: "property", property: "og:image:alt", content: OG_IMAGE_ALT },
    { kind: "property", property: "og:locale", content: "en_US" },
    { kind: "name", name: "twitter:card", content: "summary_large_image" },
    { kind: "name", name: "twitter:site", content: TWITTER_HANDLE },
    { kind: "name", name: "twitter:creator", content: TWITTER_HANDLE },
    { kind: "name", name: "twitter:title", content: title },
    { kind: "name", name: "twitter:description", content: route.description },
    { kind: "name", name: "twitter:image", content: ogImage },
    { kind: "name", name: "twitter:image:alt", content: OG_IMAGE_ALT },
  ];

  if (route.jsonLd) {
    const payloads = Array.isArray(route.jsonLd) ? route.jsonLd : [route.jsonLd];
    for (const payload of payloads) entries.push({ kind: "ld", payload });
  }

  return entries;
}
