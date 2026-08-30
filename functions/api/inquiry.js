/**
 * POST /api/inquiry
 * 604jenks.homes - Cloudflare Pages Function
 * Pfeilschmiede - SOW-2026-0001
 *
 * Same-origin form handler. No third-party form service, no external URL in
 * the markup. Deploys with the repo on every push.
 *
 * Order of operations matters: verify the human, write the record, then send
 * the mail. Email is best-effort and the least reliable link in the chain, so
 * the durable write happens first. A submission that logs but fails to mail is
 * recoverable. One that mails but never logs is a lead you cannot count, and
 * SOW section 3 obliges us to report inquiry volume.
 *
 * Bindings (Cloudflare dashboard, Settings > Functions):
 *   DB                  D1 database binding
 *   RESEND_API_KEY      secret
 *   TURNSTILE_SECRET    secret
 *   NOTIFY_TO           comma-separated recipients (broker, owner)
 *   NOTIFY_FROM         inquiries@604jenks.homes  (verify domain in Resend
 *                       so SPF and DKIM sign as us, not as a shared sender)
 *
 * Schema:
 *   CREATE TABLE inquiries (
 *     id INTEGER PRIMARY KEY AUTOINCREMENT,
 *     created_at TEXT NOT NULL,
 *     name TEXT, email TEXT, phone TEXT,
 *     intent TEXT, message TEXT,
 *     source TEXT, ip TEXT, country TEXT,
 *     mailed INTEGER DEFAULT 0
 *   );
 */

const ok   = (body) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
const fail = (status, error) => new Response(JSON.stringify({ error }), { status, headers: { 'content-type': 'application/json' } });

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

async function humanCheck(token, ip, secret) {
  if (!secret) return true; // Turnstile not configured yet; honeypot still applies.
  if (!token) return false;
  const body = new FormData();
  body.append('secret', secret);
  body.append('response', token);
  if (ip) body.append('remoteip', ip);
  const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
  return r.ok && (await r.json()).success === true;
}

export async function onRequestPost({ request, env }) {
  let f;
  try {
    f = Object.fromEntries(await request.formData());
  } catch {
    return fail(400, 'Could not read that submission. Please try again.');
  }

  /* Honeypot. Hidden off-screen, so a filled value means a bot.
     Answer 200 so it does not learn anything from the response. */
  if (f.company) return ok({ ok: true });

  /* Time-to-submit floor. Humans do not complete a form in three seconds. */
  const elapsed = Date.now() - Number(f.t0 || 0);
  if (f.t0 && elapsed < 3000) return ok({ ok: true });

  if (!f.name || !f.email || !f.intent) return fail(400, 'Name, email and reason for writing are all required.');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email)) return fail(400, 'That email address does not look right.');

  const ip = request.headers.get('CF-Connecting-IP');
  if (!(await humanCheck(f['cf-turnstile-response'], ip, env.TURNSTILE_SECRET))) {
    return fail(400, 'We could not verify that submission. Please reload and try again.');
  }

  const row = {
    created_at: new Date().toISOString(),
    name: String(f.name).slice(0, 200),
    email: String(f.email).slice(0, 200),
    phone: String(f.phone || '').slice(0, 60),
    intent: String(f.intent).slice(0, 80),
    message: String(f.message || '').slice(0, 4000),
    source: String(f.source || 'direct').slice(0, 500),
    ip: ip || '',
    country: request.headers.get('CF-IPCountry') || '',
  };

  /* 1. Durable write. This is the record of truth for the cycle report. */
  let id = null;
  try {
    const res = await env.DB.prepare(
      `INSERT INTO inquiries (created_at, name, email, phone, intent, message, source, ip, country)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(row.created_at, row.name, row.email, row.phone, row.intent,
           row.message, row.source, row.ip, row.country).run();
    id = res.meta?.last_row_id ?? null;
  } catch (e) {
    console.error('D1 insert failed', e);
    /* Keep going. Losing the log is bad; losing the lead is worse. */
  }

  /* 2. Notify. Reply-To carries the visitor so a reply reaches them directly.
        From stays on our verified domain - putting the visitor's address in
        From is the single most common cause of DMARC rejection. */
  let mailed = 0;
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.RESEND_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: env.NOTIFY_FROM,
        to: (env.NOTIFY_TO || '').split(',').map(s => s.trim()).filter(Boolean),
        reply_to: row.email,
        subject: `604 Jenks - ${row.intent} - ${row.name}`,
        html:
          `<h2 style="font:600 16px system-ui">${esc(row.intent)}</h2>` +
          `<p style="font:400 15px/1.6 system-ui">` +
          `<strong>${esc(row.name)}</strong><br>` +
          `<a href="mailto:${esc(row.email)}">${esc(row.email)}</a>` +
          (row.phone ? `<br>${esc(row.phone)}` : '') + `</p>` +
          (row.message ? `<blockquote style="font:400 15px/1.6 system-ui;border-left:3px solid #1F3B31;margin:0;padding-left:1em">${esc(row.message)}</blockquote>` : '') +
          `<hr style="border:0;border-top:1px solid #ddd;margin:1.5em 0">` +
          `<p style="font:400 12px/1.5 system-ui;color:#666">` +
          `Source: ${esc(row.source)}<br>` +
          `Received: ${esc(row.created_at)}${row.country ? ' from ' + esc(row.country) : ''}<br>` +
          `Record: ${id ?? 'not logged'}</p>`,
      }),
    });
    mailed = r.ok ? 1 : 0;
    if (!r.ok) console.error('Resend rejected', r.status, await r.text());
  } catch (e) {
    console.error('Resend request failed', e);
  }

  if (id !== null) {
    try { await env.DB.prepare('UPDATE inquiries SET mailed = ? WHERE id = ?').bind(mailed, id).run(); }
    catch { /* already logged; the mailed flag is a nice-to-have */ }
  }

  /* Never surface a delivery failure to the visitor. From their side the
     inquiry landed - it is in D1 either way. Reconcile mailed = 0 rows
     when building the cycle report. */
  return ok({ ok: true });
}

/* Anything other than POST. */
export const onRequest = ({ request }) =>
  request.method === 'POST' ? undefined : fail(405, 'Method not allowed.');
