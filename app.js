<script>
const BACKEND_BASE = "YOUR_APPS_SCRIPT_WEB_URL/exec"; // same one the site uses
const PING_MS = 30000; // 30 seconds
let lastVersion = { news_orders:0, signals:0, announcements:0 };

function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = 'sine'; o.frequency.value = 880;
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.15);
    o.start(); o.stop(ctx.currentTime + 0.16);
  } catch {}
}

function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.style.display = 'block';
  setTimeout(()=> el.style.display = 'none', 4000);
}

async function checkVersion() {
  try {
    const r = await fetch(BACKEND_BASE + "?path=version");
    const v = await r.json();
    ['news_orders','signals','announcements'].forEach(k => {
      if (v[k] && v[k] > (lastVersion[k]||0)) {
        showToast(`New update in ${k.replace('_',' / ')}`);
        beep();
      }
    });
    lastVersion = v;
  } catch (e) {
    // silent
  }
}

window.addEventListener('load', () => {
  checkVersion();                   // initial
  setInterval(checkVersion, PING_MS);
});
</script>
