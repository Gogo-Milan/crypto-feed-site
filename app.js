// ===== SITE APP (unlocks + feed + dark mode + minimal notifier) =====
'use strict';

const BACKEND_BASE    = "https://script.google.com/macros/s/AKfycbxYykjZ0s5IkolkWDD5PzpNeHnTUzBSu0IaJ73-S7zxjpptBFWtX2-AZZgHT_8uY78u/exec";
const AUTO_REFRESH_MS = 2 * 60 * 1000;

const KEY_TOKEN  = 'auth_token';
const KEY_DEVICE = 'device_id';
const KEY_THEME  = 'theme_pref'; // 'light' | 'dark'

// DOM
const gateEl      = document.getElementById('gate');
const mainEl      = document.getElementById('main');
const codeInput   = document.getElementById('codeInput');
const redeemBtn   = document.getElementById('redeemBtn');
const gateMsg     = document.getElementById('gateMsg');
const tabsBtns    = Array.from(document.querySelectorAll('.tab'));
const newsPane    = document.getElementById('news');
const signalsPane = document.getElementById('signals');
const annPane     = document.getElementById('ann');
const refreshBtn  = document.getElementById('refreshBtn');
const updatedAtEl = document.getElementById('updatedAt');
const toastEl     = document.getElementById('toast');
const darkToggle  = document.getElementById('darkToggle');

let refreshTimer = null;

// ---- storage ----
const st = {
  get(k, def=null) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch { return def; } },
  set(k, v)        { localStorage.setItem(k, JSON.stringify(v)); }
};

// ---- utils ----
function setVisible(el, vis) { el?.classList.toggle('hidden', !vis); }
function h(txt) { const d=document.createElement('div'); d.textContent=txt??''; return d.innerHTML; }
function fmtDate(dt){ const d=new Date(dt); return isNaN(d)?'':d.toLocaleString(); }
function uuidv4(){ return (crypto.randomUUID ? crypto.randomUUID() :
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c=>{
    const r=Math.random()*16|0,v=c==='x'?r:(r&0x3|0x8); return v.toString(16);
  })); }

// ---- theme ----
function applyTheme(theme) {
  const isDark = theme === 'dark';
  document.body.classList.toggle('dark', isDark);
  if (darkToggle) darkToggle.textContent = isDark ? '☀️' : '🌙';
}
function loadTheme() {
  applyTheme(st.get(KEY_THEME, 'light'));
}
function toggleTheme() {
  const next = document.body.classList.contains('dark') ? 'light' : 'dark';
  st.set(KEY_THEME, next);
  applyTheme(next);
}

