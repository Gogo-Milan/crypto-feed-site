// ===== SITE APP (unlocks + feed + toast beeps) =====
const BACKEND_BASE = "https://script.google.com/macros/s/AKfycbzpiEn-EQIhFurF5lWnLG0sCRqHNhzBbSmxQYwgyUS7EL0Fs3wFv-7hfBJYvff3toMf/exec";
const AUTO_REFRESH_MS = 2 * 60 * 1000;
const PING_MS = 30000;

const KEY_TOKEN  = 'auth_token';
const KEY_DEVICE = 'device_id';

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

let refreshTimer = null;
let lastVersion = { news_orders:0, signals:0, announcements:0 };

// storage (localStorage for site)
const st = {
  get(k, def=null) {
    try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; }
    catch { return def; }
  },
  set(k, v) {
    localStorage.setItem(k, JSON.stringify(v));
  }
};

function setVisible(el, vis) { el.classList.toggle('hidden', !vis); }
function h(txt) { const d=document.createElement('div'); d.textContent=txt??''; return d.innerHTML; }
function fmtDate(dt){ const d=new Date(dt); return isNaN(d)?'':d.toLocaleString(); }
function uuidv4(){ return (crypto.randomUUID ? crypto.randomUUID() :
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c=>{
    const r=Math.random()*16|0,v=c==='x'?r:(r&0x3|0x8); return v.toString(16);
  })); }

// API
async function apiRedeem(code, deviceId) {
  const r = await fetch(BACKEND_BASE + "?path=redeem", {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ code, deviceId })
  });
  return r.json();
}
async function apiFeed(type, token) {
  const r = await fetch(BACKEND_BASE + `?path=feed&type=${encodeURIComponent(type)}&token=${encodeURIComponent(token)}`);
  return r.json();
}
async function apiVersion() {
  const r = await fetch(BACKEND_BASE + "?path=version");
  return r.json();
}

// RENDER
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

// Notifier (toast + beep)
function showToast(msg) {
  if (!toastEl) return;
  toastEl.textContent = msg;
  toastEl.style.display = 'block';
  setTimeout(()=> toastEl.style.display='none', 4000);
}
function beep() {
  try {
    const ctx = new (window.AudioContext||window.webkitAudioContext)();
    const o=ctx.createOscillator(), g=ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type='sine'; o.frequency.value=880;
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime+0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime+0.15);
    o.start(); o.stop(ctx.currentTime+0.16);
  } catch {}
}
async function checkVersion() {
  try {
    const v = await apiVersion();
    ['news_orders','signals','announcements'].forEach(k=>{
      if (v[k] && v[k] > (lastVersion[k]||0)) {
        showToast(`New update in ${k.replace('_',' / ')}`);
        beep();
      }
    });
    lastVersion = v;
  } catch {}
}

// FLOW
async function doRefresh() {
  const token = st.get(KEY_TOKEN, null);
  if (!token) return;
  try {
    const [news, sig/*, ann*/] = await Promise.all([
      apiFeed('news_orders', token),
      apiFeed('signals', token),
      // apiFeed('announcements', token) // enable if you have this sheet structured like others
    ]);
    if (news?.items) renderNews(news.items);
    if (sig?.items)   renderSignals(sig.items);
    // if (ann?.items)   renderAnn(ann.items);
    updatedAtEl.textContent = fmtDate(new Date());
  } catch {
    updatedAtEl.textContent = 'refresh failed';
  }
}
async function showMain() {
  setVisible(gateEl, false);
  setVisible(mainEl, true);
  await doRefresh();
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(async ()=>{
    await doRefresh();
    await checkVersion();
  }, AUTO_REFRESH_MS);
  checkVersion(); // also start notifier loop immediately
}

function init() {
  let deviceId = st.get(KEY_DEVICE, null);
  if (!deviceId) { deviceId = uuidv4(); st.set(KEY_DEVICE, deviceId); }
  const token = st.get(KEY_TOKEN, null);
  if (token) showMain();
  else { setVisible(gateEl, true); setVisible(mainEl, false); }
}

// Events
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
  } catch {
    gateMsg.textContent='Network error.';
    redeemBtn.disabled=false;
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

window.addEventListener('load', init);

