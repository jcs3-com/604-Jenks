#!/usr/bin/env node
/**
 * 604jenks.homes — property image pipeline
 * Pfeilschmiede · SOW-2026-0001
 *
 * Takes the photographer's full-resolution originals and produces:
 *   - EXIF-stripped responsive derivatives (AVIF / WebP / JPEG) at 5 widths
 *   - Content-hashed filenames safe for immutable caching
 *   - Inline LQIP blur placeholders
 *   - A curation manifest with alt-text slots and include/order flags
 *
 * Usage:
 *   npm i sharp
 *   node tools/build-gallery.mjs ./originals ./assets/property ./src/data/gallery.json
 *
 * Re-running is safe. Existing derivatives are skipped; an existing manifest is
 * merged so hand-authored alt text, room tags, ordering, and include flags survive.
 *
 * NOTE: ./originals must be gitignored. Do not commit source JPEGs.
 */

import { promises as fs } from 'node:fs';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';

const SRC_DIR = process.argv[2] ?? './originals';
const OUT_DIR = process.argv[3] ?? './assets/property';
const MANIFEST_PATH = process.argv[4] ?? './src/data/gallery.json';

/** Derivative widths. Widths larger than the source are skipped, never upscaled. */
const WIDTHS = [400, 800, 1200, 1600, 2400];

/** Format ladder, best-first. The browser picks the first it supports. */
const FORMATS = [
  { ext: 'avif', opts: { quality: 55, effort: 6 } },
  { ext: 'webp', opts: { quality: 72 } },
  { ext: 'jpg', opts: { quality: 78, mozjpeg: true, progressive: true } },
];

/** How many images actually ship. SOW-2026-0001 caps media prep at 25. */
const SCOPE_CAP = 25;

const bytes = (n) => `${(n / 1048576).toFixed(2)} MB`;

/** Sort "…-2.jpg" before "…-10.jpg" instead of lexically. */
const naturalSort = (a, b) =>
  a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

async function hashFile(file) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex').slice(0, 8);
}

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/** Tiny inline blur placeholder. Prevents the grey-box flash on slow mobile. */
async function makeLqip(file) {
  const buf = await sharp(file)
    .resize(20, null, { fit: 'inside' })
    .blur(1.2)
    .webp({ quality: 40 })
    .toBuffer();
  return `data:image/webp;base64,${buf.toString('base64')}`;
}

