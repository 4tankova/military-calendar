import { MONTHS, PALETTES, normalize, resolve, describeRule, dkey, esc, fmtDate, today, badge, applyTheme, store } from "./core.js";

const $ = id => document.getElementById(id);
const API = "https://api.github.com";
const DATA_PATH = "data/events.json";
const HUES = { olive: [125, 255, 90], pixel: [145, 135, 100], ukraine: [250, 258, 92], sand: [75, 40, 80], navy: [245, 225, 75] };
const NOW = today();

// ---------- Стан ----------
let data = null;        // робоча копія
let base = null;        // опубліковна версія (рядок)
let baseObj = null;
let sha = null;         // sha файлу в репозиторії
let logos = [];         // [{name, path, sha, url}]
let tab = "events";
let filter = { q: "", cat: "" };
let editing = null;     // id події в редакторі або "new"
let kind = "date";

const conn = loadConn();
function loadConn() {
  let c = {};
  try { c = JSON.parse(localStorage.getItem("mc.admin.conn") || sessionStorage.getItem("mc.admin.conn") || "{}"); } catch {}
  if (!c.owner && location.hostname.endsWith(".github.io")) {
    c.owner = location.hostname.split(".")[0];
    c.repo = location.pathname.split("/").filter(Boolean)[0] || `${c.owner}.github.io`;
  }
  return { owner: "", repo: "", branch: "main", token: "", remember: true, ...c };
}
function saveConn() {
  const s = JSON.stringify(conn);
  try {
    localStorage.removeItem("mc.admin.conn"); sessionStorage.removeItem("mc.admin.conn");
    (conn.remember ? localStorage : sessionStorage).setItem("mc.admin.conn", s);
  } catch {}
}
const connected = () => !!(conn.token && conn.owner && conn.repo && sha !== null);

// ---------- Утиліти ----------
function toast(msg, ms = 2600) { const t = $("toast"); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, ms); }
const slug = s => s.toLowerCase().normalize("NFKD")
  .replace(/[а-яіїєґ']/g, ch => ({ а:"a",б:"b",в:"v",г:"h",ґ:"g",д:"d",е:"e",є:"ie",ж:"zh",з:"z",и:"y",і:"i",ї:"i",й:"i",к:"k",л:"l",м:"m",н:"n",о:"o",п:"p",р:"r",с:"s",т:"t",у:"u",ф:"f",х:"kh",ц:"ts",ч:"ch",ш:"sh",щ:"shch",ь:"",ю:"iu",я:"ia","'":"" }[ch] ?? ""))
  .replace(/[^a-z0-9.]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "file";
function b64encode(str) { return bytesToB64(new TextEncoder().encode(str)); }
function bytesToB64(bytes) { let bin = ""; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(bin); }
function b64decode(b64) { return new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, "")), c => c.charCodeAt(0))); }
const serialize = d => JSON.stringify(d, null, 1) + "\n";
const catMap = () => Object.fromEntries(data.categories.map(c => [c.id, c]));
const isDirty = () => base !== null && serialize(data) !== base;
const newId = () => "e" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

function confirmBox(title, text, yes = "Так") {
  return new Promise(res => {
    $("cTitle").textContent = title; $("cText").textContent = text; $("cYes").textContent = yes;
    const d = $("confirm"); d.showModal();
    const done = v => { d.close(); $("cYes").onclick = $("cNo").onclick = null; res(v); };
    $("cYes").onclick = () => done(true); $("cNo").onclick = () => done(false);
    d.oncancel = () => done(false);
  });
}

