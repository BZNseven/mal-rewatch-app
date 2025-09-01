// netlify/functions/mal-proxy.js
// Normalizes /api/* → /* so our route checks work.
// Uses multiValueHeaders for multiple Set-Cookie values.

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
    // Example event.path: "/.netlify/functions/mal-proxy/api/animelist"
    let path = (event.path || "").replace("/.netlify/functions/mal-proxy", "");
    // Remove the /api prefix added by our redirect rule
    if (path.startsWith("/api")) path = path.slice(4);
    if (!path.startsWith("/")) path = "/" + path;

    const qs = new URLSearchParams(event.queryStringParameters || {}).toString();
    const qStr = qs ? `?${qs}` : "";

    if (path.startsWith("/animelist")) {
      // Requires user access token (set by auth-callback)
      const access = parseCookies(event.headers.cookie || "").mal_access;
      if (!access) return { statusCode: 401, body: "Not signed in." };

      const base = "https://api.myanimelist.net/v2/users/@me/animelist";
      const url = qStr
        ? `${base}${qStr}`
        : `${base}?limit=100&fields=list_status{tags,score,status,is_rewatching,num_times_rewatched,rewatch_value}`;
      const resp = await fetch(url, { headers: { Authorization: `Bearer ${access}` } });
      const text = await resp.text();
      return { statusCode: resp.status, body: text, headers: { "Content-Type": "application/json" } };
    }

    if (path.startsWith("/anime/")) {
      // Public anime details (no user token), but needs Client ID
      const clientId = process.env.MAL_CLIENT_ID;
      if (!clientId) return { statusCode: 500, body: "Missing MAL_CLIENT_ID" };

      const animeId = path.split("/")[2];
      const base = `https://api.myanimelist.net/v2/anime/${animeId}`;
      const url = qStr
        ? `${base}${qStr}`
        : `${base}?fields=genres,studios,start_season,num_episodes,media_type`;
      const resp = await fetch(url, { headers: { "X-MAL-CLIENT-ID": clientId } });
      const text = await resp.text();
      return { statusCode: resp.status, body: text, headers: { "Content-Type": "application/json" } };
    }

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
