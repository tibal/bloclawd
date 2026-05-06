/**
 * Frontend Worker entry: serves SPA assets via the ASSETS binding,
 * proxies `/reports/v1/*` from the R2 bucket via the BUCKET binding so
 * the bucket can stay private (no public r2.dev / custom-domain attach),
 * and applies D-123 response-header overrides for /install.sh.
 *
 * Cloudflare WORKERS Static Assets do NOT honor the `_headers` file
 * (that is a Cloudflare PAGES convention). Header rewriting requires
 * a Worker entry — that is what this file is.
 *
 * R2 proxy contract:
 *   - Requests under `/reports/v1/` are served from `env.BUCKET`.
 *   - Cache-control + content-type are passed through from the object's
 *     stored httpMetadata (the cron Worker writes these on PUT — see
 *     apps/worker/src/cron/r2_emit.rs put_json).
 *   - Same-origin reads make the bucket reachable only through this
 *     Worker, which on staging is policy-gated by Cloudflare Access.
 */

export interface Env {
  ASSETS: Fetcher;
  BUCKET?: R2Bucket;
  ENVIRONMENT?: "production" | "staging" | "development";
}

const REPORTS_PREFIX = "/reports/v1/";
const SITE_URL = "https://bloclawd.com";
const SITE_NAME = "bloclawd";
const RANK_TITLE = "Make a shareable Claude Code or Codex limit card · bloclawd";
const RANK_DESCRIPTION =
  "Run the normal bloclawd command to submit an anonymous limit hit, then paste the rank block it prints for a shareable card and cohort comparison.";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (
      (request.method === "GET" || request.method === "HEAD") &&
      (url.pathname === "/compare" || url.pathname === "/compare/")
    ) {
      const target = new URL(request.url);
      target.pathname = "/rank";
      return Response.redirect(target.toString(), 308);
    }

    if (
      (request.method === "GET" || request.method === "HEAD") &&
      url.pathname.startsWith(REPORTS_PREFIX)
    ) {
      return serveReport(request, env, url);
    }

    let response = await env.ASSETS.fetch(request);

    if (
      request.method === "GET" &&
      (url.pathname === "/rank" || url.pathname === "/rank/") &&
      isHtmlResponse(response)
    ) {
      response = await rewriteRankMetadata(response, url);
    }

    // /install.sh: D-123 — text/plain so curl-pipe-sh users see source on
    // GET-without-pipe; 5-min cache so install.sh PR merges propagate fast.
    if (url.pathname === "/install.sh") {
      const newResponse = new Response(response.body, response);
      newResponse.headers.set("Content-Type", "text/plain; charset=utf-8");
      newResponse.headers.set(
        "Cache-Control",
        "public, max-age=300, must-revalidate",
      );
      newResponse.headers.set("X-Robots-Tag", "noindex");
      return newResponse;
    }

    // Any deploy that isn't production gets X-Robots-Tag: noindex so a
    // leaked staging/preview URL can't poison search results. ENVIRONMENT
    // is set per env in wrangler.toml ([env.production], [env.staging]).
    if (env.ENVIRONMENT !== "production") {
      const noindexed = new Response(response.body, response);
      noindexed.headers.set("X-Robots-Tag", "noindex, nofollow");
      return noindexed;
    }

    return response;
  },
} satisfies ExportedHandler<Env>;

