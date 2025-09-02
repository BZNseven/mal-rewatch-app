// netlify/functions/mal-proxy.js
// CommonJS + plain object responses to avoid 502s on Netlify
const MAL_API = 'https://api.myanimelist.net/v2';
const COOKIE_ACCESS = 'mal_access';

function readCookie(cookie, name) {
  if (!cookie) return null;
  const m = cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : null;
}

function buildHeaders(event) {
  const headers = { Accept: 'application/json' };
  const cookie = (event.headers && (event.headers.cookie || event.headers.Cookie)) || '';
  const access = readCookie(cookie, COOKIE_ACCESS);
  if (access) {
    headers.Authorization = `Bearer ${access}`;
  } else if (process.env.MAL_CLIENT_ID) {
    headers['X-MAL-CLIENT-ID'] = process.env.MAL_CLIENT_ID;
  }
  return headers;
}

function appendNSFW(urlStr) {
  const url = new URL(urlStr);
  if (!url.searchParams.has('nsfw')) url.searchParams.set('nsfw', 'true');
  return url.toString();
}

// Normalize the "subpath" after the function name, so this works with:
//  - "/api/animelist" redirected to "/.netlify/functions/mal-proxy/animelist"
//  - "/.netlify/functions/mal-proxy/anime/123?fields=..."
function getSubpath(eventPath) {
  let p = eventPath || '/';
  const fnPrefix = '/.netlify/functions/';
  if (p.startsWith(fnPrefix)) {
    const after = p.slice(fnPrefix.length); // "mal-proxy/animelist"
    const idx = after.indexOf('/');
    p = idx !== -1 ? '/' + after.slice(idx + 1) : '/';
  }
  // Allow both "/api/xxx" and "/xxx"
  if (p.startsWith('/api/')) p = p.slice(4); // remove "/api"
  return p;
}

async function forward(url, event) {
  const headers = buildHeaders(event);
  const res = await fetch(appendNSFW(url), { headers });
  const text = await res.text();
  return {
    statusCode: res.status,
    headers: { 'Content-Type': res.headers.get('content-type') || 'application/json' },
    body: text
  };
}

module.exports.handler = async function handler(event) {
  try {
    const subpath = getSubpath(event.path || '/');
    const qs = new URLSearchParams(event.queryStringParameters || {});

    // /animelist -> v2/users/@me/animelist
    if (subpath === '/animelist' || subpath === 'animelist') {
      const url = `${MAL_API}/users/@me/animelist?${qs.toString()}`;
      return await forward(url, event);
    }

    // /anime/:id -> v2/anime/{id}
    const mAnime = subpath.match(/^\/?anime\/(\d+)$/);
    if (mAnime) {
      const id = mAnime[1];
      const url = `${MAL_API}/anime/${id}?${qs.toString()}`;
      return await forward(url, event);
    }

    // /anime-ranking -> v2/anime/ranking
    if (subpath === '/anime-ranking' || subpath === 'anime-ranking') {
      if (!qs.has('ranking_type')) qs.set('ranking_type', 'bypopularity');
      if (!qs.has('limit')) qs.set('limit', '100');
      const url = `${MAL_API}/anime/ranking?${qs.toString()}`;
      return await forward(url, event);
    }

    // Not found
    return {
      statusCode: 404,
      body: JSON.stringify({ error: 'not_found', path: subpath })
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'proxy_error', message: err.message })
    };
  }
};
