import { MONTHS, MONTHS_G, DOW_SHORT, DOW_FULL, PALETTES, normalize, resolve, describeRule, dkey, parseKey, esc,
  fmtDate, today, daysBetween, plural, anniversary, badge, applyTheme, store } from "./core.js";

const $ = id => document.getElementById(id);
const HUES = { olive: [125, 255, 90], pixel: [145, 135, 100], ukraine: [250, 258, 92], sand: [75, 40, 80], navy: [245, 225, 75] };

let DATA = null, CATS = {}, active = new Set();
let view = "calendar";
const NOW = today();
let cur = new Date(NOW.getFullYear(), NOW.getMonth(), 1);
let sel = new Date(NOW);
let unitQuery = "";

// ---------- Дані ----------
const cache = new Map();
function yearMap(y) {
  if (cache.has(y)) return cache.get(y);
  const map = {};
  for (const ev of DATA.events) {
    if (!CATS[ev.cat]) continue;
    const d = resolve(ev, y);
    if (!d) continue;
    (map[dkey(d)] ||= []).push({ ev, date: d });
  }
  const order = DATA.categories.map(c => c.id);
  for (const k in map) map[k].sort((a, b) => order.indexOf(a.ev.cat) - order.indexOf(b.ev.cat));
  cache.set(y, map); return map;
}
const on = (d, all = false) => (yearMap(d.getFullYear())[dkey(d)] || []).filter(x => all || active.has(x.ev.cat));
const color = ev => CATS[ev.cat]?.color || "#888";

function nextOccurrence(ev, from = NOW) {
  for (let y = from.getFullYear(); y <= from.getFullYear() + 1; y++) {
    const d = resolve(ev, y); if (d && d >= from) return d;
  }
  return null;
}
function upcoming(from, days, all = false) {
  const out = [];
  for (let i = 0; i < days; i++) { const d = new Date(from); d.setDate(from.getDate() + i); on(d, all).forEach(x => out.push(x)); }
  return out;
}

