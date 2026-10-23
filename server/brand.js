// White-label texts for the bot, SMS, chat, reports and AI prompts. All values come from src/data.py
// (OWNER, BRAND, EXAMPLES) through the generated server/config.js – no business name is written in the code.
import { CONFIG } from "./config.js";

// owner's name in the Polish cases the bot needs: "Jan przydzielił…", "Poproś Jana…", "Do oddania Janowi…"
export const OWNER = { nom: "Właściciel", gen: "właściciela", dat: "właścicielowi", full: "", ...(CONFIG.owner || {}) };
export const BRAND = { short: "Taxi", name: "Taxi", city: "", ...(CONFIG.brand || {}) };
// example addresses shown in the bot's help and given to the AI
export const EX = { town: "", addr: "Rynek 1", addr2: "Lipowa 5", street: "Szpitalna 5", probe: "Dworcowa", region_en: "Poland", towns_en: "", ...(CONFIG.examples || {}) };