// ---------- GitHub API ----------
async function gh(path, opts = {}) {
  const r = await fetch(API + path, { ...opts, headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${conn.token}`, "X-GitHub-Api-Version": "2022-11-28", ...(opts.body ? { "Content-Type": "application/json" } : {}) } });
  if (!r.ok) {
    let msg = ""; try { msg = (await r.json()).message; } catch {}
    const e = new Error(msg || r.statusText); e.status = r.status; throw e;
  }
  return r.status === 204 ? null : r.json();
}
const repoPath = p => `/repos/${encodeURIComponent(conn.owner)}/${encodeURIComponent(conn.repo)}/contents/${p.split("/").map(encodeURIComponent).join("/")}`;
const ref = () => `?ref=${encodeURIComponent(conn.branch)}`;
function explain(e) {
  if (e.status === 401) return "Токен недійсний або прострочений. Створіть новий у налаштуваннях GitHub.";
  if (e.status === 403) return "Токен не має права запису. Дайте йому доступ Contents: Read and write для цього репозиторію.";
  if (e.status === 404) return "Репозиторій, гілку або файл не знайдено. Перевірте власника, назву та гілку.";
  if (e.status === 409) return "Файл у репозиторії змінився після завантаження. Оновіть сторінку і повторіть.";
  if (e.status === 422) return "GitHub відхилив запит: " + e.message;
  return "Помилка мережі або GitHub: " + (e.message || "невідома");
}

async function loadRemote() {
  const f = await gh(repoPath(DATA_PATH) + ref());
  sha = f.sha;
  const text = b64decode(f.content);
  return normalize(JSON.parse(text));
}
async function loadLogos() {
  if (!conn.token) { logos = guessLogos(); return; }
  try {
    const list = await gh(repoPath("logos") + ref());
    logos = list.filter(x => x.type === "file" && /\.(png|jpe?g|webp|svg|gif)$/i.test(x.name)).map(x => ({ name: x.name, path: x.path, sha: x.sha, url: x.download_url }));
  } catch (e) { if (e.status === 404) logos = []; else throw e; }
}
function guessLogos() { // без підключення: емблеми, що вже згадані в даних
  return [...new Set(data.events.map(e => e.logo).filter(Boolean))].map(p => ({ name: p.split("/").pop(), path: p, url: p }));
}
const logoUrl = p => logos.find(l => l.path === p)?.url || p;

// ---------- Завантаження ----------
async function boot() {
  let remoteErr = null;
  if (conn.token && conn.owner && conn.repo) {
    try { data = await loadRemote(); } catch (e) { remoteErr = e; sha = null; }
  }
  if (!data) {
    try { const r = await fetch(DATA_PATH, { cache: "no-cache" }); data = normalize(await r.json()); }
    catch { data = normalize({}); }
  }
  base = serialize(data); baseObj = structuredClone(data);
  // Чернетка з попереднього сеансу
  const draft = store("mc.admin.draft");
  if (draft && draft !== base) {
    try { const d = normalize(JSON.parse(draft)); if (serialize(d) !== base) restoreOffer = d; } catch {}
  }
  if (!store("mc.palette")) applyTheme(data.settings.defaultPalette, store("mc.mode"));
  try { await loadLogos(); } catch { logos = guessLogos(); }
  updateConn(remoteErr);
  readHash(); render();
  if (remoteErr) toast(explain(remoteErr), 5000);
}
let restoreOffer = null;

function updateConn(err) {
  const el = $("conn");
  el.classList.toggle("on", connected());
  el.querySelector("span").textContent = connected() ? `${conn.owner}/${conn.repo} · ${conn.branch}` : err ? "Помилка підключення" : "Не підключено";
  el.title = connected() ? "Підключено до GitHub" : "Зміни можна лише експортувати у файл";
}
function markDirty() {
  const dirty = isDirty();
  const n = dirty ? diff().length : 0;
  $("dirty").hidden = !dirty; $("dirty").textContent = `Неопубліковано: ${n}`;
  $("publishBtn").disabled = !dirty;
  $("cntEvents").textContent = data.events.length;
  if (dirty) store("mc.admin.draft", serialize(data)); else { try { localStorage.removeItem("mc.admin.draft"); } catch {} }
}
addEventListener("beforeunload", e => { if (isDirty()) { e.preventDefault(); e.returnValue = ""; } });

// ---------- Різниця ----------
function diff() {
  const out = []; const a = Object.fromEntries(baseObj.events.map(e => [e.id, e])); const b = Object.fromEntries(data.events.map(e => [e.id, e]));
  for (const id in b) if (!a[id]) out.push({ t: "plus", s: `Додано: ${b[id].title}` }); else if (JSON.stringify(a[id]) !== JSON.stringify(b[id])) out.push({ t: "edit", s: `Змінено: ${b[id].title}` });
  for (const id in a) if (!b[id]) out.push({ t: "minus", s: `Видалено: ${a[id].title}` });
  if (JSON.stringify(baseObj.categories) !== JSON.stringify(data.categories)) out.push({ t: "edit", s: "Категорії" });
  if (JSON.stringify(baseObj.settings) !== JSON.stringify(data.settings)) out.push({ t: "edit", s: "Налаштування сайту" });
  if (!out.length && isDirty()) out.push({ t: "edit", s: "Порядок подій" });
  return out;
}

// ---------- Маршрутизація ----------
function readHash() { const h = location.hash.slice(1); if (["events", "categories", "logos", "site", "connect"].includes(h)) tab = h; }
addEventListener("hashchange", () => { readHash(); render(); });
function render() {
  document.querySelectorAll(".side-nav a").forEach(a => a.dataset.tab === tab ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current"));
  ({ events: renderEvents, categories: renderCats, logos: renderLogos, site: renderSite, connect: renderConnect })[tab]();
  markDirty();
}

// ---------- Події ----------
function sortKey(ev) { const d = resolve({ ...ev, year: undefined }, NOW.getFullYear()); return d ? d.getMonth() * 100 + d.getDate() : 9999; }
function renderEvents() {
  const cats = catMap(); const q = filter.q.toLowerCase();
  const changed = new Set(diff().length ? data.events.filter(e => { const o = baseObj.events.find(x => x.id === e.id); return !o || JSON.stringify(o) !== JSON.stringify(e); }).map(e => e.id) : []);
  const list = data.events
    .filter(e => (!filter.cat || e.cat === filter.cat) && (!q || (e.title + " " + (e.desc || "") + " " + (e.abbr || "")).toLowerCase().includes(q)))
    .sort((a, b) => sortKey(a) - sortKey(b));
  $("pane").innerHTML = `
    ${restoreOffer ? `<div class="banner"><span>Знайдено неопубліковану чернетку з минулого разу.</span><span class="spacer"></span><button class="btn" id="dropDraft">Відкинути</button><button class="btn primary" id="useDraft">Відновити</button></div>` : ""}
    ${!connected() ? `<div class="banner"><span>GitHub не підключено. Можна редагувати й експортувати JSON, але публікація недоступна.</span><span class="spacer"></span><a class="btn primary" href="#connect">Підключити</a></div>` : ""}
    <div class="pane-head">
      <h1>Події</h1><span class="spacer"></span>
      <button class="btn primary" id="addEv">+ Нова подія</button>
    </div>
    <div class="pane-head">
      <input class="input" id="evQ" type="search" placeholder="Пошук за назвою, описом, скороченням" value="${esc(filter.q)}" aria-label="Пошук подій">
      <select class="input" id="evCat" aria-label="Категорія"><option value="">Усі категорії (${data.events.length})</option>${data.categories.map(c =>
        `<option value="${esc(c.id)}" ${filter.cat === c.id ? "selected" : ""}>${esc(c.name)} (${data.events.filter(e => e.cat === c.id).length})</option>`).join("")}</select>
    </div>
    <div class="rows">${list.map(e => {
      const c = cats[e.cat]?.color || "#888";
      return `<div class="row${changed.has(e.id) ? " changed" : ""}" data-edit="${esc(e.id)}" role="button" tabindex="0">
        ${badge({ ...e, logo: e.logo ? logoUrl(e.logo) : "" }, c, 36)}
        <span style="min-width:0"><b>${esc(e.title)}</b><small><span class="tag" style="--c:${esc(c)}">${esc(cats[e.cat]?.name || e.cat + " (немає категорії)")}</span> · ${esc(describeRule(e))}${e.year ? " · з " + e.year : ""}</small></span>
        <span class="when">${(() => { const d = resolve({ ...e, year: undefined }, NOW.getFullYear()); return d ? `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}` : "—"; })()}</span>
        <span class="acts"><button class="btn ghost" data-dup="${esc(e.id)}" title="Дублювати">Копія</button></span>
      </div>`;
    }).join("") || `<p class="empty">Нічого не знайдено.</p>`}</div>`;
  const qi = $("evQ");
  qi.oninput = () => { filter.q = qi.value; const p = qi.selectionStart; renderEvents(); const n = $("evQ"); n.focus(); n.setSelectionRange(p, p); };
  $("evCat").onchange = e => { filter.cat = e.target.value; renderEvents(); };
  $("addEv").onclick = () => openEditor("new");
  if (restoreOffer) {
    $("useDraft").onclick = () => { data = restoreOffer; restoreOffer = null; render(); toast("Чернетку відновлено"); };
    $("dropDraft").onclick = () => { restoreOffer = null; try { localStorage.removeItem("mc.admin.draft"); } catch {} render(); };
  }
}

// ---------- Редактор ----------
const monthOpts = MONTHS.map((m, i) => `<option value="${i + 1}">${m}</option>`).join("");
$("fMonth").innerHTML = monthOpts; $("fMonth2").innerHTML = monthOpts;

function setKind(k) {
  kind = k;
  document.querySelectorAll("#fKind button").forEach(b => { b.setAttribute("aria-pressed", b.dataset.kind === k); b.setAttribute("aria-checked", b.dataset.kind === k); });
  document.querySelectorAll(".kind-row").forEach(r => r.hidden = r.dataset.for !== k);
  preview();
}
document.querySelectorAll("#fKind button").forEach(b => b.onclick = () => setKind(b.dataset.kind));

function fillLogoSelect(val) {
  $("fLogo").innerHTML = `<option value="">Без емблеми — щит з абревіатурою</option>` +
    logos.map(l => `<option value="${esc(l.path)}">${esc(l.name)}</option>`).join("") +
    (val && !logos.some(l => l.path === val) ? `<option value="${esc(val)}">${esc(val)}</option>` : "");
  $("fLogo").value = val || "";
}

function openEditor(id) {
  editing = id;
  const e = id === "new" ? { title: "", cat: filter.cat || data.categories[0]?.id, date: `${String(NOW.getMonth() + 1).padStart(2, "0")}-${String(NOW.getDate()).padStart(2, "0")}` } : data.events.find(x => x.id === id);
  $("edTitle").textContent = id === "new" ? "Нова подія" : "Редагувати подію";
  $("fCat").innerHTML = data.categories.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join("");
  $("fTitle").value = e.title || ""; $("fCat").value = e.cat || ""; $("fAbbr").value = e.abbr || "";
  $("fYear").value = e.year || ""; $("fUrl").value = e.url || ""; $("fDesc").value = e.desc || "";
  fillLogoSelect(e.logo || "");
  if (e.date) { const [m, d] = e.date.split("-").map(Number); $("fMonth").value = m; $("fDay").value = d; setKind("date"); }
  else if (e.rule?.nth) { const [m, wd, n] = e.rule.nth; $("fMonth2").value = m; $("fWd").value = wd; $("fOrd").value = n; setKind("nth"); }
  else if (e.rule && typeof e.rule.easter === "number") { $("fEaster").value = e.rule.easter; setKind("easter"); }
  else setKind("date");
  $("fDelete").hidden = id === "new";
  $("fErr").hidden = true;
  $("editor").showModal(); $("fTitle").focus();
  preview();
}

function readForm() {
  const ev = { id: editing === "new" ? newId() : editing, title: $("fTitle").value.trim(), cat: $("fCat").value };
  if (kind === "date") ev.date = `${String($("fMonth").value).padStart(2, "0")}-${String(+$("fDay").value || 0).padStart(2, "0")}`;
  if (kind === "nth") ev.rule = { nth: [+$("fMonth2").value, +$("fWd").value, +$("fOrd").value] };
  if (kind === "easter") ev.rule = { easter: +$("fEaster").value || 0 };
  const y = +$("fYear").value; if (y) ev.year = y;
  const abbr = $("fAbbr").value.trim(); if (abbr) ev.abbr = abbr;
  const desc = $("fDesc").value.trim(); if (desc) ev.desc = desc;
  const url = $("fUrl").value.trim(); if (url) ev.url = url;
  const logo = $("fLogo").value; if (logo) ev.logo = logo;
  return ev;
}
function validate(ev) {
  if (!ev.title) return "Вкажіть назву події.";
  if (!catMap()[ev.cat]) return "Оберіть категорію.";
  if (ev.date) {
    const [m, d] = ev.date.split("-").map(Number); const max = new Date(2024, m, 0).getDate();
    if (!d || d < 1 || d > max) return `У місяці «${MONTHS[m - 1]}» день має бути від 1 до ${max}.`;
  }
  if (ev.year && (ev.year < 800 || ev.year > NOW.getFullYear() + 1)) return "Рік створення виглядає неправильним.";
  if (ev.url && !/^https?:\/\/\S+\.\S+/.test(ev.url)) return "Посилання має починатися з https:// і містити адресу сайту.";
  return "";
}
function preview() {
  if (!$("editor").open && editing === null) return;
  const ev = readForm(); const c = catMap()[ev.cat]?.color || "#888";
  const nd = (() => { for (let y = NOW.getFullYear(); y <= NOW.getFullYear() + 1; y++) { const d = resolve({ ...ev, year: undefined }, y); if (d && d >= NOW) return d; } return null; })();
  $("fPreview").innerHTML = `<div class="evcard" style="--c:${esc(c)}">${badge({ ...ev, logo: ev.logo ? logoUrl(ev.logo) : "" }, c, 52)}
    <div><div class="tag">${esc(catMap()[ev.cat]?.name || "")}</div><h3>${esc(ev.title || "Назва події")}</h3>${ev.desc ? `<p>${esc(ev.desc)}</p>` : ""}
    <div class="meta"><span>${esc(describeRule(ev))}</span>${nd ? `<span>· найближча: ${fmtDate(nd)}</span>` : ""}</div></div></div>`;
}
$("evForm").addEventListener("input", preview);
$("evForm").addEventListener("change", preview);
$("evForm").addEventListener("submit", e => {
  e.preventDefault();
  const ev = readForm(); const err = validate(ev);
  if (err) { $("fErr").textContent = err; $("fErr").hidden = false; return; }
  if (editing === "new") data.events.push(ev); else data.events[data.events.findIndex(x => x.id === editing)] = ev;
  $("editor").close(); editing = null; render(); toast("Збережено в чернетці. Натисніть «Опублікувати», щоб оновити сайт.");
});
$("fDelete").onclick = async () => {
  const ev = data.events.find(x => x.id === editing);
  if (!(await confirmBox("Видалити подію?", `«${ev.title}» зникне з календаря після публікації.`, "Видалити"))) return;
  data.events = data.events.filter(x => x.id !== editing); $("editor").close(); editing = null; render(); toast("Подію видалено");
};
document.querySelectorAll("dialog [data-close]").forEach(b => b.onclick = () => { b.closest("dialog").close(); });
$("editor").addEventListener("close", () => { editing = null; });
$("fLogoUp").onchange = async e => {
  const f = e.target.files[0]; e.target.value = ""; if (!f) return;
  const path = await uploadLogo(f, $("fAbbr").value || $("fTitle").value || f.name);
  if (path) { fillLogoSelect(path); preview(); }
};

// ---------- Емблеми ----------
async function prepareImage(file) {
  if (file.type === "image/svg+xml") {
    const text = await file.text();
    if (/<script|on\w+\s*=|javascript:/i.test(text)) throw new Error("SVG містить скрипти. Збережіть його без них.");
    return { bytes: new TextEncoder().encode(text), ext: "svg", preview: "data:image/svg+xml;base64," + b64encode(text) };
  }
  const bmp = await createImageBitmap(file);
  const s = Math.min(1, 256 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas"); c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  const blob = await new Promise(r => c.toBlob(r, "image/png"));
  return { bytes: new Uint8Array(await blob.arrayBuffer()), ext: "png", preview: c.toDataURL("image/png") };
}
async function uploadLogo(file, nameHint) {
  if (!connected()) { toast("Щоб завантажувати емблеми, підключіть GitHub"); location.hash = "#connect"; return null; }
  try {
    const img = await prepareImage(file);
    let name = slug(nameHint.replace(/\.[a-z]+$/i, "")) + "." + img.ext, i = 1;
    while (logos.some(l => l.name === name)) name = slug(nameHint) + "-" + (++i) + "." + img.ext;
    const path = "logos/" + name;
    toast("Завантаження емблеми…");
    const r = await gh(repoPath(path), { method: "PUT", body: JSON.stringify({ message: `Емблема: ${name}`, content: bytesToB64(img.bytes), branch: conn.branch }) });
    logos.push({ name, path, sha: r.content.sha, url: img.preview });
    toast("Емблему завантажено: " + name);
    return path;
  } catch (e) { toast(e.status ? explain(e) : e.message, 5000); return null; }
}
function renderLogos() {
  const used = p => data.events.filter(e => e.logo === p).length;
  $("pane").innerHTML = `
    <div class="pane-head"><h1>Емблеми</h1><span class="spacer"></span>
      <label class="btn primary" for="logoUp">Завантажити</label><input id="logoUp" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" multiple hidden></div>
    <div class="drop" id="drop">Перетягніть сюди зображення (PNG, JPG, WebP, SVG). Растрові файли зменшуються до 256 px і зберігаються в <code>logos/</code>.</div>
    ${!connected() ? `<p class="muted">Без підключення до GitHub показано лише емблеми, що вже використовуються.</p>` : ""}
    <div class="logo-grid">${logos.map(l => `<div class="logo-tile">
      <div class="img"><img src="${esc(l.url)}" alt="" loading="lazy"></div>
      <code>${esc(l.name)}</code><span class="muted small">Подій: ${used(l.path)}</span>
      ${connected() ? `<button class="btn ghost danger" data-dellogo="${esc(l.path)}" ${used(l.path) ? "disabled title='Емблема використовується'" : ""}>Видалити</button>` : ""}
    </div>`).join("") || `<p class="empty">Емблем ще немає.</p>`}</div>`;
  const up = async files => { for (const f of files) await uploadLogo(f, f.name); renderLogos(); };
  $("logoUp").onchange = e => up([...e.target.files]);
  const dz = $("drop");
  dz.ondragover = e => { e.preventDefault(); dz.classList.add("over"); };
  dz.ondragleave = () => dz.classList.remove("over");
  dz.ondrop = e => { e.preventDefault(); dz.classList.remove("over"); up([...e.dataTransfer.files].filter(f => f.type.startsWith("image/"))); };
  document.querySelectorAll("[data-dellogo]").forEach(b => b.onclick = async () => {
    const l = logos.find(x => x.path === b.dataset.dellogo);
    if (!(await confirmBox("Видалити емблему?", `Файл ${l.name} буде видалено з репозиторію.`, "Видалити"))) return;
    try {
      await gh(repoPath(l.path), { method: "DELETE", body: JSON.stringify({ message: `Видалено емблему: ${l.name}`, sha: l.sha, branch: conn.branch }) });
      logos = logos.filter(x => x !== l); renderLogos(); toast("Емблему видалено");
    } catch (e) { toast(explain(e), 5000); }
  });
}

// ---------- Категорії ----------
const BUILTIN = new Set(["state", "mil", "unit", "mem", "rel"]);
function renderCats() {
  $("pane").innerHTML = `
    <div class="pane-head"><h1>Категорії</h1><span class="spacer"></span><button class="btn primary" id="addCat">+ Категорія</button></div>
    <p class="muted small" style="margin-top:-6px">Колір позначає подію в календарі та фон щита. Категорія «Частини» показується в розділі «Частини» на сайті.</p>
    <div class="cards">${data.categories.map((c, i) => {
      const n = data.events.filter(e => e.cat === c.id).length;
      return `<div class="cat-row">
        <input type="color" value="${esc(c.color)}" data-ci="${i}" data-k="color" aria-label="Колір: ${esc(c.name)}">
        <input class="input" value="${esc(c.name)}" data-ci="${i}" data-k="name" aria-label="Назва категорії">
        <code>${esc(c.id)} · подій: ${n}</code>
        <span class="acts" style="display:flex;gap:4px">
          <button class="btn ghost" data-mv="${i}" data-d="-1" ${i === 0 ? "disabled" : ""} aria-label="Вище">↑</button>
          <button class="btn ghost" data-mv="${i}" data-d="1" ${i === data.categories.length - 1 ? "disabled" : ""} aria-label="Нижче">↓</button>
          <button class="btn ghost danger" data-delcat="${i}" ${n || BUILTIN.has(c.id) ? "disabled" : ""} title="${BUILTIN.has(c.id) ? "Вбудовану категорію не можна видалити" : n ? "Спершу перенесіть події" : "Видалити"}">Видалити</button>
        </span></div>`;
    }).join("")}</div>`;
  document.querySelectorAll("[data-ci]").forEach(inp => inp.oninput = () => { data.categories[+inp.dataset.ci][inp.dataset.k] = inp.value; markDirty(); });
  document.querySelectorAll("[data-mv]").forEach(b => b.onclick = () => {
    const i = +b.dataset.mv, j = i + +b.dataset.d; [data.categories[i], data.categories[j]] = [data.categories[j], data.categories[i]]; render();
  });
  document.querySelectorAll("[data-delcat]").forEach(b => b.onclick = () => { data.categories.splice(+b.dataset.delcat, 1); render(); });
  $("addCat").onclick = () => {
    let id = "cat" + (data.categories.length + 1); while (catMap()[id]) id += "x";
    data.categories.push({ id, name: "Нова категорія", color: "#3f7f8c" }); render();
  };
}

// ---------- Сайт і теми ----------
function renderSite() {
  const s = data.settings;
  $("pane").innerHTML = `
    <div class="pane-head"><h1>Сайт і теми</h1></div>
    <div class="panel panel-form">
      <label class="f">Назва сайту<input id="sTitle" value="${esc(s.title)}" maxlength="80"></label>
      <label class="f">Підзаголовок / опис<textarea id="sSub" rows="2" maxlength="300">${esc(s.subtitle)}</textarea></label>
      <label class="f">Попередження на головній (порожнє — не показувати)<textarea id="sNotice" rows="2" maxlength="300">${esc(s.notice)}</textarea></label>
      <label class="f">Текст у підвалі<textarea id="sFoot" rows="2" maxlength="300">${esc(s.footer)}</textarea></label>
      <div class="f"><span>Тема за замовчуванням для відвідувачів</span>
        <div class="palette-pick">${PALETTES.map(p => { const [h, ah, gh] = HUES[p.id];
          return `<button type="button" data-defpal="${p.id}" aria-pressed="${s.defaultPalette === p.id}"><i style="background:linear-gradient(135deg, oklch(.3 .05 ${h}) 55%, oklch(.6 .16 ${ah}) 55% 80%, oklch(.83 .16 ${gh}) 80%)"></i>${esc(p.name)}</button>`; }).join("")}</div>
        <span class="muted small">Відвідувач може вибрати іншу тему кнопкою з палітрою; його вибір зберігається в браузері.</span>
      </div>
      <div class="f"><span>Ваша тема в адмінці</span>
        <div class="seg" style="max-width:340px" id="myMode">${["auto", "light", "dark"].map(m => `<button type="button" data-mymode="${m}" aria-pressed="${(store("mc.mode") || "auto") === m}">${{ auto: "Авто", light: "Світлий", dark: "Темний" }[m]}</button>`).join("")}</div>
      </div>
    </div>`;
  const bind = (id, k) => $(id).oninput = e => { data.settings[k] = e.target.value; markDirty(); };
  bind("sTitle", "title"); bind("sSub", "subtitle"); bind("sNotice", "notice"); bind("sFoot", "footer");
  document.querySelectorAll("[data-defpal]").forEach(b => b.onclick = () => { data.settings.defaultPalette = b.dataset.defpal; applyTheme(b.dataset.defpal, store("mc.mode")); store("mc.palette", b.dataset.defpal); render(); });
  document.querySelectorAll("[data-mymode]").forEach(b => b.onclick = () => { store("mc.mode", b.dataset.mymode); applyTheme(document.documentElement.dataset.palette, b.dataset.mymode); render(); });
}

// ---------- Підключення ----------
function renderConnect() {
  $("pane").innerHTML = `
    <div class="pane-head"><h1>Підключення до GitHub</h1></div>
    <div class="panel panel-form">
      <div class="form-grid">
        <label class="f">Власник (логін або організація)<input id="cOwner" value="${esc(conn.owner)}" autocomplete="off" spellcheck="false"></label>
        <label class="f">Репозиторій<input id="cRepo" value="${esc(conn.repo)}" autocomplete="off" spellcheck="false"></label>
        <label class="f">Гілка<input id="cBranch" value="${esc(conn.branch)}" autocomplete="off" spellcheck="false"></label>
        <label class="f">Токен доступу<input id="cToken" type="password" value="${esc(conn.token)}" autocomplete="off" spellcheck="false" placeholder="github_pat_…"></label>
      </div>
      <label style="display:flex;gap:8px;align-items:center;font-size:14px"><input type="checkbox" id="cRemember" ${conn.remember ? "checked" : ""}> Запам'ятати на цьому пристрої</label>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn primary" id="cGo">Підключитися</button>
        ${conn.token ? `<button class="btn ghost danger" id="cOut">Вийти й забути токен</button>` : ""}
      </div>
      <p class="err" id="cErr" hidden></p>
    </div>
    <div class="panel panel-form" style="margin-top:14px">
      <h2>Як отримати токен</h2>
      <ol class="steps">
        <li>Відкрийте <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">GitHub → Settings → Fine-grained tokens → Generate new token</a>.</li>
        <li><b>Repository access:</b> Only select repositories → виберіть цей репозиторій.</li>
        <li><b>Permissions → Repository → Contents:</b> Read and write.</li>
        <li>Створіть токен, скопіюйте його й вставте вище.</li>
      </ol>
      <p class="muted small">Токен зберігається лише у вашому браузері й надсилається тільки на api.github.com. Без нього адмінка відкривається лише для перегляду, тож сторонні люди не можуть нічого змінити.</p>
    </div>
    <div class="panel panel-form" style="margin-top:14px">
      <h2>Резервна копія</h2>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn" id="exp">Експортувати JSON</button>
        <label class="btn" for="imp">Імпортувати JSON</label><input id="imp" type="file" accept="application/json,.json" hidden>
      </div>
      <p class="muted small">Імпорт замінює робочу копію; на сайті зміни з'являться після публікації.</p>
    </div>`;
  $("cGo").onclick = async () => {
    Object.assign(conn, { owner: $("cOwner").value.trim(), repo: $("cRepo").value.trim(), branch: $("cBranch").value.trim() || "main", token: $("cToken").value.trim(), remember: $("cRemember").checked });
    $("cErr").hidden = true; $("cGo").disabled = true; $("cGo").textContent = "Перевірка…";
    try {
      const repo = await gh(`/repos/${encodeURIComponent(conn.owner)}/${encodeURIComponent(conn.repo)}`);
      if (!repo.permissions?.push) throw Object.assign(new Error("no push"), { status: 403 });
      const remote = await loadRemote();
      saveConn();
      const keepLocal = isDirty() && await confirmBox("Залишити ваші зміни?", "У вас є неопубліковані зміни. Залишити їх поверх даних з репозиторію?", "Залишити");
      baseObj = structuredClone(remote); base = serialize(remote); if (!keepLocal) data = remote;
      await loadLogos(); updateConn(); toast("Підключено до " + conn.owner + "/" + conn.repo); location.hash = "#events";
    } catch (e) {
      sha = null; updateConn(e); $("cErr").textContent = explain(e); $("cErr").hidden = false;
    } finally { const b = $("cGo"); if (b) { b.disabled = false; b.textContent = "Підключитися"; } }
  };
  $("cOut") && ($("cOut").onclick = () => { conn.token = ""; sha = null; saveConn(); try { localStorage.removeItem("mc.admin.conn"); sessionStorage.removeItem("mc.admin.conn"); } catch {} updateConn(); render(); toast("Токен видалено з браузера"); });
  $("exp").onclick = () => {
    const blob = new Blob([serialize({ ...data, updated: dkey(NOW) })], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "events.json"; document.body.appendChild(a); a.click(); a.remove();
  };
  $("imp").onchange = async e => {
    const f = e.target.files[0]; e.target.value = ""; if (!f) return;
    try { const d = normalize(JSON.parse(await f.text())); if (!Array.isArray(d.events)) throw 0; data = d; render(); toast(`Імпортовано подій: ${d.events.length}`); }
    catch { toast("Файл не схожий на events.json календаря", 4000); }
  };
}

// ---------- Публікація ----------
$("publishBtn").onclick = () => {
  if (!connected()) { toast("Спершу підключіть GitHub"); location.hash = "#connect"; return; }
  const d = diff();
  $("pubSummary").innerHTML = `<ul class="diff">${d.slice(0, 12).map(x => `<li class="${x.t}">${{ plus: "+", minus: "−", edit: "~" }[x.t]} <span>${esc(x.s)}</span></li>`).join("")}${d.length > 12 ? `<li class="muted">і ще ${d.length - 12}</li>` : ""}</ul>`;
  $("pubMsg").value = d.length === 1 ? d[0].s : `Оновлення календаря: змін ${d.length}`;
  $("pubErr").hidden = true; $("publish").showModal();
};
$("pubForm").addEventListener("submit", async e => {
  e.preventDefault();
  const btn = $("pubGo"); btn.disabled = true; btn.textContent = "Публікація…";
  try {
    const out = { ...data, updated: dkey(NOW) };
    const r = await gh(repoPath(DATA_PATH), { method: "PUT", body: JSON.stringify({ message: $("pubMsg").value.trim() || "Оновлення календаря", content: b64encode(serialize(out)), sha, branch: conn.branch }) });
    sha = r.content.sha; data = out; base = serialize(out); baseObj = structuredClone(out);
    $("publish").close(); render(); toast("Опубліковано. Сайт оновиться за 1–2 хвилини.", 4500);
  } catch (err) { $("pubErr").textContent = explain(err); $("pubErr").hidden = false; }
  finally { btn.disabled = false; btn.textContent = "Опублікувати"; }
});

// ---------- Делегування ----------
document.addEventListener("click", e => {
  const dup = e.target.closest("[data-dup]");
  if (dup) { e.stopPropagation(); const src = data.events.find(x => x.id === dup.dataset.dup); data.events.push({ ...structuredClone(src), id: newId(), title: src.title + " (копія)" }); render(); toast("Створено копію"); return; }
  const row = e.target.closest("[data-edit]"); if (row) openEditor(row.dataset.edit);
});
document.addEventListener("keydown", e => {
  const row = e.target.closest?.("[data-edit]"); if (row && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); openEditor(row.dataset.edit); }
  if ((e.ctrlKey || e.metaKey) && e.key === "s") { e.preventDefault(); if (isDirty()) $("publishBtn").click(); }
});

boot();
