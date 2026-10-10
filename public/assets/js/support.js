(() => {
  'use strict';
  const apiBase = (window.FIMA_API_BASE_URL || 'https://api.fimamacro.com').replace(/\/$/, '');
  const view = document.getElementById('supportView'), notice = document.getElementById('supportNotice');
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const date = value => new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  const status = value => value.toLowerCase().replaceAll('_', ' ').replace(/^./, c => c.toUpperCase());
  const badge = value => `<span class="support-status" data-status="${esc(value)}">${esc(status(value))}</span>`;
  const detailLabels = {product:'Product (optional)',appVersion:'App version',device:'Device / HWID issue',operatingSystem:'Operating system',errorCode:'Error code',attempts:'What have you already tried?',reference:'Purchase reference (last 4 characters only)',reportedUser:'Reported account / Discord ID',incidentTime:'When did this happen?'};
  const icons = ['⌘','◇','▣','↗','◈','⚑','⌁','✧','…'];
  let session, csrf, workspace = 'mine', page = 1, current, step = 0, draft, files = [], messageFiles = [], messageRequest, timer, blobs = [], uploadBlobs = [];
  let requestInFlight = false, olderPage = 1, olderMessages = new Map();
  const categoryHelp = ['Timing, profiles, setup and application errors.', 'Purchase access, payment errors and license status.', 'Device changes, activation and HWID errors.', 'Secure access recovery and account linking.', 'Setup and troubleshooting for Fake Headless.', 'Report conduct with relevant evidence.', 'Suspicious activity, scams and account safety.', 'Business enquiries and partnership proposals.', 'Anything else you need help with.'];
  const linkify = value => String(value || '').split(/(https?:\/\/[^\s<>"']+)/g).map(part => /^https?:\/\//.test(part) ? `<a href="${esc(part)}" target="_blank" rel="noopener noreferrer">${esc(part)}</a>` : esc(part)).join('');
  try { draft = JSON.parse(sessionStorage.getItem('fimaSupportDraft') || 'null'); } catch {}
  draft ||= { requestId: crypto.randomUUID(), category: '', title: '', description: '', details: {} };
  const errors = { ticket_not_found:'This ticket is unavailable or you do not have access.', support_unavailable:'Support is temporarily unavailable. Your draft is preserved. Please retry.', attachment_content_mismatch:'A file’s content does not match its extension.', unsafe_attachment:'This file type is not supported. Choose an image, PDF, TXT, LOG, MP4 or WebM.', attachment_size_limit:'Use up to 4 files: 5 MB each, 8 MB total.', already_claimed:'Another staff member has already claimed this ticket.', ticket_closed:'This ticket is closed. Reopen it to continue the conversation.', assignee_not_ticket_staff:'Choose a member with an authorized ticket staff role.', reason_required:'Please enter a reason of at least 5 characters.', invalid_ticket_details:'Enter a title of at least 5 characters and details of at least 20 characters.', delete_preconditions_failed:'Deletion requires a closed ticket, verified transcript, private log delivery and both confirmations.' };
  function fail(e, target = notice) { target.className = 'support-error'; target.textContent = errors[e.message] || 'Could not complete this action. Please retry. (' + e.message + ')'; }
  async function api(path, { method = 'GET', body, progress } = {}) {
    if (method !== 'GET' && !csrf) { const r = await fetch(apiBase + '/api/csrf-token', { credentials: 'include' }); const d = await r.json(); csrf = d.token || d.csrfToken; }
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open(method, apiBase + '/api/support' + path); xhr.withCredentials = true; xhr.timeout = 45000;
      if (body) { xhr.setRequestHeader('Content-Type', 'application/json'); xhr.setRequestHeader('x-fima-csrf', csrf || ''); }
      if (progress) xhr.upload.onprogress = e => progress(e.lengthComputable ? e.loaded / e.total : 0);
      xhr.onload = () => { let data; try { data = JSON.parse(xhr.responseText); } catch { return reject(new Error('support_unavailable')); } if (xhr.status < 200 || xhr.status >= 300) { if (xhr.status === 403 && /csrf/.test(data.error || '')) csrf = null; reject(Object.assign(new Error(data.error || 'support_unavailable'), { status: xhr.status })); } else resolve(data); };
      xhr.onerror = xhr.ontimeout = () => reject(new Error('support_unavailable'));
      xhr.send(body ? JSON.stringify(body) : null);
    });
  }
  function clearBlobs() { blobs.forEach(URL.revokeObjectURL); blobs = []; }
  function clearUploadBlobs() { uploadBlobs.forEach(URL.revokeObjectURL); uploadBlobs = []; }
  function persist() { sessionStorage.setItem('fimaSupportDraft', JSON.stringify(draft)); }
  function gotoTicket(id) { history.pushState({}, '', '/support?ticket=' + encodeURIComponent(id)); void detail(id); }
  function backHome() { history.pushState({}, '', '/support'); current = null; clearBlobs(); void list(); }
  function newTicket() {
    if (!session) { location.href = '/login?next=' + encodeURIComponent('/support'); return; }
    clearInterval(timer); current = null; step = 0; form();
  }
  document.getElementById('newTicket').onclick = newTicket;
  async function list() {
    document.body.classList.remove('support-detail-mode', 'support-form-mode');
    if (!session) return init();
    clearInterval(timer); notice.textContent = ''; notice.className = '';
    view.innerHTML = `<section class="support-panel"><div class="support-heading"><h2>${workspace === 'staff' ? 'Staff workspace' : 'My tickets'} <span id="ticketCount" class="support-count">…</span></h2>${session.actor.work || session.actor.manage ? `<div class="support-tabs"><button class="support-tab ${workspace === 'mine' ? 'active' : ''}" data-workspace="mine">My tickets</button><button class="support-tab ${workspace === 'staff' ? 'active' : ''}" data-workspace="staff">Staff workspace</button></div>` : ''}</div><div class="support-filters"><input id="ticketSearch" type="search" placeholder="Search title, category or ticket ID" aria-label="Search tickets"><select id="ticketStatus" aria-label="Filter by status">${['ALL','OPEN',...(workspace === 'staff' ? ['UNASSIGNED','ASSIGNED_TO_ME'] : []),'WAITING_FOR_STAFF','IN_PROGRESS','WAITING_FOR_USER','ESCALATED','CLOSED','REOPENED'].map(s => `<option value="${s}">${s === 'ALL' ? 'All statuses' : status(s)}</option>`).join('')}</select><select id="ticketSort" aria-label="Sort tickets"><option value="latest">Last updated</option><option value="oldest">Oldest first</option></select></div>${workspace === 'staff' ? `<div class="support-filters"><select id="ticketCategory" aria-label="Filter by category"><option value="">All categories</option>${session.categories.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('')}</select><select id="ticketPriority" aria-label="Filter by priority"><option value="">All priorities</option><option value="NORMAL">Normal</option><option value="HIGH">High</option></select><input id="ticketAssignee" placeholder="Assigned Discord ID" aria-label="Assigned staff ID"></div>` : ''}<div id="ticketResults" class="support-loading">Loading tickets…</div><div id="ticketPagination"></div></section>`;
    view.querySelectorAll('[data-workspace]').forEach(b => b.onclick = () => { workspace = b.dataset.workspace; page = 1; list(); });
    let debounce;
    document.getElementById('ticketSearch').oninput = () => { clearTimeout(debounce); debounce = setTimeout(() => { page = 1; loadList(); }, 280); };
    ['ticketStatus','ticketSort','ticketCategory','ticketPriority','ticketAssignee'].forEach(id => { if (document.getElementById(id)) document.getElementById(id).onchange = () => { page = 1; loadList(); }; });
    await loadList();
  }
  let listGeneration = 0;
  async function loadList() {
    const generation = ++listGeneration, results = document.getElementById('ticketResults');
    if (!results) return;
    try {
      const q = new URLSearchParams({ workspace, page, search: document.getElementById('ticketSearch').value, status: document.getElementById('ticketStatus').value, sort: document.getElementById('ticketSort').value });
      for (const [key,id] of [['category','ticketCategory'],['priority','ticketPriority'],['assignedTo','ticketAssignee']]) if (document.getElementById(id)?.value) q.set(key,document.getElementById(id).value);
      const data = await api('/tickets?' + q);
      if (generation !== listGeneration || !results.isConnected) return;
      document.getElementById('ticketCount').textContent = data.total;
      results.className = 'support-ticket-list';
      results.innerHTML = data.tickets.length ? data.tickets.map(t => `<a class="support-ticket-row" href="/support?ticket=${esc(t.id)}" data-ticket="${esc(t.id)}"><div><strong>${esc(t.title)}</strong><small>#${esc(t.id.slice(0,8))} · ${esc(t.category)} · ${esc(t.lastResponder || 'No response yet')}<br>Created ${esc(date(t.createdAt))}</small></div>${badge(t.status)}<time datetime="${esc(t.updatedAt)}">${esc(date(t.updatedAt))}</time><b>↗</b></a>`).join('') : '<div class="support-empty"><span style="font-size:36px;color:#b98cdf">◇</span><h3>No tickets here yet.</h3><p>Need a hand? Start a conversation with the FIMA team.<br>Every update will appear right here.</p><button class="button primary" id="emptyCreate">Create your first ticket</button></div>';
      results.querySelectorAll('[data-ticket]').forEach(a => a.onclick = e => { e.preventDefault(); gotoTicket(a.dataset.ticket); });
      document.getElementById('emptyCreate')?.addEventListener('click', newTicket);
      document.getElementById('ticketPagination').innerHTML = data.total > 15 ? `<div class="support-pagination"><button class="support-tab" id="prevPage" ${page <= 1 ? 'disabled' : ''}>← Previous</button><span>Page ${page} of ${Math.ceil(data.total / 15)}</span><button class="support-tab" id="nextPage" ${page * 15 >= data.total ? 'disabled' : ''}>Next →</button></div>` : '';
      document.getElementById('prevPage')?.addEventListener('click', () => { page--; loadList(); }); document.getElementById('nextPage')?.addEventListener('click', () => { page++; loadList(); });
    } catch (e) { fail(e, results); }
  }
  function field(label, name, placeholder = '', full = false, required = false) { return `<label class="support-field ${full ? 'full' : ''}">${label}<input name="${name}" value="${esc(name.startsWith('details.') ? draft.details[name.slice(8)] || '' : draft[name] || '')}" placeholder="${esc(placeholder)}" maxlength="${name === 'title' ? 120 : 500}" ${required ? 'required minlength="5"' : ''}></label>`; }
  function categoryFields() {
    let html = field('Product (optional)','details.product','Fima Macro');
    if ([0,2,4].includes(session.categories.indexOf(draft.category))) html += field('App version','details.appVersion','e.g. 1.0.128') + field('Device / HWID issue','details.device','Describe the device change; no full key') + field('Operating system','details.operatingSystem','e.g. Windows 11') + field('Error code','details.errorCode','Optional') + field('What have you already tried?','details.attempts','Troubleshooting steps',true);
    if (draft.category === session.categories[1]) html += field('Purchase reference (last 4 characters only)','details.reference','Never enter a card number or full license key',true);
    if ([5,6].includes(session.categories.indexOf(draft.category))) html += field('Reported account / Discord ID','details.reportedUser','Account identifier') + field('When did this happen?','details.incidentTime','Date, time and timezone');
    return html;
  }
  function uploadMarkup(id) { return `<label class="support-upload" id="${id}Drop">＋ Add files or drop them here<br><small>PNG, JPG, WebP, GIF, PDF, TXT, LOG, MP4, WebM · 4 files · 5 MB each · 8 MB total</small><input type="file" id="${id}" multiple accept=".png,.jpg,.jpeg,.webp,.gif,.pdf,.txt,.log,.mp4,.webm" aria-label="Add ticket attachments"></label><div id="${id}List" class="support-file-list"></div>`; }
  function form() {
    document.body.classList.remove('support-detail-mode');
    document.body.classList.add('support-form-mode');
    notice.textContent = ''; notice.className = '';
    view.innerHTML = `<section class="support-panel support-form"><a class="support-back" href="/support" id="formBack">← Back to my tickets</a><div class="support-heading"><h2>Create a ticket</h2><small style="color:#ae9abb">Step ${step + 1} of 3</small></div><div class="support-steps">${['Choose a category','Tell us what happened','Review & send'].map((s,i) => `<span class="support-step ${i <= step ? 'active' : ''}">${i + 1} · ${s}</span>`).join('')}</div><form id="ticketForm">${step === 0 ? `<div class="support-categories">${session.categories.map((c,i) => `<button type="button" class="support-category ${c === draft.category ? 'selected' : ''}" data-category="${i}" aria-pressed="${c === draft.category}"><span aria-hidden="true">${icons[i]}</span><strong>${esc(c)}</strong><small>${esc(categoryHelp[i])}</small></button>`).join('')}</div>` : step === 1 ? `<p class="support-notice">${esc(draft.category)} · Share enough detail to help us find the right solution.</p>${draft.category === session.categories[3] ? '<p class="support-notice">For password recovery, <a href="/forgot-password">use secure account recovery</a>. Support never asks for your password.</p>' : ''}<div class="support-fields">${field('Ticket title','title','A short summary of your issue',true,true)}<label class="support-field full">What happened?<textarea name="description" required minlength="20" maxlength="6000" placeholder="Describe the issue, what you expected and what you’ve tried.">${esc(draft.description)}</textarea><small>At least 20 characters. Don’t include passwords or full license keys.</small></label>${categoryFields()}<div class="support-field full">${uploadMarkup('ticketFiles')}</div></div>` : `<div class="support-review"><p class="eyebrow">${esc(draft.category)}</p><h3>${esc(draft.title)}</h3><pre>${esc(draft.description)}</pre>${Object.entries(draft.details).filter(([,v]) => v).map(([k,v]) => `<p><strong>${esc(detailLabels[k] || k)}:</strong> ${esc(k === 'reference' ? '…' + v.slice(-4) : v)}</p>`).join('')}<p>${files.length} attachment${files.length !== 1 ? 's' : ''} · ${esc(files.map(f => f.name).join(', '))}</p><p class="support-notice">Your ticket is saved on the website first. Discord delivery retries automatically when your verified account is connected. Files are not malware scanned.</p></div>`}<progress class="support-upload-progress" id="createProgress" value="0" max="1" hidden aria-label="Ticket upload progress"></progress><p id="formError" role="alert"></p><div class="support-form-actions"><button class="button secondary" type="button" id="previousStep">${step === 0 ? 'Cancel' : '← Back'}</button><button class="button primary" type="submit" id="nextStep">${step === 2 ? 'Send ticket ↗' : 'Continue →'}</button></div></form></section>`;
    document.getElementById('formBack').onclick = e => { e.preventDefault(); saveFields(); backHome(); };
    view.querySelectorAll('[data-category]').forEach(b => b.onclick = () => { draft.category = session.categories[Number(b.dataset.category)]; persist(); form(); });
    document.getElementById('previousStep').onclick = () => { saveFields(); if (!step) backHome(); else { step--; form(); } };
    if (step === 1) { wireFiles('ticketFiles', files); document.getElementById('ticketForm').oninput = saveFields; }
    document.getElementById('ticketForm').onsubmit = async e => {
      e.preventDefault(); saveFields();
      if (!draft.category) { fail(new Error('Choose a category.'), document.getElementById('formError')); return; }
      if (step < 2) { step++; form(); return; }
      if (requestInFlight) return;
      requestInFlight = true; const button = document.getElementById('nextStep'); button.disabled = true; button.textContent = 'Saving your ticket…';
      try {
        const payload = await encodeFiles(files); const progress = document.getElementById('createProgress'); progress.hidden = false;
        const t = await api('/tickets', { method: 'POST', body: { ...draft, attachments: payload }, progress: value => { progress.value = value; } });
        sessionStorage.removeItem('fimaSupportDraft'); draft = { requestId: crypto.randomUUID(), category:'', title:'', description:'', details:{} }; files = []; gotoTicket(t.id);
      } catch (err) { fail(err, document.getElementById('formError')); button.disabled = false; button.textContent = 'Retry sending ticket ↗'; } finally { requestInFlight = false; }
    };
    view.querySelector('h2')?.setAttribute('tabindex','-1'); view.querySelector('h2')?.focus({ preventScroll:true });
  }
  function saveFields() { view.querySelectorAll('#ticketForm [name]').forEach(input => { if (input.name.startsWith('details.')) draft.details[input.name.slice(8)] = input.value; else draft[input.name] = input.value; }); persist(); }
  async function encodeFiles(selected) { return Promise.all(selected.map(f => new Promise((resolve,reject) => { const reader = new FileReader(); reader.onload = () => resolve({ name:f.name, data:String(reader.result).split(',')[1] }); reader.onerror = () => reject(new Error('file_read_failed')); reader.readAsDataURL(f); }))); }
  function wireFiles(id, selected) {
    const input = document.getElementById(id), drop = document.getElementById(id + 'Drop'), list = document.getElementById(id + 'List');
    function renderFiles() {
      clearUploadBlobs();
      list.replaceChildren();
      selected.forEach((f,i) => { const chip = document.createElement('div'); chip.className = 'support-file-chip'; if (f.type.startsWith('image/')) { const img = document.createElement('img'); const u = URL.createObjectURL(f); uploadBlobs.push(u); img.src = u; img.alt = f.name; chip.append(img); } const name = document.createElement('span'); name.textContent = f.name + ' · ' + Math.ceil(f.size / 1024) + ' KB'; const remove = document.createElement('button'); remove.className = 'support-icon'; remove.type = 'button'; remove.textContent = '×'; remove.setAttribute('aria-label','Remove ' + f.name); remove.onclick = () => { selected.splice(i,1); renderFiles(); }; chip.append(name,remove); list.append(chip); });
    }
    function add(incoming) { const combined = [...selected,...incoming]; if (combined.length > 4 || combined.some(f => f.size > 5242880) || combined.reduce((n,f) => n + f.size,0) > 8388608) { fail(new Error('attachment_size_limit')); return; } if (combined.some(f => !/\.(png|jpe?g|webp|gif|pdf|txt|log|mp4|webm)$/i.test(f.name))) { fail(new Error('unsafe_attachment')); return; } selected.push(...incoming); renderFiles(); }
    input.onchange = () => { add([...input.files]); input.value = ''; }; drop.ondragover = e => e.preventDefault(); drop.ondrop = e => { e.preventDefault(); add([...e.dataTransfer.files]); }; renderFiles();
  }
  function messageHtml(t, m) {
    return `<article class="support-message ${m.role === 'staff' ? 'staff' : ''} ${m.internal ? 'internal' : ''}"><span class="support-avatar" aria-hidden="true">${esc(m.author.slice(0,2).toUpperCase())}</span><div class="support-message-content"><div class="support-message-head"><strong>${esc(m.author)}</strong><small>${esc(m.internal ? 'Internal staff note' : m.role)} · ${esc(date(m.createdAt))}</small></div><p class="support-message-text">${linkify(m.text)}</p>${m.attachments.map(f => `<a class="support-attachment" href="${apiBase}/api/support/tickets/${esc(t.id)}/files/${esc(f.id)}" data-file="${esc(f.id)}" data-mime="${esc(f.mime)}" target="_blank" rel="noopener">${esc(f.name)} · ${Math.ceil(f.size / 1024)} KB · Not malware scanned</a>`).join('')}${m.delivery === 'PENDING' ? '<small style="color:#b9a4ce">Saved · Discord delivery pending</small>' : ''}</div></article>`;
  }
  async function detail(id) {
    document.body.classList.remove('support-form-mode');
    document.body.classList.add('support-detail-mode');
    clearInterval(timer); clearBlobs(); clearUploadBlobs(); olderPage = 1; olderMessages = new Map(); messageFiles = []; messageRequest = null; notice.textContent = ''; notice.className = ''; current = null;
    view.innerHTML = '<div class="support-loading">Loading conversation…</div>';
    try {
      const t = await api('/tickets/' + encodeURIComponent(id)); current = t; renderDetail(t);
      timer = setInterval(async () => { if (document.hidden || requestInFlight || !current) return; try { const latest = await api('/tickets/' + encodeURIComponent(id)); if (latest.updatedAt !== current.updatedAt) { current = latest; updateConversation(latest); } } catch {} }, 15000);
    } catch (e) { view.innerHTML = '<section class="support-panel"><a href="/support" class="support-back">← My tickets</a><div id="detailError"></div></section>'; fail(e,document.getElementById('detailError')); }
  }
  function renderDetail(t) {
    const staff = t.permissions.work || t.permissions.manage;
    view.innerHTML = `<a class="support-back" href="/support" id="detailBack">← ${workspace === 'staff' ? 'Staff workspace' : 'My tickets'}</a><div class="support-detail-top"><div><p class="eyebrow">${esc(t.category)} · #${esc(t.id.slice(0,8))}</p><h2 class="support-detail-title">${esc(t.title)}</h2></div><div id="detailBadge">${badge(t.status)}</div></div><div class="support-detail-layout"><section class="support-panel"><div id="olderMessages"></div><div id="conversation"></div><div id="composer"></div></section><aside class="support-panel support-aside"><p class="eyebrow">TICKET DETAILS</p><dl class="support-meta"><div><dt>Created</dt><dd>${esc(date(t.createdAt))}</dd></div><div><dt>Last updated</dt><dd id="lastUpdated">${esc(date(t.updatedAt))}</dd></div><div><dt>Assigned staff</dt><dd id="assignedStaff">${esc(t.assignedTo || 'Waiting for assignment')}</dd></div><div><dt>Discord connection</dt><dd id="discordStatus">${t.channelId && t.sync === 'CONNECTED' ? 'Connected' : t.discordUserId ? 'Saved · delivery pending' : 'Website only · connect your account'}</dd></div><div><dt>Priority</dt><dd id="ticketPriorityValue">${esc(status(t.priority || "NORMAL"))}</dd></div><div><dt>Ticket ID</dt><dd>${esc(t.id)}</dd></div>${Object.entries(t.details).map(([k,v]) => `<div><dt>${esc(detailLabels[k] || k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl><div id="staffActions" class="support-staff-actions"></div><div id="transcriptLinks"></div>${staff ? '<p class="support-footnote">Actions are checked against your current guild permissions. Internal notes stay in this workspace.</p>' : '<p class="support-footnote">Your conversation is private. You can continue here while Discord is unavailable.</p>'}</aside></div>`;
    document.getElementById('detailBack').onclick = e => { e.preventDefault(); backHome(); };
    updateConversation(t); renderComposer(t);
  }
  function updateConversation(t) {
    clearBlobs();
    t.messages.forEach(m => olderMessages.set(m.id,m));
    t = { ...t, messages: [...olderMessages.values()] };
    document.getElementById('conversation').innerHTML = [...t.events.map(e => ({ at:e.at, html:`<div class="support-event">${esc(date(e.at))} · ${esc(e.actor)} · ${esc(status(e.type))}${e.reason ? ' · ' + esc(e.reason) : ''}</div>` })), ...t.messages.map(m => ({ at:m.createdAt, html:messageHtml(t,m) }))].sort((a,b) => a.at.localeCompare(b.at)).map(x => x.html).join('');
    document.getElementById('detailBadge').innerHTML = badge(t.status); document.getElementById('ticketPriorityValue').textContent = status(t.priority || 'NORMAL');
    document.getElementById('lastUpdated').textContent = date(t.updatedAt); document.getElementById('assignedStaff').textContent = t.assignedTo || 'Waiting for assignment';
    document.getElementById('discordStatus').textContent = t.channelDeleted ? 'Channel deleted · history retained' : t.sync === 'CONNECTED' ? 'Connected' : t.discordUserId ? 'Saved · delivery pending' : 'Website only';
    if (t.channelId && !t.channelDeleted) { const a = document.createElement('a'); a.href = 'https://discord.com/channels/' + t.guildId + '/' + t.channelId; a.target = '_blank'; a.rel = 'noopener'; a.textContent = ' · Open Discord ↗'; document.getElementById('discordStatus').append(a); }
    document.getElementById('staffActions').innerHTML = t.status === 'CLOSED'
      ? `${t.permissions.reopen ? '<button class="button secondary" data-action="reopen">Reopen ticket</button>' : ''}${t.permissions.delete && t.channelId && !t.channelDeleted && t.transcripts.at(-1)?.verified && t.transcripts.at(-1)?.logMessageId ? '<button class="button secondary" data-action="delete">Delete Discord channel</button>' : ''}`
      : `${t.permissions.work || t.permissions.manage ? '<button class="button secondary" data-action="claim">Claim ticket</button><button class="button secondary" data-action="escalate">Escalate</button>' : ''}${t.permissions.manage ? '<button class="button secondary" data-action="assign">Assign staff</button>' : ''}${t.permissions.close ? '<button class="button secondary" data-action="close">Close & save transcript</button>' : ''}`;
    view.querySelectorAll('[data-action]').forEach(b => b.onclick = () => actionDialog(b.dataset.action));
    document.getElementById('transcriptLinks').innerHTML = t.transcripts.map(x => `<p><a class="support-back" target="_blank" rel="noopener" href="${apiBase}/api/support/tickets/${esc(t.id)}/transcripts/${esc(x.id)}">${x.verified ? 'View secure transcript ↗' : 'Transcript verification pending'}</a><small style="display:block;color:#ad9bbd">${esc(date(x.at))} · ${x.logMessageId ? 'Private log delivered' : 'Private log delivery pending'}</small></p>`).join('');
    document.getElementById('olderMessages').innerHTML = t.messageCount > t.messages.length ? '<button class="support-tab" id="loadOlder">Load earlier messages</button>' : '';
    document.getElementById('loadOlder')?.addEventListener('click', async function () { this.disabled = true; try { const old = await api('/tickets/' + t.id + '?page=' + (olderPage + 1)); olderPage++; old.messages.forEach(m => olderMessages.set(m.id,m)); updateConversation(current); } catch(e) { this.disabled = false; fail(e); } });
    if (t.status === 'CLOSED' && document.getElementById('messageForm')) renderComposer(t);
    if (t.status !== 'CLOSED' && !document.getElementById('messageForm')) renderComposer(t);
    previews();
  }
  async function previews() {
    for (const a of view.querySelectorAll('[data-file]')) {
      if (!/^(image|video)\//.test(a.dataset.mime) || a.dataset.previewed) continue;
      a.dataset.previewed = 'true';
      try { const response = await fetch(a.href,{ credentials:'include' }); if (!response.ok) continue; const blob = await response.blob(); if (!a.isConnected) continue; const u = URL.createObjectURL(blob); blobs.push(u); const media = document.createElement(a.dataset.mime.startsWith('image') ? 'img' : 'video'); media.src = u; if (media.tagName === 'IMG') media.alt = a.textContent; else { media.controls = true; media.preload = 'metadata'; media.onclick = e => e.preventDefault(); } a.prepend(media); } catch {};
    }
  }
  function renderComposer(t) {
    const target = document.getElementById('composer');
    clearUploadBlobs();
    if (t.status === 'CLOSED') { target.innerHTML = '<p class="support-notice">This conversation is closed. Your messages and files remain available. Use Reopen ticket to continue when you need more help.</p>'; return; }
    target.innerHTML = `<form class="support-composer" id="messageForm"><label class="support-field">Your reply<textarea id="messageText" maxlength="6000" placeholder="Write a reply… Shift + Enter for a new line" aria-label="Message"></textarea></label><details style="margin-top:12px"><summary style="font-size:12px;color:#c1a3dd;cursor:pointer">Add attachments</summary>${uploadMarkup('messageFiles')}</details><div class="support-composer-actions">${t.permissions.work || t.permissions.manage ? '<label><input type="checkbox" id="internalNote"> Internal staff note</label>' : '<small style="font-size:11px;color:#a995bb">Your reply is saved before Discord delivery.</small>'}<button type="submit" class="button primary" id="sendReply">Send reply ↗</button></div><progress id="replyProgress" class="support-upload-progress" value="0" max="1" hidden aria-label="Reply upload progress"></progress><p id="replyError" role="alert"></p></form>`;
    wireFiles('messageFiles',messageFiles);
    document.getElementById('messageText').onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && matchMedia('(min-width:769px)').matches) { e.preventDefault(); document.getElementById('messageForm').requestSubmit(); } };
    document.getElementById('messageForm').onsubmit = async e => {
      e.preventDefault(); if (requestInFlight) return;
      const text = document.getElementById('messageText').value; if (!text.trim() && !messageFiles.length) return;
      messageRequest ||= crypto.randomUUID(); requestInFlight = true; const b = document.getElementById('sendReply'); b.disabled = true; b.textContent = 'Saving…';
      try { const attachments = await encodeFiles(messageFiles), progress = document.getElementById('replyProgress'); progress.hidden = false; const updated = await api('/tickets/' + t.id + '/messages',{ method:'POST',body:{ requestId:messageRequest,text,attachments,internal:!!document.getElementById('internalNote')?.checked },progress:v => { progress.value = v; } }); current = updated; messageFiles = []; messageRequest = null; updateConversation(updated); renderComposer(updated); }
      catch(err) { fail(err,document.getElementById('replyError')); b.disabled = false; b.textContent = 'Retry sending ↗'; } finally { requestInFlight = false; }
    };
  }
  const dialog = document.getElementById('supportDialog');
  ['cancelAction','cancelActionBottom'].forEach(id => document.getElementById(id).onclick = () => dialog.close());
  function actionDialog(action) {
    const t = current, title = document.getElementById('dialogTitle'); title.textContent = action === 'close' ? 'Close conversation?' : action === 'delete' ? 'Delete Discord channel?' : status(action) + ' ticket';
    document.getElementById('actionError').textContent = '';
    document.getElementById('actionFields').innerHTML = action === 'delete' ? `<p>Website history stays available. Discord channel deletion is permanent and requires a verified transcript delivered to the private log.</p><label>Type the exact channel ID <strong>${esc(t.channelId)}</strong><input name="confirm" required autocomplete="off" placeholder="Exact Discord channel ID"></label><label><input name="secondConfirm" type="checkbox" required> I confirm permanently deleting this closed channel.</label>` : action === 'assign' ? '<label>Authorized staff Discord ID<input name="assignedTo" required pattern="[0-9]{17,20}" autocomplete="off"></label>' : ['close','escalate'].includes(action) ? `<p>${action === 'close' ? 'A secure transcript will be saved automatically. This does not delete the Discord channel.' : 'Explain why senior staff should review this ticket.'}</p><label>Reason<textarea name="reason" required minlength="5" maxlength="1000"></textarea></label>` : '<p>Confirm this change to the ticket.</p>';
    const b = document.getElementById('confirmAction'); b.disabled = false; b.textContent = action === 'close' ? 'Close & save transcript' : action === 'delete' ? 'Delete channel permanently' : 'Confirm';
    document.getElementById('actionForm').onsubmit = async e => { e.preventDefault(); if (requestInFlight) return; requestInFlight = true; b.disabled = true; const body = { action,...Object.fromEntries(new FormData(e.target)),secondConfirm:!!e.target.elements.secondConfirm?.checked }; try { current = await api('/tickets/' + t.id + '/actions',{ method:'POST',body }); dialog.close(); updateConversation(current); } catch(err) { fail(err,document.getElementById('actionError')); b.disabled = false; } finally { requestInFlight = false; } };
    dialog.showModal();
  }
  window.addEventListener('popstate',() => { const id = new URLSearchParams(location.search).get('ticket'); if (id) detail(id); else list(); });
  async function init() {
    try { session = await api('/session'); const id = new URLSearchParams(location.search).get('ticket') || location.pathname.match(/\/support\/tickets\/([a-f0-9]+)/)?.[1]; if (id) await detail(id); else await list(); }
    catch(e) { if (e.status === 401) view.innerHTML = '<section class="support-panel support-empty"><h3>Your support, all in one place.</h3><p>Sign in to create a private ticket and follow every response.<br>Account recovery and FAQs are available without signing in.</p><a class="button primary" href="/login?next=%2Fsupport">Sign in to support ↗</a></section>'; else { fail(e); view.innerHTML = '<section class="support-panel support-empty"><h3>We couldn’t load your workspace.</h3><p>Please try again in a moment. Your saved drafts are preserved.</p><button class="button secondary" id="retrySupport">Retry</button></section>'; document.getElementById('retrySupport').onclick = init; } }
  }
  // Use the existing site language selector. Translate interface nodes only;
  // customer messages, titles, filenames and submitted values stay untouched.
  const tr = {
    'FIMA CARE · PERSONAL SUPPORT':'FIMA CARE · KİŞİSEL DESTEK',
    'Let’s get you moving.':'Birlikte çözelim.',
    'One conversation. Every answer, file and update in one place.':'Tek konuşma. Tüm yanıtlar, dosyalar ve güncellemeler bir arada.',
    '＋ Create ticket':'＋ Destek talebi oluştur','Explore FAQ ↗':'SSS’ye göz at ↗',
    'Can’t access your account?':'Hesabınıza erişemiyor musunuz?',
    'Recover your account securely':'Hesabınızı güvenle kurtarın','Connect with Discord':'Discord hesabınızı bağlayın',
    'Continue the same conversation there':'Aynı konuşmaya Discord’da devam edin',
    'A quick answer might be here':'Yanıtınız burada olabilir','Setup, billing and device guides':'Kurulum, ödeme ve cihaz rehberleri',
    'Loading your support workspace…':'Destek alanınız yükleniyor…',
    'Never share passwords, full license keys or payment card details. Attachments are not malware scanned. Only open files you trust.':'Şifre, tam lisans anahtarı veya kart bilgisi paylaşmayın. Eklerde zararlı yazılım taraması yapılmaz. Yalnızca güvendiğiniz dosyaları açın.',
    'My tickets':'Destek taleplerim','My Tickets':'Destek taleplerim','Staff workspace':'Personel çalışma alanı',
    'Search title, category or ticket ID':'Başlık, kategori veya talep numarası ara','Search tickets':'Destek taleplerini ara',
    'All statuses':'Tüm durumlar','Open':'Açık','Waiting for staff':'Destek yanıtı bekleniyor','Waiting for user':'Yanıtınız bekleniyor',
    'In progress':'İşlem sürüyor','Escalated':'Üst incelemede','Closed':'Kapalı','Reopened':'Yeniden açıldı',
    'Unassigned':'Atanmamış','Assigned to me':'Bana atanan','Last updated':'Son güncelleme','Oldest first':'En eskiler önce',
    'All categories':'Tüm kategoriler','All priorities':'Tüm öncelikler','Normal':'Normal','High':'Yüksek',
    'Assigned Discord ID':'Atanan Discord kimliği','Assigned staff ID':'Atanan personel kimliği',
    'Loading tickets…':'Destek talepleri yükleniyor…','No tickets here yet.':'Henüz destek talebiniz yok.',
    'Need a hand? Start a conversation with the FIMA team.':'Yardıma mı ihtiyacınız var? FIMA ekibiyle iletişime geçin.',
    'Every update will appear right here.':'Tüm güncellemeler burada görünecek.',
    'Create your first ticket':'İlk destek talebinizi oluşturun','← Previous':'← Önceki','Next →':'Sonraki →',
    'Macro support':'Macro desteği','Payment / purchase / license':'Ödeme / satın alma / lisans',
    'HWID / device':'HWID / cihaz','Account recovery':'Hesap kurtarma','Fake Headless':'Fake Headless',
    'Report a user':'Kullanıcı bildir','Scam / security':'Dolandırıcılık / güvenlik','Partnership / business':'İş ortaklığı / ticari','Other':'Diğer',
    'Timing, profiles, setup and application errors.':'Zamanlama, profiller, kurulum ve uygulama hataları.',
    'Purchase access, payment errors and license status.':'Satın alma erişimi, ödeme hataları ve lisans durumu.',
    'Device changes, activation and HWID errors.':'Cihaz değişimi, etkinleştirme ve HWID hataları.',
    'Secure access recovery and account linking.':'Güvenli erişim kurtarma ve hesap bağlama.',
    'Setup and troubleshooting for Fake Headless.':'Fake Headless kurulumu ve sorun giderme.',
    'Report conduct with relevant evidence.':'İlgili kanıtlarla kullanıcı davranışı bildirin.',
    'Suspicious activity, scams and account safety.':'Şüpheli işlemler, dolandırıcılık ve hesap güvenliği.',
    'Business enquiries and partnership proposals.':'Ticari sorular ve iş ortaklığı teklifleri.',
    'Anything else you need help with.':'Yardıma ihtiyaç duyduğunuz diğer konular.',
    '← Back to my tickets':'← Destek taleplerime dön','Create a ticket':'Destek talebi oluştur',
    'Choose a category':'Kategori seçin','Tell us what happened':'Sorunu anlatın','Review & send':'Kontrol edin ve gönderin',
    'Ticket title':'Talep başlığı','A short summary of your issue':'Sorunun kısa özeti','What happened?':'Ne oldu?',
    'Describe the issue, what you expected and what you’ve tried.':'Sorunu, beklediğiniz sonucu ve denediğiniz çözümleri anlatın.',
    'At least 20 characters. Don’t include passwords or full license keys.':'En az 20 karakter. Şifre veya tam lisans anahtarı eklemeyin.',
    'Product (optional)':'Ürün (isteğe bağlı)','App version':'Uygulama sürümü','Device / HWID issue':'Cihaz / HWID sorunu',
    'Describe the device change; no full key':'Cihaz değişimini anlatın; tam anahtar paylaşmayın','Operating system':'İşletim sistemi',
    'Error code':'Hata kodu','Optional':'İsteğe bağlı','What have you already tried?':'Hangi çözümleri denediniz?',
    'Troubleshooting steps':'Sorun giderme adımları','Purchase reference (last 4 characters only)':'Satın alma referansı (yalnızca son 4 karakter)',
    'Never enter a card number or full license key':'Kart numarası veya tam lisans anahtarı girmeyin',
    'Reported account / Discord ID':'Bildirilen hesap / Discord kimliği','Account identifier':'Hesap kimliği',
    'When did this happen?':'Ne zaman oldu?','Date, time and timezone':'Tarih, saat ve saat dilimi',
    '＋ Add files or drop them here':'＋ Dosya ekleyin veya buraya sürükleyin',
    'PNG, JPG, WebP, GIF, PDF, TXT, LOG, MP4, WebM · 4 files · 5 MB each · 8 MB total':'PNG, JPG, WebP, GIF, PDF, TXT, LOG, MP4, WebM · 4 dosya · dosya başına 5 MB · toplam 8 MB',
    'Add ticket attachments':'Talebe dosya ekle','Cancel':'İptal','← Back':'← Geri','Continue →':'Devam →','Send ticket ↗':'Talebi gönder ↗',
    'Your ticket is saved on the website first. Discord delivery retries automatically when your verified account is connected. Files are not malware scanned.':'Talebiniz önce sitede kaydedilir. Doğrulanmış hesabınız bağlıysa Discord aktarımı otomatik yeniden denenir. Dosyalarda zararlı yazılım taraması yapılmaz.',
    'Loading conversation…':'Konuşma yükleniyor…','TICKET DETAILS':'TALEP BİLGİLERİ','Created':'Oluşturulma',
    'Assigned staff':'Atanan personel','Waiting for assignment':'Atama bekleniyor','Discord connection':'Discord bağlantısı',
    'Connected':'Bağlı','Saved · delivery pending':'Kaydedildi · aktarım bekleniyor','Website only · connect your account':'Yalnızca site · hesabınızı bağlayın',
    'Website only':'Yalnızca site','Channel deleted · history retained':'Kanal silindi · geçmiş korunuyor',' · Open Discord ↗':' · Discord’u aç ↗',
    'Ticket ID':'Talep numarası','Priority':'Öncelik','product':'Ürün','appVersion':'Uygulama sürümü','device':'Cihaz',
    'operatingSystem':'İşletim sistemi','errorCode':'Hata kodu','attempts':'Denenen çözümler','reference':'Referans',
    'reportedUser':'Bildirilen kullanıcı','incidentTime':'Olay zamanı',
    'Actions are checked against your current guild permissions. Internal notes stay in this workspace.':'İşlemler mevcut sunucu yetkilerinizle doğrulanır. İç notlar bu çalışma alanında kalır.',
    'Your conversation is private. You can continue here while Discord is unavailable.':'Konuşmanız özeldir. Discord kullanılamıyorken buradan devam edebilirsiniz.',
    'Reopen ticket':'Talebi yeniden aç','Delete Discord channel':'Discord kanalını sil','Claim ticket':'Talebi üstlen',
    'Escalate':'Üst incelemeye gönder','Assign staff':'Personel ata','Close & save transcript':'Kapat ve konuşma kaydını sakla',
    'View secure transcript ↗':'Güvenli konuşma kaydını aç ↗','Transcript verification pending':'Konuşma kaydı doğrulanıyor',
    'Private log delivered':'Özel kayıt kanalına iletildi','Private log delivery pending':'Özel kayıt kanalına aktarım bekleniyor',
    'Load earlier messages':'Önceki mesajları yükle','Your reply':'Yanıtınız','Write a reply… Shift + Enter for a new line':'Yanıt yazın… Yeni satır için Shift + Enter',
    'Message':'Mesaj','Add attachments':'Dosya ekle','Internal staff note':'Personele özel not','customer':'Müşteri','staff':'Personel',
    'Your reply is saved before Discord delivery.':'Yanıtınız Discord aktarımından önce kaydedilir.',
    'Send reply ↗':'Yanıtı gönder ↗','Saving…':'Kaydediliyor…','Retry sending ↗':'Göndermeyi yeniden dene ↗',
    'This conversation is closed. Your messages and files remain available. Use Reopen ticket to continue when you need more help.':'Bu konuşma kapalı. Mesajlarınız ve dosyalarınız erişilebilir kalır. Yardım gerektiğinde talebi yeniden açabilirsiniz.',
    'Close conversation?':'Konuşma kapatılsın mı?','Delete Discord channel?':'Discord kanalı silinsin mi?',
    'Ticket action':'Talep işlemi','Close dialog':'Pencereyi kapat','Confirm':'Onayla','Reason':'Gerekçe',
    'A secure transcript will be saved automatically. This does not delete the Discord channel.':'Güvenli konuşma kaydı otomatik saklanır. Discord kanalı silinmez.',
    'Explain why senior staff should review this ticket.':'Talebin neden üst düzey personelce incelenmesi gerektiğini açıklayın.',
    'Confirm this change to the ticket.':'Talepteki bu değişikliği onaylayın.',
    'Authorized staff Discord ID':'Yetkili personelin Discord kimliği','Exact Discord channel ID':'Tam Discord kanal kimliği',
    'Website history stays available. Discord channel deletion is permanent and requires a verified transcript delivered to the private log.':'Sitedeki geçmiş erişilebilir kalır. Discord kanalının silinmesi kalıcıdır; doğrulanmış konuşma kaydı özel kayıt kanalına iletilmiş olmalıdır.',
    'I confirm permanently deleting this closed channel.':'Bu kapalı kanalın kalıcı olarak silinmesini onaylıyorum.',
    'Delete channel permanently':'Kanalı kalıcı olarak sil','Your support, all in one place.':'Tüm desteğiniz bir arada.',
    'Sign in to create a private ticket and follow every response.':'Özel talep oluşturmak ve yanıtları takip etmek için giriş yapın.',
    'Account recovery and FAQs are available without signing in.':'Hesap kurtarma ve SSS’ye giriş yapmadan erişebilirsiniz.',
    'Sign in to support ↗':'Destek için giriş yap ↗','We couldn’t load your workspace.':'Destek alanınız yüklenemedi.',
    'Please try again in a moment. Your saved drafts are preserved.':'Biraz sonra tekrar deneyin. Kayıtlı taslaklarınız korunuyor.',
    'Retry':'Yeniden dene','Not malware scanned':'Zararlı yazılım taraması yapılmadı',
    'This ticket is unavailable or you do not have access.':'Talep kullanılamıyor veya erişim yetkiniz yok.',
    'Support is temporarily unavailable. Your draft is preserved. Please retry.':'Destek geçici olarak kullanılamıyor. Taslağınız korunuyor. Tekrar deneyin.',
    'A file’s content does not match its extension.':'Dosyanın içeriği uzantısıyla eşleşmiyor.',
    'This file type is not supported. Choose an image, PDF, TXT, LOG, MP4 or WebM.':'Bu dosya türü desteklenmiyor. Görsel, PDF, TXT, LOG, MP4 veya WebM seçin.',
    'Use up to 4 files: 5 MB each, 8 MB total.':'En fazla 4 dosya ekleyin: dosya başına 5 MB, toplam 8 MB.',
    'Another staff member has already claimed this ticket.':'Bu talebi başka bir personel üstlendi.',
    'This ticket is closed. Reopen it to continue the conversation.':'Talep kapalı. Konuşmaya devam etmek için yeniden açın.',
    'Choose a member with an authorized ticket staff role.':'Yetkili destek rolüne sahip bir üye seçin.',
    'Please enter a reason of at least 5 characters.':'En az 5 karakterlik bir gerekçe girin.',
    'Enter a title of at least 5 characters and details of at least 20 characters.':'En az 5 karakterlik başlık ve 20 karakterlik açıklama girin.',
    'Deletion requires a closed ticket, verified transcript, private log delivery and both confirmations.':'Silme için kapalı talep, doğrulanmış konuşma kaydı, özel kayıt kanalına aktarım ve iki onay gerekir.'
  };
  const originals = new WeakMap();
  function translateText(text) {
    const trimmed = text.trim(), translated = tr[trimmed];
    if (translated) return text.replace(trimmed,translated);
    return text.replace(/Step (\d) of 3/g,'Adım $1 / 3').replace(/Page (\d+) of (\d+)/g,'Sayfa $1 / $2').replace(/^(\d+) attachments? ·/,'$1 dosya eki ·')
      .replace(/^(\d · )(Choose a category|Tell us what happened|Review & send)$/,(_,n,label) => n + tr[label])
      .replace(/ · Share enough detail to help us find the right solution\./g,' · Doğru çözümü bulabilmemiz için yeterli ayrıntı paylaşın.')
      .replace(/^Created /,'Oluşturulma ').replace(/Not malware scanned/g,tr['Not malware scanned'])
      .replace(/Saved · Discord delivery pending/g,'Kaydedildi · Discord aktarımı bekleniyor');
  }
  function translateSupport() {
    const turkish = document.documentElement.lang === 'tr';
    for (const root of [document.getElementById('main'),dialog]) {
      const walker = document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode;
        if (node.parentElement.closest('.support-message-text,.support-message-head strong,.support-avatar,.support-ticket-row strong,.support-detail-title,.support-review h3,.support-review pre,.support-meta dd:not(#discordStatus):not(#ticketPriorityValue):not(#assignedStaff),.support-file-chip span,textarea')) continue;
        let saved = originals.get(node);
        if (!saved || node.nodeValue !== saved.rendered) saved = { source:node.nodeValue };
        saved.rendered = turkish ? translateText(saved.source) : saved.source;
        originals.set(node,saved);
        if (node.nodeValue !== saved.rendered) node.nodeValue = saved.rendered;
      }
      root.querySelectorAll('[placeholder],[aria-label]').forEach(el => {
        for (const attr of ['placeholder','aria-label']) {
          if (!el.hasAttribute(attr)) continue;
          const key = 'data-support-original-' + attr;
          if (!el.hasAttribute(key)) el.setAttribute(key,el.getAttribute(attr));
          const text = el.getAttribute(key), translated = turkish ? translateText(text) : text;
          if (el.getAttribute(attr) !== translated) el.setAttribute(attr,translated);
        }
      });
    }
  }
  const translationObserver = new MutationObserver(translateSupport);
  translationObserver.observe(document.getElementById('main'),{ childList:true,subtree:true,characterData:true });
  translationObserver.observe(dialog,{ childList:true,subtree:true,characterData:true });
  translationObserver.observe(document.documentElement,{ attributes:true,attributeFilter:['lang'] });
  translateSupport();
  void init();
})();
