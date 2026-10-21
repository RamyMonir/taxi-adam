// Creates the owner panel secrets: a secret link part (PANEL_SLUG), a salt and the PBKDF2 hash of a 6-digit PIN.
//   node scripts/panel_pin.mjs            -> random PIN
//   node scripts/panel_pin.mjs 123456     -> your PIN
// Put PANEL_SLUG, PANEL_PIN_SALT, PANEL_PIN_HASH into Cloudflare (Pages → Settings → Variables and Secrets, type Secret).
// The panel link is  https://<site>/panel/#<PANEL_SLUG>  – give it and the PIN to the owner (not in the same message).
import { pinHash } from "../server/panel.js";

const arg = process.argv[2];
if (arg && !/^\d{6}$/.test(arg)) { console.error("PIN must be exactly 6 digits"); process.exit(1); }
const rnd = (n) => crypto.getRandomValues(new Uint8Array(n));
const pin = arg || String(100000 + (new Uint32Array(rnd(4).buffer)[0] % 900000));
const abc = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const slug = Array.from(rnd(24), (b) => abc[b % abc.length]).join("");
const salt = Array.from(rnd(16), (b) => b.toString(16).padStart(2, "0")).join("");
console.log(`PIN            ${pin}`);
console.log(`PANEL_SLUG     ${slug}`);
console.log(`PANEL_PIN_SALT ${salt}`);
console.log(`PANEL_PIN_HASH ${await pinHash(pin, salt)}`);
console.log(`Link:          https://<site>/panel/#${slug}`);
