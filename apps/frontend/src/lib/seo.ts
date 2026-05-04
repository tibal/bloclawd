/**
 * Single source of truth for site-wide SEO metadata.
 * Dependency-free so both browser code and the Node prerender script
 * import from here.
 */

export const SITE_URL = "https://bloclawd.com" as const;
export const SITE_NAME = "bloclawd" as const;
export const SITE_TAGLINE =
  "When do AI subscription users actually hit limits?" as const;
export const SITE_DESCRIPTION =
  "Live cohort percentiles for Claude Code and Codex rate limits. See where Pro, Max5, and Max20 caps actually fire — and how they drift week to week. Open dataset, one CLI command to contribute, anonymous by construction." as const;
export const SITE_KEYWORDS = [
  "claude code rate limit",
  "codex rate limit",
  "claude max20",
  "claude max5",
  "claude pro",
  "5 hour limit",
  "weekly limit",
  "tokens to limit",
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
      "bloclawd shows where Claude Code and Codex rate limits actually fire — for everyone, not just you. Compare your last bonked window to the live cohort, watch the envelope drift week to week, and contribute your own with one CLI command. Anonymous by construction, k ≥ 5.",
  },
  {
    path: "/dashboard",
    title: "Dashboard · Claude Code & Codex limits by tier (Pro / Max5 / Max20)",
    description:
      "Where your tier's limits actually fire. Live p10–p90 envelope of tokens consumed before Claude Code and Codex rate limits trigger, broken down by Pro, Max5, and Max20. Filter by harness, region, and model.",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Dataset",
      name: "bloclawd — AI subscription rate-limit dataset",
      description:
        "Community-sourced, k-anonymized aggregates of Claude Code and Codex rate-limit events: tokens consumed, harness, tier, region, and model. Updated daily.",
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
        "tokens_to_limit_p10",
        "tokens_to_limit_p25",
        "tokens_to_limit_p50",
        "tokens_to_limit_p75",
        "tokens_to_limit_p90",
      ],
    },
    noscript:
      "Where your tier's limits actually fire. Pick Pro, Max5, or Max20 for the live percentile envelope, or compare tiers side-by-side to spot drift. Cells with fewer than five contributors are suppressed for anonymity.",
  },
  {
    path: "/methodology",
    title: "Methodology · how bloclawd computes what you see",
    description:
      "How bloclawd derives public aggregates from local CLI submissions: canonicalization, k-anonymity, log-scale binning, weighting, and the cron pipeline.",
    noscript:
      "How bloclawd computes what you see: canonicalization of submissions, proof-of-work admission control, k-anonymity at n ≥ 5, log-scale binning, weighting, and the daily aggregation pipeline.",
  },
  {
    path: "/methodology/changelog",
    title: "Methodology changelog",
    description:
      "Versioned record of changes to the bloclawd aggregation methodology, schema, and binning policy.",
    noscript:
      "Methodology changelog: versioned record of every change to the bloclawd aggregation methodology, schema, and binning policy.",
  },
  {
    path: "/install",
    title: "Install bloclawd · macOS & Linux",
    description:
      "Install the bloclawd CLI via curl, cargo, or Homebrew. One command after a 5-hour or weekly rate-limit hit submits a canonicalized, signed event.",
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
      "Install the bloclawd CLI on macOS or Linux: curl -fsSL https://bloclawd.com/install.sh | sh — or cargo install bloclawd, or brew install bloclawd/tap/bloclawd. One command after you hit a rate limit submits a canonicalized, signed event.",
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
    path: "/compare",
    title: "Pro vs Max5 vs Max20 · live tier comparison",
    description:
      "Side-by-side percentile envelope of tokens consumed before Claude Code and Codex rate limits trigger, broken down by Pro, Max5, and Max20. Real bonks from real users, anonymized.",
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "WebPage",
        name: "Pro vs Max5 vs Max20 · live tier comparison",
        url: `${SITE_URL}/compare`,
        description:
          "Side-by-side percentile envelope of tokens consumed before Claude Code and Codex rate limits trigger, broken down by Pro, Max5, and Max20.",
      },
      {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: [
          {
            "@type": "Question",
            name: "Does $200/mo Max20 really give you 20× the headroom of Pro?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Compare the p50 envelope side-by-side over a 30-day window. The relationship between sticker-price ratio and observed headroom is rarely linear and shifts week to week.",
            },
          },
          {
            "@type": "Question",
            name: "Why does my tier look tighter than the cohort?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Either you've hit a heavier model mix, or you may be in a cohort the provider is silently A/B testing. The drift chart shows shifts before any official changelog mentions them.",
            },
          },
          {
            "@type": "Question",
            name: "How is 'tokens to limit' defined across tiers?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "It is the unified token cost summed over the 5-hour or weekly window leading into a rate-limit hit. Per-model token weights are fit with ridge regression toward published per-token prices.",
            },
          },
          {
            "@type": "Question",
            name: "Why are some cells suppressed?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Any cell with fewer than 5 distinct contributors is suppressed for anonymity. Widen the window or relax a filter if you see gaps.",
            },
          },
        ],
      },
    ],
    noscript:
      "Pro vs Max5 vs Max20: live percentile envelope of tokens consumed before Claude Code and Codex rate limits trigger, broken down by subscription tier. Real bonks from real users, anonymized at k ≥ 5.",
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
