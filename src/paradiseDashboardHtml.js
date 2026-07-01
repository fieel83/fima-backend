export function paradiseDashboardHtml({ clientId }) {
  const invite = `https://discord.com/oauth2/authorize?client_id=${encodeURIComponent(clientId || "")}&permissions=8&scope=bot%20applications.commands`;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,nofollow,noarchive">
  <title>Paradise Owner Console</title>
  <style>
    :root{--brand:#000000;--brand-soft:#ffffff12}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 20% 0,var(--brand-soft),transparent 34%),#08050d;color:#f8f3ff;font:15px Inter,Segoe UI,sans-serif}
    main{width:min(1120px,calc(100% - 32px));margin:32px auto}.hero,.card{border:1px solid color-mix(in srgb,var(--brand) 46%,transparent);background:#100a18e8;border-radius:16px;box-shadow:0 22px 70px #0008}
    .hero{padding:28px;border-left:5px solid var(--brand)}.badge{color:color-mix(in srgb,var(--brand) 60%,white);font-weight:900;text-transform:uppercase;letter-spacing:.12em}h1{font-size:38px;margin:8px 0}.muted{color:#b9a9cd}
    .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px;margin-top:14px}.card{padding:20px}h2{margin:0 0 12px;font-size:20px}
    label{display:block;margin:12px 0 6px;font-weight:800}input,textarea,button,a.button{width:100%;border-radius:10px;border:1px solid color-mix(in srgb,var(--brand) 58%,#111);background:#0a0710;color:#fff;padding:12px;font:inherit}
    textarea{min-height:110px}button,a.button{display:block;text-align:center;text-decoration:none;margin-top:12px;background:linear-gradient(135deg,var(--brand),#28242d);border:1px solid #514b59;font-weight:900;cursor:pointer}
    button,a.button{background:linear-gradient(135deg,var(--brand),color-mix(in srgb,var(--brand) 62%,#13002e))}.color-row{display:grid;grid-template-columns:72px 1fr;gap:10px;align-items:center}.color-row input[type=color]{height:48px;padding:4px;cursor:pointer}.swatch{height:6px;border-radius:99px;background:var(--brand);margin:12px 0}
    pre{white-space:pre-wrap;word-break:break-word;color:#d7c9f7}.ok{color:#62e6a7}.error{color:#ff8297}
  </style>
</head>
<body>
<main>
  <section class="hero"><div class="badge">Owner-only • Discord verified</div><h1>Paradise Bot Console</h1><p class="muted">Guild setup, command channels, quotas, mainer code and safe bot installation. This page never exposes the bot token.</p></section>
  <section class="grid">
    <article class="card"><h2>Bot installation</h2><p class="muted">Administrator is intended for isolated setup/testing. Use least privilege for production.</p><a class="button" href="${invite}" rel="noopener">Invite Paradise</a></article>
    <article class="card"><h2>Embed appearance</h2><p class="muted">Controls the colored stripe on Paradise embeds. Use a six-digit HEX color.</p><div class="swatch"></div><div class="color-row"><input id="brandPicker" type="color" value="#000000" aria-label="Brand color"><input id="brandHex" maxlength="7" value="#000000" spellcheck="false"></div><button data-save="branding">Save color</button></article>
    <article class="card"><h2>Mainer configuration</h2><label for="mainer">Official code</label><input id="mainer" maxlength="32"><button data-save="mainer">Save code</button></article>
    <article class="card"><h2>Weekly quotas</h2><p class="muted">JSON object: role → activity key/minimum.</p><textarea id="quotas"></textarea><button data-save="quotas">Save quotas</button></article>
    <article class="card"><h2>Command channels</h2><p class="muted">JSON object: command → channel ID array.</p><textarea id="channels"></textarea><button data-save="channels">Save restrictions</button></article>
    <article class="card"><h2>Activity automation</h2><label><input id="autoChecks" type="checkbox" style="width:auto"> 48-hour automatic checks</label><label><input id="autoRemoval" type="checkbox" style="width:auto"> Remove related roles after missed 24-hour deadline</label><button data-save="automation">Save automation</button></article>
    <article class="card"><h2>Runtime state</h2><pre id="status">Loading…</pre><button id="refresh">Refresh</button></article>
  </section>
</main>
<script>
const status=document.getElementById('status');
async function load(){
  const r=await fetch('/api/paradise/config',{credentials:'same-origin'});const j=await r.json();
  if(!r.ok){status.className='error';status.textContent=j.error||'Failed';return}
  document.getElementById('mainer').value=j.config.mainerCode||'';
  document.getElementById('quotas').value=JSON.stringify(j.config.weeklyQuotas||{},null,2);
  document.getElementById('channels').value=JSON.stringify(j.config.commandChannels||{},null,2);
  document.getElementById('autoChecks').checked=j.config.autoActivityChecks===true;
  document.getElementById('autoRemoval').checked=j.config.autoActivityRoleRemoval===true;
  const brand=/^#[0-9a-f]{6}$/i.test(j.config.brandColor||'')?j.config.brandColor.toUpperCase():'#000000';
  document.getElementById('brandPicker').value=brand.toLowerCase();document.getElementById('brandHex').value=brand;applyBrand(brand);
  status.className='ok';status.textContent=JSON.stringify(j.summary,null,2);
}
function applyBrand(value){document.documentElement.style.setProperty('--brand',value);document.documentElement.style.setProperty('--brand-soft',value+'33')}
async function save(kind){
  let value;
  try{value=kind==='mainer'?document.getElementById('mainer').value:kind==='branding'?document.getElementById('brandHex').value:kind==='automation'?{autoActivityChecks:document.getElementById('autoChecks').checked,autoActivityRoleRemoval:document.getElementById('autoRemoval').checked}:JSON.parse(document.getElementById(kind==='quotas'?'quotas':'channels').value||'{}')}
  catch{status.className='error';status.textContent='Invalid JSON';return}
  const r=await fetch('/api/paradise/config',{method:'PATCH',credentials:'same-origin',headers:{'content-type':'application/json','x-paradise-owner-action':'1'},body:JSON.stringify({kind,value})});
  const j=await r.json();status.className=r.ok?'ok':'error';status.textContent=JSON.stringify(j,null,2);if(r.ok)await load();
}
document.getElementById('brandPicker').oninput=e=>{const value=e.target.value.toUpperCase();document.getElementById('brandHex').value=value;applyBrand(value)};
document.getElementById('brandHex').oninput=e=>{if(/^#[0-9a-f]{6}$/i.test(e.target.value)){document.getElementById('brandPicker').value=e.target.value;applyBrand(e.target.value)}};
document.querySelectorAll('[data-save]').forEach(b=>b.onclick=()=>save(b.dataset.save));document.getElementById('refresh').onclick=load;load();
</script>
</body></html>`;
}
