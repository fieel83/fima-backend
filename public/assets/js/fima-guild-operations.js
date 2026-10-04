// Operations and durable recovery plans are scoped to the authorized guild and actor.
export async function renderFimaOperations(panel, payload, context) {
  const { request, csrfToken, escapeHtml: esc, setDirty, refresh } = context;
  const root = `/api/fima-bot/customer/workspaces/${encodeURIComponent(payload.workspace.guildId)}/operations`;
  const marker = {};
  panel.fimaOperationMarker = marker;
  const current = () => panel.fimaOperationMarker === marker && panel.isConnected && context.isCurrent();
  panel.innerHTML = `<div class="module-heading"><div><p class="eyebrow">FIMA · ${esc(payload.setupType)}</p><h2>${esc(({setup:'Kurulum',content:'İçerik Merkezi',polls:'Anketler',integrations:'Entegrasyonlar'})[payload.route])}</h2></div></div><p data-operation-status role="status">Canlı envanter yükleniyor…</p><div data-operation-body></div>`;
  const status = panel.querySelector('[data-operation-status]');
  const body = panel.querySelector('[data-operation-body]');
  const say = message => { if (current()) status.textContent = message; };
  async function post(path, value) {
    const response = await fetch(root + path, { method: 'POST', credentials: 'include', headers: { 'Content-Type':'application/json', 'x-fima-csrf': await csrfToken(), Accept:'application/json' }, body: JSON.stringify(value) });
    const data = await response.json();
    if (!response.ok || data.success === false) throw new Error(data.error || 'operation_failed');
    return data;
  }
  let pending = false;
  async function act(button, work) {
    if (pending || !current()) return;
    pending = true; button.disabled = true;
    const fields = [...body.querySelectorAll('input, select, textarea')].map(field => [field, field.disabled]);
    // Capture FormData before disabling controls, then freeze edits during I/O.
    const captured = button.closest('form') ? new FormData(button.closest('form')) : null;
    fields.forEach(([field]) => { field.disabled = true; });
    try { await work(captured); } catch (error) { say(error.message); }
    finally { pending = false; if (current()) { button.disabled = false; fields.forEach(([field, disabled]) => { field.disabled = disabled; }); } }
  }
  try {
    const inventory = (await request(root + '/inspect')).inventory;
    if (!current()) return;
    say(`Envanter: ${inventory.observedAt}. Sağlık durumu gözlemlenmedi.`);
    const options = resources => '<option value="">Mevcut eşleşmeyi koru</option>' + resources.map(row => `<option value="${esc(row.id)}">${esc(row.name)} · ${esc(row.id)}</option>`).join('');
    if (payload.route === 'integrations' || payload.route === 'content') {
      const rows = inventory.integrations || [];
      body.innerHTML = `<p>NotifyMe, EG ve Openclaw gibi harici üreticiler korunur. FIMA yerel TikTok gönderimi kapalıdır.</p><p>Son teslimat: gözlemlenmedi. Webhook adresleri ve tokenlar gösterilmez.</p><div class="config-grid">${rows.map(row => `<article class="config-card"><h3>${esc(row.provider)}</h3><p>Uygulama: ${esc(row.applicationId || 'Bilinmiyor')}</p><p>Hedef: ${esc(row.destinationChannelId || 'Doğrulanmadı')}</p><p>Sahip: ${esc(row.ownerId || 'Bilinmiyor')} · Amaç: ${esc(row.purpose || 'Bilinmiyor')}</p><p>${esc(row.state)} · ${esc(row.health)}</p><small>${esc(row.id)}</small></article>`).join('') || '<p>Bu incelemede entegrasyon bulunamadı.</p>'}</div><p>${esc((inventory.errors || []).join(', '))}</p>${payload.route === 'content' ? `<p>İçerik üretimi için <a href="/fima-bot/dashboard/servers/${esc(payload.workspace.guildId)}/polls">Anketler</a> modülünü kullan.</p>` : ''}`;
      return;
    }
    if (payload.route === 'setup') {
      body.innerHTML = `<form data-wizard class="config-editor"><label>Kurulum türü<select name="setupType">${['community','clan','tsbtr'].map(type => `<option ${type === payload.setupType ? 'selected' : ''}>${type}</option>`).join('')}</select></label><p>Seçilen türün modülleri uygulanır. Mevcut kanal, rol, yetki ve mesaj geçmişi korunur.</p><label>İçerik kanalı<select name="content">${options(inventory.channels.filter(row => row.type === 0))}</select></label><label>Karşılama kanalı<select name="welcome">${options(inventory.channels.filter(row => row.type === 0))}</select></label><label>Kayıt kanalı<select name="logs">${options(inventory.channels.filter(row => row.type === 0))}</select></label><label>Join to Create ses kanalı<select name="join_to_create">${options(inventory.channels.filter(row => row.type === 2))}</select></label><label>Geçici ses odaları kategorisi<select name="private_voice">${options(inventory.channels.filter(row => row.type === 4))}</select></label><p>Join to Create üç kurulum türünde de açıktır. Katılan üyeye bir ses odası oluşturulur; boşalan oda otomatik temizlenir. Kategori seçilmezse giriş kanalının kategorisi kullanılır.</p><fieldset><legend>Modül seçimi</legend>${payload.moduleStates.map(row => `<label><input type="checkbox" name="module:${esc(row.id)}" ${row.enabled ? 'checked' : ''} ${row.compatibleTypes.includes(payload.setupType) ? '' : 'disabled'}> ${esc(row.id)}</label>`).join('')}</fieldset><label>Üye rolü<select name="memberRole">${options(inventory.roles.filter(row => !row.managed && row.id !== payload.workspace.guildId))}</select></label><label>Yetkili rolü<select name="staffRole">${options(inventory.roles.filter(row => !row.managed && row.id !== payload.workspace.guildId))}</select></label><button type="submit" class="button button-primary">Tam değişiklik önizlemesi</button></form><div data-preview></div>`;
      const form = body.querySelector('form');
      const output = body.querySelector('[data-preview]');
      form.elements.setupType.addEventListener('change', () => {
        const type = form.elements.setupType.value;
        for (const row of payload.moduleStates) {
          const checkbox = form.elements.namedItem(`module:${row.id}`);
          checkbox.checked = row.defaultTypes.includes(type);
          checkbox.disabled = !row.compatibleTypes.includes(type);
        }
      });
      let plan = null;
      form.addEventListener('input', () => { plan = null; output.replaceChildren(); setDirty(true); });
      form.addEventListener('submit', event => {
        event.preventDefault();
        act(form.querySelector('button'), async values => {
          const channelMappings = Object.fromEntries(['content','welcome','logs','join_to_create','private_voice'].filter(key => values.get(key)).map(key => [key, values.get(key)]));
          const modules = Object.fromEntries(payload.moduleStates.map(row => [row.id, values.has(`module:${row.id}`)]));
          const roleMappings = Object.fromEntries([['member', 'memberRole'], ['staff', 'staffRole']].filter(([, key]) => values.get(key)).map(([key, field]) => [key, values.get(field)]));
          const result = await post('/setup/preview', { expectedVersion: payload.version, setupType: values.get('setupType'), channelMappings, roleMappings, modules });
          if (!current()) return;
          plan = result.planId;
          output.innerHTML = `<h3>Değişiklik önizlemesi</h3><p>Discord işlemi: ${result.diff.discordMutationCount}. Süre sonu: ${esc(result.expiresAt)}</p><pre>${esc(JSON.stringify(result.diff.configDiff, null, 2))}</pre><div class="fima-diff-scroll"><table><thead><tr><th>ID</th><th>Tür</th><th>Ad / hedef ad</th><th>Üst kanal / hedef</th><th>Yetki</th><th>Sahiplik</th><th>İşlem</th><th>Geri alma</th></tr></thead><tbody>${result.diff.resourceDiff.map(row => `<tr><td>${esc(row.objectId)}</td><td>${esc(row.type)}</td><td>${esc(row.currentName)} / ${esc(row.proposedName)}</td><td>${esc(row.currentParent || '—')} / ${esc(row.proposedParent || '—')}</td><td>${esc(row.permissionImpact)}</td><td>${esc(row.dependencyOwner)}</td><td>${esc(row.action)}</td><td>${esc(row.rollbackCapability)}</td></tr>`).join('')}</tbody></table></div><p>${esc(result.diff.warnings.join(' '))}</p><button data-apply class="button button-primary">İncelenen yapılandırmayı uygula</button>`;
          output.querySelector('[data-apply]').addEventListener('click', event => act(event.currentTarget, async () => {
            if (!plan) return;
            const applied = await post('/setup/apply', { planId: plan });
            if (!current()) return;
            payload.version = applied.committedVersion; setDirty(false); form.hidden = true;
            output.innerHTML = `<p>Kaydedildi · sürüm ${applied.committedVersion}. Discord nesneleri korundu.</p><button data-rollback class="button">Bu yapılandırmayı geri al</button><button data-refresh class="button">Yenile</button>`;
            output.querySelector('[data-refresh]').onclick = refresh;
            output.querySelector('[data-rollback]').onclick = event => act(event.currentTarget, async () => { await post('/setup/rollback', { planId: plan }); setDirty(false); await refresh(); });
          }));
        });
      });
      const voicePending = (await request(root + '/voice/pending')).pending;
      const voiceHistory = (await request(root + '/voice/history')).history;
      if (!current()) return;
      const voicePanel = document.createElement('section');
      voicePanel.innerHTML = `<h3>Join to Create giriş kanalı oluştur</h3><p>Mevcut bir giriş kanalı varsa yukarıdan seç. Eksikse burada yeni bir ses kanalı oluşturup ses modülüne bağla.</p><form data-voice-create class="config-editor"><label>Kanal adı<input name="name" value="Join to Create" maxlength="100" required></label><label>Kategori<select name="parentId"><option value="">Kategorisiz · sunucu yetkileri</option>${inventory.channels.filter(row => row.type === 4).map(row => `<option value="${esc(row.id)}">${esc(row.name)}</option>`).join('')}</select></label><button class="button" type="submit">Ses kanalını önizle</button></form><div data-voice-preview></div>${voicePending.map(row => `<form data-voice-reconcile="${esc(row.planId)}" class="config-editor"><p>Oluşturma yanıtı bekleniyor: ${esc(row.name)}. Discord'daki kanal kimliğini doğrula.</p><label>Ses kanalı kimliği<input name="channelId" value="${esc(row.createdChannelId || '')}" pattern="[0-9]{16,22}" required></label><button class="button" type="submit">Oluşturulan kanalı doğrula ve bağla</button></form>`).join('')}`;
      body.append(voicePanel);
      for (const row of voiceHistory) {
        const item = document.createElement('div');
        item.innerHTML = `<p>${esc(row.name)} · ${esc(row.channelId)} · ${esc(row.status)}</p>${row.status === 'completed' ? '<button class="button">Ses kanalı bağlamasını geri al · kanal korunur</button>' : ''}`;
        const rollback = item.querySelector('button');
        if (rollback) rollback.onclick = event => act(event.currentTarget, async () => {
          await post('/voice/rollback', { planId: row.planId });
          if (current()) { setDirty(false); await refresh(); }
        });
        voicePanel.append(item);
      }
      const voiceForm = voicePanel.querySelector('[data-voice-create]');
      const voiceOutput = voicePanel.querySelector('[data-voice-preview]');
      let voicePlan = null;
      voiceForm.addEventListener('input', () => { voicePlan = null; voiceOutput.replaceChildren(); setDirty(true); });
      voiceForm.addEventListener('submit', event => {
        event.preventDefault();
        act(voiceForm.querySelector('button'), async fields => {
          const result = await post('/voice/preview', { expectedVersion: payload.version, name: fields.get('name'), parentId: fields.get('parentId') || null });
          if (!current()) return;
          voicePlan = result.planId;
          voiceOutput.innerHTML = `<h4>Yeni ses kanalı: ${esc(result.diff.name)}</h4><p>Kategori: ${esc(result.diff.parentId || 'Kategorisiz')}. Yetkiler: ${result.diff.permissionImpact === 'COPY_CATEGORY_OVERWRITES' ? 'Seçilen kategoriden kopyalanır' : 'Sunucudan alınır'}. Mevcut nesneler korunur. Geri almada yeni kanal silinmez.</p><p>Süre sonu: ${esc(result.expiresAt)}</p><button class="button button-primary">İncelenen ses kanalını oluştur ve bağla</button>`;
          voiceOutput.querySelector('button').onclick = event => act(event.currentTarget, async () => {
            if (!voicePlan) return;
            await post('/voice/apply', { planId: voicePlan });
            if (current()) { setDirty(false); await refresh(); }
          });
        });
      });
      for (const recoveryForm of voicePanel.querySelectorAll('[data-voice-reconcile]')) recoveryForm.addEventListener('submit', event => {
        event.preventDefault();
        act(recoveryForm.querySelector('button'), async fields => {
          await post('/voice/reconcile', { planId: recoveryForm.dataset.voiceReconcile, channelId: fields.get('channelId') });
          if (current()) { setDirty(false); await refresh(); }
        });
      });
      const migrations = (await request(root + '/migration')).migrations;
      if (!current()) return;
      const migrationPanel = document.createElement('section');
      const migrationDiff = steps => `<div class="fima-diff-scroll"><table><thead><tr><th>Nesne ID</th><th>Önce</th><th>Sonra</th><th>Yetki</th><th>Geri alma</th></tr></thead><tbody>${steps.map(step => `<tr><td>${esc(step.objectId)}</td><td>${esc(JSON.stringify(step.before))}</td><td>${esc(JSON.stringify(step.after))}</td><td>${esc(step.permissionImpact)}</td><td>${esc(step.rollbackCapability)}</td></tr>`).join('')}</tbody></table></div>`;
      migrationPanel.innerHTML = `<h3>Kanal ve rol düzeni</h3><p>Önce değişiklikleri incele. Uygulama, doğrulanmış yedek gerektirir. Entegrasyon bağımlılığı belirsizse durur.</p><form data-migration class="config-editor"><label>Nesne<select name="object">${[...inventory.channels.map(row => ({ ...row, kind: 'channel' })), ...inventory.roles.filter(row => !row.managed && row.id !== inventory.guildId).map(row => ({ ...row, kind: 'role' }))].map(row => `<option value="${esc(row.kind + ':' + row.id)}">${esc(row.name)} · ${esc(row.id)}</option>`).join('')}</select></label><label>Yeni ad<input name="name" maxlength="100" required></label><label>Üst kategori · yalnız kanallar<select name="parentId"><option value="">Mevcut kategoriyi koru</option><option value="none">Kategoriden çıkar</option>${inventory.channels.filter(row => row.type === 4).map(row => `<option value="${esc(row.id)}">${esc(row.name)}</option>`).join('')}</select></label><button class="button" type="submit">Düzen değişikliğini önizle</button></form><div data-migration-preview></div><h3>Geçiş günlüğü</h3><div data-migration-history>${migrations.map(plan => `<article><p>${esc(plan.status)} · ${plan.cursor}/${plan.steps.length}</p>${migrationDiff(plan.steps)}${['preview','prepared','applying'].includes(plan.status) ? `<button class="button" data-migration-apply="${esc(plan.planId)}">İncelenen geçişi uygula / devam et</button>` : ''}${['completed','rolling_back'].includes(plan.status) ? `<button class="button" data-migration-rollback="${esc(plan.planId)}">Orijinal düzeni geri getir</button>` : ''}</article>`).join('') || '<p>Geçiş kaydı yok.</p>'}</div>`;
      body.append(migrationPanel);
      const migrationForm = migrationPanel.querySelector('form');
      const migrationOutput = migrationPanel.querySelector('[data-migration-preview]');
      let migrationPlan = null;
      migrationForm.addEventListener('input', () => { migrationPlan = null; migrationOutput.replaceChildren(); setDirty(true); });
      const applyMigration = async planId => { const result = await post('/migration/apply', { planId }); if (current()) { setDirty(false); say(`Geçiş: ${result.status}.`); await refresh(); } };
      migrationForm.addEventListener('submit', event => {
        event.preventDefault();
        act(migrationForm.querySelector('button'), async fields => {
          const [kind, objectId] = fields.get('object').split(':');
          const parentId = fields.get('parentId');
          const result = await post('/migration/preview', { expectedVersion: payload.version, changes: [{ kind, objectId, name: fields.get('name'), ...(parentId ? { parentId: parentId === 'none' ? null : parentId } : {}) }] });
          if (!current()) return;
          migrationPlan = result.planId;
          migrationOutput.innerHTML = `${migrationDiff(result.steps)}<p>Süre sonu: ${esc(result.expiresAt)}</p><button class="button button-primary">İncelenen geçişi uygula</button>`;
          migrationOutput.querySelector('button').onclick = event => act(event.currentTarget, () => migrationPlan && applyMigration(migrationPlan));
        });
      });
      for (const button of migrationPanel.querySelectorAll('[data-migration-apply]')) button.onclick = () => act(button, () => applyMigration(button.dataset.migrationApply));
      for (const button of migrationPanel.querySelectorAll('[data-migration-rollback]')) button.onclick = () => act(button, async () => { await post('/migration/rollback', { planId: button.dataset.migrationRollback }); if (current()) { setDirty(false); await refresh(); } });
      return;
    }
    const polls = await request(root + '/polls');
    const unresolved = await request(root + '/polls/pending');
    if (!current()) return;
    body.innerHTML = `<form class="config-editor"><label>Kanal<select name="channelId" required>${options(inventory.channels.filter(row => row.type === 0))}</select></label><label>Soru<input name="question" maxlength="300" required></label><label>Seçenekler · her satıra bir tane<textarea name="options" rows="4" required placeholder="Seçenek 1&#10;Seçenek 2"></textarea></label><label>Süre (saat)<input name="duration" type="number" min="1" max="768" value="24" required></label><label><input name="multi" type="checkbox"> Birden fazla seçenek</label><button type="submit" class="button button-primary">Anketi önizle</button></form><div data-preview></div><h3>Yayınlanan anketler</h3>${polls.polls.map(row => `<p><a href="${esc(`https://discord.com/channels/${payload.workspace.guildId}/${row.channelId}/${row.messageId}`)}" target="_blank" rel="noopener">${esc(row.messageId)}</a> · ${esc(row.expiresAt)} · ${esc(Date.parse(row.expiresAt) <= Date.now() ? 'Süre doldu' : row.lifecycle)}</p>`).join('') || '<p>Henüz kayıtlı anket yok.</p>'}`;
    const form = body.querySelector('form');
    const output = body.querySelector('[data-preview]');
    const recovery = document.createElement('div');
    recovery.innerHTML = unresolved.pending.length ? `<h3>Doğrulama bekleyen gönderimler</h3><p>Discord’da gönderilmiş anketin mesaj kimliğini gir. Doğrulama anketi yeniden göndermez.</p>${unresolved.pending.map(row => `<form data-reconcile="${esc(row.planId)}" class="config-editor"><p>Kanal: ${esc(row.channelId)} · ${esc(row.deliveryStartedAt)}</p><label>Discord mesaj kimliği<input name="messageId" pattern="[0-9]{16,22}" required></label><button class="button" type="submit">Mevcut anketi doğrula</button></form>`).join('')}` : '';
    body.prepend(recovery);
    for (const recoveryForm of recovery.querySelectorAll('form')) recoveryForm.addEventListener('submit', event => {
      event.preventDefault();
      act(recoveryForm.querySelector('button'), async fields => {
        await post('/polls/reconcile', { planId: recoveryForm.dataset.reconcile, messageId: fields.get('messageId') });
        if (current()) { say('Mevcut Discord anketi doğrulandı.'); recoveryForm.remove(); }
      });
    });
    let plan = null;
    form.addEventListener('input', () => { plan = null; output.replaceChildren(); setDirty(true); });
    form.addEventListener('submit', event => {
      event.preventDefault();
      act(form.querySelector('button'), async fields => {
        const result = await post('/polls/preview', { expectedVersion: payload.version, channelId: fields.get('channelId'), question: fields.get('question'), options: String(fields.get('options')).split('\n').map(row => row.trim()).filter(Boolean), duration: Number(fields.get('duration')), allowMultiselect: fields.has('multi') });
        if (!current()) return;
        plan = result.planId;
        output.innerHTML = `<h3>${esc(result.poll.question)}</h3><ol>${result.poll.options.map(option => `<li>${esc(option)}</li>`).join('')}</ol><p>#${esc(result.channel.name)} · ${result.poll.duration} saat · ${result.poll.allowMultiselect ? 'Çoklu' : 'Tekli'} seçim</p><button data-publish class="button button-primary">Discord’da yayınla</button>`;
        output.querySelector('button').onclick = event => act(event.currentTarget, async () => { if (!plan) return; const published = await post('/polls/publish', { planId: plan }); if (!current()) return; setDirty(false); plan = null; output.innerHTML = `<p>Yayınlandı: <a href="${esc(`https://discord.com/channels/${payload.workspace.guildId}/${published.reference.channelId}/${published.reference.messageId}`)}" target="_blank" rel="noopener">Discord anketi</a></p>`; });
      });
    });
  } catch (error) { say(error.message); }
}
