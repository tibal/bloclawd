import { ROUTES, composeMeta, type KnownPath } from "./seo";

type HeadMeta =
  | { title: string }
  | { name: string; content: string }
  | { property: string; content: string };

type HeadLink = { rel: string; href: string };
type HeadScript = { type: string; children: string };

export function routeHead(path: KnownPath): {
  meta: HeadMeta[];
  links: HeadLink[];
  scripts: HeadScript[];
} {
  const route = ROUTES.find((r) => r.path === path);
  if (!route) return { meta: [], links: [], scripts: [] };

  const meta: HeadMeta[] = [];
  const links: HeadLink[] = [];
  const scripts: HeadScript[] = [];

  for (const entry of composeMeta(route)) {
    switch (entry.kind) {
      case "title":
        meta.push({ title: entry.content });
        break;
      case "name":
        meta.push({ name: entry.name, content: entry.content });
        break;
      case "property":
        meta.push({ property: entry.property, content: entry.content });
        break;
      case "link":
        links.push({ rel: entry.rel, href: entry.href });
        break;
      case "ld":
        scripts.push({
          type: "application/ld+json",
          children: JSON.stringify(entry.payload),
        });
        break;
    }
  }

  return { meta, links, scripts };
}