// ---- API (GET; no preflight) ----
async function apiRedeem(code, deviceId) {
  const url = BACKEND_BASE + `?path=redeem&code=${encodeURIComponent(code)}&deviceId=${encodeURIComponent(deviceId)}&t=${Date.now()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`redeem HTTP ${res.status}`);
  return res.json();
}
async function apiFeed(type, token) {
  const url = BACKEND_BASE + `?path=feed&type=${encodeURIComponent(type)}&token=${encodeURIComponent(token)}&t=${Date.now()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`feed(${type}) HTTP ${res.status}`);
  return res.json();
}
async function apiVersion() {
  const url = BACKEND_BASE + `?path=version&t=${Date.now()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`version HTTP ${res.status}`);
  return res.json();
}

// ---- rendering ----
function renderNews(items){
  newsPane.innerHTML='';
  if(!items?.length){ newsPane.innerHTML='<p>No items yet.</p>'; return; }
  items.forEach(it=>{
    const div=document.createElement('div'); div.className='item';
    const tags=[]; if(it.tag) tags.push(h(it.tag));
    if(String(it.pinned).toUpperCase()==='TRUE') tags.push('Pinned');
    const badges=tags.map(t=>`<span class="badge">${t}</span>`).join(' ');
    const linkHtml = it.link ? ` <a href="${h(it.link)}" target="_blank" rel="noreferrer">link</a>` : '';
    div.innerHTML = `
      <div><strong>${h(it.title)}</strong> ${badges}</div>
      <div><small>${h(it.ts)}</small></div>
      <div>${h(it.body)}</div>
      <div>${linkHtml}</div>`;
    newsPane.appendChild(div);
  });
}
function renderSignals(items){
  signalsPane.innerHTML='';
  if(!items?.length){ signalsPane.innerHTML='<p>No signals yet.</p>'; return; }
  items.forEach(it=>{
    const div=document.createElement('div'); div.className='item';
    const pin = String(it.pinned).toUpperCase()==='TRUE' ? `<span class="badge">Pinned</span>` : '';
    div.innerHTML=`
      <div><strong>${h(it.pair)}</strong> — ${h(it.action)} ${pin}</div>
      <div><small>${h(it.ts)}</small></div>
      <div>Entry: ${h(it.entry)} | TP: ${h(it.tp)} | SL: ${h(it.sl)}</div>
      <div>${h(it.notes)}</div>`;
    signalsPane.appendChild(div);
  });
}
function renderAnn(items){
  annPane.innerHTML='';
  if(!items?.length){ annPane.innerHTML='<p>No announcements.</p>'; return; }
  items.forEach(it=>{
    const div=document.createElement('div'); div.className='item';
    const pin = String(it.pinned).toUpperCase()==='TRUE' ? `<span class="badge">Pinned</span>` : '';
    const linkHtml = it.link ? ` <a href="${h(it.link)}" target="_blank" rel="noreferrer">link</a>` : '';
    div.innerHTML=`
      <div><strong>${h(it.title||'Announcement')}</strong> ${pin}</div>
      <div><small>${h(it.ts)}</small></div>
      <div>${h(it.body||'')}</div>
      <div>${linkHtml}</div>`;
    annPane.appendChild(div);
  });
}

// ---- flow ----
async function doRefresh() {
  const token = st.get(KEY_TOKEN, null);
  if (!token) return;
  try {
    const [news, sig, ann] = await Promise.all([
      apiFeed('news_orders', token),
      apiFeed('signals', token),
      apiFeed('announcements', token).catch(()=>({items:[]}))
    ]);
    if (news?.items) renderNews(news.items);
    if (sig?.items)  renderSignals(sig.items);
    if (ann?.items)  renderAnn(ann.items);
    updatedAtEl.textContent = fmtDate(new Date());
  } catch (err) {
    console.error('Refresh failed:', err);
    updatedAtEl.textContent = 'refresh failed';
  }
}

async function showMain() {
  setVisible(gateEl, false);
  setVisible(mainEl, true);
  await doRefresh();
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(doRefresh, AUTO_REFRESH_MS);
}

function init() {
  console.log('[boot] app.js loaded');
  // theme
  loadTheme();
  darkToggle?.addEventListener('click', toggleTheme);

  // device id
  let deviceId = st.get(KEY_DEVICE, null);
  if (!deviceId) { deviceId = uuidv4(); st.set(KEY_DEVICE, deviceId); }

  const token = st.get(KEY_TOKEN, null);
  if (token) showMain();
  else { setVisible(gateEl, true); setVisible(mainEl, false); }
}

// ---- events ----
redeemBtn?.addEventListener('click', async ()=>{
  gateMsg.textContent='';
  const code = (codeInput.value||'').trim();
  if (!code) { gateMsg.textContent='Enter a code.'; return; }
  redeemBtn.disabled = true;
  try {
    const res = await apiRedeem(code, st.get(KEY_DEVICE,null));
    if (res.ok && res.token) {
      st.set(KEY_TOKEN, res.token);
      await showMain();
    } else {
      gateMsg.textContent = res.error || 'Failed to redeem code.';
      redeemBtn.disabled = false;
    }
  } catch (e) {
    gateMsg.textContent='Network error.';
    redeemBtn.disabled=false;
    console.error('redeem failed:', e);
  }
});

tabsBtns.forEach(btn=>{
  btn.addEventListener('click', ()=>{
    tabsBtns.forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    const tab = btn.dataset.tab;
    setVisible(newsPane,    tab==='news');
    setVisible(signalsPane, tab==='signals');
    setVisible(annPane,     tab==='ann');
  });
});

refreshBtn?.addEventListener('click', doRefresh);
document.addEventListener('visibilitychange', ()=>{ if (!document.hidden) doRefresh(); });

window.addEventListener('load', init);

// Optional: surface fatal JS errors to console
window.addEventListener('error', (e)=> console.error('[global error]', e.error || e.message));
