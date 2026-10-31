"use strict";
// Календар Сил оборони України. Дані: data/events.json
// ---------- Дані ----------
// rule: [m,d] — фіксована; {nth:[m,weekday(0=нд),n]} n=-1 остання; {easter:offset}
const CATS={
  state:{name:"Державні",c:"--c-state"},
  mem:{name:"Пам'ятні дні",c:"--c-mem"},
  mil:{name:"Військові",c:"--c-mil"},
  unit:{name:"Частини",c:"--c-unit"},
  rel:{name:"Релігійні",c:"--c-rel"},
  own:{name:"Мої",c:"--c-own"}
};
let E=[];
// Перетворює запис JSON у внутрішній формат
function fromJSON(x){const r=x.date?x.date.split("-").map(Number):x.rule;return {r,y:x.year,t:x.title,cat:x.cat,a:x.abbr,d:x.desc,u:x.url,logo:x.logo}}

// ---------- Власні події ----------
let OWN=[];
try{OWN=JSON.parse(localStorage.getItem("ownUnits")||"[]")}catch(e){OWN=[]}
function saveOwn(){try{localStorage.setItem("ownUnits",JSON.stringify(OWN))}catch(e){}}

// ---------- Розрахунок дат ----------
function orthodoxEaster(y){
  const a=y%4,b=y%7,c=y%19,d=(19*c+15)%30,e=(2*a+4*b-d+34)%7;
  const m=Math.floor((d+e+114)/31),day=((d+e+114)%31)+1;
  const dt=new Date(y,m-1,day);dt.setDate(dt.getDate()+13);return dt;
}
function nthWeekday(y,m,wd,n){
  if(n>0){const d=new Date(y,m-1,1);const off=(wd-d.getDay()+7)%7;return new Date(y,m-1,1+off+7*(n-1));}
  const d=new Date(y,m,0);const off=(d.getDay()-wd+7)%7;return new Date(y,m-1,d.getDate()-off);
}
function resolve(ev,y){
  const r=ev.r;
  if(Array.isArray(r))return new Date(y,r[0]-1,r[1]);
  if(r.nth)return nthWeekday(y,r.nth[0],r.nth[1],r.nth[2]);
  if("easter" in r){const d=orthodoxEaster(y);d.setDate(d.getDate()+r.easter);return d;}
}
function allEvents(){
  return E.concat(OWN.map(o=>({r:[o.m,o.d],y:o.y,t:o.name,cat:"own",a:o.abbr||o.name.slice(0,3),u:o.url,logo:o.logo,d:"Додано вами.",id:o.id})));
}
const key=d=>d.getFullYear()+"-"+(d.getMonth()+1)+"-"+d.getDate();
const cache={};
function eventsForYear(y){
  if(cache[y])return cache[y];
  const map={};
  allEvents().forEach(ev=>{
    if(ev.y&&ev.y>y)return;
    const d=resolve(ev,y);const k=key(d);(map[k]=map[k]||[]).push({...ev,date:d});
  });
  return cache[y]=map;
}
function clearCache(){for(const k in cache)delete cache[k]}

// ---------- Стан ----------
const now=new Date();now.setHours(0,0,0,0);
let cur=new Date(now.getFullYear(),now.getMonth(),1);
let sel=new Date(now);
let view="month";
let active=new Set(Object.keys(CATS));
let q="";
try{const v=localStorage.getItem("view");if(v)view=v}catch(e){}

const MONTHS=["січень","лютий","березень","квітень","травень","червень","липень","серпень","вересень","жовтень","листопад","грудень"];
const MONTHS_G=["січня","лютого","березня","квітня","травня","червня","липня","серпня","вересня","жовтня","листопада","грудня"];
const DOW=["Пн","Вт","Ср","Чт","Пт","Сб","Нд"];
const DOWF=["неділя","понеділок","вівторок","середа","четвер","п'ятниця","субота"];

function visible(ev){
  if(!active.has(ev.cat))return false;
  if(!q)return true;
  return (ev.t+" "+(ev.d||"")+" "+(ev.a||"")).toLowerCase().includes(q);
}
function dayEvents(d){return (eventsForYear(d.getFullYear())[key(d)]||[]).filter(visible)}
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const col=ev=>`var(${CATS[ev.cat].c})`;

function badge(ev){
  if(ev.logo)return `<span class="badge"><img src="${esc(ev.logo)}" alt="Емблема: ${esc(ev.t)}"></span>`;
  const a=esc(ev.a||"").slice(0,6);const fs=a.length>4?11:a.length>2?14:18;
  return `<svg class="badge" viewBox="0 0 48 56" aria-hidden="true">
    <path d="M24 2 L45 9 V27 C45 41 35 50 24 54 C13 50 3 41 3 27 V9 Z" fill="${col(ev)}" />
    <path d="M24 6 L41 11.5 V27 C41 38.5 33 46 24 49.5 C15 46 7 38.5 7 27 V11.5 Z" fill="none" stroke="var(--surface)" stroke-width="1.2" opacity=".7"/>
    <text x="24" y="31" text-anchor="middle" dominant-baseline="middle" font-family="IBM Plex Mono,monospace" font-weight="600" font-size="${fs}" fill="var(--surface)">${a}</text>
  </svg>`;
}
function years(ev){
  if(!ev.y)return "";
  const n=ev.date.getFullYear()-ev.y;
  return n>0?`<span>${n}-та річниця</span>`:"<span>рік створення</span>";
}
function itemHTML(ev){
  return `<div class="item" style="--c:${col(ev)}">${badge(ev)}<div>
    <h3>${esc(ev.t)}</h3>${ev.d?`<p>${esc(ev.d)}</p>`:""}
    <div class="meta"><span class="tag">${CATS[ev.cat].name}</span>${years(ev)}${ev.u?`<a href="${esc(ev.u)}" target="_blank" rel="noopener">Сторінка ↗</a>`:""}</div>
  </div></div>`;
}

