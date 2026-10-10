// "taxi-cron": wakes the website up every minute (Cloudflare Pages has no timers of its own).
// Settings (Worker → Settings → Variables): SITE_URL = https://taxi-adam.pages.dev, CRON_KEY = same secret as in the Pages project.
export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(fetch(`${env.SITE_URL}/api/admin/cron`, { method: "POST", headers: { "x-cron-key": env.CRON_KEY } })
      .then((r) => r.text()).then((t) => console.log("cron", t)).catch((e) => console.log("cron failed", e.message)));
  },
  async fetch() { return new Response("taxi-cron: OK", { headers: { "content-type": "text/plain" } }); },
};
