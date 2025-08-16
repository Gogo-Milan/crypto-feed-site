<script>
// ===== SITE APP (unlocks + feed + toast, beep, OS notifications, JSONP fallback) =====
const BACKEND_BASE    = "https://script.google.com/macros/s/AKfycbxYykjZ0s5IkolkWDD5PzpNeHnTUzBSu0IaJ73-S7zxjpptBFWtX2-AZZgHT_8uY78u/exec";
const AUTO_REFRESH_MS = 2 * 60 * 1000;  // refresh data + check version

const KEY_TOKEN  = 'auth_token';
const KEY_DEVICE = 'device_id';
const KEY_VER    = 'last_version_cache'; // remember last versions across reloads
const KEY_NOTI   = 'notify_enabled';     // remember if user ok'd notifications
const KEY_AUDIO  = 'audio_unlocked';     // remember if user interacted for audio
const KEY_THEME  = 'theme_pref';         // 'light' | 'dark'

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

// ---- storage (localStorage for site) ----
const st = {
  get(k, def=null) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch { return def; } },
  set(k, v)        { localStorage.setItem(k, JSON.stringify(v)); }
};

// ---- utils ----
function setVisible(el, vis) { el.classList.toggle('hidden', !vis); }
function h(txt) { const d=document.createElement('div'); d.textContent=txt??''; return d.innerHTML; }
function fmtDate(dt){ const d=new Date(dt); return isNaN(d)?'':d.toLocaleString(); }
function uuidv4(){ return (crypto.randomUUID ? crypto.randomUUID() :
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c=>{
    const r=Math.random()*16|0,v=c==='x'?r:(r&0x3|0x8); return v.toString(16);
  })); }

// --- theme helpers ---
function applyTheme(theme) {
  const isDark = theme === 'dark';
  document.body.classList.toggle('dark', isDark);
  if (darkToggle) darkToggle.textContent = isDark ? '☀️' : '🌙';
}
function loadTheme() {
  const t = st.get(KEY_THEME, 'light');
  applyTheme(t);
}
function toggleTheme() {
  const next = document.body.classList.contains('dark') ? 'light' : 'dark';
  st.set(KEY_THEME, next);
  applyTheme(next);
}

