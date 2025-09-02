// netlify/functions/animelist.ts
import type { Handler } from '@netlify/functions';
import { requireAuth } from './_auth';

export const handler: Handler = async (event) => {
  const { token } = requireAuth(event);

  const url = new URL('https://api.myanimelist.net/v2/users/@me/animelist');
  const p = event.queryStringParameters || {};
  if (p.limit)  url.searchParams.set('limit', p.limit);
  if (p.offset) url.searchParams.set('offset', p.offset);
  if (p.fields) url.searchParams.set('fields', p.fields);
  url.searchParams.set('nsfw', 'true');            // ← include ecchi/hentai

  const r = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
  const j = await r.json();
  return { statusCode: r.status, body: JSON.stringify(j) };
};
