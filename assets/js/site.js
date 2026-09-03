/* 604jenks.homes - gallery, lightbox, share, inquiry attribution
   Pfeilschmiede - SOW-2026-0001

   Reads assets/data/gallery.json, produced by tools/build-gallery.mjs.
   Only images flagged include:true render. The rest stay in the manifest
   as the Cycle 2 photo refresh. */

(() => {
  'use strict';

  const MANIFEST = 'assets/data/gallery.json';
  const grid = document.getElementById('gallery-grid');

  /* Order rooms the way a buyer walks the house, not alphabetically. */
  const ROOM_ORDER = ['Exterior', 'Living', 'Dining', 'Kitchen', 'Bedroom',
                      'Bath', 'Lower Level', 'Grounds', 'Aerial'];

  let shots = [];

  /* ---------- gallery ---------- */

  function srcset(img, base, ext) {
    return img.widths.map(w => `${base}/${img.slug}-${w}.${ext} ${w}w`).join(', ');
  }

  function tile(img, base, index) {
    const btn = document.createElement('button');
    btn.className = 'tile';
    btn.type = 'button';
    btn.dataset.index = index;
    btn.setAttribute('aria-label', `Enlarge: ${img.alt || 'photograph'}`);
    if (img.lqip) btn.style.backgroundImage = `url("${img.lqip}")`;

    const picture = document.createElement('picture');
    for (const ext of ['avif', 'webp']) {
      if (!img.formats.includes(ext)) continue;
      const s = document.createElement('source');
      s.type = `image/${ext}`;
      s.srcset = srcset(img, base, ext);
      s.sizes = '(min-width: 56rem) 24rem, 100vw';
      picture.append(s);
    }

    const el = document.createElement('img');
    el.src = `${base}/${img.slug}-800.jpg`;
    el.srcset = srcset(img, base, 'jpg');
    el.sizes = '(min-width: 56rem) 24rem, 100vw';
    el.alt = img.alt || '';
    el.width = 800;
    el.height = Math.round(800 / (img.aspectRatio || 1.5));
    el.loading = img.hero ? 'eager' : 'lazy';
    el.decoding = 'async';
    picture.append(el);

    btn.append(picture);
    return btn;
  }

  async function render() {
    if (!grid) return;
    let data;
    try {
      const res = await fetch(MANIFEST, { cache: 'no-cache' });
      if (!res.ok) throw new Error(res.status);
      data = await res.json();
    } catch {
      grid.innerHTML = '<p class="grid__empty">Photographs are not available right now. ' +
                       'Contact the listing broker below and they will send the full set.</p>';
      return;
    }

    const base = data.basePath || 'assets/property';
    shots = (data.images || [])
      .filter(i => i.include)
      .sort((a, b) => (a.order || 0) - (b.order || 0));

    if (!shots.length) {
      grid.innerHTML = '<p class="grid__empty">Photographs are being prepared.</p>';
      return;
    }

    /* Group by room, in walk-through order. Untagged images fall to the end. */
    const rooms = new Map();
    for (const img of shots) rooms.set(img.room || '', []);
    shots.forEach((img, i) => rooms.get(img.room || '').push({ img, i }));

    const sorted = [...rooms.keys()].sort((a, b) => {
      const ai = ROOM_ORDER.indexOf(a), bi = ROOM_ORDER.indexOf(b);
      return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
    });

    const frag = document.createDocumentFragment();
    for (const room of sorted) {
      if (room) {
        const h = document.createElement('p');
        h.className = 'grid__group';
        h.textContent = room;
        frag.append(h);
      }
      for (const { img, i } of rooms.get(room)) frag.append(tile(img, base, i));
    }

    grid.innerHTML = '';
    grid.append(frag);
  }

  /* ---------- lightbox ---------- */

  const lb   = document.getElementById('lb');
  const lbImg = document.getElementById('lb-img');
  const lbCap = document.getElementById('lb-cap');
  let at = 0, opener = null;

  function show(i) {
    if (!shots.length) return;
    at = (i + shots.length) % shots.length;
    const img = shots[at];
    lbImg.src = `assets/property/${img.slug}-1600.jpg`;
    lbImg.alt = img.alt || '';
    lbCap.textContent = `${at + 1} of ${shots.length}${img.room ? ' - ' + img.room : ''}`;
    /* Warm the neighbours so arrow-key browsing feels instant. */
    for (const step of [1, -1]) {
      const n = shots[(at + step + shots.length) % shots.length];
      new Image().src = `assets/property/${n.slug}-1600.jpg`;
    }
  }

  function open(i, from) {
    opener = from;
    lb.hidden = false;
    document.body.style.overflow = 'hidden';
    show(i);
    document.getElementById('lb-x').focus();
  }

  function close() {
    lb.hidden = true;
    document.body.style.overflow = '';
    lbImg.src = '';
    if (opener) opener.focus();
  }

  grid?.addEventListener('click', e => {
    const t = e.target.closest('.tile');
    if (t) open(Number(t.dataset.index), t);
  });

  document.getElementById('lb-x')?.addEventListener('click', close);
  document.getElementById('lb-prev')?.addEventListener('click', () => show(at - 1));
  document.getElementById('lb-next')?.addEventListener('click', () => show(at + 1));
  lb?.addEventListener('click', e => { if (e.target === lb) close(); });

  document.addEventListener('keydown', e => {
    if (lb.hidden) return;
    if (e.key === 'Escape')     close();
    if (e.key === 'ArrowLeft')  show(at - 1);
    if (e.key === 'ArrowRight') show(at + 1);
  });

  /* Swipe on touch. */
  let x0 = null;
  lb?.addEventListener('touchstart', e => { x0 = e.changedTouches[0].clientX; }, { passive: true });
  lb?.addEventListener('touchend', e => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0;
    if (Math.abs(dx) > 50) show(dx < 0 ? at + 1 : at - 1);
    x0 = null;
  }, { passive: true });

  /* ---------- share (SOW section 2: one-tap agent share) ---------- */

  document.getElementById('share')?.addEventListener('click', async function () {
    const url = 'https://604jenks.homes/';
    const payload = { title: '604 Jenks Boulevard, Kalamazoo', url };
    try {
      if (navigator.share) { await navigator.share(payload); return; }
      await navigator.clipboard.writeText(url);
      const was = this.textContent;
      this.textContent = 'Link copied';
      setTimeout(() => { this.textContent = was; }, 2000);
    } catch { /* user dismissed the sheet; nothing to report */ }
  });

  /* ---------- inquiry attribution ---------- */

  /* Stamps where the visitor came from onto the submission, so the cycle
     report can separate agent-channel traffic from buyer traffic without
     guesswork. Also tags the subject line so the broker can triage at a glance. */

  const params = new URLSearchParams(location.search);
  const src = document.getElementById('src');
  const t0 = document.getElementById('t0');
  if (t0) t0.value = String(Date.now());

  if (src) {
    src.value = [
      params.get('utm_source') || params.get('src') || 'direct',
      params.get('utm_medium')   || '',
      params.get('utm_campaign') || '',
      document.referrer || ''
    ].filter(Boolean).join(' | ');
  }

  const intent = document.getElementById('intent');
  const subj = document.getElementById('subj');
  intent?.addEventListener('change', () => {
    if (subj) subj.value = `604 Jenks - ${intent.value || 'inquiry'}`;
  });

  const form = document.getElementById('inquiry');
  const note = document.getElementById('form-note');
  form?.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"]');
    const was = btn?.textContent || 'Send inquiry';
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Sending...';
    }
    if (note) note.textContent = 'Sending your inquiry...';

    try {
      const res = await fetch(form.action, {
        method: 'POST',
        body: new FormData(form),
        headers: { accept: 'application/json' },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Please try again.');
      form.reset();
      if (t0) t0.value = String(Date.now());
      if (note) note.textContent = 'Inquiry sent. Expect a reply within one business day.';
    } catch (err) {
      if (note) note.textContent = err.message || 'Inquiry delivery is temporarily unavailable. Please contact the listing broker directly.';
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = was;
      }
    }
  });

  render();
})();
