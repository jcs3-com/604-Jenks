# 604 Jenks Boulevard

Property marketing site for 604 Jenks Blvd, Kalamazoo, MI 49006.
Built by Pfeilschmiede under SOW-2026-0001 for Dustin Tibbs.

**This file is the handover document.** It carries the full state of the project
so work can continue without prior conversation context.

---

## Migration status

Cloudflare Pages (classic) connected 2026-09-02. This commit exists to trigger
the first preview build for this branch — Pages builds on push, and this
branch predates the connection, so no build had fired yet.

---

## Current state

| | |
|---|---|
| Domain | 604jenks.homes |
| Live now | `main`, served by GitHub Pages — the old coming-soon page |
| Built | `feat/gallery-pipeline`, PR #1 — **not merged, deliberately** |
| Next step | Verify the branch preview, then configure D1/Resend/Turnstile/Access, then merge |

### Why the branch is not merged

Merging deploys to GitHub Pages, and three things break:

1. **The form dies.** It posts to `/api/inquiry`, a Cloudflare Pages Function.
   GitHub Pages has no server and returns 405 on POST.
2. **The page goes public with placeholders.** Every unresolved value is marked
   `TODO` and carries `data-todo`, which paints a dashed outline in the browser.
3. **It may start an MLS clock.** See Compliance below.

Merge after Cloudflare Pages is connected and Access is configured.

---

## Files

```
index.html                  Five sections. Small (~10 KB) and remotely editable.
assets/css/site.css         Evergreen and brass on laid paper. Fraunces + Archivo.
assets/js/site.js           Gallery, lightbox, share control, inquiry attribution.
functions/api/inquiry.js    Cloudflare Pages Function. Inert on GitHub Pages.
tools/build-gallery.mjs     Image pipeline. Run locally.
604-jenks-hero.jpg          Hero. Referenced as a file, not inlined.
CNAME                       Delete when DNS moves to Cloudflare.
```

### What was fixed in the rebuild

- **`index.html` went from 1,903,755 bytes to ~10,000.** The hero was base64
  inlined into the document while the JPEG sat in the repo root beside it.
  Nothing was cacheable and the file was too large to edit via the GitHub API.
- **`og:image` was a base64 data URI.** No social platform renders one, so every
  link the broker sent appeared as a bare URL with no preview card. Now an
  absolute HTTPS URL.
- **Formspree replaced** with a same-origin handler.

---

## Design

Midwest period home, not the "Southern historic" framing of the earlier draft —
this is a 1949 colonial in Westwood.

- **Palette** — evergreen `#1F3B31` (painted trim), brass `#A8763E` (door
  hardware), moss `#6E7F5F`, laid-paper `#F1EFE6`
- **Type** — Fraunces for display, chosen for old-style figures and period
  character; Archivo for body and specification data
- **Signature element** — the specification ledger: hairline-ruled rows reading
  as a property abstract rather than a bullet list
- **Lead detail for copy** — the reclaimed brick paver drive, lettering still
  legible in the bricks. The 2009 listing led with it too.

---

## Cloudflare migration runbook

1. **Pages** → Connect to Git → `Jcs3-com/604-Jenks`. DONE 2026-09-02.
   Build command: none. Output directory: `/`
2. **Verify the branch preview** for `feat/gallery-pipeline` builds and renders
   correctly — hero, five sections, dashed-outline TODOs, gallery placeholder
   text, form present (submission will fail until the Function is wired below).
3. **Custom domain** → 604jenks.homes
4. **Disable GitHub Pages** in repo settings and delete `CNAME`.
   Otherwise an ungated copy keeps serving.
5. **Make the repository private.** Access protects the Pages deployment but not
   `github.com` or `raw.githubusercontent.com`, which serve the source and the
   hero image to anyone with the URL. Gating the site while the repo is public
   accomplishes nothing.
6. **Zero Trust → Access → Applications → Self-hosted** → 604jenks.homes
   Allow policy, one-time PIN, three emails: Dustin, Jason Reicherts, James.
   Free to 50 users. This is the password gate.