// ---------- Рендер ----------
const $=id=>document.getElementById(id);
function renderChips(){
  $("chips").innerHTML=Object.entries(CATS).map(([k,v])=>
    `<button class="chip" data-k="${k}" aria-pressed="${active.has(k)}"><span class="dot" style="background:var(${v.c})"></span>${v.name}</button>`).join("");
}
function renderMonth(){
  const y=cur.getFullYear(),m=cur.getMonth();
  $("mtitle").textContent=MONTHS[m]+" "+y;
  const first=new Date(y,m,1);const start=new Date(first);start.setDate(1-((first.getDay()+6)%7));
  let h=DOW.map(d=>`<div class="dow">${d}</div>`).join("");
  for(let i=0;i<42;i++){
    const d=new Date(start);d.setDate(start.getDate()+i);
    if(i>=35&&d.getMonth()!==m)break;
    const evs=dayEvents(d);const cls=["cell"];
    if(d.getMonth()!==m)cls.push("out");
    if(d.getDay()===0||d.getDay()===6)cls.push("wk");
    if(+d===+now)cls.push("today");
    if(+d===+sel)cls.push("sel");
    const shown=evs.slice(0,2).map(e=>`<div class="ev" style="--c:${col(e)}" title="${esc(e.t)}">${esc(e.t)}</div>`).join("");
    h+=`<button class="${cls.join(" ")}" data-d="${+d}" aria-label="${d.getDate()} ${MONTHS_G[d.getMonth()]}${evs.length?", подій: "+evs.length:""}">
      <span class="n">${d.getDate()}</span>${shown}${evs.length>2?`<span class="more">+${evs.length-2}</span>`:""}
      <span class="dots">${evs.map(e=>`<i style="--c:${col(e)}"></i>`).join("")}</span></button>`;
  }
  $("view").innerHTML=`<div class="grid">${h}</div>`;
}
function renderYear(){
  const y=cur.getFullYear();$("mtitle").textContent=y+" рік";
  const map=eventsForYear(y);let h="";
  for(let m=0;m<12;m++){
    let rows="";
    const days=new Date(y,m+1,0).getDate();
    for(let d=1;d<=days;d++){
      const dt=new Date(y,m,d);const evs=(map[key(dt)]||[]).filter(visible);
      if(!evs.length)continue;
      rows+=`<div class="yrow"><div class="d">${d}<small>${DOWF[dt.getDay()].slice(0,3)}</small></div><div>${
        evs.map(e=>`<div class="yev" style="--c:${col(e)}">${badge(e)}<div><b>${esc(e.t)}</b><div class="meta"><span class="tag">${CATS[e.cat].name}</span>${years(e)}${e.u?`<a href="${esc(e.u)}" target="_blank" rel="noopener">Сторінка ↗</a>`:""}</div></div></div>`).join("")}</div></div>`;
    }
    if(rows)h+=`<div class="ymonth"><h3>${MONTHS[m]}</h3>${rows}</div>`;
  }
  $("view").innerHTML=`<div class="year">${h||'<p class="empty">Нічого не знайдено за цим фільтром.</p>'}</div>`;
}
function renderDay(){
  const evs=dayEvents(sel);
  $("dayPanel").innerHTML=`<div><div class="label">${DOWF[sel.getDay()]}</div><h2>${sel.getDate()} ${MONTHS_G[sel.getMonth()]} ${sel.getFullYear()}</h2></div>`+
    (evs.length?evs.map(itemHTML).join(""):`<p class="empty">Цього дня немає свят чи пам'ятних дат у вибраних категоріях.</p>`);
}
function renderUpcoming(){
  let h="";
  for(let i=0;i<30;i++){
    const d=new Date(now);d.setDate(now.getDate()+i);
    dayEvents(d).forEach(e=>{h+=`<button class="uprow" data-d="${+d}" style="--c:${col(e)}"><span class="d">${String(d.getDate()).padStart(2,"0")}.${String(d.getMonth()+1).padStart(2,"0")}</span><span class="t">${esc(e.t)}</span></button>`});
  }
  $("upcoming").innerHTML=h||'<p class="empty">Найближчим часом подій немає.</p>';
}
function renderOwn(){
  $("ownList").innerHTML=OWN.map(o=>`<div><span>${esc(o.name)} · ${String(o.d).padStart(2,"0")}.${String(o.m).padStart(2,"0")}.${o.y}</span><span><button data-json="${o.id}">JSON</button> <button data-del="${o.id}">Видалити</button></span></div>`).join("");
}
// Рядок для вставки в data/events.json (щоб додати частину в репозиторій)
function ownToJSON(o){
  const x={date:String(o.m).padStart(2,"0")+"-"+String(o.d).padStart(2,"0"),year:o.y,title:o.name,cat:"unit",abbr:o.abbr||undefined,url:o.url||undefined,logo:"logos/назва-файлу.png"};
  return JSON.stringify(x);
}
function render(){
  $("vMonth").setAttribute("aria-pressed",view==="month");$("vYear").setAttribute("aria-pressed",view==="year");
  $("prev").setAttribute("aria-label",view==="month"?"Попередній місяць":"Попередній рік");
  $("next").setAttribute("aria-label",view==="month"?"Наступний місяць":"Наступний рік");
  view==="month"?renderMonth():renderYear();
  renderDay();renderUpcoming();renderOwn();
}

