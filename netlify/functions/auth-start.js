// netlify/functions/auth-start.js
const crypto = require("crypto");

exports.handler = async (event) => {
  try {
    const clientId = process.env.MAL_CLIENT_ID;
    if (!clientId) {
      return { statusCode: 500, body: "Missing MAL_CLIENT_ID env var" };
    }

    const host = event.headers["x-forwarded-host"] || event.headers.host;
    const proto = event.headers["x-forwarded-proto"] || "https";
    const origin = `${proto}://${host}`;
    const redirectUri = `${origin}/.netlify/functions/auth-callback`;

    const codeVerifier = crypto.randomBytes(64).toString("hex");
    const state = crypto.randomBytes(16).toString("hex");

    const authorize = new URL("https://myanimelist.net/v1/oauth2/authorize");
    authorize.search = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      code_challenge: codeVerifier,           // PKCE "plain"
      code_challenge_method: "plain",
      state,
      redirect_uri: redirectUri,
    }).toString();

    return {
      statusCode: 302,
      headers: { Location: authorize.toString() },
      multiValueHeaders: {
        "Set-Cookie": [
          `pkce_verifier=${codeVerifier}; Max-Age=600; HttpOnly; Secure; SameSite=Lax; Path=/`,
          `oauth_state=${state}; Max-Age=600; HttpOnly; Secure; SameSite=Lax; Path=/`,
        ],
      },
    };
  } catch (e) {
    return { statusCode: 500, body: e.message || "Auth start error" };
  }
};
