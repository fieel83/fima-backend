export function loginPage(error = "") {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Fima Admin Login</title>
  <style>
    *{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:radial-gradient(circle at 20% 0%,#40207855,transparent 38%),linear-gradient(180deg,#070510,#05040b);color:#f8f3ff;font-family:Inter,Segoe UI,sans-serif}
    form{width:min(440px,calc(100vw - 32px));padding:30px;border:1px solid #6e55a055;border-radius:10px;background:linear-gradient(145deg,#171027ee,#090611f5);box-shadow:0 24px 90px #000a,0 0 48px #8b5cff22}
    h1{margin:0 0 10px;font-size:32px;line-height:1}.muted{color:#b9a9cd}.mark{display:inline-grid;place-items:center;width:42px;height:42px;margin-bottom:18px;border-radius:9px;background:linear-gradient(135deg,#d7a6ff,#53d6ff);color:#090611;font-weight:950}
    label{display:block;margin:22px 0 8px;font-weight:900}input,button{width:100%;height:48px;border-radius:8px;font:inherit}input{padding:0 13px;color:#fff;background:#090612;border:1px solid #493560}
    button{margin-top:14px;border:0;font-weight:950;background:linear-gradient(135deg,#d7a6ff,#53d6ff);color:#090611;cursor:pointer}.error{padding:10px 12px;border:1px solid #ff7b9366;border-radius:8px;background:#40101a;color:#ff9caf}
  </style>
</head>
<body>
  <form method="post" action="/admin/login">
    <div class="mark">FM</div>
    <h1>Fima Admin</h1>
    <p class="muted">Sales, licenses, downloads and security.</p>
    ${error ? `<p class="error">${escapeHtml(error)}</p>` : ""}
    <label for="password">Admin password</label>
    <input id="password" name="password" type="password" autocomplete="current-password" required>
    <button type="submit">Login</button>
  </form>
</body>
</html>`;
}

export function adminPage() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Fima Macro Admin</title>
  <style>
    :root{--bg:#06050c;--panel:#110c1c;--panel2:#171026;--line:#6e55a033;--text:#f8f3ff;--muted:#b8aacb;--faint:#756a88;--primary:#b477ff;--accent:#53d6ff;--good:#72f0c4;--bad:#ff7b93;--warn:#ffd66f;--radius:8px}
    *{box-sizing:border-box}body{margin:0;color:var(--text);font-family:Inter,Segoe UI,sans-serif;background:radial-gradient(circle at 12% 0%,#5f2db244,transparent 34%),radial-gradient(circle at 90% 8%,#35cce833,transparent 28%),linear-gradient(180deg,#080713,#05040a);line-height:1.45}
    button,input,select,textarea{font:inherit}button{cursor:pointer}code{font-family:Consolas,monospace;color:#dcb8ff}
    .layout{min-height:100vh;display:grid;grid-template-columns:250px minmax(0,1fr)}
    aside{position:sticky;top:0;height:100vh;padding:18px;border-right:1px solid #ffffff12;background:#080611e8;backdrop-filter:blur(18px)}
    .brand{display:flex;align-items:center;gap:12px;margin-bottom:22px}.brand-mark{display:grid;place-items:center;width:40px;height:40px;border-radius:9px;background:linear-gradient(135deg,var(--primary),var(--accent));color:#070510;font-weight:950}.brand strong{display:block}.brand span{color:var(--muted);font-size:12px}
    .nav{display:grid;gap:7px}.nav button{height:42px;padding:0 12px;border:1px solid transparent;border-radius:var(--radius);background:transparent;color:var(--muted);text-align:left;font-weight:850}.nav button:hover,.nav button.active{color:var(--text);border-color:var(--line);background:linear-gradient(135deg,#a25cff22,#ffffff08)}
    .logout{position:absolute;left:18px;right:18px;bottom:18px}.logout button,.btn{height:40px;padding:0 13px;border:1px solid var(--line);border-radius:var(--radius);background:#ffffff0a;color:var(--text);font-weight:850}.btn.primary{border:0;color:#070510;background:linear-gradient(135deg,#d7a6ff,#53d6ff)}.btn.danger{border-color:#ff7b9366;background:#3a111c}.btn.good{border-color:#72f0c466;background:#103527}.btn:disabled{opacity:.55;cursor:not-allowed}
    main{min-width:0;padding:22px}.topbar{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:18px}.topbar h1{margin:0;font-size:30px;line-height:1}.topbar p{margin:4px 0 0;color:var(--muted)}
    .panel{border:1px solid var(--line);border-radius:10px;background:linear-gradient(145deg,#ffffff09,#ffffff03),#0d0917;box-shadow:0 18px 60px #0006}.panel-pad{padding:16px}.section{display:none}.section.active{display:grid;gap:16px}
    .cards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.card{padding:15px;border:1px solid var(--line);border-radius:var(--radius);background:linear-gradient(135deg,#a25cff18,#53d6ff0a),#0f0a19}.card span{display:block;color:var(--faint);font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:.06em}.card strong{display:block;margin-top:7px;font-size:24px}
    .grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px}.grid3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.filters{display:grid;grid-template-columns:2fr repeat(4,minmax(130px,1fr));gap:8px;margin-bottom:12px}
    input,select,textarea{width:100%;min-height:40px;padding:0 11px;color:var(--text);border:1px solid var(--line);border-radius:var(--radius);background:#070510}textarea{min-height:92px;padding:10px;resize:vertical}
    table{width:100%;border-collapse:collapse}th,td{padding:11px 10px;border-bottom:1px solid #ffffff10;text-align:left;vertical-align:top;font-size:13px}th{color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.05em}td .muted{font-size:12px}.status{display:inline-flex;min-height:24px;align-items:center;padding:0 8px;border-radius:999px;font-size:12px;font-weight:900}.status.active,.status.valid,.status.success,.status.live{background:#12392d;color:var(--good)}.status.banned,.status.failed{background:#3b101c;color:var(--bad)}.status.inactive,.status.expired,.status.test{background:#3f3211;color:var(--warn)}
    .actions{display:flex;flex-wrap:wrap;gap:6px}.actions .btn{height:32px;padding:0 9px;font-size:12px}.empty{padding:22px;border:1px dashed var(--line);border-radius:var(--radius);color:var(--muted);text-align:center}.loading{color:var(--muted)}.bars{display:grid;gap:8px}.bar{display:grid;grid-template-columns:110px 1fr 64px;gap:10px;align-items:center}.bar-track{height:9px;border-radius:999px;background:#ffffff12;overflow:hidden}.bar-fill{height:100%;border-radius:999px;background:linear-gradient(90deg,var(--primary),var(--accent))}
    .modal{position:fixed;inset:0;display:none;place-items:center;padding:18px;background:#05030bcc;z-index:20}.modal.show{display:grid}.dialog{width:min(880px,100%);max-height:88vh;overflow:auto}.detail{white-space:pre-wrap;color:var(--muted);font-size:13px}
    @media(max-width:1050px){.layout{grid-template-columns:1fr}aside{position:relative;height:auto}.logout{position:static;margin-top:14px}.cards{grid-template-columns:repeat(2,1fr)}.grid2,.grid3,.filters{grid-template-columns:1fr}.hide-sm{display:none}}
    @media(max-width:560px){main{padding:14px}.cards{grid-template-columns:1fr}.topbar{align-items:flex-start;flex-direction:column}th,td{font-size:12px;padding:9px 7px}.brand span{display:none}}
  </style>
</head>
<body>
  <div class="layout">
    <aside>
      <div class="brand"><div class="brand-mark">FM</div><div><strong>Fima Macro</strong><span>Admin Control</span></div></div>
      <div class="nav" id="nav"></div>
      <form class="logout" method="post" action="/admin/logout"><button type="submit">Logout</button></form>
    </aside>
    <main>
      <div class="topbar"><div><h1 id="pageTitle">Dashboard</h1><p id="pageSubtitle">Sales, licenses and system health.</p></div><button class="btn primary" onclick="refreshCurrent()">Refresh</button></div>
      <section class="section active" id="dashboard"></section>
      <section class="section" id="orders"></section>
      <section class="section" id="licenses"></section>
      <section class="section" id="customers"></section>
      <section class="section" id="downloads"></section>
      <section class="section" id="settings"></section>
      <section class="section" id="coupons"></section>
      <section class="section" id="analytics"></section>
      <section class="section" id="webhooks"></section>
      <section class="section" id="audit"></section>
      <section class="section" id="tools"></section>
    </main>
  </div>
  <div class="modal" id="modal" onclick="if(event.target===this) closeModal()"><div class="dialog panel panel-pad"><div class="actions" style="justify-content:space-between"><strong id="modalTitle">Details</strong><button class="btn" onclick="closeModal()">Close</button></div><pre class="detail" id="modalBody"></pre></div></div>
  <script>
    const sections = [
      ['dashboard','Dashboard','Revenue, health and recent activity.'],
      ['orders','Orders','Payments, Stripe sessions and customer plans.'],
      ['licenses','Licenses','License keys, HWID, validation and download history.'],
      ['customers','Customers','Emails, spend, orders and notes.'],
      ['downloads','Downloads / Versions','Current manifest, release info and download logs.'],
      ['settings','Site Settings','Public website and checkout switches.'],
      ['coupons','Coupons / Discounts','Manual coupon and promotion-code preparation.'],
      ['analytics','Analytics','Events, validations, downloads and checkout signals.'],
      ['webhooks','Webhook / Stripe Logs','Stripe webhook processing and failures.'],
      ['audit','Security / Audit Logs','Admin actions and system security log.'],
      ['tools','Manual Tools','Create licenses and quick admin actions.']
    ];
    let current = 'dashboard';
    const $ = (id) => document.getElementById(id);
    const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const money = (cents, currency='usd') => new Intl.NumberFormat('en-US',{style:'currency',currency:String(currency||'usd').toUpperCase()}).format((cents||0)/100);
    const date = (v) => v ? new Date(v).toLocaleString() : '-';
    const short = (v,n=18) => !v ? '-' : String(v).length>n ? String(v).slice(0,n)+'...' : String(v);
    const pill = (v) => '<span class="status '+esc(v||'')+'">'+esc(v||'-')+'</span>';
    async function api(path, options={}) {
      const res = await fetch(path,{credentials:'same-origin',headers:{'content-type':'application/json'},...options});
      const data = await res.json().catch(()=>({}));
      if(!res.ok) throw new Error(data.error || data.message || 'Request failed');
      return data;
    }
    function setLoading(id){ $(id).innerHTML='<div class="panel panel-pad loading">Loading...</div>'; }
    function showSectionError(id, error){
      const message = error && error.message ? error.message : 'Request failed';
      $(id).innerHTML='<div class="panel panel-pad"><h3>Admin data could not load</h3><p class="muted">'+esc(message)+'</p><button class="btn primary" onclick="refreshCurrent()">Try again</button></div>';
    }
    function empty(text){ return '<div class="empty">'+esc(text)+'</div>'; }
    function table(headers, rows, emptyText='No records yet.') {
      if(!rows.length) return empty(emptyText);
      return '<div class="panel panel-pad"><table><thead><tr>'+headers.map(h=>'<th>'+esc(h)+'</th>').join('')+'</tr></thead><tbody>'+rows.join('')+'</tbody></table></div>';
    }
    function showModal(title, data){ $('modalTitle').textContent=title; $('modalBody').textContent=typeof data==='string'?data:JSON.stringify(data,null,2); $('modal').classList.add('show'); }
    function closeModal(){ $('modal').classList.remove('show'); }
    function switchTo(id){ current=id; document.querySelectorAll('.section').forEach(s=>s.classList.toggle('active',s.id===id)); document.querySelectorAll('.nav button').forEach(b=>b.classList.toggle('active',b.dataset.id===id)); const meta=sections.find(s=>s[0]===id); $('pageTitle').textContent=meta[1]; $('pageSubtitle').textContent=meta[2]; refreshCurrent(); }
    function refreshCurrent(){
      const loader = ({dashboard:loadDashboard,orders:loadOrders,licenses:loadLicenses,customers:loadCustomers,downloads:loadDownloads,settings:loadSettings,coupons:loadCoupons,analytics:loadAnalytics,webhooks:loadWebhooks,audit:loadAudit,tools:loadTools}[current]);
      Promise.resolve(loader()).catch((error)=>showSectionError(current,error));
    }
    $('nav').innerHTML = sections.map(([id,label]) => '<button data-id="'+id+'" class="'+(id==='dashboard'?'active':'')+'" onclick="switchTo(\\''+id+'\\')">'+label+'</button>').join('');

    async function loadDashboard(){
      setLoading('dashboard'); const d=await api('/admin/api/dashboard');
      const c=d.cards; const cards=[['Total revenue',money(c.totalRevenue)],['Today revenue',money(c.todayRevenue)],['Week revenue',money(c.weekRevenue)],['Month revenue',money(c.monthRevenue)],['Orders',c.totalOrders],['Licenses',c.totalLicenses],['Active licenses',c.activeLicenses],['Expired licenses',c.expiredLicenses],['Banned licenses',c.bannedLicenses],['Lifetime',c.lifetimeLicenses],['Most sold plan',c.mostSoldPlan],['Downloads',c.downloadCount],['Active users 24h',c.activeUsersLast24h],['Failed webhooks',c.failedWebhookCount],['Failed checkouts',c.failedCheckoutCount],['HWID mismatches',c.hwidMismatchCount]];
      $('dashboard').innerHTML='<div class="cards">'+cards.map(x=>'<div class="card"><span>'+esc(x[0])+'</span><strong>'+esc(x[1])+'</strong></div>').join('')+'</div><div class="grid2"><div class="panel panel-pad"><h3>Revenue by day</h3>'+bars(d.charts.revenueByDay.map(x=>[x.date,money(x.revenue),x.revenue]))+'</div><div class="panel panel-pad"><h3>Orders by plan</h3>'+bars(Object.entries(d.charts.ordersByPlan||{}).map(([k,v])=>[k,v,v]))+'</div></div><div class="grid2">'+recentOrders(d.recentPurchases)+recentValidations(d.recentValidations)+'</div>';
    }
    function bars(items){ const max=Math.max(1,...items.map(x=>Number(x[2]||0))); return '<div class="bars">'+items.map(x=>'<div class="bar"><span>'+esc(x[0])+'</span><div class="bar-track"><div class="bar-fill" style="width:'+Math.max(4,Math.round((Number(x[2]||0)/max)*100))+'%"></div></div><strong>'+esc(x[1])+'</strong></div>').join('')+'</div>'; }
    function recentOrders(rows){ return '<div class="panel panel-pad"><h3>Recent purchases</h3>'+table(['Email','Plan','Amount','License'],rows.map(o=>'<tr><td>'+esc(o.customerEmail)+'</td><td>'+esc(o.plan)+'</td><td>'+money(o.amount,o.currency)+'</td><td><code>'+esc(o.license?.licenseKey||'-')+'</code></td></tr>'),'No purchases yet.')+'</div>'; }
    function recentValidations(rows){ return '<div class="panel panel-pad"><h3>Recent validations</h3>'+table(['License','Result','Reason','App'],rows.map(v=>'<tr><td><code>'+esc(short(v.licenseKey,18))+'</code></td><td>'+pill(v.result)+'</td><td>'+esc(v.reason||'-')+'</td><td>'+esc(v.appVersion||'-')+'</td></tr>'),'No validation logs yet.')+'</div>'; }

    async function loadOrders(){ setLoading('orders'); $('orders').innerHTML=filters('orders') + '<div id="ordersTable"></div>'; await refreshOrdersTable(); }
    function filters(kind){ return '<div class="panel panel-pad"><div class="filters"><input id="'+kind+'Search" placeholder="Search email, license or Stripe ID"><select id="'+kind+'Plan"><option value="">All plans</option><option>2weeks</option><option>1month</option><option>3months</option><option>lifetime</option></select><select id="'+kind+'Status"><option value="">All statuses</option><option>active</option><option>inactive</option><option>banned</option><option>paid</option><option>unpaid</option></select><select id="'+kind+'Mode"><option value="">Any mode</option><option>live</option><option>test</option></select><button class="btn primary" onclick="refresh'+kind[0].toUpperCase()+kind.slice(1)+'Table()">Search</button></div></div>'; }
    async function refreshOrdersTable(){ const q=new URLSearchParams({search:ordersSearch.value,plan:ordersPlan.value,status:ordersStatus.value,mode:ordersMode.value}); const d=await api('/admin/api/orders?'+q); $('ordersTable').outerHTML='<div id="ordersTable">'+table(['Email','Plan','Amount','Mode','Status','Stripe Session','License','Actions'],d.orders.map(o=>'<tr><td>'+esc(o.customerEmail)+'</td><td>'+esc(o.plan)+'</td><td>'+money(o.amount,o.currency)+'</td><td>'+pill(o.mode)+'</td><td>'+esc(o.status)+'</td><td><code>'+esc(short(o.stripeSessionId,22))+'</code></td><td><code>'+esc(short(o.license?.licenseKey,18))+'</code></td><td><button class="btn" onclick="detail(\\'/admin/api/orders/'+o.id+'\\',\\'Order\\')">View</button></td></tr>'),'No orders yet.')+'</div>'; }

    async function loadLicenses(){ setLoading('licenses'); $('licenses').innerHTML=filters('licenses') + '<div id="licensesTable"></div>'; await refreshLicensesTable(); }
    async function refreshLicensesTable(){ const q=new URLSearchParams({search:licensesSearch.value,plan:licensesPlan.value,status:licensesStatus.value}); const d=await api('/admin/api/licenses?'+q); $('licensesTable').outerHTML='<div id="licensesTable">'+table(['License','Email','Plan','Status','Expires','HWID','Counts','Actions'],d.licenses.map(l=>'<tr><td><code>'+esc(l.licenseKey)+'</code></td><td>'+esc(l.customerEmail)+'</td><td>'+esc(l.plan)+'</td><td>'+pill(l.status)+'</td><td>'+esc(l.lifetime?'Never':date(l.expiresAt))+'</td><td>'+esc(short(l.hwid||'not locked',18))+'</td><td>V '+esc(l.validationCount||0)+' / D '+esc(l.downloadCount||0)+'</td><td class="actions"><button class="btn" onclick="copyText(\\''+esc(l.licenseKey)+'\\')">Copy</button><button class="btn" onclick="detail(\\'/admin/api/licenses/'+l.id+'\\',\\'License\\')">View</button><button class="btn" onclick="post(\\'/admin/api/licenses/'+l.id+'/reset-hwid\\',{}).then(refreshLicensesTable)">Reset</button><button class="btn good" onclick="post(\\'/admin/api/licenses/'+l.id+'/status\\',{status:\\'active\\'}).then(refreshLicensesTable)">Unban</button><button class="btn danger" onclick="post(\\'/admin/api/licenses/'+l.id+'/status\\',{status:\\'banned\\'}).then(refreshLicensesTable)">Ban</button></td></tr>'),'No licenses yet.')+'</div>'; }

    async function loadCustomers(){ setLoading('customers'); const d=await api('/admin/api/customers'); $('customers').innerHTML=table(['Email','Orders','Spent','First purchase','Last purchase','Notes','Actions'],d.customers.map(c=>'<tr><td>'+esc(c.email)+'</td><td>'+esc(c.totalOrders)+'</td><td>'+money(c.totalSpent)+'</td><td>'+date(c.firstPurchaseAt)+'</td><td>'+date(c.lastPurchaseAt)+'</td><td>'+esc(short(c.notes||'-',28))+'</td><td><button class="btn" onclick="detail(\\'/admin/api/customers/'+encodeURIComponent(c.email)+'\\',\\'Customer\\')">View</button></td></tr>'),'No customers yet.'); }
    async function loadDownloads(){ setLoading('downloads'); const d=await api('/admin/api/downloads'); const c=d.current; window.latestManifestPreview=c.manifest||{}; $('downloads').innerHTML='<div class="grid3"><div class="card"><span>Source</span><strong>'+esc(c.source)+'</strong></div><div class="card"><span>Version</span><strong>'+esc(c.version||'Unknown')+'</strong></div><div class="card"><span>File</span><strong>'+esc(c.fileName||'Fallback')+'</strong></div></div><div class="panel panel-pad"><h3>Download URL</h3><code>'+esc(c.downloadUrl)+'</code><h3>Release notes</h3><p class="muted">'+esc(c.releaseNotes||'No release notes in manifest.')+'</p><button class="btn" onclick="showModal(\\'latest.json\\',window.latestManifestPreview)">View manifest JSON</button></div>'+table(['License','Result','Reason','Version','Created'],d.recent.map(r=>'<tr><td><code>'+esc(short(r.licenseKey,20))+'</code></td><td>'+pill(r.result)+'</td><td>'+esc(r.reason||'-')+'</td><td>'+esc(r.version||'-')+'</td><td>'+date(r.createdAt)+'</td></tr>'),'No download logs yet.'); }
    async function loadSettings(){ setLoading('settings'); const d=await api('/admin/api/settings'); const s=d.settings; $('settings').innerHTML='<div class="panel panel-pad"><div class="grid2"><label>Discord invite URL<input id="setDiscord" value="'+esc(s.discordInviteUrl||'')+'"></label><label>Support email<input id="setSupport" value="'+esc(s.supportEmail||'')+'"></label><label>Brand name<input id="setBrand" value="'+esc(s.brandName||'')+'"></label><label>Announcement<input id="setBanner" value="'+esc(s.announcementBannerText||'')+'"></label></div><div class="grid3"><label><input type="checkbox" id="setMaintenance" '+(s.maintenanceMode?'checked':'')+'> Maintenance mode</label><label><input type="checkbox" id="setBannerOn" '+(s.announcementBannerEnabled?'checked':'')+'> Banner enabled</label><label><input type="checkbox" id="setPricing" '+(s.pricingVisible?'checked':'')+'> Pricing visible</label><label><input type="checkbox" id="setCheckout" '+(s.checkoutEnabled?'checked':'')+'> Checkout enabled</label><label><input type="checkbox" id="setDownload" '+(s.downloadEnabled?'checked':'')+'> Download enabled</label></div><button class="btn primary" onclick="saveSettings()">Save settings</button></div>'; }
    async function saveSettings(){ await post('/admin/api/settings',{discordInviteUrl:setDiscord.value,supportEmail:setSupport.value,brandName:setBrand.value,announcementBannerText:setBanner.value,maintenanceMode:setMaintenance.checked,announcementBannerEnabled:setBannerOn.checked,pricingVisible:setPricing.checked,checkoutEnabled:setCheckout.checked,downloadEnabled:setDownload.checked}); loadSettings(); }
    async function loadCoupons(){ setLoading('coupons'); const d=await api('/admin/api/coupons'); $('coupons').innerHTML='<div class="panel panel-pad"><div class="grid3"><input id="couponCode" placeholder="Code"><input id="couponPromo" placeholder="Stripe promotion code ID"><input id="couponPercent" placeholder="Percent off"></div><button class="btn primary" onclick="saveCoupon()">Save coupon</button></div>'+table(['Code','Stripe promo','Percent','Amount','Active','Expiry','Notes'],d.coupons.map(c=>'<tr><td>'+esc(c.code)+'</td><td>'+esc(c.stripePromotionCodeId||'-')+'</td><td>'+esc(c.percentOff||'-')+'</td><td>'+esc(c.amountOff||'-')+'</td><td>'+pill(c.active?'active':'inactive')+'</td><td>'+date(c.expiresAt)+'</td><td>'+esc(c.notes||'-')+'</td></tr>'),'No coupons yet.'); }
    async function saveCoupon(){ await post('/admin/api/coupons',{code:couponCode.value,stripePromotionCodeId:couponPromo.value,percentOff:couponPercent.value}); loadCoupons(); }
    async function loadAnalytics(){ setLoading('analytics'); const d=await api('/admin/api/analytics'); $('analytics').innerHTML='<div class="grid2"><div class="panel panel-pad"><h3>Events by type</h3>'+bars(Object.entries(d.byType||{}).map(([k,v])=>[k,v,v]))+'</div><div class="panel panel-pad"><h3>Events by plan</h3>'+bars(Object.entries(d.byPlan||{}).map(([k,v])=>[k,v,v]))+'</div></div>'+table(['Type','Plan','Amount','Mode','Created'],d.events.slice(0,100).map(e=>'<tr><td>'+esc(e.type)+'</td><td>'+esc(e.plan||'-')+'</td><td>'+esc(e.amount?money(e.amount,e.currency):'-')+'</td><td>'+esc(e.mode||'-')+'</td><td>'+date(e.createdAt)+'</td></tr>'),'No analytics events yet.'); }
    async function loadWebhooks(){ setLoading('webhooks'); const d=await api('/admin/api/webhooks'); $('webhooks').innerHTML=table(['Event','Type','Processed','Error','Order','License','Created'],d.events.map(e=>'<tr><td><code>'+esc(short(e.stripeEventId,24))+'</code></td><td>'+esc(e.type)+'</td><td>'+pill(e.processed?'success':'failed')+'</td><td>'+esc(e.errorMessage||'-')+'</td><td>'+esc(short(e.relatedOrderId,12))+'</td><td>'+esc(short(e.relatedLicenseId,12))+'</td><td>'+date(e.createdAt)+'</td></tr>'),'No webhook events yet.'); }
    async function loadAudit(){ setLoading('audit'); const d=await api('/admin/api/audit'); $('audit').innerHTML=table(['Action','Target','Metadata','Created'],d.logs.map(l=>'<tr><td>'+esc(l.action)+'</td><td>'+esc((l.targetType||'-')+' '+(l.targetId||''))+'</td><td><code>'+esc(short(JSON.stringify(l.metadata||{}),80))+'</code></td><td>'+date(l.createdAt)+'</td></tr>'),'No audit logs yet.'); }
    function loadTools(){ $('tools').innerHTML='<div class="panel panel-pad"><h3>Manual license</h3><div class="grid3"><input id="manualEmail" placeholder="customer@example.com"><select id="manualPlan"><option value="2weeks">2 Weeks</option><option value="1month" selected>1 Month</option><option value="3months">3 Months</option><option value="lifetime">Lifetime</option></select><button class="btn primary" onclick="manualLicense()">Create license</button></div><p class="muted" id="manualResult"></p></div><div class="panel panel-pad"><h3>Quick validate/download test</h3><div class="grid2"><input id="toolLicense" placeholder="FIMA-XXXX-XXXX-XXXX-XXXX"><button class="btn" onclick="testDownload()">Check download</button></div><pre class="detail" id="toolResult"></pre></div>'; }
    async function manualLicense(){ const d=await post('/admin/api/licenses/manual',{customerEmail:manualEmail.value,plan:manualPlan.value}); manualResult.textContent='Created: '+d.license.licenseKey; }
    async function testDownload(){ const d=await api('/api/download?licenseKey='+encodeURIComponent(toolLicense.value)); toolResult.textContent=JSON.stringify(d,null,2); }
    async function detail(path,title){ showModal(title, await api(path)); }
    async function post(path, body){ return api(path,{method:'POST',body:JSON.stringify(body||{})}); }
    function copyText(text){ navigator.clipboard?.writeText(text); }
    refreshCurrent();
  </script>
</body>
</html>`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}
