// Operations and durable recovery plans are scoped to the authorized guild and actor.
export async function renderFimaOperations(panel, payload, context) {
  const { request, csrfToken, escapeHtml: esc, setDirty, refresh, apiUrl } = context;
  const root = `/api/fima-bot/customer/workspaces/${encodeURIComponent(payload.workspace.guildId)}/operations`;
  const marker = {};
  panel.fimaOperationMarker = marker;
  const current = () => panel.fimaOperationMarker === marker && panel.isConnected && context.isCurrent();
  panel.innerHTML = `<div class="module-heading"><div><p class="eyebrow">FIMA · ${esc(payload.setupType)}</p><h2>${esc(({setup:'Kurulum',content:'İçerik Merkezi',polls:'Anketler',integrations:'Entegrasyonlar'})[payload.route])}</h2></div></div><p data-operation-status role="status">Canlı envanter yükleniyor…</p><div data-operation-body></div>`;
  const status = panel.querySelector('[data-operation-status]');
  const body = panel.querySelector('[data-operation-body]');
  body.classList.add('fima-operations');
  const say = message => { if (current()) status.textContent = message; };
  async function post(path, value) {
    const response = await fetch(apiUrl(root + path), { method: 'POST', credentials: 'include', headers: { 'Content-Type':'application/json', 'x-fima-csrf': await csrfToken(), Accept:'application/json' }, body: JSON.stringify(value) });
    const data = await response.json();
    if (!response.ok || data.success === false) throw new Error(data.error || 'operation_failed');
    return data;
  }
  let pending = false;
  async function act(button, work) {
    if (pending || !current()) return;
    pending = true; button.disabled = true;
    const fields = [...body.querySelectorAll('input, select, textarea, button')].filter(field => field !== button).map(field => [field, field.disabled]);
    // Capture FormData before disabling controls, then freeze edits during I/O.
    const captured = button.closest('form') ? new FormData(button.closest('form')) : null;
    fields.forEach(([field]) => { field.disabled = true; });
    try { await work(captured); } catch (error) { say(error.message); }
    finally { pending = false; if (current()) { button.disabled = false; fields.forEach(([field, disabled]) => { field.disabled = disabled; }); } }
  }
  try {
    const inventory = (await request(root + '/inspect')).inventory;
    if (!current()) return;
    say(`${inventory.channels.length} kanal · ${inventory.roles.length} rol · Canlı sunucu`);
    const options = resources => '<option value="">Mevcut eşleşmeyi koru</option>' + resources.map(row => `<option value="${esc(row.id)}">${esc(row.name)} · ${esc(row.id)}</option>`).join('');
    if (payload.route === 'integrations' || payload.route === 'content') {
      const rows = inventory.integrations || [];
      body.innerHTML = `<p>NotifyMe, EG ve Openclaw gibi harici üreticiler korunur. FIMA yerel TikTok gönderimi kapalıdır.</p><p>Son teslimat: gözlemlenmedi. Webhook adresleri ve tokenlar gösterilmez.</p><div class="config-grid">${rows.map(row => `<article class="config-card"><h3>${esc(row.provider)}</h3><p>Uygulama: ${esc(row.applicationId || 'Bilinmiyor')}</p><p>Hedef: ${esc(row.destinationChannelId || 'Doğrulanmadı')}</p><p>Sahip: ${esc(row.ownerId || 'Bilinmiyor')} · Amaç: ${esc(row.purpose || 'Bilinmiyor')}</p><p>${esc(row.state)} · ${esc(row.health)}</p><small>${esc(row.id)}</small></article>`).join('') || '<p>Bu incelemede entegrasyon bulunamadı.</p>'}</div><p>${esc((inventory.errors || []).join(', '))}</p>${payload.route === 'content' ? `<p>İçerik üretimi için <a href="/fima-bot/dashboard/servers/${esc(payload.workspace.guildId)}/polls">Anketler</a> modülünü kullan.</p>` : ''}`;
      return;
    }
    if (payload.route === 'setup') {
      body.innerHTML = `<form data-wizard class="config-editor"><label>Kurulum türü<select name="setupType">${['community','clan','tsbtr'].map(type => `<option ${type === payload.setupType ? 'selected' : ''}>${type}</option>`).join('')}</select></label><p>Seçilen türün modülleri uygulanır. Mevcut kanal, rol, yetki ve mesaj geçmişi korunur.</p><fieldset><legend>Kanal eşleşmeleri</legend><label>İçerik kanalı<select name="content">${options(inventory.channels.filter(row => row.type === 0))}</select></label><label>Giriş ve çıkış kanalı<select name="welcome">${options(inventory.channels.filter(row => row.type === 0))}</select></label><label>Kayıt kanalı<select name="logs">${options(inventory.channels.filter(row => row.type === 0))}</select></label><label>Join to Create ses kanalı<select name="join_to_create">${options(inventory.channels.filter(row => row.type === 2))}</select></label><label>Geçici ses odaları kategorisi<select name="private_voice">${options(inventory.channels.filter(row => row.type === 4))}</select></label></fieldset><p>Join to Create üç kurulum türünde de açıktır. Katılan üyeye bir ses odası oluşturulur; boşalan oda otomatik temizlenir. Kategori seçilmezse giriş kanalının kategorisi kullanılır.</p><fieldset><legend>Modül seçimi</legend>${payload.moduleStates.map(row => `<label><input type="checkbox" name="module:${esc(row.id)}" ${row.enabled ? 'checked' : ''} ${row.compatibleTypes.includes(payload.setupType) ? '' : 'disabled'}> ${esc(({welcome:'Giriş ve çıkış',roles:'Rol seçimi',profiles:'Profiller',security:'Güvenlik',moderation:'Moderasyon',social:'Topluluk',content:'İçerik',polls:'Anketler',events:'Etkinlikler',voice:'Ses odaları',logs:'Kayıtlar',levels:'Seviyeler',tickets:'Destek'})[row.id] || row.id)}</label>`).join('')}</fieldset><fieldset><legend>Rol eşleşmeleri</legend><label>Üye rolü<select name="memberRole">${options(inventory.roles.filter(row => !row.managed && row.id !== payload.workspace.guildId))}</select></label><label>Yetkili rolü<select name="staffRole">${options(inventory.roles.filter(row => !row.managed && row.id !== payload.workspace.guildId))}</select></label></fieldset><button type="submit" class="button button-primary">Tam değişiklik önizlemesi</button></form><div data-preview></div>`;
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
          const bindingLabel = id => inventory.channels.find(row => row.id === id)?.name || inventory.roles.find(row => row.id === id)?.name || id;
          const describe = value => value && typeof value === 'object' ? Object.entries(value).map(([key, val]) => `${key}: ${typeof val === 'boolean' ? val ? 'Açık' : 'Kapalı' : bindingLabel(val)}`).join(' · ') : String(value || 'Ayarlanmamış');
          output.innerHTML = `<h3>Değişiklik önizlemesi</h3><div class="fima-change-list">${result.diff.configDiff.map(row => `<article class="fima-change"><strong>${esc(({activeSetupMode:'Kurulum türü',modules:'Modüller',channelMappings:'Kanallar',roleMappings:'Roller'})[row.key] || row.key)}</strong><p>${esc(describe(row.after))}</p></article>`).join('') || '<p>Eşleşmeler güncel.</p>'}</div><p>Kanal ve rol kimlikleri korunur. Bu adım yalnız FIMA eşleşmelerini kaydeder.</p><button data-apply class="button button-primary">Yapılandırmayı kaydet</button>`;
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
      const voicePanel = document.createElement('details');
      voicePanel.innerHTML = `<summary>Yeni ses giriş kanalı ve kurtarma</summary><p>Mevcut bir giriş kanalı varsa yukarıdan seç. Eksikse burada yeni bir ses kanalı oluşturup ses modülüne bağla.</p><form data-voice-create class="config-editor"><label>Kanal adı<input name="name" value="Join to Create" maxlength="100" required></label><label>Kategori<select name="parentId"><option value="">Kategorisiz · sunucu yetkileri</option>${inventory.channels.filter(row => row.type === 4).map(row => `<option value="${esc(row.id)}">${esc(row.name)}</option>`).join('')}</select></label><button class="button" type="submit">Ses kanalını önizle</button></form><div data-voice-preview></div>${voicePending.map(row => `<form data-voice-reconcile="${esc(row.planId)}" class="config-editor"><p>Oluşturma yanıtı bekleniyor: ${esc(row.name)}. Discord'daki kanal kimliğini doğrula.</p><label>Ses kanalı kimliği<input name="channelId" value="${esc(row.createdChannelId || '')}" pattern="[0-9]{16,22}" required></label><button class="button" type="submit">Oluşturulan kanalı doğrula ve bağla</button></form>`).join('')}`;
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
      const categoryName = id => inventory.channels.find(row => row.id === id)?.name || 'Kategorisiz';
      const migrationDiff = steps => `<div class="fima-change-list">${steps.map(step => `<article class="fima-change"><strong>${esc(step.before.name)} → ${esc(step.after.name)}</strong>${Object.hasOwn(step.after, 'parentId') ? `<p>${esc(categoryName(step.before.parentId))} → ${esc(categoryName(step.after.parentId))}</p>` : ''}${Object.hasOwn(step.after, 'hoist') ? `<p>Üye listesinde ayrı gösterim: ${step.after.hoist ? 'Açık' : 'Kapalı'}</p>` : ''}<small>Kimlik ve yetkiler korunur · geri alınabilir${step.applicationReview ? ' · bot devri bekliyor' : ''}</small></article>`).join('')}</div>`;
      const categories = inventory.channels.filter(row => row.type === 4);
      const editable = [...inventory.channels.map(row => ({...row, kind: 'channel'})), ...inventory.roles.filter(row => !row.managed && row.id !== inventory.guildId).map(row => ({...row, kind: 'role'}))];
      migrationPanel.innerHTML = `<h3>Kanal ve rol düzeni</h3><p>Adları ve kategorileri birlikte düzenle. Yalnız değiştirdiğin satırlar önizlemeye eklenir.</p><form data-migration class="config-editor"><div class="fima-channel-editor">${editable.map((row, index) => `${row.kind === 'role' && editable[index-1]?.kind !== 'role' ? '<details><summary>Rol adları ve gösterimi</summary>' : ''}<div class="fima-channel-row" data-object="${esc(row.kind + ':' + row.id)}"><label>${esc(row.kind === 'role' ? 'Rol' : row.type === 4 ? 'Kategori' : 'Kanal')} · ${esc(row.name)}<input name="name:${esc(row.id)}" aria-label="${esc(row.name)} yeni adı" value="${esc(row.name)}" maxlength="100" required></label>${row.kind === 'channel' && row.type !== 4 ? `<label>Kategori<select name="parent:${esc(row.id)}"><option value="none" ${!row.parentId ? 'selected' : ''}>Kategorisiz</option>${categories.map(cat => `<option value="${esc(cat.id)}" ${row.parentId === cat.id ? 'selected' : ''}>${esc(cat.name)}</option>`).join('')}</select></label>` : row.kind === 'role' ? `<label><input type="checkbox" name="hoist:${esc(row.id)}" ${row.hoist ? 'checked' : ''}> Üye listesinde ayrı göster</label>` : '<span></span>'}</div>${row.kind === 'role' && index === editable.length - 1 ? '</details>' : ''}`).join('')}</div><label><input name="stagedMetadataTakeover" type="checkbox"> Bot görevleri FIMA’ya devredilecek. Geçiş sırasında mevcut botlar ve kanal kimlikleri korunacak.</label><button class="button button-primary" type="submit">Değişiklikleri önizle</button></form><div data-migration-preview></div><details><summary>Geçiş geçmişi · ${migrations.length}</summary><div data-migration-history>${migrations.map(plan => `<details><summary>${esc(plan.status)} · ${plan.cursor}/${plan.steps.length} değişiklik</summary>${migrationDiff(plan.steps)}${['prepared','applying'].includes(plan.status) || (plan.status === 'preview' && Date.parse(plan.expiresAt) > Date.now()) ? `<button class="button" data-migration-apply="${esc(plan.planId)}">Geçişi uygula / devam et</button>` : ''}${['completed','rolling_back'].includes(plan.status) ? `<button class="button" data-migration-rollback="${esc(plan.planId)}">Orijinal düzeni geri getir</button>` : ''}</details>`).join('') || '<p>Geçiş kaydı yok.</p>'}</div></details>`;
      body.append(migrationPanel);
      const migrationForm = migrationPanel.querySelector('form');
      const migrationOutput = migrationPanel.querySelector('[data-migration-preview]');
      let migrationPlan = null;
      migrationForm.addEventListener('input', () => { migrationPlan = null; migrationOutput.replaceChildren(); setDirty(true); });
      const applyMigration = async planId => { const result = await post('/migration/apply', { planId }); if (current()) { setDirty(false); say(`Geçiş: ${result.status}.`); await refresh(); } };
      migrationForm.addEventListener('submit', event => {
        event.preventDefault();
        act(migrationForm.querySelector('button'), async fields => {
          const changes = editable.flatMap(row => {
            const name = String(fields.get(`name:${row.id}`) || '').trim();
            const parent = fields.get(`parent:${row.id}`);
            const parentId = parent === 'none' ? null : parent;
            const renamed = name !== row.name;
            const moved = parent !== null && parentId !== (row.parentId ?? null);
            const hoist = fields.has(`hoist:${row.id}`);
            const displayChanged = row.kind === 'role' && hoist !== (row.hoist === true);
            return renamed || moved || displayChanged ? [{ kind: row.kind, objectId: row.id, ...(renamed ? {name} : {}), ...(moved ? {parentId} : {}), ...(displayChanged ? {hoist} : {}) }] : [];
          });
          if (!changes.length) { say('Henüz bir değişiklik yapmadın.'); return; }
          const result = await post('/migration/preview', { expectedVersion: payload.version, stagedMetadataTakeover: fields.has('stagedMetadataTakeover'), changes });
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
