/**
 * Derives favicon + social-image set from `public/logo.png`.
 * Skipped when `favicon-32x32.png` is newer than `logo.png` (use --force to regenerate).
 */

import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import pngToIco from "png-to-ico";
import sharp from "sharp";

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = join(here, "..", "public");
const sourcePath = join(publicDir, "logo.png");

const BG = { r: 11, g: 13, b: 18, alpha: 1 } as const;

const witness = join(publicDir, "favicon-32x32.png");
if (
  !process.argv.includes("--force") &&
  existsSync(witness) &&
  statSync(witness).mtimeMs >= statSync(sourcePath).mtimeMs
) {
  console.log("✓ icons up to date (logo.png unchanged)");
  process.exit(0);
}

const source = readFileSync(sourcePath);
const meta = await sharp(source).metadata();
if ((meta.width ?? 0) < 512 || (meta.height ?? 0) < 512) {
  throw new Error(
    `logo.png too small (${meta.width}x${meta.height}); need at least 512x512`,
  );
}

await Promise.all([
  emitTransparent(16, "favicon-16x16.png"),
  emitTransparent(32, "favicon-32x32.png"),
  emitOpaque(180, "apple-touch-icon.png", { padRatio: 0.08 }),
  emitOpaque(192, "android-chrome-192x192.png", { padRatio: 0.1 }),
  emitOpaque(512, "android-chrome-512x512.png", { padRatio: 0.15 }),
  emitOg(),
  emitIco(),
]);

console.log("✓ generated icons + og-image into public/");

async function emitTransparent(size: number, filename: string): Promise<void> {
  await sharp(source)
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toFile(join(publicDir, filename));
}

async function emitOpaque(
  size: number,
  filename: string,
  opts: { padRatio?: number } = {},
): Promise<void> {
  const padRatio = opts.padRatio ?? 0.1;
  const inner = Math.round(size * (1 - padRatio * 2));
  const logo = await sharp(source)
    .resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();
  const offset = Math.round((size - inner) / 2);

  await sharp({
    create: { width: size, height: size, channels: 4, background: BG },
  })
    .composite([{ input: logo, left: offset, top: offset }])
    .png({ compressionLevel: 9 })
    .toFile(join(publicDir, filename));
}

async function emitOg(): Promise<void> {
  const W = 1200;
  const H = 630;
  const logoSize = 280;
  const logo = await sharp(source)
    .resize(logoSize, logoSize, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();

  // Soft brand-blue radial wash, baked into the bg via SVG composite.
  const bgSvg = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
      <defs>
        <radialGradient id="r1" cx="22%" cy="18%" r="60%">
          <stop offset="0%" stop-color="#3a5fc8" stop-opacity="0.35" />
          <stop offset="60%" stop-color="#1a2a55" stop-opacity="0.18" />
          <stop offset="100%" stop-color="#0b0d12" stop-opacity="0" />
        </radialGradient>
        <radialGradient id="r2" cx="85%" cy="80%" r="55%">
          <stop offset="0%" stop-color="#7aa6ff" stop-opacity="0.18" />
          <stop offset="100%" stop-color="#0b0d12" stop-opacity="0" />
        </radialGradient>
        <pattern id="grid" x="0" y="0" width="56" height="56" patternUnits="userSpaceOnUse">
          <path d="M 56 0 L 0 0 0 56" fill="none" stroke="#ffffff" stroke-opacity="0.04" stroke-width="1"/>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="#0b0d12"/>
      <rect width="100%" height="100%" fill="url(#grid)"/>
      <rect width="100%" height="100%" fill="url(#r1)"/>
      <rect width="100%" height="100%" fill="url(#r2)"/>
    </svg>
  `);

  // Wordmark + tagline rendered as SVG. Falls back through ui-sans-serif so
  // librsvg + fontconfig can find a clean sans on most systems; if Inter
  // isn't present it'll pick the closest match. Sized big and tracked tight
  // so font substitution stays acceptable.
  const textSvg = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
      <style>
        .brand { font: 600 84px ui-sans-serif, system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif; fill: #f5f7fb; letter-spacing: -2px; }
        .tag   { font: 500 30px ui-sans-serif, system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif; fill: #9aa3b2; letter-spacing: -0.4px; }
        .accent { font: 500 18px ui-monospace, "JetBrains Mono", "SF Mono", Menlo, monospace; fill: #7aa6ff; letter-spacing: 1px; }
      </style>
      <text x="600" y="370" text-anchor="middle" class="brand">bloclawd</text>
      <text x="600" y="430" text-anchor="middle" class="tag">When do AI subscription users actually hit limits?</text>
      <text x="600" y="500" text-anchor="middle" class="accent">COMMUNITY-SOURCED · NO TELEMETRY · k ≥ 5</text>
    </svg>
  `);

  await sharp(bgSvg)
    .composite([
      { input: logo, top: 70, left: Math.round(W / 2 - logoSize / 2) },
      { input: textSvg, top: 0, left: 0 },
    ])
    .png({ compressionLevel: 9 })
    .toFile(join(publicDir, "og-image.png"));
}

async function emitIco(): Promise<void> {
  const buffers = await Promise.all(
    [16, 32, 48].map((size) =>
      sharp(source)
        .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer(),
    ),
  );
  const ico = await pngToIco(buffers);
  writeFileSync(join(publicDir, "favicon.ico"), ico);
}
