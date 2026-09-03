# 604 Jenks Boulevard

Property marketing site for 604 Jenks Blvd, Kalamazoo, MI 49006.
Built by Pfeilschmiede under SOW-2026-0001 for Dustin Tibbs.

**This file is the handover document.** It carries the full state of the project
so work can continue without prior conversation context.

---

## Migration status

Cloudflare Pages (classic) is connected to GitHub. The production branch is
`main`; preview deployments are building from `feat/gallery-pipeline`.

R2 and D1 are configured in `wrangler.toml`:

- `GALLERY_IMAGES` -> R2 bucket `604-jenks-images`
- `DB` -> D1 database `604-jenks-inquiries`

---

## Current state

| | |
|---|---|
| Domain | 604jenks.homes |
| Live now | `main`, currently the old coming-soon page until PR #1 is merged |
| Built | `feat/gallery-pipeline`, PR #1 |
| Next step | Merge PR #1, verify production, then attach/cut over the custom domain |

### Launch notes

Merging PR #1 deploys the new site to Cloudflare Pages production because
Cloudflare is connected to GitHub and `main` is the production branch.

The old GitHub Pages custom-domain file has been removed. DNS for
`604jenks.homes` must be cut over from GitHub Pages to Cloudflare Pages before
the custom domain serves the new site.

---

## Files

```
index.html                  Five sections. Small (~10 KB) and remotely editable.
assets/css/site.css         Evergreen and brass on laid paper. Fraunces + Archivo.
assets/js/site.js           Gallery, lightbox, share control, inquiry attribution.
functions/api/inquiry.js    Cloudflare Pages Function. Inert on GitHub Pages.
tools/build-gallery.mjs     Image pipeline. Run locally.
604-jenks-hero.jpg          Hero. Referenced as a file, not inlined.
wrangler.toml               Cloudflare Pages bindings for R2 and D1.
migrations/                 D1 schema for captured inquiries.
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
   correctly — hero, five sections, R2 gallery images, form present.
3. **Merge PR #1** so `main` deploys to Cloudflare Pages production.
4. **Custom domain** → 604jenks.homes
5. **Disable GitHub Pages** in repo settings. `CNAME` has already been removed
   from this branch.
6. **Make the repository private.** Access protects the Pages deployment but not
   `github.com` or `raw.githubusercontent.com`, which serve the source and the
   hero image to anyone with the URL. Gating the site while the repo is public
   accomplishes nothing.
7. **Zero Trust → Access → Applications → Self-hosted** → 604jenks.homes
   Allow policy, one-time PIN, three emails: Dustin, Jason Reicherts, James.
   Free to 50 users. This is the password gate.
8. **D1** → created as `604-jenks-inquiries`, bound as `DB`, schema:

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

9. **Resend** → add 604jenks.homes, publish SPF and DKIM, generate an API key.
   Domain verification is what makes mail to a Gmail inbox actually land.
10. **Turnstile** → optional hardening. Add a widget and wire its site key in
    `index.html`; secret goes into env.
11. **Environment variables for email notifications**

```
RESEND_API_KEY      secret
TURNSTILE_SECRET    secret
NOTIFY_TO           broker@…, owner@…      comma separated
NOTIFY_FROM         inquiries@604jenks.homes
```

12. Send a live test submission and confirm it appears in D1. After Resend is
    configured, confirm it also lands in the broker's inbox rather than spam.

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

The crawler-exclusion meta and visible development markers were removed for
public launch.

---

## Outstanding

- [ ] Questionnaire returned by the owner — verifies the ledger, supplies
      improvement years, narrative and neighborhood copy, room labels
- [ ] Broker license number and display phone, if the broker wants them shown
- [ ] Resend email notification setup
- [ ] Turnstile hardening
- [ ] Seller disclosure and floor plan PDFs
- [ ] Custom-domain DNS cutover from GitHub Pages to Cloudflare Pages
- [ ] Channel designation from owner and broker (SOW section 7)
- [ ] Cycle 1 baseline market snapshot — gate-independent, deliverable now
