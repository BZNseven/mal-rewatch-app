// netlify/functions/mal-proxy.js
// Single proxy for both /api/animelist and /api/anime/:id
// Adds nsfw=true so MAL returns ecchi/18+ items (nsfw: gray/black).

const fetch = (...args) => import("node-fetch").then(({ default: f }) => f(...args));

function parseCookies(cookieHeader = "") {
  return Object.fromEntries(
    cookieHeader.split(";").map((c) => {
      const i = c.indexOf("=");
      if (i === -1) return [c.trim(), ""];
      return [c.slice(0, i).trim(), decodeURIComponent(c.slice(i + 1))];
    })
  );
}

exports.handler = async (event) => {
  try {
    // Normalize path
    let path = (event.path || "").replace("/.netlify/functions/mal-proxy", "");
    if (path.startsWith("/api")) path = path.slice(4);
    if (!path.startsWith("/")) path = "/" + path;

    const qs = new URLSearchParams(event.queryStringParameters || {});
    // Always include NSFW in requests to avoid hidden items
    if (!qs.has("nsfw")) qs.set("nsfw", "true");
    const qStr = qs.toString() ? `?${qs.toString()}` : "";

    // 1) User's own animelist (needs OAuth access token)
    if (path.startsWith("/animelist")) {
      const access = parseCookies(event.headers.cookie || "").mal_access;
      if (!access) return { statusCode: 401, body: "Not signed in." };

      const base = "https://api.myanimelist.net/v2/users/@me/animelist";
      const url = `${base}${qStr || "?nsfw=true"}`;
      const resp = await fetch(url, { headers: { Authorization: `Bearer ${access}` } });
      const text = await resp.text();
      return { statusCode: resp.status, body: text, headers: { "Content-Type": "application/json" } };
    }

    // 2) Public anime details (uses Client ID)
    if (path.startsWith("/anime/")) {
      const clientId = process.env.MAL_CLIENT_ID;
      if (!clientId) return { statusCode: 500, body: "Missing MAL_CLIENT_ID" };

      const animeId = path.split("/")[2];
      const base = `https://api.myanimelist.net/v2/anime/${animeId}`;
      const url = `${base}${qStr || "?nsfw=true"}`;
      const resp = await fetch(url, { headers: { "X-MAL-CLIENT-ID": clientId } });
      const text = await resp.text();
      return { statusCode: resp.status, body: text, headers: { "Content-Type": "application/json" } };
    }

    // 3) Logout helper
    if (path.startsWith("/logout")) {
      return {
        statusCode: 200,
        multiValueHeaders: {
          "Set-Cookie": [
            `mal_access=; Max-Age=0; HttpOnly; Secure; SameSite=Lax; Path=/`,
            `mal_refresh=; Max-Age=0; HttpOnly; Secure; SameSite=Lax; Path=/`,
          ],
        },
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ok: true }),
      };
    }

    return { statusCode: 404, body: `Not found: ${path}` };
  } catch (e) {
    return { statusCode: 500, body: e.message || "Proxy error" };
  }
};
