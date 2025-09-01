const fetch = (...args) => import("node-fetch").then(({default: f}) => f(...args));

function parseCookies(cookieHeader = "") {
  return Object.fromEntries(
    cookieHeader.split(";").map(c => {
      const i = c.indexOf("=");
      if (i === -1) return [c.trim(), ""];
      return [c.slice(0, i).trim(), decodeURIComponent(c.slice(i + 1))];
    })
  );
}

exports.handler = async (event) => {
  try {
    const clientId = process.env.MAL_CLIENT_ID;
    if (!clientId) return { statusCode: 500, body: "Missing MAL_CLIENT_ID" };

    const host = event.headers["x-forwarded-host"] || event.headers.host;
    const proto = event.headers["x-forwarded-proto"] || "https";
    const origin = `${proto}://${host}`;
    const redirectUri = `${origin}/.netlify/functions/auth-callback`;

    const params = new URLSearchParams(event.rawQuery || "");
    const code = params.get("code");
    const state = params.get("state");
    if (!code || !state) return { statusCode: 400, body: "Missing code/state" };

    const cookies = parseCookies(event.headers.cookie || "");
    if (cookies.oauth_state !== state) {
      return { statusCode: 400, body: "State mismatch" };
    }
    const verifier = cookies.pkce_verifier;
    if (!verifier) return { statusCode: 400, body: "Missing PKCE verifier" };

    const body = new URLSearchParams({
      client_id: clientId,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier,
    });

    const resp = await fetch("https://myanimelist.net/v1/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!resp.ok) {
      const txt = await resp.text();
      return { statusCode: resp.status, body: `Token error: ${txt}` };
    }
    const json = await resp.json();

    const cookiesOut = [];
    const maxAge = Math.max(60, (json.expires_in || 3600) - 60);
    cookiesOut.push(`mal_access=${json.access_token}; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax; Path=/`);
    if (json.refresh_token) {
      cookiesOut.push(`mal_refresh=${json.refresh_token}; Max-Age=${60*60*24*30}; HttpOnly; Secure; SameSite=Lax; Path=/`);
    }
    cookiesOut.push(`pkce_verifier=; Max-Age=0; HttpOnly; Secure; SameSite=Lax; Path=/`);
    cookiesOut.push(`oauth_state=; Max-Age=0; HttpOnly; Secure; SameSite=Lax; Path=/`);

    return {
      statusCode: 302,
      headers: { Location: "/", "Set-Cookie": cookiesOut },
    };
  } catch (e) {
    return { statusCode: 500, body: e.message || "Auth callback error" };
  }
};