// Cloudflare Turnstile ("are you human") for online bookings.
// Optional: only checked when the secret TURNSTILE_SECRET is set, so local runs and the e2e test keep working.
export const turnstileOn = (env) => !!(env && env.TURNSTILE_SECRET);

// -> true when the token is valid (or Turnstile is off). fetchFn is injectable for tests.
export async function verifyTurnstile(env, token, ip, fetchFn = fetch) {
  if (!turnstileOn(env)) return true;
  if (typeof token !== "string" || !token || token.length > 4096) return false;
  const fd = new FormData();
  fd.append("secret", env.TURNSTILE_SECRET);
  fd.append("response", token);
  if (ip) fd.append("remoteip", ip);
  try {
    const r = await fetchFn("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: fd });
    const j = await r.json();
    return !!(j && j.success);
  } catch (e) {
    console.log("turnstile", e.message);
    return false;   // can't verify -> treat as failed; the page offers phone / WhatsApp instead
  }
}