// ---- network helpers (robust fetch + JSONP fallback) ----
async function fetchJSON(url) {
  const res = await fetch(url, { credentials: 'omit' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}
function jsonp(url) {
  return new Promise((resolve, reject) => {
    const cb = '__cb' + Math.random().toString(36).slice(2);
    const sep = url.includes('?') ? '&' : '?';
    const s = document.createElement('script');
    s.src = url + sep + 'callback=' + cb;
    s.async = true;

    const timer = setTimeout(() => { cleanup(); reject(new Error('JSONP timeout')); }, 10000);
    function cleanup() { clearTimeout(timer); try { delete window[cb]; } catch {} s.remove(); }

    window[cb] = (data) => { cleanup(); resolve(data); };
    s.onerror = () => { cleanup(); reject(new Error('JSONP load error')); };

    document.head.appendChild(s);
  });
}

// ---- API (with fallbacks) ----
async function apiRedeem(code, deviceId) {
  const url = BACKEND_BASE + `?path=redeem&code=${encodeURIComponent(code)}&deviceId=${encodeURIComponent(deviceId)}&t=${Date.now()}`;
  try { return await fetchJSON(url); }
  catch (err) { console.error('redeem fetch failed, trying JSONP:', err); return await jsonp(url); }
}
async function apiFeed(type, token) {
  const url = BACKEND_BASE + `?path=feed&type=${encodeURIComponent(type)}&token=${encodeURIComponent(token)}&t=${Date.now()}`;
  try { return await fetchJSON(url); }
  catch (err) { console.warn('feed fetch failed, trying JSONP:', err); return await jsonp(url); }
}
async function apiVersion() {
  const url = BACKEND_BASE + `?path=version&t=${Date.now()}`;
  try { return await fetchJSON(url); }
  catch (err) { console.warn('version fetch failed, trying JSONP:', err); return await jsonp(url); }
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

// ---- toast + beep ----
function showToast(msg) { if (!toastEl) return; toastEl.textContent = msg; toastEl.style.display = 'block'; setTimeout(()=> toastEl.style.display='none', 4000); }
function audioUnlocked() { return !!st.get(KEY_AUDIO, false); }
function unlockAudioOnce() {
  if (audioUnlocked()) return;
  try {
    const ctx = new (window.AudioContext||window.webkitAudioContext)();
    const o=ctx.createOscillator(), g=ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    g.gain.value = 0; o.start(); o.stop(ctx.currentTime + 0.01);
    st.set(KEY_AUDIO, true);
  } catch {}
}
function beep() {
  if (!audioUnlocked()) return;
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

// ---- Web Notifications (native OS popups) ----
function notifyEnabled() { return st.get(KEY_NOTI, false) === true; }
async function ensureNotifyPermission() {
  if (notifyEnabled()) return true;
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') { st.set(KEY_NOTI, true); return true; }
  if (Notification.permission === 'denied')  { return false; }
  try { const res = await Notification.requestPermission(); const ok = (res === 'granted'); st.set(KEY_NOTI, ok); return ok; }
  catch { return false; }
}
function webNotify(title, body) {
  if (!notifyEnabled() || !('Notification' in window) || Notification.permission!=='granted') return;
  try { new Notification(title, { body, icon: 'icon.png' }); } catch {}
}

// ---- version notifier ----
let lastVersion = st.get(KEY_VER, { news_orders:0, signals:0, announcements:0 });
let firstRun = (lastVersion.news_orders===0 && lastVersion.signals===0 && lastVersion.announcements===0);
function saveVersionCache(v) { st.set(KEY_VER, v); lastVersion = v; }

async function checkVersionAndNotify() {
  try {
    const v = await apiVersion();
    if (firstRun) { saveVersionCache(v); firstRun = false; return; }
    ['news_orders','signals','announcements'].forEach(k=>{
      if (v[k] && v[k] > (lastVersion[k]||0)) {
        const pretty = k.replace('_',' / ');
        showToast(`New update in ${pretty}`);
        beep();
        webNotify('Crypto Private Feed', `New ${pretty} posted`);
      }
    });
    saveVersionCache(v);
  } catch (e) { console.warn('checkVersionAndNotify failed:', e); }
}

// ---- data fetch flow ----
async function doRefresh() {
  const token = st.get(KEY_TOKEN, null);
  if (!token) return;
  try {
    const [news, sig, ann] = await Promise.all([
      apiFeed('news_orders', token),
      apiFeed('signals', token),
      apiFeed('announcements', token).catch(()=>({items:[]})) // ok if sheet missing
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
  await checkVersionAndNotify();
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(async ()=>{ await doRefresh(); await checkVersionAndNotify(); }, AUTO_REFRESH_MS);
}

function init() {
  let deviceId = st.get(KEY_DEVICE, null);
  if (!deviceId) { deviceId = uuidv4(); st.set(KEY_DEVICE, deviceId); }

  // Theme at startup
  loadTheme();
  darkToggle?.addEventListener('click', toggleTheme);

  // Unlock audio + ask notif permission once after first interaction
  const oneTimeInteract = () => {
    unlockAudioOnce();
    ensureNotifyPermission();
    window.removeEventListener('click', oneTimeInteract);
    window.removeEventListener('keydown', oneTimeInteract);
    window.removeEventListener('touchstart', oneTimeInteract, {passive:true});
  };
  window.addEventListener('click', oneTimeInteract);
  window.addEventListener('keydown', oneTimeInteract);
  window.addEventListener('touchstart', oneTimeInteract, {passive:true});

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
document.addEventListener('visibilitychange', ()=>{ if (!document.hidden) { doRefresh(); checkVersionAndNotify(); } });

window.addEventListener('load', init);

// --- test notification button (dev only) ---
document.getElementById('testNotify')?.addEventListener('click', async () => {
  try {
    if (Notification.permission !== 'granted') {
      await Notification.requestPermission();
    }
    if (Notification.permission === 'granted') {
      new Notification("Crypto Private Feed", {
        body: "This is a test notification 🔔",
        icon: "icon.png"
      });
    } else {
      alert("Notifications are blocked in your browser.");
    }
  } catch (e) {
    console.error('testNotify error:', e);
  }
});
</script>
