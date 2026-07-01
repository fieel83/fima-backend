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
    *{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 20% 0,#6b32c633,transparent 34%),#08050d;color:#f8f3ff;font:15px Inter,Segoe UI,sans-serif}
    main{width:min(1120px,calc(100% - 32px));margin:32px auto}.hero,.card{border:1px solid #7754a966;background:#100a18e8;border-radius:16px;box-shadow:0 22px 70px #0008}
    .hero{padding:28px}.badge{color:#d8adff;font-weight:900;text-transform:uppercase;letter-spacing:.12em}h1{font-size:38px;margin:8px 0}.muted{color:#b9a9cd}
    .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px;margin-top:14px}.card{padding:20px}h2{margin:0 0 12px;font-size:20px}
    label{display:block;margin:12px 0 6px;font-weight:800}input,textarea,button,a.button{width:100%;border-radius:10px;border:1px solid #69479a;background:#0a0710;color:#fff;padding:12px;font:inherit}
    textarea{min-height:110px}button,a.button{display:block;text-align:center;text-decoration:none;margin-top:12px;background:linear-gradient(135deg,#9b5cff,#5f2de0);font-weight:900;cursor:pointer}
    pre{white-space:pre-wrap;word-break:break-word;color:#d7c9f7}.ok{color:#62e6a7}.error{color:#ff8297}
  </style>
</head>
<body>
<main>
  <section class="hero"><div class="badge">Owner-only • Discord verified</div><h1>Paradise Bot Console</h1><p class="muted">Guild setup, command channels, quotas, mainer code and safe bot installation. This page never exposes the bot token.</p></section>
  <section class="grid">
    <article class="card"><h2>Bot installation</h2><p class="muted">Administrator is intended for isolated setup/testing. Use least privilege for production.</p><a class="button" href="${invite}" rel="noopener">Invite Paradise</a></article>
    <article class="card"><h2>Mainer configuration</h2><label for="mainer">Official code</label><input id="mainer" maxlength="32"><button data-save="mainer">Save code</button></article>
    <article class="card"><h2>Weekly quotas</h2><p class="muted">JSON object: role → activity key/minimum.</p><textarea id="quotas"></textarea><button data-save="quotas">Save quotas</button></article>
    <article class="card"><h2>Command channels</h2><p class="muted">JSON object: command → channel ID array.</p><textarea id="channels"></textarea><button data-save="channels">Save restrictions</button></article>
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
  status.className='ok';status.textContent=JSON.stringify(j.summary,null,2);
}
async function save(kind){
  let value;
  try{value=kind==='mainer'?document.getElementById('mainer').value:JSON.parse(document.getElementById(kind==='quotas'?'quotas':'channels').value||'{}')}
  catch{status.className='error';status.textContent='Invalid JSON';return}
  const r=await fetch('/api/paradise/config',{method:'PATCH',credentials:'same-origin',headers:{'content-type':'application/json','x-paradise-owner-action':'1'},body:JSON.stringify({kind,value})});
  const j=await r.json();status.className=r.ok?'ok':'error';status.textContent=JSON.stringify(j,null,2);if(r.ok)await load();
}
document.querySelectorAll('[data-save]').forEach(b=>b.onclick=()=>save(b.dataset.save));document.getElementById('refresh').onclick=load;load();
</script>
</body></html>`;
}