// ---------- Утиліти ----------
function toast(msg) {
  const t = $("toast"); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, 2200);
}
function copy(text, ok = "Скопійовано") {
  (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(() => toast(ok), () => toast(text));
}
function transition(fn) {
  if (document.startViewTransition && !matchMedia("(prefers-reduced-motion: reduce)").matches) document.startViewTransition(fn);
  else fn();
}
const ymd = d => dkey(d).replaceAll("-", "");
function gcalLink(ev, d) {
  const e = new Date(d); e.setDate(e.getDate() + 1);
  const p = new URLSearchParams({ action: "TEMPLATE", text: ev.title, dates: `${ymd(d)}/${ymd(e)}`, details: [ev.desc, ev.url].filter(Boolean).join("\n") });
  if (ev.date) p.set("recur", "RRULE:FREQ=YEARLY");
  return "https://calendar.google.com/calendar/render?" + p;
}
function inDays(n) {
  if (n === 0) return "сьогодні"; if (n === 1) return "завтра";
  return `через ${n} ${plural(n, "день", "дні", "днів")}`;
}

// ---------- Картка події ----------
function evCard(x, opts = {}) {
  const { ev, date } = x; const c = color(ev);
  const ann = anniversary(ev, date);
  return `<article class="evcard" style="--c:${esc(c)}">
    ${badge(ev, c, 48)}
    <div>
      <div class="tag">${esc(CATS[ev.cat]?.name)}</div>
      <h3>${esc(ev.title)}</h3>
      ${ev.desc ? `<p>${esc(ev.desc)}</p>` : ""}
      <div class="meta"><span>${esc(describeRule(ev))}</span>${ann ? `<span>· ${esc(ann)}</span>` : ""}</div>
      <div class="actions">
        ${ev.url ? `<a class="btn" href="${esc(ev.url)}" target="_blank" rel="noopener">Сторінка ↗</a>` : ""}
        <a class="btn ghost" href="${esc(gcalLink(ev, date))}" target="_blank" rel="noopener">У Google Календар</a>
        ${opts.share !== false ? `<button class="btn ghost" data-share="${dkey(date)}">Поділитися</button>` : ""}
      </div>
    </div>
  </article>`;
}

// ---------- Сьогодні ----------
function renderHero() {
  $("todayDate").innerHTML = `${NOW.getDate()} ${MONTHS_G[NOW.getMonth()]}<small>${DOW_FULL[NOW.getDay()]} · ${NOW.getFullYear()}</small>`;
  const t = on(NOW, true);
  $("todayEvents").innerHTML = t.length
    ? t.map(x => `<button class="today-pill" data-go="${dkey(NOW)}" style="--c:${esc(color(x.ev))}"><i></i>${esc(x.ev.title)}</button>`).join("")
    : `<span class="today-none">Сьогодні свят і пам'ятних дат немає.</span>`;

  const tomorrow = new Date(NOW); tomorrow.setDate(NOW.getDate() + 1);
  const next = upcoming(tomorrow, 366, true);
  if (!next.length) { $("nextCard").innerHTML = `<p class="empty">Найближчих подій немає.</p>`; return; }
  const first = next[0], n = daysBetween(NOW, first.date);
  const rest = next.slice(1, 5);
  $("nextCard").innerHTML = `
    <div class="label">Найближча подія</div>
    <div class="countdown"><b>${n}</b><span>${plural(n, "день", "дні", "днів")} · ${first.date.getDate()} ${MONTHS_G[first.date.getMonth()]}</span></div>
    <h2 class="next-title"><a href="#d${dkey(first.date)}" style="color:inherit;text-decoration:none">${esc(first.ev.title)}</a></h2>
    <div class="next-list">${rest.map(upRow).join("")}</div>`;
}
function upRow(x) {
  const n = daysBetween(NOW, x.date);
  return `<button class="uprow" data-go="${dkey(x.date)}" style="--c:${esc(color(x.ev))}">
    <span class="d">${String(x.date.getDate()).padStart(2, "0")}.${String(x.date.getMonth() + 1).padStart(2, "0")}</span>
    <span class="t">${esc(x.ev.title)}</span><span class="in">${n === 0 ? "сьогодні" : n + " дн."}</span></button>`;
}

// ---------- Фільтри ----------
function chipsHTML(year) {
  const map = yearMap(year); const count = {};
  Object.values(map).flat().forEach(x => count[x.ev.cat] = (count[x.ev.cat] || 0) + 1);
  return `<div class="chips" role="group" aria-label="Категорії">${DATA.categories.map(c =>
    `<button class="chip" data-cat="${esc(c.id)}" aria-pressed="${active.has(c.id)}" style="--c:${esc(c.color)}"><i></i>${esc(c.name)} <span class="count">${count[c.id] || 0}</span></button>`).join("")}</div>`;
}

// ---------- Календар ----------
function renderCalendar() {
  const y = cur.getFullYear(), m = cur.getMonth();
  const first = new Date(y, m, 1);
  const start = new Date(first); start.setDate(1 - ((first.getDay() + 6) % 7));
  let cells = DOW_SHORT.map((d, i) => `<div class="dow${i > 4 ? " we" : ""}">${d}</div>`).join("");
  for (let i = 0; i < 42; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    if (i >= 35 && d.getMonth() !== m) break;
    const evs = on(d); const cls = ["cell"];
    if (d.getMonth() !== m) cls.push("out");
    if (d.getDay() === 0 || d.getDay() === 6) cls.push("we");
    if (+d === +NOW) cls.push("today");
    if (+d === +sel) cls.push("sel");
    if (evs.length) cls.push("has");
    cells += `<button class="${cls.join(" ")}" data-d="${dkey(d)}" ${evs.length ? `style="--first:${esc(color(evs[0].ev))}"` : ""}
      aria-label="${d.getDate()} ${MONTHS_G[d.getMonth()]}${evs.length ? ", подій: " + evs.length : ""}">
      <span class="n">${d.getDate()}</span>
      ${evs.slice(0, 3).map(x => `<span class="ev" style="--c:${esc(color(x.ev))}">${esc(x.ev.title)}</span>`).join("")}
      ${evs.length > 3 ? `<span class="more">ще ${evs.length - 3}</span>` : ""}
      <span class="dots">${evs.map(x => `<i style="--c:${esc(color(x.ev))}"></i>`).join("")}</span>
    </button>`;
  }
  const dayEvs = on(sel);
  $("view").innerHTML = `
    <div class="bar">
      <button class="btn icon" data-nav="-1" aria-label="Попередній місяць">‹</button>
      <h2 class="month-title">${MONTHS[m]} <span>${y}</span></h2>
      <button class="btn icon" data-nav="1" aria-label="Наступний місяць">›</button>
      <button class="btn" data-today>Сьогодні</button>
      <span class="spacer"></span>
      ${chipsHTML(y)}
    </div>
    <div class="layout">
      <div class="grid">${cells}</div>
      <aside class="side">
        <section class="panel" id="dayPanel">
          <div><div class="label">${DOW_FULL[sel.getDay()]}</div><h2>${fmtDate(sel)}</h2></div>
          ${dayEvs.length ? dayEvs.map(x => evCard(x)).join("") : `<p class="empty">Цього дня подій у вибраних категоріях немає.</p>`}
        </section>
        <section class="panel">
          <h2>Найближчі 30 днів</h2>
          <div>${upcoming(NOW, 30).map(upRow).join("") || `<p class="empty">Подій немає.</p>`}</div>
        </section>
      </aside>
    </div>`;
}

// ---------- Рік ----------
function renderYear() {
  const y = cur.getFullYear(); const map = yearMap(y);
  let minis = "";
  for (let m = 0; m < 12; m++) {
    const first = new Date(y, m, 1); const pad = (first.getDay() + 6) % 7; const days = new Date(y, m + 1, 0).getDate();
    let cells = DOW_SHORT.map(d => `<span class="label" style="text-align:center;font-size:9px;letter-spacing:0">${d[0]}</span>`).join("") + "<span></span>".repeat(pad);
    let total = 0;
    for (let d = 1; d <= days; d++) {
      const dt = new Date(y, m, d); const evs = (map[dkey(dt)] || []).filter(x => active.has(x.ev.cat)); total += evs.length;
      cells += `<button class="md${evs.length ? " has" : ""}${+dt === +NOW ? " today" : ""}" data-go="${dkey(dt)}"
        ${evs.length ? `style="--c:${esc(color(evs[0].ev))};--k:${Math.min(evs.length, 3)}" title="${esc(evs.map(x => x.ev.title).join(" · "))}"` : ""}
        aria-label="${d} ${MONTHS_G[m]}${evs.length ? ", подій: " + evs.length : ""}">${d}</button>`;
    }
    minis += `<div class="mini"><h3>${MONTHS[m]}<span>${total || ""}</span></h3><div class="mini-grid">${cells}</div></div>`;
  }
  let list = "";
  for (let m = 0; m < 12; m++) {
    let rows = ""; const days = new Date(y, m + 1, 0).getDate();
    for (let d = 1; d <= days; d++) {
      const dt = new Date(y, m, d); const evs = (map[dkey(dt)] || []).filter(x => active.has(x.ev.cat));
      if (!evs.length) continue;
      rows += `<div class="yrow"><div class="d">${d}<small>${DOW_FULL[dt.getDay()].slice(0, 3)}</small></div><div>${evs.map(x =>
        `<button class="yev" data-go="${dkey(dt)}" style="--c:${esc(color(x.ev))}">${badge(x.ev, color(x.ev), 30)}<span><b>${esc(x.ev.title)}</b><span class="meta" style="margin:0"><span class="tag">${esc(CATS[x.ev.cat].name)}</span>${x.ev.year ? `<span>${esc(anniversary(x.ev, dt))}</span>` : ""}</span></span></button>`).join("")}</div></div>`;
    }
    if (rows) list += `<section class="ymonth"><h3>${MONTHS[m]}</h3>${rows}</section>`;
  }
  $("view").innerHTML = `
    <div class="bar">
      <button class="btn icon" data-nav="-1" aria-label="Попередній рік">‹</button>
      <h2 class="month-title">${y} <span>рік</span></h2>
      <button class="btn icon" data-nav="1" aria-label="Наступний рік">›</button>
      <button class="btn" id="icsBtn">Завантажити .ics</button>
      <span class="spacer"></span>
      ${chipsHTML(y)}
    </div>
    <div class="year-grid">${minis}</div>
    <div class="ylist">${list || `<p class="empty">Нічого не вибрано.</p>`}</div>`;
}

// ---------- Частини ----------
function renderUnits() {
  const unitCats = new Set(["unit"]);
  const q = unitQuery.toLowerCase();
  const units = DATA.events.filter(e => unitCats.has(e.cat) && (!q || (e.title + " " + (e.desc || "") + " " + (e.abbr || "")).toLowerCase().includes(q)))
    .map(ev => ({ ev, date: nextOccurrence(ev) })).filter(x => x.date)
    .sort((a, b) => a.date - b.date);
  $("view").innerHTML = `
    <div class="bar">
      <h2 class="month-title">Частини <span>${units.length}</span></h2>
      <span class="spacer"></span>
      <input id="unitQ" type="search" placeholder="Фільтр за назвою" value="${esc(unitQuery)}" aria-label="Фільтр частин"
        style="border:1px solid var(--line);background:var(--surface);border-radius:999px;padding:8px 14px;min-width:0;flex:0 1 260px">
    </div>
    <div class="units">${units.map(({ ev, date }) => {
      const c = color(ev); const n = daysBetween(NOW, date);
      const age = ev.year ? date.getFullYear() - ev.year : null;
      return `<article class="unit fade-in" style="--c:${esc(c)}">
        <div class="unit-head">${badge(ev, c, 56)}<div><h3>${esc(ev.title)}</h3></div></div>
        ${ev.desc ? `<p>${esc(ev.desc)}</p>` : ""}
        <div class="unit-stats">
          <div class="stat"><b>${date.getDate()}.${String(date.getMonth() + 1).padStart(2, "0")}</b><span>${esc(inDays(n))}</span></div>
          <div class="stat"><b>${age !== null ? (age > 0 ? age : "—") : "—"}</b><span>${age > 0 ? plural(age, "рік", "роки", "років") + " у " + date.getFullYear() : ev.year ? "рік створення" : "рік не вказано"}</span></div>
        </div>
        <div class="actions" style="margin:0">
          ${ev.url ? `<a class="btn" href="${esc(ev.url)}" target="_blank" rel="noopener">Сторінка ↗</a>` : ""}
          <a class="btn ghost" href="#d${dkey(date)}">У календарі</a>
        </div>
      </article>`;
    }).join("") || `<p class="empty">Частин не знайдено.</p>`}</div>`;
  const inp = $("unitQ");
  inp.addEventListener("input", () => { unitQuery = inp.value; const pos = inp.selectionStart; renderUnits(); const i2 = $("unitQ"); i2.focus(); i2.setSelectionRange(pos, pos); });
}

// ---------- ICS ----------
function exportICS() {
  const y = cur.getFullYear(); const map = yearMap(y);
  const escI = s => String(s || "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/[,;]/g, m => "\\" + m);
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//military-calendar//UA", "CALSCALE:GREGORIAN", "X-WR-CALNAME:" + escI(DATA.settings.title)];
  Object.values(map).flat().filter(x => active.has(x.ev.cat)).forEach(({ ev, date }) => {
    const e = new Date(date); e.setDate(e.getDate() + 1);
    lines.push("BEGIN:VEVENT", `UID:${ev.id}-${y}@military-calendar`, `DTSTAMP:${ymd(NOW)}T000000Z`, `DTSTART;VALUE=DATE:${ymd(date)}`, `DTEND;VALUE=DATE:${ymd(e)}`,
      "SUMMARY:" + escI(ev.title), ...(ev.desc ? ["DESCRIPTION:" + escI(ev.desc)] : []), ...(ev.url ? ["URL:" + ev.url] : []), "CATEGORIES:" + escI(CATS[ev.cat].name), "END:VEVENT");
  });
  lines.push("END:VCALENDAR");
  const blob = new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `kalendar-syl-oborony-${y}.ics`;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast("Файл .ics збережено");
}

// ---------- Пошук ----------
let results = [], ri = 0;
function hl(text, q) {
  const t = esc(text); if (!q) return t;
  const i = text.toLowerCase().indexOf(q); if (i < 0) return t;
  return esc(text.slice(0, i)) + "<mark>" + esc(text.slice(i, i + q.length)) + "</mark>" + esc(text.slice(i + q.length));
}
function renderResults() {
  const q = $("pq").value.trim().toLowerCase();
  const pool = DATA.events.filter(e => CATS[e.cat]).map(ev => ({ ev, date: nextOccurrence(ev) })).filter(x => x.date);
  results = (q ? pool.filter(x => (x.ev.title + " " + (x.ev.desc || "") + " " + (x.ev.abbr || "") + " " + CATS[x.ev.cat].name).toLowerCase().includes(q)) : pool)
    .sort((a, b) => a.date - b.date).slice(0, 40);
  ri = Math.min(ri, Math.max(results.length - 1, 0));
  $("results").innerHTML = results.map((x, i) => `<button class="res" role="option" aria-selected="${i === ri}" data-i="${i}" style="--c:${esc(color(x.ev))}">
      ${badge(x.ev, color(x.ev), 28)}<span><span>${hl(x.ev.title, q)}</span><small>${esc(CATS[x.ev.cat].name)} · ${esc(describeRule(x.ev))}</small></span>
      <span class="when">${esc(inDays(daysBetween(NOW, x.date)))}</span></button>`).join("") || `<p class="empty" style="padding:12px">Нічого не знайдено.</p>`;
  $("results").querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
}
function openPalette() { const d = $("palette"); if (d.open) return; d.showModal(); $("pq").value = ""; ri = 0; renderResults(); $("pq").focus(); }
function pick(i) { const x = results[i]; if (!x) return; $("palette").close(); location.hash = "#d" + dkey(x.date); }

// ---------- Тема ----------
function renderTheme() {
  const p = document.documentElement.dataset.palette; const mode = store("mc.mode") || "auto";
  $("swatches").innerHTML = PALETTES.map(x => { const [h, ah, gh] = HUES[x.id];
    return `<button class="swatch" data-pal="${x.id}" aria-pressed="${x.id === p}" title="${esc(x.name)}" aria-label="${esc(x.name)}"
      style="background:oklch(.32 .05 ${h})"><span style="background:linear-gradient(90deg, oklch(.62 .16 ${ah}) 50%, oklch(.83 .16 ${gh}) 50%)"></span></button>`; }).join("");
  document.querySelectorAll("#modes button").forEach(b => b.setAttribute("aria-pressed", b.dataset.mode === mode));
}

// ---------- Маршрутизація ----------
function readHash() {
  const h = location.hash.slice(1);
  if (/^d\d{4}-\d{2}-\d{2}$/.test(h)) { sel = parseKey(h.slice(1)); cur = new Date(sel.getFullYear(), sel.getMonth(), 1); view = "calendar"; }
  else if (["calendar", "year", "units"].includes(h)) view = h;
}
function render() {
  document.querySelectorAll(".tabs a").forEach(a => a.dataset.view === view ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current"));
  ({ calendar: renderCalendar, year: renderYear, units: renderUnits })[view]();
}

// ---------- Події ----------
document.addEventListener("click", e => {
  const t = e.target.closest("[data-d],[data-go],[data-nav],[data-today],[data-cat],[data-share],[data-pal],[data-mode],#icsBtn,#searchBtn,#themeBtn,.res");
  if (!t) { if (!e.target.closest(".popover")) { $("themePop").hidden = true; $("themeBtn").setAttribute("aria-expanded", "false"); } return; }
  if (t.dataset.d) { sel = parseKey(t.dataset.d); if (sel.getMonth() !== cur.getMonth()) cur = new Date(sel.getFullYear(), sel.getMonth(), 1);
    history.replaceState(null, "", "#d" + t.dataset.d); transition(render);
    if (innerWidth < 980) $("dayPanel")?.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
  if (t.dataset.go) { location.hash = "#d" + t.dataset.go; return; }
  if (t.dataset.nav) { const s = +t.dataset.nav; cur = view === "year" ? new Date(cur.getFullYear() + s, 0, 1) : new Date(cur.getFullYear(), cur.getMonth() + s, 1); transition(render); return; }
  if (t.hasAttribute("data-today")) { cur = new Date(NOW.getFullYear(), NOW.getMonth(), 1); sel = new Date(NOW); transition(render); return; }
  if (t.dataset.cat) { const k = t.dataset.cat;
    if (active.has(k) && active.size === 1) DATA.categories.forEach(c => active.add(c.id)); else active.has(k) ? active.delete(k) : active.add(k);
    store("mc.cats", [...active].join(",")); render(); return; }
  if (t.dataset.share) { copy(location.origin + location.pathname + "#d" + t.dataset.share, "Посилання скопійовано"); return; }
  if (t.dataset.pal) { applyTheme(t.dataset.pal, store("mc.mode")); store("mc.palette", t.dataset.pal); renderTheme(); return; }
  if (t.dataset.mode) { store("mc.mode", t.dataset.mode); applyTheme(document.documentElement.dataset.palette, t.dataset.mode); renderTheme(); return; }
  if (t.id === "icsBtn") { exportICS(); return; }
  if (t.id === "searchBtn") { openPalette(); return; }
  if (t.id === "themeBtn") { const p = $("themePop"); p.hidden = !p.hidden; t.setAttribute("aria-expanded", String(!p.hidden)); return; }
  if (t.classList.contains("res")) pick(+t.dataset.i);
});
$("pq").addEventListener("input", () => { ri = 0; renderResults(); });
$("pq").addEventListener("keydown", e => {
  if (e.key === "ArrowDown") { ri = Math.min(ri + 1, results.length - 1); renderResults(); e.preventDefault(); }
  if (e.key === "ArrowUp") { ri = Math.max(ri - 1, 0); renderResults(); e.preventDefault(); }
  if (e.key === "Enter") { pick(ri); e.preventDefault(); }
});
$("palette").addEventListener("click", e => { if (e.target === $("palette")) $("palette").close(); });
document.addEventListener("keydown", e => {
  const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName);
  if ((e.key === "k" && (e.ctrlKey || e.metaKey)) || (e.key === "/" && !typing)) { e.preventDefault(); openPalette(); return; }
  if (typing || $("palette").open || !DATA) return;
  if (e.key === "Escape") { $("themePop").hidden = true; return; }
  if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
    if (view === "units") return; const s = e.key === "ArrowLeft" ? -1 : 1;
    cur = view === "year" ? new Date(cur.getFullYear() + s, 0, 1) : new Date(cur.getFullYear(), cur.getMonth() + s, 1); transition(render);
  }
  if (e.key === "t" || e.key === "е") { cur = new Date(NOW.getFullYear(), NOW.getMonth(), 1); sel = new Date(NOW); transition(render); }
});
addEventListener("hashchange", () => { readHash(); transition(render); if (location.hash.startsWith("#d")) scrollTo({ top: document.querySelector("main").offsetTop - 70, behavior: "smooth" }); });

// ---------- Старт ----------
async function boot() {
  try {
    const r = await fetch("data/events.json", { cache: "no-cache" });
    if (!r.ok) throw new Error(r.status);
    DATA = normalize(await r.json());
  } catch {
    $("view").innerHTML = `<div class="panel"><h2>Не вдалося завантажити дані</h2><p class="empty">Файл <code>data/events.json</code> недоступний. Якщо ви відкрили сайт з диска, запустіть локальний сервер (див. README).</p></div>`;
    return;
  }
  CATS = Object.fromEntries(DATA.categories.map(c => [c.id, c]));
  const saved = (store("mc.cats") || "").split(",").filter(k => CATS[k]);
  active = new Set(saved.length ? saved : DATA.categories.map(c => c.id));
  if (!store("mc.palette")) applyTheme(DATA.settings.defaultPalette, store("mc.mode"));
  const s = DATA.settings;
  document.title = s.title || document.title;
  $("brandTitle").textContent = s.title;
  $("noticeText").textContent = s.notice || ""; $("notice").hidden = !s.notice;
  $("footText").textContent = s.footer || "";
  $("lede").textContent = s.subtitle || ""; $("lede").hidden = !s.subtitle;
  $("updated").textContent = DATA.updated ? fmtDate(parseKey(DATA.updated)) : "—";
  readHash(); renderHero(); renderTheme(); render();
}
boot();
