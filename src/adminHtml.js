export function loginPage(error = "") {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Fima Admin Login</title>
  <style>
    body{margin:0;min-height:100vh;display:grid;place-items:center;background:#070510;color:#f8f3ff;font-family:Inter,Segoe UI,sans-serif}
    form{width:min(420px,calc(100vw - 32px));padding:28px;border:1px solid #3d2a5a;border-radius:8px;background:#120d1e;box-shadow:0 24px 80px #0008}
    h1{margin:0 0 10px;font-size:28px}.muted{color:#b9a9cd}label{display:block;margin:20px 0 8px;font-weight:800}
    input,button{width:100%;height:46px;border-radius:8px;font:inherit}input{padding:0 12px;color:#fff;background:#0a0711;border:1px solid #37284b}
    button{margin-top:14px;border:0;font-weight:900;background:linear-gradient(135deg,#d46cff,#6c4dff);color:#090611;cursor:pointer}.error{color:#ff7b93}
  </style>
</head>
<body>
  <form method="post" action="/admin/login">
    <h1>Fima Admin</h1>
    <p class="muted">Backend protected panel</p>
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
  <title>Fima License Admin</title>
  <style>
    *{box-sizing:border-box}body{margin:0;background:#070510;color:#f8f3ff;font-family:Inter,Segoe UI,sans-serif}
    header{position:sticky;top:0;z-index:2;display:flex;justify-content:space-between;align-items:center;padding:16px 22px;border-bottom:1px solid #2b2042;background:#0b0714ee;backdrop-filter:blur(12px)}
    main{width:min(1220px,calc(100vw - 28px));margin:24px auto 60px}.panel{padding:18px;border:1px solid #33254c;border-radius:8px;background:#110c1d}
    .grid{display:grid;gap:12px}.filters{grid-template-columns:2fr 1fr 1fr auto}.manual{grid-template-columns:2fr 1fr auto}input,select,button{height:40px;border-radius:8px;font:inherit}
    input,select{padding:0 10px;color:#fff;background:#080610;border:1px solid #33254c}button{padding:0 14px;border:1px solid #6e45aa;background:#211238;color:#fff;font-weight:800;cursor:pointer}
    button.primary{color:#080610;background:linear-gradient(135deg,#d46cff,#6c4dff)}button.danger{border-color:#91314d;background:#2a0e18}
    table{width:100%;border-collapse:collapse;margin-top:16px}th,td{padding:10px;border-bottom:1px solid #241a37;text-align:left;font-size:14px;vertical-align:top}th{color:#b9a9cd}
    code{font-family:Consolas,monospace;color:#d46cff}.actions{display:flex;flex-wrap:wrap;gap:6px}.muted{color:#b9a9cd}.ok{color:#7fffd1}.bad{color:#ff7b93}
    @media(max-width:800px){.filters,.manual{grid-template-columns:1fr}table{font-size:12px}th:nth-child(4),td:nth-child(4){display:none}}
  </style>
</head>
<body>
  <header>
    <strong>Fima License Admin</strong>
    <form method="post" action="/admin/logout"><button type="submit">Logout</button></form>
  </header>
  <main>
    <section class="panel">
      <h2>Licenses</h2>
      <div class="grid filters">
        <input id="search" placeholder="Email or license key">
        <select id="plan"><option value="">All plans</option><option>2weeks</option><option>1month</option><option>3months</option><option>lifetime</option></select>
        <select id="status"><option value="">All statuses</option><option>active</option><option>inactive</option><option>banned</option></select>
        <button class="primary" onclick="loadLicenses()">Search</button>
      </div>
      <table>
        <thead><tr><th>License</th><th>Email</th><th>Plan</th><th>Expiry</th><th>Status</th><th>HWID</th><th>Actions</th></tr></thead>
        <tbody id="licenses"></tbody>
      </table>
    </section>
    <section class="panel" style="margin-top:18px">
      <h2>Manual license</h2>
      <div class="grid manual">
        <input id="manualEmail" placeholder="customer@example.com">
        <select id="manualPlan"><option value="2weeks">2 Weeks</option><option value="1month" selected>1 Month</option><option value="3months">3 Months</option><option value="lifetime">Lifetime</option></select>
        <button class="primary" onclick="manualLicense()">Create</button>
      </div>
      <p class="muted" id="manualResult"></p>
    </section>
    <section class="panel" style="margin-top:18px">
      <h2>Recent orders</h2>
      <table>
        <thead><tr><th>Session</th><th>Email</th><th>Plan</th><th>Amount</th><th>Status</th><th>License</th></tr></thead>
        <tbody id="orders"></tbody>
      </table>
    </section>
  </main>
  <script>
    const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    async function api(path, options = {}) {
      const res = await fetch(path, { credentials: 'same-origin', headers: { 'content-type': 'application/json' }, ...options });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Request failed');
      return res.json();
    }
    function expiry(row){ return row.lifetime ? 'Never' : row.expiresAt ? new Date(row.expiresAt).toLocaleString() : '-'; }
    async function loadLicenses() {
      const params = new URLSearchParams({ search: search.value, plan: plan.value, status: status.value });
      const data = await api('/admin/api/licenses?' + params);
      licenses.innerHTML = data.licenses.map(row => \`
        <tr>
          <td><code>\${esc(row.licenseKey)}</code></td><td>\${esc(row.customerEmail)}</td><td>\${esc(row.plan)}</td><td>\${expiry(row)}</td>
          <td class="\${row.status === 'active' ? 'ok' : 'bad'}">\${esc(row.status)}</td><td>\${esc(row.hwid || 'not locked')}</td>
          <td class="actions">
            <button onclick="copyText('\${esc(row.licenseKey)}')">Copy</button>
            <button onclick="resetHwid('\${row.id}')">Reset HWID</button>
            <button onclick="extendLicense('\${row.id}')">Extend</button>
            <button onclick="setStatus('\${row.id}','active')">Active</button>
            <button class="danger" onclick="setStatus('\${row.id}','banned')">Ban</button>
          </td>
        </tr>\`).join('');
      loadOrders();
    }
    async function loadOrders() {
      const data = await api('/admin/api/orders');
      orders.innerHTML = data.orders.map(row => \`
        <tr><td><code>\${esc(row.stripeSessionId)}</code></td><td>\${esc(row.customerEmail)}</td><td>\${esc(row.plan)}</td><td>\${(row.amount / 100).toFixed(2)} \${esc(row.currency.toUpperCase())}</td><td>\${esc(row.status)}</td><td><code>\${esc(row.license?.licenseKey || '-')}</code></td></tr>\`).join('');
    }
    async function manualLicense() {
      const data = await api('/admin/api/licenses/manual', { method: 'POST', body: JSON.stringify({ customerEmail: manualEmail.value, plan: manualPlan.value }) });
      manualResult.textContent = 'Created: ' + data.license.licenseKey;
      loadLicenses();
    }
    async function resetHwid(id){ await api('/admin/api/licenses/' + id + '/reset-hwid', { method:'POST', body:'{}' }); loadLicenses(); }
    async function setStatus(id,status){ await api('/admin/api/licenses/' + id + '/status', { method:'POST', body:JSON.stringify({ status }) }); loadLicenses(); }
    async function extendLicense(id){ const plan = prompt('Extend with plan: 2weeks, 1month, 3months, lifetime', '1month'); if(plan) { await api('/admin/api/licenses/' + id + '/extend', { method:'POST', body:JSON.stringify({ plan }) }); loadLicenses(); } }
    function copyText(text){ navigator.clipboard?.writeText(text); }
    loadLicenses().catch(err => alert(err.message));
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
