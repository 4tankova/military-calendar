// Спільна логіка для сайту та адмінки
export const MONTHS = ["січень","лютий","березень","квітень","травень","червень","липень","серпень","вересень","жовтень","листопад","грудень"];
export const MONTHS_G = ["січня","лютого","березня","квітня","травня","червня","липня","серпня","вересня","жовтня","листопада","грудня"];
export const DOW_SHORT = ["Пн","Вт","Ср","Чт","Пт","Сб","Нд"];
export const DOW_FULL = ["неділя","понеділок","вівторок","середа","четвер","п'ятниця","субота"];
const DOW_ACC = ["неділя","понеділок","вівторок","середа","четвер","п'ятниця","субота"];
const ORD_F = {1:"перша",2:"друга",3:"третя",4:"четверта",5:"п'ята","-1":"остання"};
const ORD_M = {1:"перший",2:"другий",3:"третій",4:"четвертий",5:"п'ятий","-1":"останній"};
const MASC = new Set([1,2,4]); // понеділок, вівторок, четвер

export const PALETTES = [
  { id: "olive",   name: "Олива" },
  { id: "pixel",   name: "Піксель" },
  { id: "ukraine", name: "Синьо-жовта" },
  { id: "sand",    name: "Пісок" },
  { id: "navy",    name: "Флот" },
];

export const DEFAULT_DATA = {
  version: 2,
  settings: { title: "Календар Сил оборони України", subtitle: "", notice: "", defaultPalette: "olive", footer: "" },
  categories: [
    { id: "state", name: "Державні", color: "#2f6fd6" },
    { id: "mil", name: "Військові", color: "#5f8a2a" },
    { id: "unit", name: "Частини", color: "#c0662e" },
    { id: "mem", name: "Пам'ятні дні", color: "#7c8394" },
    { id: "rel", name: "Релігійні", color: "#9a62c0" },
  ],
  events: [],
};

// Приводить дані будь-якої версії до схеми v2
export function normalize(raw) {
  const d = structuredClone(raw || {});
  d.version = 2;
  d.settings = { ...DEFAULT_DATA.settings, ...(d.settings || {}) };
  if (!Array.isArray(d.categories) || !d.categories.length) d.categories = structuredClone(DEFAULT_DATA.categories);
  d.events = (d.events || []).map((e, i) => ({ id: e.id || "e" + Date.now().toString(36) + i, ...e }));
  return d;
}

export function orthodoxEaster(y) {
  const a = y % 4, b = y % 7, c = y % 19, d = (19 * c + 15) % 30, e = (2 * a + 4 * b - d + 34) % 7;
  const m = Math.floor((d + e + 114) / 31), day = ((d + e + 114) % 31) + 1;
  const dt = new Date(y, m - 1, day); dt.setDate(dt.getDate() + 13); return dt;
}
export function nthWeekday(y, m, wd, n) {
  if (n > 0) { const d = new Date(y, m - 1, 1); const off = (wd - d.getDay() + 7) % 7; return new Date(y, m - 1, 1 + off + 7 * (n - 1)); }
  const d = new Date(y, m, 0); const off = (d.getDay() - wd + 7) % 7; return new Date(y, m - 1, d.getDate() - off);
}

// Дата події в заданому році або null
export function resolve(ev, y) {
  if (ev.year && ev.year > y) return null;
  if (ev.date) {
    const [m, d] = ev.date.split("-").map(Number);
    if (!m || !d) return null;
    const dt = new Date(y, m - 1, d);
    return dt.getMonth() === m - 1 ? dt : null; // 29 лютого в невисокосний рік
  }
  const r = ev.rule || {};
  if (Array.isArray(r.nth)) return nthWeekday(y, r.nth[0], r.nth[1], r.nth[2]);
  if (typeof r.easter === "number") { const d = orthodoxEaster(y); d.setDate(d.getDate() + r.easter); return d; }
  return null;
}

export function describeRule(ev) {
  if (ev.date) { const [m, d] = ev.date.split("-").map(Number); return `щороку ${d} ${MONTHS_G[m - 1]}`; }
  const r = ev.rule || {};
  if (Array.isArray(r.nth)) {
    const [m, wd, n] = r.nth; const ord = MASC.has(wd) ? ORD_M[n] : ORD_F[n];
    return `${ord} ${DOW_ACC[wd]} ${MONTHS_G[m - 1]}`;
  }
  if (typeof r.easter === "number") return r.easter === 0 ? "за пасхалією" : `Великдень + ${r.easter} дн.`;
  return "";
}

export const dkey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const parseKey = k => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };
export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const fmtDate = d => `${d.getDate()} ${MONTHS_G[d.getMonth()]} ${d.getFullYear()}`;
export const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
export const daysBetween = (a, b) => Math.round((b - a) / 86400000);

export function plural(n, one, few, many) {
  const n10 = n % 10, n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return one;
  if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return few;
  return many;
}

export function anniversary(ev, d) {
  if (!ev.year) return "";
  const n = d.getFullYear() - ev.year;
  return n > 0 ? `${n} ${plural(n, "рік", "роки", "років")} від створення` : "рік створення";
}

// Щит-емблема: логотип, якщо є, інакше абревіатура
export function badge(ev, color, size = 48, base = "") {
  const w = size, h = Math.round(size * 7 / 6);
  if (ev.logo) return `<span class="badge" style="width:${w}px;height:${h}px"><img src="${esc(/^(https?:|data:)/.test(ev.logo) ? ev.logo : base + ev.logo)}" alt="" loading="lazy"></span>`;
  const a = esc((ev.abbr || ev.title || "").slice(0, 6));
  const fs = a.length > 4 ? 10.5 : a.length > 2 ? 13.5 : 18;
  return `<svg class="badge" width="${w}" height="${h}" viewBox="0 0 48 56" aria-hidden="true" style="--c:${esc(color)}">
<path d="M24 2 45 9v18c0 14-10 23-21 27C13 50 3 41 3 27V9Z" fill="var(--c)"/>
<path d="M24 6.5 41 12v15c0 11.5-8 19-17 22.5C15 46 7 38.5 7 27V12Z" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width="1.2"/>
<text x="24" y="30" text-anchor="middle" dominant-baseline="middle" font-family="IBM Plex Mono,ui-monospace,monospace" font-weight="600" font-size="${fs}" fill="#fff">${a}</text></svg>`;
}

// Тема: палітра + режим (auto/light/dark)
export function applyTheme(palette, mode) {
  const r = document.documentElement;
  r.dataset.palette = palette || "olive";
  if (mode === "light" || mode === "dark") r.dataset.theme = mode; else delete r.dataset.theme;
}
export function store(key, val) {
  try { if (val === undefined) return localStorage.getItem(key); localStorage.setItem(key, val); } catch { return null; }
}
