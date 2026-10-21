/* Taxi Lite – owner panel (/panel/#<secret>): PIN, request report, CSV, status marks, price editor.
   All data is written with textContent (no HTML from the database). */
const $ = (id) => document.getElementById(id);
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const slug = decodeURIComponent((location.hash || "").replace(/^#/, ""));
const CH = { wa: "WhatsApp", sms: "SMS", tel: "Telefon" };
const fmtTs = (ms) => new Date(ms).toLocaleString("pl-PL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

async function api(path, body) {
  const r = await fetch("/api/panel/" + path, { method: body ? "POST" : "GET", credentials: "same-origin", cache: "no-store",
    headers: body ? { "content-type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
  let j = {}; try { j = await r.json(); } catch (e) {}
  j._status = r.status; return j;
}
function show(id) { ["v-setup", "v-pin", "v-app"].forEach((v) => { $(v).hidden = v !== id; }); }

/* ---------- login ---------- */
$("pin-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const pin = $("pin").value.replace(/\D/g, ""), msg = $("pin-msg");
  if (pin.length !== 6) { msg.textContent = "PIN ma 6 cyfr."; return; }
  $("pin-go").disabled = true; msg.textContent = "Sprawdzam…";
  const r = await api("login", { slug, pin });
  $("pin-go").disabled = false; $("pin").value = "";
  if (r.ok) { msg.textContent = ""; start(); return; }
  if (r.error === "locked") msg.textContent = `Za dużo prób – spróbuj za ${Math.ceil((r.retryS || 900) / 60)} minut.`;
  else if (r.error === "pin") msg.textContent = `Błędny PIN (zostało prób: ${r.left}).`;
  else if (r._status === 404) msg.textContent = "Nieprawidłowy link do panelu. Użyj linku od Ramego.";
  else msg.textContent = "Nie udało się zalogować. Spróbuj ponownie.";
});
$("logout").addEventListener("click", async () => { await api("logout", {}); show("v-pin"); });

/* ---------- tabs ---------- */
document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => {
  document.querySelectorAll(".tab").forEach((x) => x.setAttribute("aria-selected", x === t ? "true" : "false"));
  $("t-report").hidden = t.dataset.tab !== "report"; $("t-prices").hidden = t.dataset.tab !== "prices";
  if (t.dataset.tab === "prices" && !pricesLoaded) loadPrices();
}));

/* ---------- report ---------- */
let per = { p: "dzis" };
document.querySelectorAll("[data-p]").forEach((b) => b.addEventListener("click", () => {
  document.querySelectorAll("[data-p]").forEach((x) => x.setAttribute("aria-pressed", x === b ? "true" : "false"));
  $("range").hidden = b.dataset.p !== "range";
  if (b.dataset.p !== "range") { per = { p: b.dataset.p }; loadReport(); }
}));
$("range-go").addEventListener("click", () => {
  if (!$("r-from").value || !$("r-to").value) return;
  per = { from: $("r-from").value, to: $("r-to").value }; loadReport();
});
const qs = () => (per.from ? `from=${per.from}&to=${per.to}` : `p=${per.p}`);

async function loadReport() {
  const r = await api("report?" + qs());
  if (r._status === 401) { show("v-pin"); return; }
  if (r.error) { $("rep-total").textContent = "–"; return; }
  $("rep-period").textContent = r.from === r.to ? r.from.split("-").reverse().join(".") : `${r.from.split("-").reverse().join(".")} – ${r.to.split("-").reverse().join(".")}`;
  $("rep-total").textContent = r.total;
  $("rep-ch").textContent = `WhatsApp ${r.byChannel.wa || 0} · SMS ${r.byChannel.sms || 0} · Telefon ${r.byChannel.tel || 0}`;
  $("rep-marked").textContent = r.marked.ok || r.marked.no ? `Oznaczone: przyjęte ${r.marked.ok}, nieprzyjęte ${r.marked.no}` : "";
  const topList = (ul, items) => { ul.replaceChildren(...(items.length ? items.map((x) => el("li", null, `${x.label} – ${x.n}`)) : [el("li", "muted", "brak danych")])); };
  topList($("rep-to"), r.topTo); topList($("rep-from"), r.topFrom);
  $("csv").href = "/api/panel/report.csv?" + qs();
  const list = $("rep-list");
  if (!r.items.length) { list.replaceChildren(el("li", "muted", "Brak zapytań w tym okresie.")); return; }
  list.replaceChildren(...r.items.map(row));
}
function row(it) {
  const li = el("li", "lead" + (it.status ? " is-" + it.status : ""));
  const head = el("div", "lead-head");
  head.append(el("b", null, fmtTs(it.ts)), el("span", "ch ch-" + it.channel, CH[it.channel] || it.channel));
  if (it.mode === "later" && it.when_at) head.append(el("span", "when", "na " + it.when_at.slice(8, 10) + "." + it.when_at.slice(5, 7) + " " + it.when_at.slice(11)));
  const route = el("p", "route", `${it.from_txt || "(skąd?)"} → ${it.to_txt || "(dokąd?)"} · ${it.pax} os.${it.luggage ? " · " + it.luggage : ""}`);
  const who = el("p", "who");
  if (it.name) who.append(el("span", null, it.name + " "));
  if (it.phone) { const a = el("a", null, it.phone); a.href = "tel:" + it.phone.replace(/[^\d+]/g, ""); who.append(a); }
  if (it.geo) { const g = el("a", "geo", " 📍 mapa"); g.href = "https://maps.google.com/?q=" + it.geo; g.target = "_blank"; g.rel = "noopener"; who.append(g); }
  li.append(head, route, who);
  if (it.notes) li.append(el("p", "notes", it.notes));
  const btns = el("div", "marks");
  [["ok", "✓ Przyjęty"], ["no", "✗ Nie przyjęty"]].forEach(([s, label]) => {
    const b = el("button", "mark", label); b.type = "button"; b.setAttribute("aria-pressed", it.status === s ? "true" : "false");
    b.addEventListener("click", async () => {
      const next = it.status === s ? null : s;
      const r = await api("lead/" + it.id, { status: next });
      if (r.ok) { it.status = next; li.replaceWith(row(it)); }
    });
    btns.append(b);
  });
  li.append(btns);
  return li;
}

/* ---------- prices ---------- */
let pricesLoaded = false, base = null, names = null, sha = null, editor = false;
const num = (v) => (v == null ? "" : String(v));
function input(value, attrs = {}) {
  const i = el("input"); i.type = "number"; i.inputMode = "numeric"; i.min = attrs.min ?? 5; i.max = attrs.max ?? 3000; i.step = attrs.step ?? 1;
  i.value = num(value); i.disabled = !editor; Object.entries(attrs.data || {}).forEach(([k, v]) => { i.dataset[k] = v; });
  i.addEventListener("input", () => i.classList.toggle("changed", i.value !== num(value)));
  return i;
}
async function loadPrices() {
  const r = await api("prices");
  if (r._status === 401) { show("v-pin"); return; }
  if (r.error) { $("pr-msg").textContent = "Nie udało się wczytać cen."; return; }
  pricesLoaded = true; base = r.prices; names = r.names; sha = r.sha || null; editor = !!r.editor;
  $("pr-off").hidden = editor; $("pr-actions").hidden = !editor;
  renderPrices(); loadHistory();
}
function renderPrices() {
  const p = base, N = names;
  // villages: local price + zone
  const tv = $("pr-villages"); tv.replaceChildren();
  N.villages.forEach((v) => {
    const tr = el("tr"); tr.append(el("td", null, v.name));
    const td1 = el("td"); td1.append(input(p.local[v.slug], { data: { k: "local", s: v.slug } }));
    const td2 = el("td"); const sel = el("select"); sel.disabled = !editor; sel.dataset.k = "village_zone"; sel.dataset.s = v.slug;
    N.zones.forEach((z) => { const o = el("option", null, z === "0" ? "0 (bez dopłaty)" : z); o.value = z; if ((p.village_zone[v.slug] || v.zone) === z) o.selected = true; sel.append(o); });
    td2.append(sel); tr.append(td1, td2); tv.append(tr);
  });
  // zone surcharges
  const tz = $("pr-zones"); tz.replaceChildren();
  N.zones.forEach((z) => { const lab = el("label", null, `Strefa ${z}: + `); lab.append(input(p.zones[z], { min: 0, max: 200, data: { k: "zones", s: z } }), document.createTextNode(" zł")); tz.append(lab); });
  // destinations grouped by kind
  const td = $("pr-dest"); td.replaceChildren();
  Object.entries(N.kinds).forEach(([kind, label]) => {
    td.append(el("h3", null, label));
    const tbl = el("table", "pt"); const tb = el("tbody");
    N.destinations.filter((d) => d.kind === kind).forEach((d) => {
      const tr = el("tr"); tr.append(el("td", null, d.name));
      const c = el("td"); c.append(input(p.destinations[d.slug].price, { data: { k: "destinations", s: d.slug } }), document.createTextNode(" zł"));
      tr.append(c); tb.append(tr);
    });
    tbl.append(tb); td.append(tbl);
  });
  // overrides
  const to = $("pr-over"); to.replaceChildren();
  Object.entries(p.overrides || {}).forEach(([v, row]) => Object.entries(row).forEach(([d, val]) => to.append(overRow(v, d, val))));
  // waiting
  $("w-free").value = num(p.waiting.free_min); $("w-per").value = num(p.waiting.per_min);
  $("w-free").disabled = $("w-per").disabled = $("over-add").disabled = !editor;
}
function overRow(v, d, val) {
  const r = el("div", "over");
  const sv = el("select"); sv.disabled = !editor; names.villages.forEach((x) => { const o = el("option", null, x.name); o.value = x.slug; if (x.slug === v) o.selected = true; sv.append(o); });
  const sd = el("select"); sd.disabled = !editor; names.destinations.forEach((x) => { const o = el("option", null, x.short); o.value = x.slug; if (x.slug === d) o.selected = true; sd.append(o); });
  const i = input(val); const x = el("button", "x", "×"); x.type = "button"; x.title = "Usuń wyjątek"; x.disabled = !editor;
  x.addEventListener("click", () => r.remove());
  r.append(sv, el("span", null, "→"), sd, i, document.createTextNode(" zł"), x);
  return r;
}
$("over-add").addEventListener("click", () => $("pr-over").append(overRow(names.villages[0].slug, "lotnisko-pyrzowice", "")));

function collect() {
  const edit = { zones: {}, local: {}, village_zone: {}, destinations: {}, overrides: {}, waiting: { free_min: $("w-free").value, per_min: $("w-per").value } };
  document.querySelectorAll("#t-prices [data-k]").forEach((i) => { edit[i.dataset.k][i.dataset.s] = i.value; });
  document.querySelectorAll("#pr-over .over").forEach((r) => {
    const [sv, sd] = r.querySelectorAll("select"), v = r.querySelector("input").value;
    if (v !== "") (edit.overrides[sv.value] = edit.overrides[sv.value] || {})[sd.value] = v;
  });
  return edit;
}
$("pr-check").addEventListener("click", async () => {
  const r = await api("prices/preview", { edit: collect() });
  const box = $("pr-diff"); box.hidden = false;
  const ul = el("ul");
  (r.errors || []).forEach((x) => ul.append(el("li", "err", "Błąd: " + x)));
  (r.changes || []).forEach((x) => ul.append(el("li", null, x)));
  if (!r.errors?.length && !r.changes?.length) ul.append(el("li", "muted", "Nic się nie zmieniło."));
  box.replaceChildren(el("h3", null, "Zmiany do zatwierdzenia"), ul);
  $("pr-save").disabled = !!(r.errors && r.errors.length) || !(r.changes && r.changes.length);
});
$("pr-save").addEventListener("click", async () => {
  $("pr-save").disabled = true; const msg = $("pr-msg"); msg.className = "msg"; msg.textContent = "Zapisuję…";
  const r = await api("prices", { sha, edit: collect() });
  if (r.error === "conflict") { msg.textContent = "Ceny zmieniono w międzyczasie – odśwież stronę i wprowadź zmiany jeszcze raz."; return; }
  if (r.error === "invalid") { msg.textContent = "Popraw: " + r.errors.join("; "); return; }
  if (r.error) { msg.textContent = "Nie udało się zapisać (" + r.error + "). Stare ceny dalej działają. Zadzwoń do Ramego."; return; }
  msg.textContent = "Zapisano – publikuję nową wersję strony (1–3 min)…";
  $("pr-diff").hidden = true; pricesLoaded = false;
  waitForDeploy(r.version, msg);
});
async function waitForDeploy(version, msg) {
  const t0 = Date.now();
  while (Date.now() - t0 < 6 * 60000) {
    await new Promise((res) => setTimeout(res, 10000));
    try {
      const v = await (await fetch("/version.json?t=" + Date.now(), { cache: "no-store" })).json();
      if (v.prices_version >= version) { msg.className = "msg ok"; msg.textContent = "✅ Wdrożono " + new Date().toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" }) + " – nowe ceny są na stronie."; loadPrices(); return; }
    } catch (e) {}
  }
  msg.textContent = "⚠ Publikacja trwa dłużej niż zwykle. Stare ceny dalej działają – sprawdź za chwilę albo zadzwoń do Ramego.";
}
async function loadHistory() {
  const r = await api("history");
  const ul = $("pr-hist");
  if (!r.items || !r.items.length) { ul.replaceChildren(el("li", "muted", "Brak zmian z panelu.")); return; }
  ul.replaceChildren(...r.items.map((h) => { const li = el("li"); li.append(el("b", null, fmtTs(h.ts) + " "), el("span", null, h.summary.split("\n").join(" · "))); return li; }));
}

/* ---------- start ---------- */
async function start() {
  const s = await api("status");
  if (!s.ready) { show("v-setup"); return; }
  const r = await api("report?p=dzis");
  if (r._status === 401) { show("v-pin"); $("pin").focus(); return; }
  show("v-app"); loadReport();
}
if (!slug) { show("v-pin"); $("pin-msg").textContent = "Otwórz panel z linku od Ramego (link kończy się znakiem #…)."; $("pin-go").disabled = true; }
else start();
