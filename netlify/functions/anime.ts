// netlify/functions/anime.ts
import type { Handler } from '@netlify/functions';
import { requireAuth } from './_auth';

export const handler: Handler = async (event) => {
  const { token } = requireAuth(event);
  const id = event.path.split('/').pop(); // or however you parse it
  const url = new URL(`https://api.myanimelist.net/v2/anime/${id}`);
  const p = event.queryStringParameters || {};
  if (p.fields) url.searchParams.set('fields', p.fields);
  url.searchParams.set('nsfw', 'true');            // ← important

  const r = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
  const j = await r.json();
  return { statusCode: r.status, body: JSON.stringify(j) };
};
