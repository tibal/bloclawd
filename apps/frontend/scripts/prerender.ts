/**
 * Postbuild SSG: writes per-route static HTML stubs and sitemap.xml.
 *
 * Pseudo-SSG (template substitution, no React server-render): emits correct
 * <title>/description/OG/Twitter/JSON-LD per route so non-JS-rendering bots
 * see real meta. The SPA still hydrates and <HeadContent /> keeps the head
 * synced after client navigation. CF Workers static-assets serves
 * `<route>/index.html` for matching paths; SPA fallback handles the rest.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ROUTES,
  canonicalUrl,
  composeMeta,
  type MetaEntry,
  type RouteSeo,
} from "../src/lib/seo.ts";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "dist", "client");
const templatePath = join(outDir, "index.html");

const SEO_MARKER = "<!-- @@seo-head@@ -->";
const NOSCRIPT_MARKER = "<!-- @@noscript@@ -->";

const template = readFileSync(templatePath, "utf8");

if (!template.includes(SEO_MARKER)) {
  throw new Error(
    `index.html is missing ${SEO_MARKER}; prerender cannot inject route meta.`,
  );
}

for (const route of ROUTES) {
  const html = renderRoute(template, route);
  const targetDir =
    route.path === "/" ? outDir : join(outDir, route.path.replace(/^\//, ""));
  mkdirSync(targetDir, { recursive: true });
  writeFileSync(join(targetDir, "index.html"), html, "utf8");
}

writeFileSync(join(outDir, "sitemap.xml"), renderSitemap(), "utf8");

console.log(
  `✓ prerendered ${ROUTES.length} route stub(s) and sitemap.xml → dist/client/`,
);

function renderRoute(template: string, route: RouteSeo): string {
  const headHtml = composeMeta(route).map(entryToHtml).join("\n    ");
  const noscriptHtml = renderNoscript(route);
  return template
    .replace(SEO_MARKER, headHtml)
    .replace(NOSCRIPT_MARKER, noscriptHtml);
}

function entryToHtml(entry: MetaEntry): string {
  switch (entry.kind) {
    case "title":
      return `<title>${escapeHtml(entry.content)}</title>`;
    case "name":
      return `<meta name="${entry.name}" content="${escapeAttr(entry.content)}" />`;
    case "property":
      return `<meta property="${entry.property}" content="${escapeAttr(entry.content)}" />`;
    case "link":
      return `<link rel="${entry.rel}" href="${escapeAttr(entry.href)}" />`;
    case "ld":
      return `<script type="application/ld+json">${JSON.stringify(entry.payload).replace(/</g, "\\u003c")}</script>`;
  }
}

function renderNoscript(route: RouteSeo): string {
  const heading = escapeHtml(route.title);
  const body = escapeHtml(
    route.noscript ??
      "bloclawd is an anonymous, public dataset of Claude Code and Codex rate-limit hits. This site needs JavaScript for the live dashboard.",
  );
  return `<main style="max-width: 720px; margin: 4rem auto; padding: 0 1.5rem; font-family: system-ui, sans-serif; color: #e5e7eb; background: #0b0d12;">
        <h1>${heading}</h1>
        <p>${body}</p>
        <p><a href="/">← bloclawd</a></p>
      </main>`;
}

function renderSitemap(): string {
  const today = new Date().toISOString().slice(0, 10);
  const urls = ROUTES.filter((r) => r.index !== false)
    .map((r) => {
      const priority =
        r.path === "/" ? "1.0" : r.path === "/dashboard" ? "0.9" : "0.7";
      const changefreq = r.path === "/dashboard" ? "daily" : "weekly";
      return `  <url>\n    <loc>${canonicalUrl(r.path)}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
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