async function serveReport(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response> {
  if (!env.BUCKET) {
    return new Response("R2 binding missing", {
      status: 503,
      headers: { "cache-control": "no-store" },
    });
  }

  const key = url.pathname.replace(/^\/+/, "");
  const head = request.method === "HEAD";
  const object = head ? await env.BUCKET.head(key) : await env.BUCKET.get(key);

  if (!object) {
    return new Response("Not Found", {
      status: 404,
      headers: { "cache-control": "no-store" },
    });
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json; charset=utf-8");
  }

  if (head) {
    return new Response(null, { headers });
  }
  return new Response((object as R2ObjectBody).body, { headers });
}

function isHtmlResponse(response: Response): boolean {
  return response.headers.get("content-type")?.includes("text/html") ?? false;
}

async function rewriteRankMetadata(
  response: Response,
  url: URL,
): Promise<Response> {
  const html = await response.text();
  const meta = rankMetaFor(url);
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  return new Response(applyRankMeta(html, meta), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function rankMetaFor(url: URL): {
  title: string;
  description: string;
  shareUrl: string;
} {
  const packed = decodePackedRank(url.searchParams.get("s"));
  const profile = cleanParam(url.searchParams.get("profile"));
  const ratio = Number(url.searchParams.get("ratio"));
  const cost = cleanParam(url.searchParams.get("cost"));
  const ratioLabel =
    Number.isFinite(ratio) && ratio > 0
      ? ratio >= 1
        ? `${ratio.toFixed(2)}x median headroom`
        : `${(1 / ratio).toFixed(2)}x less than median`
      : null;
  const cohort = packed
    ? `${packed.harness} ${packed.limitType} ${packed.region} ${packed.tier}`
    : "AI CLI";
  const title =
    profile && ratioLabel
      ? `${profile} · ${ratioLabel} · ${SITE_NAME}`
      : RANK_TITLE;
  const description =
    profile && ratioLabel
      ? `My ${cohort} limit card landed ${ratioLabel}${
          cost ? ` at $${cost} API-equivalent` : ""
        }. Submit with bloclawd, paste the rank block, and compare.`
      : RANK_DESCRIPTION;

  return {
    title,
    description,
    shareUrl: `${SITE_URL}${url.pathname}${url.search}`,
  };
}

function applyRankMeta(
  html: string,
  meta: { title: string; description: string; shareUrl: string },
): string {
  const image = `${SITE_URL}/og-image.png`;
  let out = replaceTitle(html, meta.title);
  out = upsertMetaName(out, "description", meta.description);
  out = upsertMetaProperty(out, "og:title", meta.title);
  out = upsertMetaProperty(out, "og:description", meta.description);
  out = upsertMetaProperty(out, "og:url", meta.shareUrl);
  out = upsertMetaProperty(out, "og:image", image);
  out = upsertMetaName(out, "twitter:title", meta.title);
  out = upsertMetaName(out, "twitter:description", meta.description);
  out = upsertMetaName(out, "twitter:image", image);
  return upsertLink(out, "canonical", `${SITE_URL}/rank`);
}

function replaceTitle(html: string, title: string): string {
  const tag = `<title>${escapeHtml(title)}</title>`;
  if (/<title>.*?<\/title>/is.test(html)) {
    return html.replace(/<title>.*?<\/title>/is, tag);
  }
  return html.replace("</head>", `    ${tag}\n  </head>`);
}

function upsertMetaName(html: string, name: string, content: string): string {
  const tag = `<meta name="${escapeAttr(name)}" content="${escapeAttr(content)}" />`;
  const pattern = new RegExp(
    `<meta\\s+name="${escapeRegExp(name)}"\\s+content="[^"]*"\\s*/?>`,
    "i",
  );
  return pattern.test(html)
    ? html.replace(pattern, tag)
    : html.replace("</head>", `    ${tag}\n  </head>`);
}

function upsertMetaProperty(
  html: string,
  property: string,
  content: string,
): string {
  const tag = `<meta property="${escapeAttr(property)}" content="${escapeAttr(content)}" />`;
  const pattern = new RegExp(
    `<meta\\s+property="${escapeRegExp(property)}"\\s+content="[^"]*"\\s*/?>`,
    "i",
  );
  return pattern.test(html)
    ? html.replace(pattern, tag)
    : html.replace("</head>", `    ${tag}\n  </head>`);
}

function upsertLink(html: string, rel: string, href: string): string {
  const tag = `<link rel="${escapeAttr(rel)}" href="${escapeAttr(href)}" />`;
  const pattern = new RegExp(
    `<link\\s+rel="${escapeRegExp(rel)}"\\s+href="[^"]*"\\s*/?>`,
    "i",
  );
  return pattern.test(html)
    ? html.replace(pattern, tag)
    : html.replace("</head>", `    ${tag}\n  </head>`);
}

function decodePackedRank(value: string | null): {
  harness: string;
  tier: string;
  region: string;
  limitType: string;
} | null {
  if (!value) return null;
  try {
    const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const json = new TextDecoder().decode(
      Uint8Array.from(atob(padded), (char) => char.charCodeAt(0)),
    );
    const packed = JSON.parse(json) as {
      h?: unknown;
      t?: unknown;
      r?: unknown;
      l?: unknown;
    };
    if (
      typeof packed.h !== "string" ||
      typeof packed.t !== "string" ||
      typeof packed.r !== "string" ||
      typeof packed.l !== "string"
    ) {
      return null;
    }
    return {
      harness: packed.h,
      tier: packed.t,
      region: packed.r,
      limitType: packed.l,
    };
  } catch {
    return null;
  }
}

function cleanParam(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length < 80 ? trimmed : null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