async function loadExistingManifest() {
  if (!(await exists(MANIFEST_PATH))) return new Map();
  try {
    const raw = JSON.parse(await fs.readFile(MANIFEST_PATH, 'utf8'));
    const list = Array.isArray(raw) ? raw : (raw.images ?? []);
    return new Map(list.map((entry) => [entry.source, entry]));
  } catch {
    console.warn('  ! Existing manifest unreadable — starting clean.');
    return new Map();
  }
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.mkdir(path.dirname(MANIFEST_PATH), { recursive: true });

  const files = (await fs.readdir(SRC_DIR))
    .filter((f) => /\.(jpe?g|png|tiff?|heic)$/i.test(f))
    .sort(naturalSort);

  if (!files.length) {
    console.error(`No source images found in ${SRC_DIR}`);
    process.exit(1);
  }

  const previous = await loadExistingManifest();
  const manifest = [];
  let srcBytes = 0;
  let outBytes = 0;
  let exifFound = 0;

  console.log(`\n604 Jenks — image pipeline`);
  console.log(`  source:   ${SRC_DIR}  (${files.length} files)`);
  console.log(`  output:   ${OUT_DIR}`);
  console.log(`  manifest: ${MANIFEST_PATH}\n`);

  for (const [i, file] of files.entries()) {
    const abs = path.join(SRC_DIR, file);
    const stat = await fs.stat(abs);
    srcBytes += stat.size;

    const image = sharp(abs).rotate(); // honor EXIF orientation, then discard EXIF
    const meta = await image.metadata();

    // sharp drops all metadata unless withMetadata() is called. We never call it.
    // Listing photos — drone shots especially — routinely carry GPS coordinates.
    if (meta.exif) exifFound++;

    const hash = await hashFile(abs);
    const seq = String(i + 1).padStart(2, '0');
    const slug = `jenks-${seq}-${hash}`;

    const usableWidths = WIDTHS.filter((w) => w <= meta.width);
    if (!usableWidths.length) usableWidths.push(meta.width);

    for (const width of usableWidths) {
      for (const { ext, opts } of FORMATS) {
        const outPath = path.join(OUT_DIR, `${slug}-${width}.${ext}`);
        if (await exists(outPath)) {
          outBytes += (await fs.stat(outPath)).size;
          continue;
        }
        const pipeline = sharp(abs)
          .rotate()
          .resize(width, null, { fit: 'inside', withoutEnlargement: true });
        const fmt = ext === 'jpg' ? 'jpeg' : ext;
        await pipeline[fmt](opts).toFile(outPath);
        outBytes += (await fs.stat(outPath)).size;
      }
    }

    const prior = previous.get(file) ?? {};

    manifest.push({
      source: file,
      slug,
      width: meta.width,
      height: meta.height,
      aspectRatio: +(meta.width / meta.height).toFixed(4),
      widths: usableWidths,
      formats: FORMATS.map((f) => f.ext),
      lqip: prior.lqip ?? (await makeLqip(abs)),

      // ---- Hand-authored below. Preserved across re-runs. ----
      // alt:  Required by SOW §2 and the WCAG 2.1 AA commitment.
      //       Describe the space, not the file.
      alt: prior.alt ?? '',
      // room: Exterior | Living | Kitchen | Dining | Bedroom | Bath | Lower Level | Grounds | Aerial
      room: prior.room ?? '',
      // order: display sequence. Lower runs first.
      order: prior.order ?? i + 1,
      // include: false = held in reserve for the Cycle 2 photo refresh.
      include: prior.include ?? i < SCOPE_CAP,
      // hero: exactly one should be true. Gets eager load + fetchpriority=high.
      hero: prior.hero ?? false,
    });

    process.stdout.write(
      `  [${seq}/${files.length}] ${file} -> ${usableWidths.length}w x ${FORMATS.length}f\n`
    );
  }

  manifest.sort((a, b) => a.order - b.order);

  await fs.writeFile(
    MANIFEST_PATH,
    JSON.stringify(
      {
        property: '604 Jenks Blvd, Kalamazoo, MI 49006',
        generated: new Date().toISOString(),
        basePath: '/assets/property',
        scopeCap: SCOPE_CAP,
        images: manifest,
      },
      null,
      2
    ) + '\n'
  );

  const included = manifest.filter((m) => m.include).length;
  const missingAlt = manifest.filter((m) => m.include && !m.alt).length;
  const heroes = manifest.filter((m) => m.hero).length;

  console.log(`\n  originals:    ${bytes(srcBytes)} across ${files.length} files`);
  console.log(`  derivatives:  ${bytes(outBytes)}`);
  console.log(`  EXIF present: ${exifFound} of ${files.length} — all stripped`);
  console.log(`  shipping:     ${included} of ${manifest.length} (cap ${SCOPE_CAP})`);

  const warn = [];
  if (included > SCOPE_CAP)
    warn.push(`${included} images flagged include — exceeds the ${SCOPE_CAP} in SOW section 2.`);
  if (missingAlt) warn.push(`${missingAlt} shipping images have no alt text.`);
  if (heroes !== 1) warn.push(`${heroes} images flagged hero — should be exactly 1.`);

  if (warn.length) {
    console.log('\n  OPEN ITEMS');
    warn.forEach((w) => console.log(`    - ${w}`));
  }
  console.log('');
}

main().catch((err) => {
  console.error('\nPipeline failed:', err.message);
  process.exit(1);
});
