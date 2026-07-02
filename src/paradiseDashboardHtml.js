export function paradiseDashboardHtml({ clientId, apiBaseUrl = "https://api.fimamacro.com", frontendUrl = "https://fimamacro.com" }) {
  const invite = `https://discord.com/oauth2/authorize?client_id=${encodeURIComponent(clientId || "")}&permissions=8&scope=bot%20applications.commands`;
  const apiBase = String(apiBaseUrl || "https://api.fimamacro.com").replace(/\/+$/, "");
  const siteBase = String(frontendUrl || "https://fimamacro.com").replace(/\/+$/, "");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,nofollow,noarchive">
  <title>Paradise Owner Console</title>
  <style>
    :root{--brand:#000;--brand-soft:#ffffff12;--panel:#111016;--panel2:#18161f;--line:#302d39;--text:#f7f5fa;--muted:#aaa5b4;--good:#64dca0;--warn:#ffca67;--bad:#ff758b}
    *{box-sizing:border-box}[hidden]{display:none!important}body{margin:0;background:radial-gradient(circle at 16% -8%,var(--brand-soft),transparent 30%),#08080a;color:var(--text);font:15px Inter,Segoe UI,Arial,sans-serif}
    main{width:min(1240px,calc(100% - 28px));margin:24px auto 60px}.hero,.panel{border:1px solid var(--line);background:linear-gradient(180deg,#15131b,#0e0d12);border-radius:16px;box-shadow:0 20px 60px #0008}
    .hero{padding:26px;border-left:5px solid var(--brand)}.badge{color:#d7d3dc;font-weight:900;text-transform:uppercase;letter-spacing:.11em;font-size:12px}
    h1{font-size:clamp(30px,5vw,44px);margin:7px 0 4px}h2{margin:0 0 4px;font-size:21px}h3{margin:18px 0 8px;font-size:15px;color:#ddd9e3}.muted,.help{color:var(--muted)}.help{margin:4px 0 14px;font-size:13px;line-height:1.45}
    .chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px}.chip{border:1px solid var(--line);border-radius:999px;padding:7px 10px;background:#0c0b10;color:#d8d4dd;font-size:12px}.chip.good{border-color:#23583d;color:var(--good)}.chip.bad{border-color:#6a2937;color:var(--bad)}
    .layout{display:grid;grid-template-columns:minmax(0,1fr) minmax(300px,.72fr);gap:14px;margin-top:14px}.stack{display:grid;gap:14px}.panel{padding:20px}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.grid.three{grid-template-columns:repeat(3,minmax(0,1fr))}
    label{display:block;margin:10px 0 6px;font-weight:800;font-size:13px}input,select,textarea,button,a.button{width:100%;border-radius:10px;border:1px solid var(--line);background:#09090c;color:#fff;padding:11px;font:inherit}
    textarea{min-height:120px;resize:vertical}button,a.button{display:block;text-align:center;text-decoration:none;margin-top:11px;background:linear-gradient(135deg,var(--brand),#29262f);border-color:#514c59;font-weight:900;cursor:pointer}
    button.secondary{background:#17151d}.tip{display:inline-grid;place-items:center;width:18px;height:18px;margin-left:5px;border:1px solid #5a5562;border-radius:50%;font-size:11px;color:#d8d4dd;cursor:help}
    .switch{display:flex;gap:9px;align-items:center;font-weight:700;margin:9px 0}.switch input{width:auto}.color-row{display:grid;grid-template-columns:72px 1fr;gap:10px}.color-row input[type=color]{height:45px;padding:3px}
    .mapping{display:grid;grid-template-columns:minmax(150px,.8fr) minmax(180px,1.2fr);gap:8px;align-items:center;margin:7px 0}.mapping label{margin:0}.danger{border-color:#6a2937;background:linear-gradient(180deg,#241016,#110b0e)}.danger h2{color:#ff9aaa}.notice{padding:12px;border:1px solid #55451f;background:#1c170c;border-radius:10px;color:#ffe0a0;line-height:1.5}
    .status{white-space:pre-wrap;word-break:break-word;max-height:440px;overflow:auto;background:#09090c;border:1px solid var(--line);border-radius:10px;padding:12px;color:#d7d3dc;font:12px ui-monospace,Consolas,monospace}
    .toast{position:fixed;right:18px;bottom:18px;max-width:420px;padding:13px 16px;border-radius:11px;background:#17151d;border:1px solid var(--line);box-shadow:0 15px 45px #0009;display:none}.toast.ok{display:block;color:var(--good)}.toast.error{display:block;color:var(--bad)}
    .access{max-width:720px;margin:10vh auto 0;text-align:center;padding:34px}.access-icon{width:54px;height:54px;margin:0 auto 16px;display:grid;place-items:center;border:1px solid var(--line);border-radius:16px;background:#09090c;font-size:25px}.access-actions{display:flex;gap:10px;justify-content:center;margin-top:20px}.access-actions .button{width:auto;min-width:190px}.template-cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.template-card{padding:14px;border:1px solid var(--line);border-radius:12px;background:#0b0a0e;text-align:left}.template-card strong,.template-card span{display:block}.template-card span{color:var(--muted);font-size:12px;margin-top:5px;line-height:1.4}.template-card.is-active{border-color:var(--good);box-shadow:0 0 0 1px #23583d}.preview-card{margin-top:10px;padding:15px;border-left:5px solid var(--brand);background:#09090c;border-radius:10px}.permission-list{display:grid;gap:8px}.permission-item{padding:11px;border:1px solid var(--line);border-radius:10px;background:#0a090d}.permission-item strong{display:block;margin-bottom:4px}.guide-actions{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
    @media(max-width:900px){.layout{grid-template-columns:1fr}.grid,.grid.three,.template-cards,.guide-actions{grid-template-columns:1fr}.mapping{grid-template-columns:1fr}.mapping label{margin-top:8px}.access-actions{flex-direction:column}.access-actions .button{width:100%}}
  </style>
</head>
<body>
<main>
  <section class="panel access" id="accessGate" aria-live="polite">
    <div class="access-icon">✦</div>
    <div class="badge">Paradise owner access</div>
    <h1 id="accessTitle">Checking secure session…</h1>
    <p class="muted" id="accessMessage">Your Fima login and linked Discord identity are checked without exposing account details.</p>
    <div class="access-actions" id="accessActions"></div>
  </section>
  <div id="console" hidden>
  <section class="hero">
    <div class="badge">Owner-only · Fima account + Discord identity protected</div>
    <h1>Paradise Operations Console</h1>
    <p class="muted">Configure the test guild, challenge rules, channel routing, profiles, staff automation and safe setup metadata. No bot credential is exposed here.</p>
    <div class="chips"><span class="chip" id="guildChip">Guild: loading</span><span class="chip" id="botChip">Bot: loading</span><span class="chip" id="syncChip">Commands: loading</span><span class="chip" id="templateChip">Template: loading</span></div>
  </section>

  <div class="layout">
    <div class="stack">
      <section class="panel">
        <h2>Identity & installation <span class="tip" title="Administrator is allowed only for the isolated test setup. Production should use least privilege.">?</span></h2>
        <p class="help">Application ID and connected guild state are read live from the Paradise bot runtime.</p>
        <a class="button" href="${invite}" rel="noopener">Invite Paradise to another server</a>
      </section>

      <section class="panel">
        <h2>Template & appearance</h2>
        <p class="help">Selecting a template here stores the owner preference. Destructive setup still requires backup, preview and Discord-side final confirmation.</p>
        <div class="template-cards">
          <button class="template-card" data-template="tsbtr"><strong>TSBTR setup</strong><span>Large community, leaderboard, referee and staff operations.</span></button>
          <button class="template-card" data-template="community"><strong>Fieel's Community</strong><span>Fima product, support, security and community channels.</span></button>
          <button class="template-card" data-template="clan"><strong>Paradise Clan</strong><span>Training, tryout, challenge, events and clan relations.</span></button>
        </div>
        <div class="grid">
          <div><label for="template">Active template <span class="tip" title="Community, Clan and TSBTR remain separate schemas.">?</span></label><select id="template"><option value="community">Fieel's Community</option><option value="clan">Paradise Clan</option><option value="tsbtr">TSBTR-style</option></select><button data-save="template">Save template</button></div>
          <div><label>Embed accent <span class="tip" title="Black is the default. This controls the Discord embed side strip and Paradise accent.">?</span></label><div class="color-row"><input id="brandPicker" type="color" value="#000000" aria-label="Brand color"><input id="brandHex" maxlength="7" value="#000000" spellcheck="false"></div><button class="secondary" id="previewBrand">Preview appearance</button><button data-save="branding">Save color</button></div>
        </div>
        <div class="preview-card" id="brandPreview"><b>✦ Paradise premium black embed</b><p class="help">Headings, compact sections and a configurable accent strip.</p></div>
      </section>

      <section class="panel">
        <h2>Challenge system</h2>
        <p class="help">Controls ranked target distance and result-generated cooldown/immunity. Selection is rechecked when the user chooses and again before the ticket opens.</p>
        <div class="grid three">
          <div><label for="topSize">Leaderboard size</label><input id="topSize" type="number" min="2" max="100"></div>
          <div><label for="top10Range">Top 1–10 range</label><input id="top10Range" type="number" min="1" max="10"></div>
          <div><label for="top20Range">Top 11–20 range</label><input id="top20Range" type="number" min="1" max="10"></div>
          <div><label for="top30Range">Top 21+ range</label><input id="top30Range" type="number" min="1" max="10"></div>
          <div><label for="cooldownDays">Normal cooldown days</label><input id="cooldownDays" type="number" min="1" max="30"></div>
          <div><label for="top10CooldownDays">Top 10 cooldown days</label><input id="top10CooldownDays" type="number" min="1" max="30"></div>
          <div><label for="immunityDays">Normal immunity days</label><input id="immunityDays" type="number" min="1" max="30"></div>
        </div>
        <label class="switch"><input id="proofRequired" type="checkbox"> Require proof on configured challenge results</label>
        <button data-save="challenge">Save challenge rules</button>
      </section>

      <section class="panel">
        <h2>Discord channel mappings</h2>
        <p class="help">These mappings remove mystery channel names. Slash command <b>/set</b> updates the same fields.</p>
        <div id="mappingFields"></div>
        <button data-save="channelMappings">Save channel mappings</button>
      </section>

      <section class="panel">
        <h2>Discord role mappings <span class="tip" title="Maps operational authority labels to real guild roles. The bot still enforces role hierarchy and cannot manage roles above itself.">?</span></h2>
        <p class="help">Use explicit mappings for referee, hoster and setup authority. Empty fields keep the safe role-name fallback.</p>
        <div id="roleMappingFields"></div>
        <button data-save="roleMappings">Save role mappings</button>
      </section>

      <section class="panel">
        <h2>Profiles, LOA & activity</h2>
        <div class="grid">
          <div>
            <h3>Verification</h3>
            <label for="codeExpiryMinutes">Short-code expiry (minutes)</label><input id="codeExpiryMinutes" type="number" min="3" max="30">
            <label class="switch"><input id="requireProfileForTrainingResult" type="checkbox"> Require complete profile for training results</label>
            <button data-save="verification">Save verification</button>
          </div>
          <div>
            <h3>LOA</h3>
            <label for="loaMaxDays">Maximum LOA days</label><input id="loaMaxDays" type="number" min="1" max="365">
            <label class="switch"><input id="loaEvidence" type="checkbox"> Require evidence</label>
            <label class="switch"><input id="loaAutoExpire" type="checkbox"> Auto-expire approved LOA</label>
            <button data-save="loa">Save LOA</button>
          </div>
          <div>
            <h3>Activity checks</h3>
            <label for="checkEveryHours">Check interval (hours)</label><input id="checkEveryHours" type="number" min="24" max="168">
            <label for="responseDeadlineHours">Response deadline (hours)</label><input id="responseDeadlineHours" type="number" min="1" max="72">
            <label for="promotionMultiplier">Promotion multiplier</label><input id="promotionMultiplier" type="number" min="2" max="10">
            <label class="switch"><input id="autoRoleChanges" type="checkbox"> Allow automatic role changes</label>
            <button data-save="activity">Save activity policy</button>
          </div>
          <div>
            <h3>AutoMod</h3>
            <label class="switch"><input id="automodEnabled" type="checkbox"> Enable Paradise AutoMod</label>
            <label class="switch"><input id="blockInvites" type="checkbox"> Block unapproved invites</label>
            <label class="switch"><input id="blockScamKeywords" type="checkbox"> Block scam patterns</label>
            <label for="mentionSpamLimit">Mention spam limit</label><input id="mentionSpamLimit" type="number" min="3" max="50">
            <button data-save="automod">Save AutoMod policy</button>
          </div>
        </div>
      </section>

      <section class="panel">
        <h2>Referee & hoster permissions</h2>
        <p class="help">These boundaries are enforced by the bot. Discord role hierarchy is checked again before role changes.</p>
        <div class="permission-list">
          <div class="permission-item"><strong>Trial Referee / Referee <span class="tip" title="They may submit work, but cannot approve or deny score posts.">?</span></strong><span class="muted">Submit challenge results; no approval authority.</span></div>
          <div class="permission-item"><strong>Experienced Referee / Referee Manager <span class="tip" title="Approval actions are audited and cannot be delegated to normal referees.">?</span></strong><span class="muted">Approve or deny score posts and review referee work.</span></div>
          <div class="permission-item"><strong>Training / Tryout hosters <span class="tip" title="Rank assignment runs through structured bot controls; hosters do not need broad Manage Roles permission.">?</span></strong><span class="muted">Create sessions and results within configured authority and quotas.</span></div>
          <div class="permission-item"><strong>Automatic role changes <span class="tip" title="Disabled by default. Missed quotas create recommendations unless explicitly enabled.">?</span></strong><span class="muted">Requires both automation and explicit automatic-role-change opt-in.</span></div>
        </div>
      </section>

      <section class="panel">
        <h2>Relations board settings</h2>
        <p class="help">The live board keeps Current Allies and Enemy Clans separate. Add, edit and remove entries with the audited <b>/relation</b> commands.</p>
        <div class="grid">
          <label class="switch"><input id="displayRelationInvites" type="checkbox"> Display approved server invites <span class="tip" title="Invite links are shown only when leadership stored one on the relation entry.">?</span></label>
          <label class="switch"><input id="showRelationRepresentatives" type="checkbox"> Show clan representatives <span class="tip" title="Displays the linked Discord representative when configured.">?</span></label>
          <div><label for="relationSortMode">Board sorting <span class="tip" title="Alphabetical is easiest to scan; updated shows recently changed relations first.">?</span></label><select id="relationSortMode"><option value="alphabetical">Alphabetical</option><option value="updated">Recently updated</option></select></div>
        </div>
        <button data-save="relations">Save relation display</button>
        <div class="status" id="relationSummary">Loading relation counters…</div>
      </section>

      <section class="panel">
        <h2>Guide & handbook repost</h2>
        <p class="help">Updates existing premium black TR/EN guide messages where possible. This sends Discord messages and is recorded in the audit log.</p>
        <div class="guide-actions">
          <button data-guide-mode="community">Repost Community guides</button>
          <button data-guide-mode="clan">Repost Clan guides</button>
          <button data-guide-mode="tsbtr">Repost TSBTR guides</button>
        </div>
      </section>

      <section class="panel">
        <h2>Advanced operations</h2>
        <div class="grid">
          <div><label for="mainer">Official mainer code</label><input id="mainer" maxlength="32"><button data-save="mainer">Save code</button></div>
          <div><label for="quotas">Weekly quota JSON <span class="tip" title="Advanced field. Role names map to activity keys and minimum counts.">?</span></label><textarea id="quotas"></textarea><button data-save="quotas">Save quotas</button></div>
          <div><label for="channels">Command-channel JSON <span class="tip" title="Advanced fallback. Prefer /commandchannel for normal changes.">?</span></label><textarea id="channels"></textarea><button data-save="channels">Save restrictions</button></div>
          <div><h3>Automation</h3><label class="switch"><input id="autoChecks" type="checkbox"> Automatic activity checks</label><label class="switch"><input id="autoRemoval" type="checkbox"> Remove roles after missed deadline</label><button data-save="automation">Save automation</button></div>
        </div>
      </section>

      <section class="panel danger">
        <h2>Danger zone</h2>
        <div class="notice"><b>No destructive action is available from this page.</b> Run <b>/setupfieelstsbtr</b>, <b>/setupfieelscommunity</b> or <b>/setupfieelsclan</b> in the isolated test guild. Paradise creates a backup, shows a create/remove preview, then requires the exact typed confirmation. Repair and handbook repost modes do not delete channels or roles.</div>
        <button class="secondary" id="exportConfig">Export safe configuration</button>
      </section>
    </div>

    <aside class="stack">
      <section class="panel"><h2>Live runtime</h2><p class="help">Sanitized bot, guild and command-sync state. Tokens and secrets are never returned.</p><div class="status" id="runtimeStatus">Loading…</div><button id="refresh">Refresh live state</button></section>
      <section class="panel"><h2>Current counters</h2><div class="status" id="summaryStatus">Loading…</div></section>
      <section class="panel"><h2>Restore notes</h2><p class="help">Backups contain category, channel, role and permission-overwrite metadata. Restore remains an owner-confirmed Discord operation; it is not silently executed from the website.</p></section>
    </aside>
  </div>
  </div>
</main>
<div class="toast" id="toast"></div>
<script>
const API_BASE=${JSON.stringify(apiBase)};
const SITE_BASE=${JSON.stringify(siteBase)};
const CHANNEL_KEYS=[
  ['challenge_channel','Challenge create panel'],['challenge_rules_channel','Challenge rules'],['challenge_results_channel','Challenge results'],['availability_channel','Availability'],
  ['loa_channel','LOA'],['tryout_channel','Tryout'],['tryout_results_channel','Tryout results'],['training_channel','Training'],['training_results_channel','Training results'],
  ['referee_works_channel','Referee works'],['activity_logs_channel','Activity logs'],['activity_check_channel','Activity check'],['relation_panel_channel','Relations board'],
  ['role_guide_channel','Role guide'],['faq_channel','FAQ / trust'],['staff_report_channel','Staff reports'],['support_ticket_channel','Support tickets'],['application_ticket_channel','Applications']
];
const ROLE_KEYS=[
  ['owner_role','Owner'],['overseer_role','Overseer'],['community_manager_role','Community Manager'],['training_manager_role','Training Manager'],
  ['referee_manager_role','Referee Manager'],['experienced_referee_role','Experienced Referee'],['referee_role','Referee'],['trial_referee_role','Trial Referee'],
  ['training_supervisor_role','Training Supervisor'],['training_hoster_role','Training Hoster'],['tryout_supervisor_role','Tryout Supervisor'],['tryout_hoster_role','Tryout Hoster']
];
let currentPayload=null;
const byId=id=>document.getElementById(id);
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
function show(message,ok=true){const el=byId('toast');el.className='toast '+(ok?'ok':'error');el.textContent=message;setTimeout(()=>el.className='toast',4500)}
function applyBrand(value){document.documentElement.style.setProperty('--brand',value);document.documentElement.style.setProperty('--brand-soft',value+'33')}
function number(id,fallback){return Number(byId(id).value)||fallback}
function buildMappings(runtime,mappings){
  const channels=(runtime&&runtime.channels||[]).filter(c=>c.type===0||c.type===5);
  byId('mappingFields').innerHTML=CHANNEL_KEYS.map(([key,label])=>{
    const options=['<option value="">Not configured</option>'].concat(channels.map(c=>'<option value="'+c.id+'" '+(mappings[key]===c.id?'selected':'')+'>#'+escapeHtml(c.name)+'</option>'));
    return '<div class="mapping"><label for="map_'+key+'">'+label+' <span class="tip" title="Stored as '+key+'">?</span></label><select id="map_'+key+'">'+options.join('')+'</select></div>';
  }).join('');
}
function buildRoleMappings(runtime,mappings){
  const roles=(runtime&&runtime.roles||[]).filter(role=>!role.managed&&role.name!=='@everyone').sort((a,b)=>b.position-a.position);
  byId('roleMappingFields').innerHTML=ROLE_KEYS.map(([key,label])=>{
    const options=['<option value="">Safe name fallback</option>'].concat(roles.map(role=>'<option value="'+role.id+'" '+(mappings[key]===role.id?'selected':'')+'>'+escapeHtml(role.name)+'</option>'));
    return '<div class="mapping"><label for="role_'+key+'">'+label+' <span class="tip" title="Stored as '+key+'">?</span></label><select id="role_'+key+'">'+options.join('')+'</select></div>';
  }).join('');
}
function renderAccess(status){
  const gate=byId('accessGate'),actions=byId('accessActions');
  actions.innerHTML='';
  if(status.ownerAuthorized){
    gate.hidden=true;byId('console').hidden=false;return true;
  }
  gate.hidden=false;byId('console').hidden=true;
  if(status.reasonCode==='login_required'){
    byId('accessTitle').textContent='Fima login required';
    byId('accessMessage').textContent='Sign in with the Fima account that owns the Paradise console. You will return here after login.';
    actions.innerHTML='<a class="button" href="/login?next=%2Fparadise">Sign in to Fima</a>';
  }else if(status.reasonCode==='discord_link_required'){
    byId('accessTitle').textContent='Discord account required';
    byId('accessMessage').textContent='Your Fima account is signed in, but Discord is not linked. Link the owner Discord account to continue.';
    actions.innerHTML='<a class="button" href="'+API_BASE+'/auth/discord/start?returnTo=%2Fparadise">Link Discord account</a><a class="button secondary" href="/dashboard/connected-accounts">Account settings</a>';
  }else if(status.reasonCode==='not_owner'){
    byId('accessTitle').textContent='Paradise access is restricted';
    byId('accessMessage').textContent='This signed-in account is not authorized to open the Paradise owner console.';
    actions.innerHTML='<a class="button secondary" href="/dashboard/connected-accounts">Review linked accounts</a>';
  }else{
    byId('accessTitle').textContent='Session check unavailable';
    byId('accessMessage').textContent='The secure account check could not be completed. Refresh or try again shortly.';
    actions.innerHTML='<button onclick="start()">Try again</button>';
  }
  return false;
}
async function sessionStatus(){
  const response=await fetch(API_BASE+'/api/paradise/session-status',{credentials:'include',headers:{accept:'application/json'},cache:'no-store'});
  if(!response.ok&&response.status>=500)throw new Error('session_check_failed');
  return response.json();
}
async function load(){
  const r=await fetch(API_BASE+'/api/paradise/config',{credentials:'include',headers:{accept:'application/json'},cache:'no-store'});const j=await r.json();
  if(!r.ok){show(j.error||'Failed to load',false);return}
  currentPayload=j;const c=j.config||{},rt=j.runtime||{},ch=c.challenge||{},loa=c.loa||{},ver=c.verification||{},act=c.activity||{},am=c.automod||{},rel=c.relationSettings||{};
  const guildLabel=rt.guild?rt.guild.name+' · …'+String(rt.guild.id||'').slice(-6):'unavailable';
  byId('guildChip').textContent='Guild: '+guildLabel;byId('guildChip').className='chip '+(rt.status==='ready'?'good':'bad');
  const identity=rt.botIdentity||{};byId('botChip').textContent='Bot: '+(rt.status==='ready'?(identity.nicknameMatches?'Paradise online':'name check needed'):'unavailable');byId('botChip').className='chip '+(rt.status==='ready'&&identity.nicknameMatches?'good':'bad');
  byId('syncChip').textContent='Commands: '+((rt.commandSync&&rt.commandSync.count)||0)+' · '+((rt.commandSync&&rt.commandSync.lastError)||'synced');byId('syncChip').className='chip '+(rt.commandSync&&rt.commandSync.lastError?'bad':'good');
  byId('templateChip').textContent='Template: '+(c.activeSetupMode||'not selected');
  byId('template').value=c.activeSetupMode||'clan';byId('mainer').value=c.mainerCode||'';byId('quotas').value=JSON.stringify(c.weeklyQuotas||{},null,2);byId('channels').value=JSON.stringify(c.commandChannels||{},null,2);
  document.querySelectorAll('[data-template]').forEach(card=>card.classList.toggle('is-active',card.dataset.template===byId('template').value));
  byId('autoChecks').checked=c.autoActivityChecks===true;byId('autoRemoval').checked=c.autoActivityRoleRemoval===true;
  const brand=/^#[0-9a-f]{6}$/i.test(c.brandColor||'')?c.brandColor.toUpperCase():'#000000';byId('brandPicker').value=brand.toLowerCase();byId('brandHex').value=brand;applyBrand(brand);
  byId('topSize').value=ch.topSize||30;byId('top10Range').value=ch.top10Range||1;byId('top20Range').value=ch.top20Range||2;byId('top30Range').value=ch.top30Range||3;byId('cooldownDays').value=ch.cooldownDays||3;byId('top10CooldownDays').value=ch.top10CooldownDays||7;byId('immunityDays').value=ch.immunityDays||3;byId('proofRequired').checked=ch.proofRequired===true;
  byId('codeExpiryMinutes').value=ver.codeExpiryMinutes||10;byId('requireProfileForTrainingResult').checked=ver.requireProfileForTrainingResult!==false;
  byId('loaMaxDays').value=loa.maxDays||90;byId('loaEvidence').checked=loa.requireEvidence===true;byId('loaAutoExpire').checked=loa.autoExpire!==false;
  byId('checkEveryHours').value=act.checkEveryHours||48;byId('responseDeadlineHours').value=act.responseDeadlineHours||24;byId('promotionMultiplier').value=act.promotionMultiplier||3;byId('autoRoleChanges').checked=act.autoRoleChanges===true;
  byId('automodEnabled').checked=am.enabled!==false;byId('blockInvites').checked=am.blockInvites!==false;byId('blockScamKeywords').checked=am.blockScamKeywords!==false;byId('mentionSpamLimit').value=am.mentionSpamLimit||8;
  byId('displayRelationInvites').checked=rel.displayInvites!==false;byId('showRelationRepresentatives').checked=rel.showRepresentatives!==false;byId('relationSortMode').value=rel.sortMode==='updated'?'updated':'alphabetical';
  buildMappings(rt,c.channelMappings||{});buildRoleMappings(rt,c.roleMappings||{});
  const runtimeView={
    status:rt.status,
    capturedAt:rt.capturedAt||null,
    guild:rt.guild?{name:rt.guild.name,id:'…'+String(rt.guild.id||'').slice(-6),memberCount:rt.guild.memberCount,botRolePosition:rt.guild.botRolePosition}:null,
    botIdentity:rt.botIdentity||null,
    commandSync:rt.commandSync||null,
    inventory:{categories:(rt.categories||[]).length,channels:(rt.channels||[]).length,roles:(rt.roles||[]).length,autoModRules:(rt.autoModRules||[]).length,webhooks:(rt.webhooks||[]).length}
  };
  byId('runtimeStatus').textContent=JSON.stringify(runtimeView,null,2);byId('summaryStatus').textContent=JSON.stringify(j.summary,null,2);
  byId('relationSummary').textContent='Current Allies: '+Number(j.summary&&j.summary.allies||0)+'\\nEnemy Clans: '+Number(j.summary&&j.summary.enemies||0)+'\\nManage entries in Discord with /relation add, /relation edit and /relation remove.';
}
function valueFor(kind){
  if(kind==='mainer')return byId('mainer').value;if(kind==='branding')return byId('brandHex').value;if(kind==='template')return byId('template').value;
  if(kind==='quotas'||kind==='channels')return JSON.parse(byId(kind).value||'{}');
  if(kind==='automation')return{autoActivityChecks:byId('autoChecks').checked,autoActivityRoleRemoval:byId('autoRemoval').checked};
  if(kind==='challenge')return{topSize:number('topSize',30),top10Range:number('top10Range',1),top20Range:number('top20Range',2),top30Range:number('top30Range',3),cooldownDays:number('cooldownDays',3),top10CooldownDays:number('top10CooldownDays',7),immunityDays:number('immunityDays',3),proofRequired:byId('proofRequired').checked};
  if(kind==='verification')return{codeExpiryMinutes:number('codeExpiryMinutes',10),requireProfileForTrainingResult:byId('requireProfileForTrainingResult').checked};
  if(kind==='loa')return{maxDays:number('loaMaxDays',90),requireEvidence:byId('loaEvidence').checked,autoExpire:byId('loaAutoExpire').checked};
  if(kind==='activity')return{checkEveryHours:number('checkEveryHours',48),responseDeadlineHours:number('responseDeadlineHours',24),promotionMultiplier:number('promotionMultiplier',3),autoRoleChanges:byId('autoRoleChanges').checked};
  if(kind==='automod')return{enabled:byId('automodEnabled').checked,blockInvites:byId('blockInvites').checked,blockScamKeywords:byId('blockScamKeywords').checked,mentionSpamLimit:number('mentionSpamLimit',8)};
  if(kind==='channelMappings'){const out={};CHANNEL_KEYS.forEach(([key])=>{const v=byId('map_'+key).value;if(v)out[key]=v});return out}
  if(kind==='roleMappings'){const out={};ROLE_KEYS.forEach(([key])=>{const v=byId('role_'+key).value;if(v)out[key]=v});return out}
  if(kind==='relations')return{displayInvites:byId('displayRelationInvites').checked,showRepresentatives:byId('showRelationRepresentatives').checked,sortMode:byId('relationSortMode').value};
}
async function save(kind){let value;try{value=valueFor(kind)}catch{show('Invalid JSON',false);return}const r=await fetch(API_BASE+'/api/paradise/config',{method:'PATCH',credentials:'include',headers:{accept:'application/json','content-type':'application/json','x-paradise-owner-action':'1'},body:JSON.stringify({kind,value})});const j=await r.json();if(!r.ok){show(j.error||'Save failed',false);return}show('Saved: '+kind);await load()}
async function repostGuides(mode){if(!confirm('Repost or update the '+mode+' guide messages in Discord?'))return;const r=await fetch(API_BASE+'/api/paradise/actions/repost-guides',{method:'POST',credentials:'include',headers:{accept:'application/json','content-type':'application/json','x-paradise-owner-action':'1'},body:JSON.stringify({mode})});const j=await r.json();if(!r.ok){show(j.error||'Guide repost failed',false);return}show('Updated '+j.posted+' guide messages');await load()}
byId('brandPicker').oninput=e=>{const v=e.target.value.toUpperCase();byId('brandHex').value=v;applyBrand(v)};byId('brandHex').oninput=e=>{if(/^#[0-9a-f]{6}$/i.test(e.target.value)){byId('brandPicker').value=e.target.value;applyBrand(e.target.value)}};
byId('previewBrand').onclick=()=>{const value=byId('brandHex').value;if(!/^#[0-9a-f]{6}$/i.test(value))return show('Use a valid HEX color such as #000000',false);applyBrand(value);byId('brandPreview').scrollIntoView({behavior:'smooth',block:'center'})};
document.querySelectorAll('[data-template]').forEach(card=>card.onclick=()=>{byId('template').value=card.dataset.template;document.querySelectorAll('[data-template]').forEach(item=>item.classList.toggle('is-active',item===card))});
document.querySelectorAll('[data-save]').forEach(b=>b.onclick=()=>save(b.dataset.save));document.querySelectorAll('[data-guide-mode]').forEach(b=>b.onclick=()=>repostGuides(b.dataset.guideMode));byId('refresh').onclick=load;
byId('exportConfig').onclick=()=>{if(!currentPayload)return;const guild=currentPayload.runtime.guild;const safeGuild=guild?{name:guild.name,id:'…'+String(guild.id||'').slice(-6),memberCount:guild.memberCount}:null;const blob=new Blob([JSON.stringify({exportedAt:new Date().toISOString(),config:currentPayload.config,runtimeSummary:{guild:safeGuild,commandSync:currentPayload.runtime.commandSync}},null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='paradise-safe-config.json';a.click();URL.revokeObjectURL(a.href)};
async function start(){try{const status=await sessionStatus();if(renderAccess(status))await load()}catch{renderAccess({reasonCode:'session_check_failed',ownerAuthorized:false})}}
start();
</script>
</body></html>`;
}
