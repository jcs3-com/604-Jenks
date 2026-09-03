/**
 * GET /assets/property/*
 *
 * Serves processed gallery derivatives from the 604-jenks-images R2 bucket.
 * Configure the Pages R2 binding as GALLERY_IMAGES. The fallback binding names
 * keep previews working if the bucket was already bound under a shorter name.
 */

const CANDIDATE_BINDINGS = ['GALLERY_IMAGES', 'GALLERY', 'PHOTOS', 'BUCKET'];

const TYPES = {
  avif: 'image/avif',
  webp: 'image/webp',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
};

const notFound = () => new Response('Not found', {
  status: 404,
  headers: {
    'content-type': 'text/plain; charset=utf-8',
    'x-content-type-options': 'nosniff',
  },
});

function cleanKey(request) {
  const path = new URL(request.url).pathname;
  const prefix = '/assets/property/';
  if (!path.startsWith(prefix)) return null;

  let key;
  try {
    key = decodeURIComponent(path.slice(prefix.length));
  } catch {
    return null;
  }

  if (!key || key.includes('\0') || key.includes('\\') || key.includes('..') || key.startsWith('/')) {
    return null;
  }

  return key;
}

function galleryBucket(env) {
  for (const name of CANDIDATE_BINDINGS) {
    const binding = env[name];
    if (binding && typeof binding.get === 'function' && typeof binding.head === 'function') {
      return binding;
    }
  }
  return null;
}

function candidateKeys(key) {
  return [
    key,
    `assets/property/${key}`,
    `property/${key}`,
  ];
}

function headersFor(object, key) {
  const headers = new Headers();
  object.writeHttpMetadata?.(headers);
  if (object.httpEtag) headers.set('etag', object.httpEtag);
  if (!headers.has('content-type')) {
    const ext = key.split('.').pop()?.toLowerCase();
    headers.set('content-type', TYPES[ext] || 'application/octet-stream');
  }
  headers.set('cache-control', 'public, max-age=31536000, immutable');
  headers.set('x-content-type-options', 'nosniff');
  return headers;
}

async function findObject(bucket, key, body) {
  for (const candidate of candidateKeys(key)) {
    const object = body ? await bucket.get(candidate) : await bucket.head(candidate);
    if (object) return { object, key: candidate };
  }
  return null;
}

export async function onRequestGet({ request, env }) {
  const key = cleanKey(request);
  const bucket = galleryBucket(env);
  if (!key || !bucket) return notFound();

  const found = await findObject(bucket, key, true);
  if (!found || !found.object.body) return notFound();

  return new Response(found.object.body, {
    headers: headersFor(found.object, found.key),
  });
}

export async function onRequestHead({ request, env }) {
  const key = cleanKey(request);
  const bucket = galleryBucket(env);
  if (!key || !bucket) return notFound();

  const found = await findObject(bucket, key, false);
  if (!found) return notFound();

  return new Response(null, {
    headers: headersFor(found.object, found.key),
  });
}

