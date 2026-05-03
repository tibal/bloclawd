/**
 * Frontend Worker entry: proxies asset requests via the ASSETS binding
 * and applies D-123 response-header overrides for /install.sh.
 *
 * Cloudflare WORKERS Static Assets do NOT honor the `_headers` file
 * (that is a Cloudflare PAGES convention). Header rewriting requires
 * a Worker entry — that is what this file is.
 */

export interface Env {
  ASSETS: Fetcher;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Pass-through to the ASSETS binding. Vite-built dist/ is served
    // by Cloudflare's static-asset binding; SPA fallback (declared in
    // wrangler.toml `not_found_handling = "single-page-application"`)
    // handles client-side routing.
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
