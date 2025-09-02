// netlify/functions/mal-proxy.js
const MAL_API = 'https://api.myanimelist.net/v2';
const COOKIE_ACCESS = 'mal_access';

function readCookie(cookie, name) {
  if (!cookie) return null;
  const m = cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : null;
}

function buildHeaders(event) {
  const headers = { 'Content-Type': 'application/json' };
  const access = readCookie(event.headers.cookie || event.headers.Cookie || '', COOKIE_ACCESS);
  if (access) {
    headers.Authorization = `Bearer ${access}`;
  } else if (process.env.MAL_CLIENT_ID) {
    headers['X-MAL-CLIENT-ID'] = process.env.MAL_CLIENT_ID;
  }
  return headers;
}

function appendNSFW(u) {
  const url = new URL(u);
  if (!url.searchParams.has('nsfw')) url.searchParams.set('nsfw', 'true');
  return url.toString();
}

async function forward(url, event) {
  const headers = buildHeaders(event);
  const res = await fetch(appendNSFW(url), { headers });
  const text = await res.text();
  return new Response(text, {
    status: res.status,
    headers: { 'Content-Type': res.headers.get('content-type') || 'application/json' }
  });
}

export async function handler(event) {
  try {
    const { path, queryStringParameters } = event;
    // /api/animelist -> v2/users/@me/animelist
    if (path.endsWith('/api/animelist')) {
      const qs = new URLSearchParams(queryStringParameters || {});
      const url = `${MAL_API}/users/@me/animelist?${qs.toString()}`;
      return await forward(url, event);
    }
    // /api/anime/:id -> v2/anime/{id}
    const animeMatch = path.match(/\/api\/anime\/(\d+)/);
    if (animeMatch) {
      const id = animeMatch[1];
      const qs = new URLSearchParams(queryStringParameters || {});
      const url = `${MAL_API}/anime/${id}?${qs.toString()}`;
      return await forward(url, event);
    }
    // /api/anime-ranking -> v2/anime/ranking
    if (path.endsWith('/api/anime-ranking')) {
      const qs = new URLSearchParams(queryStringParameters || {});
      // default ranking_type if not provided
      if (!qs.has('ranking_type')) qs.set('ranking_type', 'bypopularity');
      if (!qs.has('limit')) qs.set('limit', '100');
      // fields default used by frontend; safe to pass through
      const url = `${MAL_API}/anime/ranking?${qs.toString()}`;
      return await forward(url, event);
    }

    // 404
    return {
      statusCode: 404,
      body: JSON.stringify({ error: 'Not found' })
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'proxy_error', message: err.message })
    };
  }
}