// ---------- Події UI ----------
function selectDate(t){sel=new Date(+t);if(view==="month"&&(sel.getMonth()!==cur.getMonth()||sel.getFullYear()!==cur.getFullYear()))cur=new Date(sel.getFullYear(),sel.getMonth(),1);render();
  if(window.innerWidth<860)$("dayPanel").scrollIntoView({behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth",block:"start"});}
$("view").addEventListener("click",e=>{const c=e.target.closest(".cell");if(c)selectDate(c.dataset.d)});
$("upcoming").addEventListener("click",e=>{const c=e.target.closest(".uprow");if(c)selectDate(c.dataset.d)});
$("prev").onclick=()=>{cur=view==="month"?new Date(cur.getFullYear(),cur.getMonth()-1,1):new Date(cur.getFullYear()-1,0,1);render()};
$("next").onclick=()=>{cur=view==="month"?new Date(cur.getFullYear(),cur.getMonth()+1,1):new Date(cur.getFullYear()+1,0,1);render()};
$("todayBtn").onclick=()=>{cur=new Date(now.getFullYear(),now.getMonth(),1);sel=new Date(now);render()};
$("vMonth").onclick=()=>{view="month";try{localStorage.setItem("view",view)}catch(e){}render()};
$("vYear").onclick=()=>{view="year";try{localStorage.setItem("view",view)}catch(e){}render()};
$("q").addEventListener("input",e=>{q=e.target.value.trim().toLowerCase();render()});
$("chips").addEventListener("click",e=>{const b=e.target.closest(".chip");if(!b)return;const k=b.dataset.k;
  if(active.has(k)&&active.size===1)Object.keys(CATS).forEach(x=>active.add(x));else active.has(k)?active.delete(k):active.add(k);renderChips();render()});
$("ownList").addEventListener("click",e=>{
  const jid=e.target.dataset.json;
  if(jid){const o=OWN.find(x=>x.id===jid);const s=ownToJSON(o);const out=$("jsonOut");out.hidden=false;out.value=s+",";
    (navigator.clipboard?navigator.clipboard.writeText(out.value):Promise.reject()).then(()=>{e.target.textContent="Скопійовано"},()=>{out.select()});return;}
  const id=e.target.dataset.del;if(!id)return;OWN=OWN.filter(o=>o.id!==id);saveOwn();clearCache();render()});
$("ownForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const [y,m,d]=$("oDate").value.split("-").map(Number);
  let logo="";const f=$("oLogo").files[0];
  if(f){logo=await new Promise(res=>{const img=new Image();const fr=new FileReader();fr.onload=()=>{img.onload=()=>{const c=document.createElement("canvas");const s=Math.min(1,120/Math.max(img.width,img.height));c.width=img.width*s;c.height=img.height*s;c.getContext("2d").drawImage(img,0,0,c.width,c.height);res(c.toDataURL("image/png"))};img.onerror=()=>res("");img.src=fr.result};fr.readAsDataURL(f)})}
  OWN.push({id:String(Date.now()),name:$("oName").value.trim(),y,m,d,abbr:$("oAbbr").value.trim(),url:$("oUrl").value.trim(),logo});
  saveOwn();clearCache();e.target.reset();sel=new Date(now.getFullYear(),m-1,d);cur=new Date(sel.getFullYear(),m-1,1);render();
});

renderChips();
$("view").innerHTML='<p class="empty">Завантаження даних…</p>';
fetch("data/events.json",{cache:"no-cache"})
  .then(r=>{if(!r.ok)throw new Error(r.status);return r.json()})
  .then(j=>{E=j.events.filter(x=>CATS[x.cat]).map(fromJSON);if(j.updated)$("updated").textContent=j.updated;clearCache();render()})
  .catch(()=>{$("view").innerHTML='<p class="empty">Не вдалося завантажити data/events.json. Якщо ви відкрили файл напряму з диска, запустіть локальний сервер (див. README) або відкрийте сайт на GitHub Pages.</p>';renderDay();renderUpcoming();renderOwn()});
