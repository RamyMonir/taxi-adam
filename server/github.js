// LITE price editor -> GitHub: read and write src/prices.json through the Contents API. Cloudflare Pages rebuilds the site
// after every commit on the connected branch. Settings: GITHUB_TOKEN (fine-grained, this repo only, Contents read/write),
// GITHUB_REPO ("owner/repo"), GITHUB_BRANCH, optional GITHUB_PATH (default src/prices.json).
const API = "https://api.github.com";
export const githubReady = (env) => !!(env.GITHUB_TOKEN && env.GITHUB_REPO && env.GITHUB_BRANCH);
const pathOf = (env) => env.GITHUB_PATH || "src/prices.json";
const headers = (env) => ({
  authorization: `Bearer ${env.GITHUB_TOKEN}`, accept: "application/vnd.github+json",
  "x-github-api-version": "2022-11-28", "user-agent": "taxi-lite-panel",
});

export function b64encode(text) {
  const bytes = new TextEncoder().encode(text); let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
export function b64decode(b64) {
  const bin = atob(String(b64).replace(/\s/g, ""));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

// -> {sha, prices}
export async function readPrices(env, fetchFn = fetch) {
  const r = await fetchFn(`${API}/repos/${env.GITHUB_REPO}/contents/${pathOf(env)}?ref=${encodeURIComponent(env.GITHUB_BRANCH)}`, { headers: headers(env) });
  if (!r.ok) throw Object.assign(new Error(`github read ${r.status}`), { status: r.status });
  const j = await r.json();
  return { sha: j.sha, prices: JSON.parse(b64decode(j.content)) };
}

// -> {ok, commit} | {conflict: true} | throws
export async function writePrices(env, { text, sha, message }, fetchFn = fetch) {
  const r = await fetchFn(`${API}/repos/${env.GITHUB_REPO}/contents/${pathOf(env)}`, {
    method: "PUT", headers: { ...headers(env), "content-type": "application/json" },
    body: JSON.stringify({ message, content: b64encode(text), sha, branch: env.GITHUB_BRANCH }),
  });
  if (r.status === 409 || r.status === 422) return { conflict: true };
  if (!r.ok) throw Object.assign(new Error(`github write ${r.status}`), { status: r.status });
  const j = await r.json();
  return { ok: true, commit: j.commit && j.commit.sha, sha: j.content && j.content.sha };
}