7. **D1** → create database, bind as `DB`, run:

```sql
CREATE TABLE inquiries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  name TEXT, email TEXT, phone TEXT,
  intent TEXT, message TEXT,
  source TEXT, ip TEXT, country TEXT,
  mailed INTEGER DEFAULT 0
);
```

8. **Resend** → add 604jenks.homes, publish SPF and DKIM, generate an API key.
   Domain verification is what makes mail to a Gmail inbox actually land.
9. **Turnstile** → create a widget. Site key goes into the commented block in
   `index.html`; secret goes into env.
10. **Environment variables**

```
RESEND_API_KEY      secret
TURNSTILE_SECRET    secret
NOTIFY_TO           broker@…, owner@…      comma separated
NOTIFY_FROM         inquiries@604jenks.homes
```

11. **Merge PR #1**, then send a live test submission and confirm it lands in
    the broker's inbox rather than spam.

Everything above is free tier: Pages unlimited static, Functions 100k/day,
Access 50 users, Turnstile unlimited, D1 free tier, Resend 3,000/month.

---

## Photographs

35 originals from the seller, rights confirmed in writing and on file.
SOW section 2 caps media preparation at 25; the remaining 10 are held for a
Cycle 2 refresh, which gives a reason to re-engage the listing in October.

```bash
npm i sharp
node tools/build-gallery.mjs ./originals ./assets/property ./assets/data/gallery.json
```

Strips EXIF (drone frames carry GPS), emits AVIF/WebP/JPEG at five widths with
content-hashed filenames, generates LQIP placeholders, and writes a manifest
with empty `alt`, `room`, `order`, `include` and `hero` fields. Re-runs merge,
so hand-authored alt text survives.

`./originals` is gitignored. Do not commit source JPEGs — git keeps every
version forever.

---

## Property data

Public record via Zillow, pending the owner's confirmation. Only baths are
confirmed.

| | |
|---|---|
| Beds / baths | 3 / **2.5 confirmed** |
| Finished area | 1,412 sq ft |
| Lot | 0.40 acres |
| Year built | 1949 |
| Annual tax (2025) | $5,400 |
| Parcel | 0617135652 |
| Neighborhood | Westwood |
| Schools | Hillside Middle, Kalamazoo Central |

**No price is published.** That is the broker's call and waits on the MLS listing.

**Heating is deliberately omitted.** The furnace is newer but undated, and an
undated claim on a listing page is worse than no claim.

**Do not reuse Zillow's "What's special" copy.** It is the 2009 listing
description. Its "new furnace and central air" is now seventeen years old. Treat
it only as a checklist of features to verify.

---

## Broker

Jason Reicherts, Evenboer-Walton Realtors.
Inquiries currently route to a Gmail address; a brokerage-domain address would
deliver more reliably. License number and display phone still outstanding.

---

## Compliance

**Clear Cooperation.** The property is not yet in MichRIC. A publicly reachable
listing page counts as public marketing, and NAR's Clear Cooperation Policy can
require MLS submission within one business day of public marketing. While the
site sits behind Cloudflare Access it is not public marketing and no clock runs.
The broker decides when it opens.

**Indexing.** A gated page cannot be indexed. Search setup is configured and
staged but cannot execute until the site is public. Record this in the handover
as staged-pending-unlock rather than delivered.

**Remove at unlock:** the `robots noindex` meta in `index.html`, and the
`[data-todo]` rule at the bottom of `site.css`.

---

## Outstanding

- [ ] Questionnaire returned by the owner — verifies the ledger, supplies
      improvement years, narrative and neighborhood copy, room labels
- [ ] Broker license number, display phone, showing procedure
- [ ] Run the image pipeline; author alt text and room tags
- [ ] `assets/docs/seller-disclosure.pdf` and `floor-plan.pdf`
- [ ] Cloudflare migration per the runbook above
- [ ] Channel designation from owner and broker (SOW section 7)
- [ ] Cycle 1 baseline market snapshot — gate-independent, deliverable now
