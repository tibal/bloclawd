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
}

const REPORTS_PREFIX = "/reports/v1/";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (
      (request.method === "GET" || request.method === "HEAD") &&
      url.pathname.startsWith(REPORTS_PREFIX)
    ) {
      return serveReport(request, env, url);
    }

    const response = await env.ASSETS.fetch(request);

    // /install.sh: override Content-Type + Cache-Control per D-123.
    // Cloudflare's default for `.sh` would be application/octet-stream
    // or text/x-shellscript with default cache; D-123 demands
    // text/plain so curl-pipe-sh users see the script source on
    // GET-without-pipe, and 5-min cache so install.sh PR merges
    // propagate to fresh installers within ~5 minutes.
    if (url.pathname === "/install.sh") {
      const newResponse = new Response(response.body, response);
      newResponse.headers.set("Content-Type", "text/plain; charset=utf-8");
      newResponse.headers.set(
        "Cache-Control",
        "public, max-age=300, must-revalidate",
      );
      return newResponse;
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
