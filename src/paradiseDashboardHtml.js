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
    :root{--brand:#8b5cf6;--brand-rgb:139,92,246;--brand-soft:rgba(var(--brand-rgb),.18);--bg:#0d0914;--panel:#171121;--panel2:#20182d;--line:#392b4e;--text:#faf8ff;--muted:#b8aec8;--good:#68e6aa;--warn:#ffd171;--bad:#ff7894}
    *{box-sizing:border-box}[hidden]{display:none!important}html{scroll-behavior:smooth;scrollbar-color:var(--brand) #100b18;scrollbar-width:thin}::-webkit-scrollbar{width:11px;height:11px}::-webkit-scrollbar-track{background:#100b18}::-webkit-scrollbar-thumb{background:linear-gradient(180deg,var(--brand),#4d2d78);border:2px solid #100b18;border-radius:999px}body{margin:0;min-height:100vh;background:radial-gradient(circle at 12% -10%,var(--brand-soft),transparent 32%),radial-gradient(circle at 90% 12%,#3b1d5b33,transparent 30%),linear-gradient(145deg,var(--bg),#09070e 62%,#110a18);color:var(--text);font:15px Inter,Segoe UI,Arial,sans-serif;overflow-x:hidden}body:before{content:"";position:fixed;z-index:-1;width:44vw;height:44vw;left:-16vw;top:42vh;border-radius:50%;background:radial-gradient(circle,var(--brand-soft),transparent 66%);filter:blur(10px);animation:ambientDrift 16s ease-in-out infinite alternate}@keyframes ambientDrift{to{transform:translate(24vw,-20vh) scale(1.18);opacity:.68}}
    main{width:min(1460px,calc(100% - 28px));margin:22px auto 60px}.hero,.panel{border:1px solid var(--line);background:linear-gradient(145deg,rgba(31,23,44,.94),rgba(18,13,27,.97));border-radius:18px;box-shadow:0 22px 70px #0007,0 1px 0 #ffffff0b inset;backdrop-filter:blur(14px)}
    .hero{padding:26px;border-left:5px solid var(--brand);position:relative;overflow:hidden}.hero:after{content:"";position:absolute;inset:-80% -10% auto 55%;height:240px;background:radial-gradient(circle,var(--brand-soft),transparent 68%);pointer-events:none}.badge{color:#ddd5ea;font-weight:900;text-transform:uppercase;letter-spacing:.11em;font-size:12px}
    h1{font-size:clamp(30px,5vw,44px);margin:7px 0 4px}h2{margin:0 0 4px;font-size:21px}h3{margin:18px 0 8px;font-size:15px;color:#ddd9e3}.muted,.help{color:var(--muted)}.help{margin:4px 0 14px;font-size:13px;line-height:1.45}
    .chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px}.chip{border:1px solid var(--line);border-radius:999px;padding:7px 10px;background:#0c0b10;color:#d8d4dd;font-size:12px}.chip.good{border-color:#23583d;color:var(--good)}.chip.bad{border-color:#6a2937;color:var(--bad)}
    .console-shell{display:grid;grid-template-columns:255px minmax(0,1fr);gap:16px;margin-top:16px}.page-nav{position:sticky;top:14px;align-self:start;padding:12px;max-height:calc(100vh - 28px);overflow:auto;overscroll-behavior:contain}.page-nav button{margin:3px 0;text-align:left;background:transparent;border-color:transparent;color:var(--muted);font-weight:750;transition:.18s ease}.page-nav button:hover,.page-nav button.active{color:#fff;background:linear-gradient(90deg,var(--brand-soft),transparent);border-color:#ffffff12;transform:translateX(3px)}.page-nav small{display:block;padding:8px 10px;color:#7f748e;text-transform:uppercase;letter-spacing:.12em;font-weight:800}
    .layout{display:grid;grid-template-columns:minmax(0,1fr);gap:14px}.stack{display:grid;gap:14px}.panel{padding:22px;transition:transform .2s ease,border-color .2s ease,box-shadow .2s ease}.panel:hover{border-color:color-mix(in srgb,var(--brand) 44%,var(--line));box-shadow:0 26px 80px #0008,0 0 0 1px var(--brand-soft)}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.grid.three{grid-template-columns:repeat(3,minmax(0,1fr))}
    label{display:block;margin:10px 0 6px;font-weight:800;font-size:13px}input,select,textarea,button,a.button{width:100%;border-radius:11px;border:1px solid var(--line);background:#0d0914;color:#fff;padding:11px;font:inherit;transition:border-color .18s,box-shadow .18s,transform .18s}
    input:focus,select:focus,textarea:focus{outline:none;border-color:var(--brand);box-shadow:0 0 0 3px var(--brand-soft)}textarea{min-height:120px;resize:vertical}button,a.button{display:block;position:relative;overflow:hidden;text-align:center;text-decoration:none;margin-top:11px;background:linear-gradient(135deg,var(--brand),#4d2d78);border-color:#ffffff25;font-weight:900;cursor:pointer}button:after,a.button:after{content:"";position:absolute;inset:-80% auto -80% -35%;width:24%;transform:rotate(18deg);background:#ffffff22;transition:left .45s ease}button:hover:after,a.button:hover:after{left:120%}button:hover,a.button:hover{transform:translateY(-2px);filter:brightness(1.12);box-shadow:0 10px 28px var(--brand-soft)}button:active,a.button:active{transform:translateY(0) scale(.99)}button:disabled{opacity:.55;cursor:wait;transform:none}
    button.secondary{background:linear-gradient(145deg,#251b34,#15101e)}button.audit-action{background:linear-gradient(135deg,#2563eb,#4f46e5)}button.backup-action{background:linear-gradient(135deg,#0f766e,#115e59)}button.preview-action{background:linear-gradient(135deg,#a16207,#7c2d12)}.tip{display:inline-grid;place-items:center;width:18px;height:18px;margin-left:5px;border:1px solid #6e607f;border-radius:50%;font-size:11px;color:#e5dcf0;cursor:help;position:relative}.tip:hover:after{content:attr(title);position:absolute;z-index:20;left:24px;top:-8px;width:240px;padding:9px 11px;border-radius:9px;background:#09070e;border:1px solid var(--line);color:#eee7f7;box-shadow:0 10px 30px #000a;font-weight:500;line-height:1.35}
    .switch{display:flex;gap:9px;align-items:center;font-weight:700;margin:9px 0}.switch input{width:auto}.color-row{display:grid;grid-template-columns:72px 1fr;gap:10px}.color-row input[type=color]{height:45px;padding:3px}
    .mapping{display:grid;grid-template-columns:minmax(150px,.8fr) minmax(180px,1.2fr);gap:8px;align-items:center;margin:7px 0}.mapping label{margin:0}.search-select{position:relative}.search-select input{padding-right:38px}.search-select:after{content:"⌕";position:absolute;right:13px;top:50%;transform:translateY(-50%);color:var(--muted);pointer-events:none}.mapping-status{display:block;margin-top:4px;color:var(--muted);font-size:11px}.mapping-status.missing{color:var(--bad)}.danger{border-color:#6a2937;background:linear-gradient(180deg,#241016,#110b0e)}.danger h2{color:#ff9aaa}.notice{padding:12px;border:1px solid #55451f;background:#1c170c;border-radius:10px;color:#ffe0a0;line-height:1.5}
    .status{white-space:pre-wrap;word-break:break-word;max-height:440px;overflow:auto;background:#0b0711;border:1px solid var(--line);border-radius:11px;padding:12px;color:#d7d3dc;font:12px ui-monospace,Consolas,monospace}.metric-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.metric{padding:15px;border:1px solid var(--line);border-radius:14px;background:linear-gradient(145deg,#21182f,#120e1a)}.metric b{display:block;font-size:25px;margin-bottom:4px}.metric span{color:var(--muted);font-size:12px}
    .toast{position:fixed;z-index:100;right:18px;bottom:18px;max-width:420px;padding:14px 17px;border-radius:12px;background:#1e162a;border:1px solid var(--line);box-shadow:0 15px 45px #0009;display:none;animation:toastIn .2s ease}.toast.ok{display:block;color:var(--good)}.toast.error{display:block;color:var(--bad)}@keyframes toastIn{from{opacity:0;transform:translateY(8px)}}
    .access{max-width:720px;margin:10vh auto 0;text-align:center;padding:34px}.access-icon{width:54px;height:54px;margin:0 auto 16px;display:grid;place-items:center;border:1px solid var(--line);border-radius:16px;background:#09090c;font-size:25px}.access-actions{display:flex;gap:10px;justify-content:center;margin-top:20px}.access-actions .button{width:auto;min-width:190px}.template-cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.template-card{padding:14px;border:1px solid var(--line);border-radius:12px;background:#0b0a0e;text-align:left}.template-card strong,.template-card span{display:block}.template-card span{color:var(--muted);font-size:12px;margin-top:5px;line-height:1.4}.template-card.is-active{border-color:var(--good);box-shadow:0 0 0 1px #23583d}.preview-card{margin-top:10px;padding:15px;border-left:5px solid var(--brand);background:#09090c;border-radius:10px}.permission-list{display:grid;gap:8px}.permission-item{padding:11px;border:1px solid var(--line);border-radius:10px;background:#0a090d}.permission-item strong{display:block;margin-bottom:4px}.guide-actions{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
    .hero-actions{display:grid;grid-template-columns:minmax(220px,420px) minmax(150px,220px) auto;gap:10px;align-items:end;margin-top:17px;position:relative;z-index:1}.hero-actions label{margin:0}.dirty{color:var(--warn);font-size:12px;font-weight:800}.loading{position:fixed;z-index:90;inset:0;background:#09070ed6;display:grid;place-items:center}.spinner{width:48px;height:48px;border:4px solid #ffffff1f;border-top-color:var(--brand);border-radius:50%;animation:spin .8s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}.theme-pills{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.theme-pills button{background:#191222}.theme-pills button.is-active{box-shadow:0 0 0 2px var(--brand) inset}.operation-actions{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}.audit-summary{margin-top:12px;max-height:360px}
    @media(max-width:980px){.console-shell{grid-template-columns:1fr}.page-nav{position:sticky;top:0;z-index:30;display:flex;overflow:auto;gap:5px;padding:8px;background:#100b19ee}.page-nav small{display:none}.page-nav button{min-width:max-content;margin:0}.metric-grid{grid-template-columns:repeat(2,1fr)}}@media(max-width:700px){main{width:min(100% - 18px,1460px)}.grid,.grid.three,.template-cards,.guide-actions,.metric-grid,.hero-actions{grid-template-columns:1fr}.mapping{grid-template-columns:1fr}.mapping label{margin-top:8px}.access-actions{flex-direction:column}.access-actions .button{width:100%}.hero,.panel{border-radius:14px}.panel{padding:17px}}
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
    <p class="muted">Multi-server operations, templates, transcripts, staff workflows and safe setup metadata. No bot credential is exposed here.</p>
    <div class="chips"><span class="chip" id="guildChip">Guild: loading</span><span class="chip" id="botChip">Bot: loading</span><span class="chip" id="syncChip">Commands: loading</span><span class="chip" id="templateChip">Template: loading</span></div>
    <div class="hero-actions"><label for="serverSelect">Managed server <span class="tip" title="Only guilds where the official Paradise bot is currently connected appear here.">?</span><select id="serverSelect"><option>Loading managed servers…</option></select></label><label for="uiLanguage">Panel language<select id="uiLanguage"><option value="tr">Türkçe</option><option value="en">English</option></select></label><span class="dirty" id="saveState">All settings loaded</span></div>
  </section>

  <div class="console-shell">
  <nav class="panel page-nav" aria-label="Paradise sections">
    <small>Operations</small>
    <button data-page-button="overview" class="active">✦ Overview</button>
    <button data-page-button="servers">◉ Server Selector</button>
    <button data-page-button="setup">◈ Template Setup</button>
    <button data-page-button="channels"># Channels</button>
    <button data-page-button="roles">♜ Roles & permissions</button>
    <button data-page-button="challenge">⚔ Challenges</button>
    <button data-page-button="leaderboard">♛ Leaderboard / Profiles</button>
    <button data-page-button="availability">◷ Availability & LOA</button>
    <button data-page-button="operations">⌁ Training / Staff</button>
    <button data-page-button="applications">▧ Applications</button>
    <button data-page-button="tickets">▣ Tickets & Support</button>
    <button data-page-button="moderation">⛨ Moderation / Security</button>
    <button data-page-button="blacklist">⊘ Blacklist / Appeal / Bail</button>
    <button data-page-button="roster">♟ Roster / Lineups / Relations</button>
    <button data-page-button="events">✺ Events / Daily Question</button>
    <button data-page-button="voice">◖ Voice / Join-to-Create</button>
    <button data-page-button="xp">◆ XP / Levels</button>
    <button data-page-button="guides">▤ Guides & Embeds</button>
    <button data-page-button="branding">✧ Branding / Theme / Language</button>
    <button data-page-button="logs">⌗ Logs / Backups / Restore</button>
    <button data-page-button="advanced">⚙ Advanced JSON</button>
  </nav>
  <div class="layout">
    <div class="stack">
      <section class="panel" data-page="overview">
        <h2>Operations overview</h2>
        <p class="help">A clean operational summary for the selected server. Detailed runtime data remains sanitized.</p>
        <div class="metric-grid" id="metricGrid"><div class="metric"><b>—</b><span>Loading</span></div></div>
      </section>
      <section class="panel" data-page="overview">
        <h2>Real server discovery</h2>
        <p class="help">Uses the official Paradise bot API. Audit samples only important visible channels and returns classifications without dumping private message text.</p>
        <div class="operation-actions">
          <button class="audit-action" id="runRealAudit">Run deep audit</button>
          <button class="backup-action" id="runStructureBackup">Create structure backup</button>
          <button class="preview-action" id="runSetupPreview">Generate template preview</button>
        </div>
        <pre class="status audit-summary" id="realAuditStatus">No 3A61 audit has been run in this browser session.</pre>
      </section>
      <section class="panel" data-page="servers">
        <h2>Identity & installation <span class="tip" title="Administrator is allowed only for the isolated test setup. Production should use least privilege.">?</span></h2>
        <p class="help">Application ID and connected guild state are read live from the Paradise bot runtime.</p>
        <a class="button" href="${invite}" rel="noopener">Invite Paradise to another server</a>
      </section>

      <section class="panel" data-page="setup">
        <h2>Template & appearance</h2>
        <p class="help">Selecting a template here stores the owner preference. Destructive setup still requires backup, preview and Discord-side final confirmation.</p>
        <div class="template-cards">
          <button class="template-card" data-template="tsbtr"><strong>TSBTR setup</strong><span>Large community, leaderboard, referee and staff operations.</span></button>
          <button class="template-card" data-template="community"><strong>Fieel's Community</strong><span>Fima product, support, security and community channels.</span></button>
          <button class="template-card" data-template="clan"><strong>Paradise Clan</strong><span>Training, tryout, challenge, events and clan relations.</span></button>
        </div>
        <div class="grid">
          <div><label for="template">Active template <span class="tip" title="Community, Clan and TSBTR remain separate schemas.">?</span></label><select id="template"><option value="community">Fieel's Community</option><option value="clan">Paradise Clan</option><option value="tsbtr">TSBTR-style</option></select><button data-save="template">Save template</button></div>
          <div><label>Accent color <span class="tip" title="Controls both the dashboard accent and the Discord embed side strip.">?</span></label><div class="color-row"><input id="brandPicker" type="color" value="#8B5CF6" aria-label="Brand color"><input id="brandHex" maxlength="7" value="#8B5CF6" spellcheck="false"></div><button class="secondary" id="previewBrand">Preview appearance</button><button data-save="branding">Save theme</button></div>
        </div>
        <h3>Dashboard theme</h3>
        <div class="theme-pills"><button type="button" data-theme="paradise">Paradise Purple</button><button type="button" data-theme="charcoal">Charcoal</button><button type="button" data-theme="midnight">Midnight</button></div>
        <div class="grid">
          <label>Message density<select id="messageDensity"><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select></label>
          <label>Separator style<select id="separatorStyle"><option value="diamond">Diamond</option><option value="line">Line</option><option value="minimal">Minimal</option></select></label>
          <label>Footer style<select id="footerStyle"><option value="branded">Made by Paradise</option><option value="compact">Compact</option></select></label>
          <label>Default language<select id="defaultLanguage"><option value="en">English</option><option value="tr">Türkçe</option></select></label>
        </div>
        <div class="preview-card" id="brandPreview"><b>✦ Paradise premium embed</b><p class="help">Structured headings, readable spacing, a configurable accent and “Made by Paradise” footer.</p></div>
        <div class="operation-actions setup-actions">
          <button class="preview-action" id="previewSelectedSetup">Preview setup</button>
          <button class="success" id="createMissingSetup">Create missing only</button>
          <button class="secondary" id="repostSelectedGuides">Repost guides only</button>
          <button class="secondary" id="repairSelectedPermissions">Repair permissions</button>
          <button class="primary" id="startSelectedSetup">Start setup</button>
        </div>
        <p class="help">Start setup opens the safe preview. Permanent removal is never available here without a backup and the exact typed Discord confirmation.</p>
      </section>

      <section class="panel" data-page="challenge">
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

      <section class="panel" data-page="leaderboard">
        <h2>Leaderboard, profiles & rank rules</h2>
        <p class="help">Leaderboard position (#1–#30) and fighter Stage/Level/Strength are separate systems. Unranked challenge eligibility uses the minimum fighter rank below.</p>
        <div class="grid three">
          <label>Minimum Stage<select id="unrankedMinimumStage"><option value="0">Stage 0</option><option value="1">Stage 1</option><option value="2">Stage 2</option><option value="3">Stage 3</option><option value="4">Stage 4</option></select></label>
          <label>Minimum Level<select id="unrankedMinimumLevel"><option>Low</option><option>Mid</option><option>High</option></select></label>
          <label>Minimum Strength<select id="unrankedMinimumStrength"><option>Weak</option><option>Stable</option><option>Strong</option></select></label>
        </div>
        <div class="preview-card" id="challengeRangePreview">Unranked → #29/#30 • minimum Stage 2 High Weak</div>
        <label for="challengeGroups">Challenge groups <span class="tip" title="JSON rows define label, minRank, maxRank, upwardDistance, downwardDistance, cooldownDays, immunityDays and refereeMinimumRole. Groups must cover every rank exactly once.">?</span></label>
        <textarea id="challengeGroups" spellcheck="false"></textarea>
        <button class="preview-action" id="previewChallengeRange">Preview who can challenge whom</button>
        <button data-save="challenge">Save rank & range rules</button>
      </section>

      <section class="panel" data-page="channels">
        <h2>Discord channel mappings</h2>
        <p class="help">These mappings remove mystery channel names. Slash command <b>/set</b> updates the same fields.</p>
        <button class="preview-action" id="autoDetectChannels">Auto-detect channels (preview only)</button>
        <div id="mappingFields"></div>
        <button data-save="channelMappings">Save channel mappings</button>
      </section>

      <section class="panel" data-page="roles">
        <h2>Discord role mappings <span class="tip" title="Maps operational authority labels to real guild roles. The bot still enforces role hierarchy and cannot manage roles above itself.">?</span></h2>
        <p class="help">Use explicit mappings for referee, hoster and setup authority. Empty fields keep the safe role-name fallback.</p>
        <div id="roleMappingFields"></div>
        <button data-save="roleMappings">Save role mappings</button>
      </section>

      <section class="panel" data-page="availability">
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

      <section class="panel" data-page="operations">
        <h2>Referee & hoster permissions</h2>
        <p class="help">These boundaries are enforced by the bot. Discord role hierarchy is checked again before role changes.</p>
        <div class="permission-list">
          <div class="permission-item"><strong>Trial Referee / Referee <span class="tip" title="They may submit work, but cannot approve or deny score posts.">?</span></strong><span class="muted">Submit challenge results; no approval authority.</span></div>
          <div class="permission-item"><strong>Experienced Referee / Referee Manager <span class="tip" title="Approval actions are audited and cannot be delegated to normal referees.">?</span></strong><span class="muted">Approve or deny score posts and review referee work.</span></div>
          <div class="permission-item"><strong>Training / Tryout hosters <span class="tip" title="Rank assignment runs through structured bot controls; hosters do not need broad Manage Roles permission.">?</span></strong><span class="muted">Create sessions and results within configured authority and quotas.</span></div>
          <div class="permission-item"><strong>Automatic role changes <span class="tip" title="Disabled by default. Missed quotas create recommendations unless explicitly enabled.">?</span></strong><span class="muted">Requires both automation and explicit automatic-role-change opt-in.</span></div>
        </div>
      </section>

      <section class="panel" data-page="security">
        <h2>Security boundaries</h2>
        <p class="help">Owner access requires both a valid Fima session and the linked owner Discord identity. Mutations use a short-lived CSRF token, credentialed official-origin requests and audited owner-action headers.</p>
        <div class="permission-list">
          <div class="permission-item"><strong>Owner-only dashboard</strong><span class="muted">Wrong linked Discord identities receive no configuration data.</span></div>
          <div class="permission-item"><strong>Guild isolation</strong><span class="muted">Every saved setting includes a managed guild ID; unknown guilds are rejected.</span></div>
          <div class="permission-item"><strong>No hidden destructive web action</strong><span class="muted">Setup still requires Discord backup, preview and typed second confirmation.</span></div>
          <div class="permission-item"><strong>Private transcripts</strong><span class="muted">Transcript destinations must be permission-restricted staff channels.</span></div>
        </div>
      </section>

      <section class="panel" data-page="roster">
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

      <section class="panel" data-page="guides">
        <h2>Guide & handbook repost</h2>
        <p class="help">Updates existing premium black TR/EN guide messages where possible. This sends Discord messages and is recorded in the audit log.</p>
        <div class="guide-actions">
          <button data-guide-mode="community">Repost Community guides</button>
          <button data-guide-mode="clan">Repost Clan guides</button>
          <button data-guide-mode="tsbtr">Repost TSBTR guides</button>
        </div>
      </section>

      <section class="panel" data-page="tickets">
        <h2>Ticket & transcript operations</h2>
        <p class="help">Challenge and support transcripts are retained in their mapped private channels. Closing a ticket never silently discards its history.</p>
        <div class="grid">
          <label class="switch"><input id="stickyChallengeHeader" type="checkbox"> Sticky challenge ticket header <span class="tip" title="Keeps challenger, challenged, ticket ID, ranks, referee and current state visible.">?</span></label>
          <label class="switch"><input id="refereeRequired" type="checkbox"> Require assigned referee</label>
          <label class="switch"><input id="showCooldownSnapshot" type="checkbox"> Include cooldown/immunity snapshot</label>
          <label class="switch"><input id="showLoaOnAvailability" type="checkbox"> Include LOA on availability board</label>
          <label class="switch"><input id="challengeTranscripts" type="checkbox"> Save challenge transcripts</label>
          <label class="switch"><input id="supportTranscripts" type="checkbox"> Save support transcripts</label>
          <label>Transcript retention days<input id="transcriptRetentionDays" type="number" min="30" max="3650"></label>
          <label>Availability refresh minutes<input id="availabilityRefreshMinutes" type="number" min="5" max="1440"></label>
        </div>
        <label for="autowinReasons">Approved autowin reasons <span class="tip" title="One reason per line. The slash command still logs the exact selected reason and actor.">?</span></label>
        <textarea id="autowinReasons" placeholder="No-show&#10;Forfeit&#10;Rule violation"></textarea>
        <button data-save="operations">Save ticket operations</button>
      </section>

      <section class="panel" data-page="roster">
        <h2>Roster, lineup & mainer boards</h2>
        <p class="help">Controls display and approval policy for main lineup, war lineup, EU roster and mainer proof workflows. Discord commands remain authoritative and audited.</p>
        <div class="grid">
          <label class="switch"><input id="rosterApprovalRequired" type="checkbox"> Require manager approval</label>
          <label class="switch"><input id="rosterShowRoblox" type="checkbox"> Show Roblox username</label>
          <label class="switch"><input id="rosterShowStage" type="checkbox"> Show Stage / Level / Strength</label>
          <label class="switch"><input id="rosterShowRegion" type="checkbox"> Show region</label>
          <label>Lineup member limit<input id="lineupLimit" type="number" min="5" max="50"></label>
          <label>Board density<select id="rosterDensity"><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select></label>
        </div>
        <button data-save="roster">Save roster policy</button>
      </section>

      <section class="panel" data-page="blacklist">
        <h2>Blacklist, appeals & bail policy</h2>
        <p class="help">Blacklist records require evidence and audit history. Bail is disabled by default and can never bypass owner approval.</p>
        <div class="grid">
          <label class="switch"><input id="appealsEnabled" type="checkbox"> Allow blacklist appeals</label>
          <label class="switch"><input id="blacklistEvidenceRequired" type="checkbox"> Require evidence</label>
          <label class="switch"><input id="bailEnabled" type="checkbox"> Enable owner-approved bail workflow</label>
          <label>Appeal cooldown days<input id="appealCooldownDays" type="number" min="1" max="365"></label>
          <label>Public reason detail<select id="publicReasonMode"><option value="summary">Safe summary</option><option value="full">Full reason</option></select></label>
        </div>
        <div class="notice">Bail never auto-unblacklists a user. Payment status and final resolution are separate audited actions.</div>
        <button data-save="blacklist">Save blacklist policy</button>
      </section>

      <section class="panel" data-page="operations">
        <h2>Training, tryout, referee & hoster</h2>
        <p class="help">Staff workflows stay structured: hosters create sessions, managers review restricted results, and weekly activity produces recommendations before any role change.</p>
        <div class="grid">
          <label>Training quota / week <span class="tip" title="Default minimum completed trainings for Training Staff.">?</span><input id="trainingQuota" type="number" min="0" max="50"></label>
          <label>Tryout quota / week<input id="tryoutQuota" type="number" min="0" max="50"></label>
          <label>Referee quota / week<input id="refereeQuota" type="number" min="0" max="50"></label>
          <label class="switch"><input id="managerApprovalResults" type="checkbox"> Manager approval for restricted results</label>
          <label class="switch"><input id="profileRequiredResults" type="checkbox"> Require completed Roblox profile</label>
          <label class="switch"><input id="activityProofRequired" type="checkbox"> Require configured proof for staff activity</label>
        </div>
        <button data-save="staffOperations">Save staff operations</button>
      </section>

      <section class="panel" data-page="applications">
        <h2>Application settings</h2>
        <p class="help">Every application enters a private review queue. Role grants remain optional and are blocked above both the reviewer and Paradise bot role.</p>
        <div class="grid">
          <label class="switch"><input id="applicationsEnabled" type="checkbox"> Enable application forms</label>
          <label>Application cooldown days<input id="applicationCooldownDays" type="number" min="0" max="365"></label>
          <label class="switch"><input id="applicationAutoGrant" type="checkbox"> Grant mapped role after safe approval</label>
          <label class="switch"><input id="applicationBlockBlacklisted" type="checkbox"> Block blacklisted applicants</label>
        </div>
        <label for="applicationQuestions">Extra question JSON <span class="tip" title="Optional advanced questions. Standard motivation, experience and availability questions always remain available.">?</span></label>
        <textarea id="applicationQuestions" spellcheck="false">{}</textarea>
        <button data-save="applications">Save application policy</button>
      </section>

      <section class="panel" data-page="moderation">
        <h2>Moderation, security & quarantine</h2>
        <p class="help">Low-rank staff submit kick/ban requests; senior staff approve or deny them. Quarantine and audit logs are preferred over irreversible automatic punishment.</p>
        <div class="grid">
          <label class="switch"><input id="kickBanApprovalRequired" type="checkbox"> Require senior kick/ban approval</label>
          <label class="switch"><input id="quarantineEnabled" type="checkbox"> Enable quarantine workflow</label>
          <label class="switch"><input id="raidModeDefault" type="checkbox"> Start in raid mode</label>
          <label>Suspicious account age (days)<input id="suspiciousAccountDays" type="number" min="0" max="365"></label>
          <label>Default spam timeout (minutes)<input id="defaultSpamTimeout" type="number" min="1" max="40320"></label>
          <label>Repeated violation threshold<input id="violationThreshold" type="number" min="2" max="20"></label>
        </div>
        <button data-save="moderation">Save moderation policy</button>
      </section>

      <section class="panel" data-page="events">
        <h2>Events, giveaways & daily question</h2>
        <p class="help">Paradise Clan can ask a daily question at 13:00 Europe/Berlin. The winner submits one official Roblox gamepass and staff completes a manual payout review.</p>
        <div class="grid">
          <label class="switch"><input id="dailyQuestionEnabled" type="checkbox"> Enable daily question</label>
          <label>Question hour (Europe/Berlin)<input id="dailyQuestionHour" type="number" min="0" max="23"></label>
          <label>Reward label<input id="dailyQuestionReward" maxlength="80"></label>
          <label>Winners per question<input id="dailyQuestionWinners" type="number" min="1" max="10"></label>
          <label class="switch"><input id="eventImageRequired" type="checkbox"> Require event/game-night image</label>
          <label class="switch"><input id="giveawayAbuseProtection" type="checkbox"> Enable giveaway abuse checks</label>
        </div>
        <button data-save="events">Save event and reward settings</button>
      </section>

      <section class="panel" data-page="voice">
        <h2>Voice and Join-to-Create</h2>
        <p class="help">Joining the lobby creates a temporary voice room under PRIVATE VOICE. Only the room owner can use rename, limits, lock, hide, permit, reject, transfer and delete controls.</p>
        <div class="grid">
          <label class="switch"><input id="voiceEnabled" type="checkbox"> Enable Join-to-Create</label>
          <label>Default user limit<input id="voiceDefaultLimit" type="number" min="0" max="99"></label>
          <label class="switch"><input id="voiceAutoDelete" type="checkbox"> Delete empty temporary rooms</label>
          <label class="switch"><input id="voiceSafeNames" type="checkbox"> Enforce safe room names</label>
          <label class="switch"><input id="voiceOwnerTransfer" type="checkbox"> Allow ownership transfer</label>
          <label class="switch"><input id="voiceLogActions" type="checkbox"> Log voice panel actions</label>
        </div>
        <button data-save="voice">Save voice settings</button>
      </section>

      <section class="panel" data-page="xp">
        <h2>XP, levels and leaderboards</h2>
        <p class="help">Chat XP is cooldown-limited and ignores bot, spam, log and transcript channels. Non-AFK, non-deaf voice activity receives interval XP.</p>
        <div class="grid">
          <label class="switch"><input id="xpEnabled" type="checkbox"> Enable XP and levels</label>
          <label>Chat XP per message<input id="chatXp" type="number" min="1" max="100"></label>
          <label>Chat cooldown seconds<input id="chatXpCooldown" type="number" min="15" max="3600"></label>
          <label>Voice XP per interval<input id="voiceXp" type="number" min="1" max="100"></label>
          <label>Level-up auto-delete seconds<input id="levelUpDeleteSeconds" type="number" min="10" max="3600"></label>
          <label class="switch"><input id="weeklyLeaderboard" type="checkbox"> Weekly leaderboard</label>
          <label class="switch"><input id="monthlyLeaderboard" type="checkbox"> Monthly leaderboard</label>
        </div>
        <label for="xpExcludedChannels">Extra excluded channel IDs, one per line</label>
        <textarea id="xpExcludedChannels"></textarea>
        <button data-save="xp">Save XP settings</button>
      </section>

      <section class="panel" data-page="logs">
        <h2>Logs, backups and restore</h2>
        <p class="help">Backups contain structure and permission metadata. Restore stays behind Discord-side owner confirmation and is never executed silently from this page.</p>
        <div class="permission-list">
          <div class="permission-item"><strong>Latest live audit</strong><span class="muted">Visible in Overview and scoped to the selected managed server.</span></div>
          <div class="permission-item"><strong>Structure backup</strong><span class="muted">Create a fresh backup before every destructive preview.</span></div>
          <div class="permission-item"><strong>Restore gate</strong><span class="muted">Requires an exact typed confirmation in Discord.</span></div>
        </div>
        <div class="operation-actions">
          <button class="audit-action" onclick="runManagedOperation('audit')">Refresh audit</button>
          <button class="backup-action" onclick="runManagedOperation('backup')">Create backup</button>
          <button class="preview-action" onclick="runManagedOperation('preview')">Preview selected template</button>
        </div>
      </section>

      <section class="panel" data-page="advanced">
        <h2>Advanced operations</h2>
        <div class="grid">
          <div><label for="mainer">Official mainer code</label><input id="mainer" maxlength="32"><button data-save="mainer">Save code</button></div>
          <div><label for="quotas">Weekly quota JSON <span class="tip" title="Advanced field. Role names map to activity keys and minimum counts.">?</span></label><textarea id="quotas"></textarea><button data-save="quotas">Save quotas</button></div>
          <div><label for="channels">Command-channel JSON <span class="tip" title="Advanced fallback. Prefer /commandchannel for normal changes.">?</span></label><textarea id="channels"></textarea><button data-save="channels">Save restrictions</button></div>
          <div><h3>Automation</h3><label class="switch"><input id="autoChecks" type="checkbox"> Automatic activity checks</label><label class="switch"><input id="autoRemoval" type="checkbox"> Remove roles after missed deadline</label><button data-save="automation">Save automation</button></div>
        </div>
      </section>

      <section class="panel danger" data-page="setup">
        <h2>Danger zone</h2>
        <div class="notice"><b>No destructive action is available from this page.</b> Run <b>/setupfieelstsbtr</b>, <b>/setupfieelscommunity</b> or <b>/setupfieelsclan</b> in the isolated test guild. Paradise creates a backup, shows a create/remove preview, then requires the exact typed confirmation. Repair and handbook repost modes do not delete channels or roles.</div>
        <button class="secondary" id="exportConfig">Export safe configuration</button>
      </section>
    </div>

    <aside class="stack">
      <section class="panel" data-page="overview"><h2>Live runtime</h2><p class="help">Sanitized bot, guild and command-sync state. Tokens and secrets are never returned.</p><div class="status" id="runtimeStatus">Loading…</div><button id="refresh">Refresh live state</button></section>
      <section class="panel" data-page="overview"><h2>Current counters</h2><div class="status" id="summaryStatus">Loading…</div></section>
      <section class="panel" data-page="logs"><h2>Restore notes</h2><p class="help">Backups contain category, channel, role and permission-overwrite metadata. Restore remains an owner-confirmed Discord operation; it is not silently executed from the website.</p></section>
    </aside>
  </div>
  </div>
  </div>
</main>
<div class="toast" id="toast"></div>
<div class="loading" id="loadingState"><div><div class="spinner"></div><p class="muted">Loading Paradise safely…</p></div></div>
<script>
const API_BASE=${JSON.stringify(apiBase)};
const SITE_BASE=${JSON.stringify(siteBase)};
const CHANNEL_KEYS=[
  ['welcome_channel','Public welcome messages'],['leave_channel','Public leave messages'],['level_channel','XP levels and leaderboard'],
  ['challenge_channel','Challenge create panel'],['challenge_rules_channel','Challenge rules'],['challenge_results_channel','Challenge results'],['availability_channel','Availability'],
  ['loa_channel','LOA'],['tryout_channel','Tryout'],['tryout_results_channel','Tryout results'],['training_channel','Training'],['training_results_channel','Training results'],
  ['referee_works_channel','Referee works'],['activity_logs_channel','Activity logs'],['activity_check_channel','Activity check'],['relation_panel_channel','Relations board'],
  ['role_guide_channel','Role guide'],['faq_channel','FAQ / trust'],['staff_report_channel','Staff reports'],['support_ticket_channel','Support tickets'],['application_ticket_channel','Applications'],
  ['challenge_transcripts_channel','Challenge transcripts (private)'],['support_transcripts_channel','Support transcripts (private)'],['roster_channel','EU roster board'],
  ['main_lineup_channel','Main lineup'],['war_lineup_channel','War lineup'],['mainer_proof_channel','Mainer proof'],['blacklist_channel','Blacklist board'],
  ['blacklist_appeal_channel','Blacklist appeals'],['bail_appeal_channel','Bail review'],['war_management_channel','War management'],
  ['roster_logs_channel','Roster logs'],['server_logs_channel','Server logs'],['mod_logs_channel','Moderation logs'],
  ['application_review_channel','Application reviews (private)'],['application_logs_channel','Application logs (private)'],
  ['moderation_requests_channel','Moderation approval queue'],['moderation_logs_channel','Moderation cases'],
  ['quarantine_review_channel','Quarantine review'],['voice_logs_channel','Voice control logs'],
  ['level_logs_channel','XP and level logs'],['question_channel','Daily question'],['payout_queue_channel','Reward payout queue']
];
const ROLE_KEYS=[
  ['owner_role','Owner'],['overseer_role','Overseer'],['community_manager_role','Community Manager'],['training_manager_role','Training Manager'],
  ['referee_manager_role','Referee Manager'],['experienced_referee_role','Experienced Referee'],['referee_role','Referee'],['trial_referee_role','Trial Referee'],
  ['training_supervisor_role','Training Supervisor'],['training_hoster_role','Training Hoster'],['tryout_supervisor_role','Tryout Supervisor'],['tryout_hoster_role','Tryout Hoster'],
  ['moderator_role','Moderator'],['support_role','Support Staff'],['event_staff_role','Event Staff'],['giveaway_staff_role','Giveaway Staff'],
  ['content_creator_role','Content Creator'],['quarantine_role','Muted / Quarantined'],['media_approved_role','Media & Links Approved']
];
let currentPayload=null,selectedGuildId='',csrfPromise=null,currentTheme='paradise',selectorLookups={channels:{},roles:{}};
const byId=id=>document.getElementById(id);
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const UI_TR={
  'Paradise Operations Console':'Paradise Operasyon Paneli','Operations':'Operasyonlar','Overview':'Genel Bakış','Setup & templates':'Kurulum ve şablonlar',
  'Server Selector':'Sunucu Seçici','Template Setup':'Şablon Kurulumu','Channels':'Kanallar','Challenges':'Meydan Okumalar',
  'Training / Staff':'Training / Personel','Applications':'Başvurular','Tickets & Support':'Ticket ve Destek','Moderation / Security':'Moderasyon / Güvenlik',
  'Blacklist / Appeal / Bail':'Kara Liste / İtiraz / Bail','Roster / Lineups / Relations':'Roster / Kadro / İlişkiler',
  'Events / Daily Question':'Etkinlikler / Günün Sorusu','Voice / Join-to-Create':'Ses / Join-to-Create','XP / Levels':'XP / Seviyeler',
  'Guides & Embeds':'Rehberler ve Embedler','Branding / Theme / Language':'Marka / Tema / Dil','Logs / Backups / Restore':'Log / Yedek / Geri Yükle',
  'Advanced JSON':'Gelişmiş JSON','Leaderboard / Profiles':'Liderlik / Profiller',
  'Channels & transcripts':'Kanallar ve transcriptler','Roles & permissions':'Roller ve yetkiler','Challenge':'Meydan Okuma','Availability & LOA':'Uygunluk ve LOA',
  'Roster & lineup':'Roster ve kadrolar','Relations':'İlişkiler','Blacklist & appeals':'Kara liste ve itirazlar','Guides':'Rehberler','Branding':'Görünüm',
  'Security':'Güvenlik','Advanced':'Gelişmiş','Operations overview':'Operasyon özeti','Real server discovery':'Gerçek sunucu incelemesi',
  'Run deep audit':'Derin audit çalıştır','Create structure backup':'Yapı yedeği oluştur','Generate template preview':'Şablon önizlemesi oluştur',
  'Identity & installation':'Kimlik ve kurulum','Template & appearance':'Şablon ve görünüm','Challenge system':'Meydan okuma sistemi',
  'Discord channel mappings':'Discord kanal eşlemeleri','Discord role mappings':'Discord rol eşlemeleri','Profiles, LOA & activity':'Profiller, LOA ve aktivite',
  'Referee & hoster permissions':'Hakem ve hoster yetkileri','Relations board settings':'İlişki paneli ayarları','Guide & handbook repost':'Rehberleri yenile',
  'Ticket & transcript operations':'Ticket ve transcript işlemleri','Roster, lineup & mainer boards':'Roster, kadro ve mainer panelleri',
  'Blacklist, appeals & bail policy':'Kara liste, itiraz ve bail politikası','Advanced operations':'Gelişmiş işlemler','Danger Zone':'Tehlikeli Bölge',
  'Live runtime':'Canlı çalışma durumu','Current counters':'Güncel sayaçlar','Restore notes':'Geri yükleme notları','Refresh live state':'Canlı durumu yenile',
  'Save template':'Şablonu kaydet','Preview appearance':'Görünümü önizle','Save theme':'Temayı kaydet','Save challenge rules':'Meydan okuma ayarlarını kaydet',
  'Save channel mappings':'Kanal eşlemelerini kaydet','Save role mappings':'Rol eşlemelerini kaydet','Auto-detect channels (preview only)':'Kanalları otomatik algıla (yalnızca önizleme)','Export safe configuration':'Güvenli yapılandırmayı dışa aktar',
  'Fima login required':'Fima girişi gerekli','Discord account required':'Discord hesabı gerekli','Paradise access is restricted':'Paradise erişimi kısıtlı',
  'Session check unavailable':'Oturum kontrolü kullanılamıyor','Sign in to Fima':'Fima hesabına giriş yap','Link Discord account':'Discord hesabını bağla',
  'Account settings':'Hesap ayarları','Review linked accounts':'Bağlı hesapları kontrol et','Try again':'Tekrar dene'
};
function applyUiLanguage(language){
  const lang=language==='en'?'en':'tr';document.documentElement.lang=lang;try{localStorage.setItem('paradiseUiLanguage',lang)}catch{}
  document.querySelectorAll('h1,h2,h3,button,nav small').forEach(element=>{
    if(element.childElementCount)return;
    if(!element.dataset.enText)element.dataset.enText=element.textContent.trim();
    element.textContent=lang==='tr'?(UI_TR[element.dataset.enText]||element.dataset.enText):element.dataset.enText;
  });
}
function show(message,ok=true){const el=byId('toast');el.className='toast '+(ok?'ok':'error');el.textContent=message;setTimeout(()=>el.className='toast',4500)}
function hexToRgb(value){const match=/^#([0-9a-f]{6})$/i.exec(value);if(!match)return'139,92,246';const n=parseInt(match[1],16);return[(n>>16)&255,(n>>8)&255,n&255].join(',')}
function applyBrand(value){document.documentElement.style.setProperty('--brand',value);document.documentElement.style.setProperty('--brand-rgb',hexToRgb(value));document.documentElement.style.setProperty('--brand-soft','rgba('+hexToRgb(value)+',.18)')}
const THEMES={paradise:{bg:'#0d0914',panel:'#171121',line:'#392b4e',accent:'#8B5CF6'},charcoal:{bg:'#101114',panel:'#1a1c21',line:'#383c45',accent:'#8B8FA3'},midnight:{bg:'#070d1b',panel:'#101a2d',line:'#273b5c',accent:'#4F8CFF'}};
function applyTheme(name,accent){const theme=THEMES[name]||THEMES.paradise;currentTheme=name;for(const [key,value] of Object.entries(theme)){if(key!=='accent')document.documentElement.style.setProperty('--'+key,value)}applyBrand(accent||theme.accent);document.querySelectorAll('[data-theme]').forEach(button=>button.classList.toggle('is-active',button.dataset.theme===name))}
function setLoading(active){byId('loadingState').hidden=!active}
function markDirty(){byId('saveState').textContent='Unsaved changes';byId('saveState').className='dirty'}
async function csrfToken(force=false){
  if(force)csrfPromise=null;
  if(!csrfPromise)csrfPromise=fetch(API_BASE+'/api/csrf-token',{credentials:'include',headers:{accept:'application/json'},cache:'no-store'}).then(async response=>{const body=await response.json().catch(()=>({}));if(!response.ok||!body.csrfToken)throw new Error('csrf_unavailable');return body.csrfToken});
  return csrfPromise;
}
async function mutate(path,body,method='POST',retry=true){
  const token=await csrfToken();
  const response=await fetch(API_BASE+path,{method,credentials:'include',headers:{accept:'application/json','content-type':'application/json','x-paradise-owner-action':'1','x-fima-csrf':token},body:JSON.stringify(body)});
  const result=await response.json().catch(()=>({error:'invalid_response'}));
  if(response.status===403&&result.error==='csrf_required'&&retry){await csrfToken(true);return mutate(path,body,method,false)}
  return{response,result};
}
function number(id,fallback){return Number(byId(id).value)||fallback}
function selectorValue(id,lookup){
  const input=byId(id);if(!input)return'';
  const value=input.value.trim();
  if(!value)return'';
  return lookup[value]||'';
}
function buildMappings(runtime,mappings){
  const channels=(runtime&&runtime.channels||[]).filter(c=>c.type===0||c.type===5);
  const categories=Object.fromEntries((runtime&&runtime.categories||[]).map(category=>[category.id,category.name]));
  selectorLookups.channels={};
  byId('mappingFields').innerHTML=CHANNEL_KEYS.map(([key,label])=>{
    const listId='list_map_'+key;
    const items=channels.map(c=>{const type=c.type===5?'announcement':'text';const display=(categories[c.parentId]?categories[c.parentId]+' / ':'')+'#'+c.name+' ['+type+']';selectorLookups.channels[display]=c.id;return'<option value="'+escapeHtml(display)+'"></option>'});
    const selected=channels.find(c=>c.id===mappings[key]);const selectedLabel=selected?(categories[selected.parentId]?categories[selected.parentId]+' / ':'')+'#'+selected.name+' ['+(selected.type===5?'announcement':'text')+']':'';
    const missing=Boolean(mappings[key]&&!selected);
    return '<div class="mapping"><label for="map_'+key+'">'+label+' <span class="tip" title="Type to search. Stored as '+key+'">?</span></label><div class="search-select"><input id="map_'+key+'" list="'+listId+'" value="'+escapeHtml(selectedLabel)+'" data-selected-id="'+escapeHtml(selected?.id||'')+'" placeholder="Type to search channels…" autocomplete="off"><datalist id="'+listId+'"><option value="">Not configured</option>'+items.join('')+'</datalist><span class="mapping-status '+(missing?'missing':'')+'">'+(missing?'Missing channel — remap required':selected?'Selected: #'+escapeHtml(selected.name):'Not configured')+'</span></div></div>';
  }).join('');
}
function buildRoleMappings(runtime,mappings){
  const roles=(runtime&&runtime.roles||[]).filter(role=>!role.managed&&role.name!=='@everyone').sort((a,b)=>b.position-a.position);
  selectorLookups.roles={};
  byId('roleMappingFields').innerHTML=ROLE_KEYS.map(([key,label])=>{
    const listId='list_role_'+key;const items=roles.map(role=>{const display=role.name+' [position '+role.position+']';selectorLookups.roles[display]=role.id;return'<option value="'+escapeHtml(display)+'"></option>'});
    const selected=roles.find(role=>role.id===mappings[key]);const selectedLabel=selected?selected.name+' [position '+selected.position+']':'';
    const missing=Boolean(mappings[key]&&!selected);
    return '<div class="mapping"><label for="role_'+key+'">'+label+' <span class="tip" title="Type to search. Stored as '+key+'">?</span></label><div class="search-select"><input id="role_'+key+'" list="'+listId+'" value="'+escapeHtml(selectedLabel)+'" data-selected-id="'+escapeHtml(selected?.id||'')+'" placeholder="Type to search roles…" autocomplete="off"><datalist id="'+listId+'"><option value="">Safe name fallback</option>'+items.join('')+'</datalist><span class="mapping-status '+(missing?'missing':'')+'">'+(missing?'Missing role — remap required':selected?'Selected: '+escapeHtml(selected.name):'Safe name fallback')+'</span></div></div>';
  }).join('');
}
function initializePages(){
  const routes=[
    ['Real server discovery','servers'],['Identity & installation','servers'],['Template & appearance','branding'],
    ['Challenge system','challenge'],['Leaderboard, profiles & rank rules','leaderboard'],['Discord channel mappings','channels'],['Discord role mappings','roles'],
    ['Profiles, LOA & activity','availability'],['Referee & hoster permissions','operations'],
    ['Training, tryout, referee & hoster','operations'],['Application settings','applications'],
    ['Ticket & transcript operations','tickets'],['Moderation, security & quarantine','moderation'],['Security boundaries','moderation'],
    ['Relations board settings','roster'],['Roster, lineup & mainer boards','roster'],['Blacklist, appeals & bail policy','blacklist'],
    ['Events, giveaways & daily question','events'],['Voice and Join-to-Create','voice'],['XP, levels and leaderboards','xp'],
    ['Guide & handbook repost','guides'],['Logs, backups and restore','logs'],['Advanced operations','advanced'],
    ['Danger zone','setup'],['Live runtime','overview'],['Current counters','overview'],['Restore notes','logs']
  ];
  document.querySelectorAll('#console section.panel').forEach(section=>{if(section.dataset.page)return;const title=section.querySelector('h2')?.textContent||'';const match=routes.find(([prefix])=>title.startsWith(prefix));section.dataset.page=match?match[1]:'overview'});
  document.querySelectorAll('#console aside .panel').forEach(panel=>{panel.parentElement?.classList.add('runtime-panels')});
  showPage(location.hash.replace('#','')||'overview');
}
function showPage(page){
  const known=[...document.querySelectorAll('[data-page-button]')].some(button=>button.dataset.pageButton===page);if(!known)page='overview';
  document.querySelectorAll('[data-page]').forEach(section=>section.hidden=section.dataset.page!==page);
  document.querySelectorAll('[data-page-button]').forEach(button=>button.classList.toggle('active',button.dataset.pageButton===page));
  history.replaceState(null,'','#'+page);
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
  applyUiLanguage(byId('uiLanguage')?.value||'tr');
  return false;
}
async function sessionStatus(){
  const response=await fetch(API_BASE+'/api/paradise/session-status',{credentials:'include',headers:{accept:'application/json'},cache:'no-store'});
  if(!response.ok&&response.status>=500)throw new Error('session_check_failed');
  return response.json();
}
async function load(){
  setLoading(true);
  const query=selectedGuildId?'?guildId='+encodeURIComponent(selectedGuildId):'';
  const r=await fetch(API_BASE+'/api/paradise/config'+query,{credentials:'include',headers:{accept:'application/json'},cache:'no-store'});const j=await r.json().catch(()=>({error:'invalid_response'}));
  if(!r.ok){setLoading(false);show(j.error||'Failed to load',false);return}
  currentPayload=j;selectedGuildId=j.selectedGuildId||'';const c=j.config||{},rt=j.runtime||{},ch=c.challenge||{},loa=c.loa||{},ver=c.verification||{},act=c.activity||{},am=c.automod||{},rel=c.relationSettings||{},ops=c.operations||{},roster=c.roster||{},blacklist=c.blacklist||{},staff=c.staffOperations||{},apps=c.applicationSettings||{},moderation=c.moderationSettings||{},events=c.eventSettings||{},voice=c.voiceSettings||{},xp=c.xpSettings||{};
  byId('serverSelect').innerHTML=(j.servers||[]).map(server=>'<option value="'+server.id+'" '+(server.id===selectedGuildId?'selected':'')+'>'+escapeHtml(server.name)+' · …'+String(server.id).slice(-6)+'</option>').join('')||'<option value="">No managed server online</option>';
  const guildLabel=rt.guild?rt.guild.name+' · …'+String(rt.guild.id||'').slice(-6):'unavailable';
  byId('guildChip').textContent='Guild: '+guildLabel;byId('guildChip').className='chip '+(rt.status==='ready'?'good':'bad');
  const identity=rt.botIdentity||{};byId('botChip').textContent='Bot: '+(rt.status==='ready'?(identity.nicknameMatches?'Paradise online':'name check needed'):'unavailable');byId('botChip').className='chip '+(rt.status==='ready'&&identity.nicknameMatches?'good':'bad');
  byId('syncChip').textContent='Commands: '+((rt.commandSync&&rt.commandSync.count)||0)+' · '+((rt.commandSync&&rt.commandSync.lastError)||'synced');byId('syncChip').className='chip '+(rt.commandSync&&rt.commandSync.lastError?'bad':'good');
  byId('templateChip').textContent='Template: '+(c.activeSetupMode||'not selected');
  byId('template').value=c.activeSetupMode||'clan';byId('mainer').value=c.mainerCode||'';byId('quotas').value=JSON.stringify(c.weeklyQuotas||{},null,2);byId('channels').value=JSON.stringify(c.commandChannels||{},null,2);
  document.querySelectorAll('[data-template]').forEach(card=>card.classList.toggle('is-active',card.dataset.template===byId('template').value));
  byId('autoChecks').checked=c.autoActivityChecks===true;byId('autoRemoval').checked=c.autoActivityRoleRemoval===true;
  const theme=["paradise","charcoal","midnight"].includes(c.dashboardTheme)?c.dashboardTheme:'paradise';const brand=/^#[0-9a-f]{6}$/i.test(c.brandColor||'')?c.brandColor.toUpperCase():THEMES[theme].accent;byId('brandPicker').value=brand.toLowerCase();byId('brandHex').value=brand;applyTheme(theme,brand);
  byId('messageDensity').value=c.messageDensity==='compact'?'compact':'comfortable';byId('separatorStyle').value=['line','minimal'].includes(c.separatorStyle)?c.separatorStyle:'diamond';byId('footerStyle').value=c.footerStyle==='compact'?'compact':'branded';byId('defaultLanguage').value=c.language==='tr'?'tr':'en';
  byId('topSize').value=ch.topSize||30;byId('top10Range').value=ch.top10Range||1;byId('top20Range').value=ch.top20Range||2;byId('top30Range').value=ch.top30Range||3;byId('cooldownDays').value=ch.cooldownDays||3;byId('top10CooldownDays').value=ch.top10CooldownDays||7;byId('immunityDays').value=ch.immunityDays||3;byId('proofRequired').checked=ch.proofRequired===true;
  const minRank=ch.unrankedMinimumRank||{stage:2,level:'High',strength:'Weak'};byId('unrankedMinimumStage').value=String(minRank.stage);byId('unrankedMinimumLevel').value=minRank.level;byId('unrankedMinimumStrength').value=minRank.strength;
  byId('challengeGroups').value=JSON.stringify(ch.groups||[{label:'Top 1–10',minRank:1,maxRank:Math.min(10,ch.topSize||30),upwardDistance:1,downwardDistance:0,cooldownDays:7,immunityDays:7,refereeMinimumRole:'Experienced Referee'},{label:'Top 11–20',minRank:11,maxRank:Math.min(20,ch.topSize||30),upwardDistance:2,downwardDistance:0,cooldownDays:3,immunityDays:3,refereeMinimumRole:'Referee'},{label:'Top 21+',minRank:21,maxRank:ch.topSize||30,upwardDistance:3,downwardDistance:0,cooldownDays:3,immunityDays:3,refereeMinimumRole:'Trial Referee'}].filter(group=>group.minRank<=group.maxRank),null,2);
  byId('codeExpiryMinutes').value=ver.codeExpiryMinutes||10;byId('requireProfileForTrainingResult').checked=ver.requireProfileForTrainingResult!==false;
  byId('loaMaxDays').value=loa.maxDays||90;byId('loaEvidence').checked=loa.requireEvidence===true;byId('loaAutoExpire').checked=loa.autoExpire!==false;
  byId('checkEveryHours').value=act.checkEveryHours||48;byId('responseDeadlineHours').value=act.responseDeadlineHours||24;byId('promotionMultiplier').value=act.promotionMultiplier||3;byId('autoRoleChanges').checked=act.autoRoleChanges===true;
  byId('automodEnabled').checked=am.enabled!==false;byId('blockInvites').checked=am.blockInvites!==false;byId('blockScamKeywords').checked=am.blockScamKeywords!==false;byId('mentionSpamLimit').value=am.mentionSpamLimit||8;
  byId('displayRelationInvites').checked=rel.displayInvites!==false;byId('showRelationRepresentatives').checked=rel.showRepresentatives!==false;byId('relationSortMode').value=rel.sortMode==='updated'?'updated':'alphabetical';
  byId('stickyChallengeHeader').checked=ops.stickyChallengeHeader!==false;byId('refereeRequired').checked=ops.refereeRequired!==false;byId('showCooldownSnapshot').checked=ops.showCooldownSnapshot!==false;byId('showLoaOnAvailability').checked=ops.showLoaOnAvailability===true;byId('challengeTranscripts').checked=ops.challengeTranscripts!==false;byId('supportTranscripts').checked=ops.supportTranscripts!==false;byId('transcriptRetentionDays').value=ops.transcriptRetentionDays||365;byId('availabilityRefreshMinutes').value=ops.availabilityRefreshMinutes||30;byId('autowinReasons').value=(ops.autowinReasons||['No-show','Forfeit','Rule violation']).join('\\n');
  byId('rosterApprovalRequired').checked=roster.approvalRequired!==false;byId('rosterShowRoblox').checked=roster.showRobloxName!==false;byId('rosterShowStage').checked=roster.showStage!==false;byId('rosterShowRegion').checked=roster.showRegion!==false;byId('lineupLimit').value=roster.lineupLimit||15;byId('rosterDensity').value=roster.boardDensity==='compact'?'compact':'comfortable';
  byId('appealsEnabled').checked=blacklist.appealsEnabled!==false;byId('blacklistEvidenceRequired').checked=blacklist.evidenceRequired!==false;byId('bailEnabled').checked=blacklist.bailEnabled===true;byId('appealCooldownDays').value=blacklist.appealCooldownDays||30;byId('publicReasonMode').value=blacklist.publicReasonMode==='full'?'full':'summary';
  byId('trainingQuota').value=staff.trainingQuota??2;byId('tryoutQuota').value=staff.tryoutQuota??1;byId('refereeQuota').value=staff.refereeQuota??2;byId('managerApprovalResults').checked=staff.managerApprovalResults!==false;byId('profileRequiredResults').checked=staff.profileRequiredResults!==false;byId('activityProofRequired').checked=staff.activityProofRequired===true;
  byId('applicationsEnabled').checked=apps.enabled!==false;byId('applicationCooldownDays').value=apps.cooldownDays??7;byId('applicationAutoGrant').checked=apps.autoGrantRole===true;byId('applicationBlockBlacklisted').checked=apps.blockBlacklisted!==false;byId('applicationQuestions').value=JSON.stringify(apps.extraQuestions||{},null,2);
  byId('kickBanApprovalRequired').checked=moderation.kickBanApprovalRequired!==false;byId('quarantineEnabled').checked=moderation.quarantineEnabled!==false;byId('raidModeDefault').checked=moderation.raidModeDefault===true;byId('suspiciousAccountDays').value=moderation.suspiciousAccountDays??7;byId('defaultSpamTimeout').value=moderation.defaultSpamTimeoutMinutes??60;byId('violationThreshold').value=moderation.violationThreshold??3;
  byId('dailyQuestionEnabled').checked=events.dailyQuestionEnabled!==false;byId('dailyQuestionHour').value=events.dailyQuestionHour??13;byId('dailyQuestionReward').value=events.dailyQuestionReward||'25 Robux';byId('dailyQuestionWinners').value=events.dailyQuestionWinners??1;byId('eventImageRequired').checked=events.eventImageRequired!==false;byId('giveawayAbuseProtection').checked=events.giveawayAbuseProtection!==false;
  byId('voiceEnabled').checked=voice.enabled!==false;byId('voiceDefaultLimit').value=voice.defaultLimit??0;byId('voiceAutoDelete').checked=voice.autoDelete!==false;byId('voiceSafeNames').checked=voice.safeNames!==false;byId('voiceOwnerTransfer').checked=voice.allowTransfer!==false;byId('voiceLogActions').checked=voice.logActions!==false;
  byId('xpEnabled').checked=xp.enabled!==false;byId('chatXp').value=xp.chatXp??10;byId('chatXpCooldown').value=xp.chatCooldownSeconds??60;byId('voiceXp').value=xp.voiceXpPerInterval??15;byId('levelUpDeleteSeconds').value=xp.levelUpDeleteSeconds??60;byId('weeklyLeaderboard').checked=xp.weeklyLeaderboard!==false;byId('monthlyLeaderboard').checked=xp.monthlyLeaderboard!==false;byId('xpExcludedChannels').value=(xp.excludedChannels||[]).join('\\n');
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
  const metrics=[['Managed servers',(j.servers||[]).length],['Commands',(rt.commandSync&&rt.commandSync.count)||0],['Channels',(rt.channels||[]).length],['Roles',(rt.roles||[]).length],['Profiles',j.summary?.verifiedProfiles||0],['Open challenges',j.summary?.pendingChallenges||0],['Active sessions',j.summary?.activeSessions||0],['Active LOA',j.summary?.activeLoa||0]];
  byId('metricGrid').innerHTML=metrics.map(([label,value])=>'<div class="metric"><b>'+escapeHtml(value)+'</b><span>'+escapeHtml(label)+'</span></div>').join('');
  byId('saveState').textContent='All settings loaded';byId('saveState').className='dirty';byId('saveState').style.color='var(--good)';
  setLoading(false);
}
function valueFor(kind){
  if(kind==='mainer')return byId('mainer').value;if(kind==='branding')return{brandColor:byId('brandHex').value,dashboardTheme:currentTheme,messageDensity:byId('messageDensity').value,separatorStyle:byId('separatorStyle').value,footerStyle:byId('footerStyle').value,language:byId('defaultLanguage').value};if(kind==='template')return byId('template').value;
  if(kind==='quotas'||kind==='channels')return JSON.parse(byId(kind).value||'{}');
  if(kind==='automation')return{autoActivityChecks:byId('autoChecks').checked,autoActivityRoleRemoval:byId('autoRemoval').checked};
  if(kind==='challenge')return{topSize:number('topSize',30),top10Range:number('top10Range',1),top20Range:number('top20Range',2),top30Range:number('top30Range',3),cooldownDays:number('cooldownDays',3),top10CooldownDays:number('top10CooldownDays',7),immunityDays:number('immunityDays',3),proofRequired:byId('proofRequired').checked,unrankedMinimumRank:{stage:Number(byId('unrankedMinimumStage').value),level:byId('unrankedMinimumLevel').value,strength:byId('unrankedMinimumStrength').value},groups:JSON.parse(byId('challengeGroups').value||'[]')};
  if(kind==='verification')return{codeExpiryMinutes:number('codeExpiryMinutes',10),requireProfileForTrainingResult:byId('requireProfileForTrainingResult').checked};
  if(kind==='loa')return{maxDays:number('loaMaxDays',90),requireEvidence:byId('loaEvidence').checked,autoExpire:byId('loaAutoExpire').checked};
  if(kind==='activity')return{checkEveryHours:number('checkEveryHours',48),responseDeadlineHours:number('responseDeadlineHours',24),promotionMultiplier:number('promotionMultiplier',3),autoRoleChanges:byId('autoRoleChanges').checked};
  if(kind==='automod')return{enabled:byId('automodEnabled').checked,blockInvites:byId('blockInvites').checked,blockScamKeywords:byId('blockScamKeywords').checked,mentionSpamLimit:number('mentionSpamLimit',8)};
  if(kind==='channelMappings'){const out={};CHANNEL_KEYS.forEach(([key])=>{const v=selectorValue('map_'+key,selectorLookups.channels);if(v)out[key]=v});return out}
  if(kind==='roleMappings'){const out={};ROLE_KEYS.forEach(([key])=>{const v=selectorValue('role_'+key,selectorLookups.roles);if(v)out[key]=v});return out}
  if(kind==='relations')return{displayInvites:byId('displayRelationInvites').checked,showRepresentatives:byId('showRelationRepresentatives').checked,sortMode:byId('relationSortMode').value};
  if(kind==='operations')return{stickyChallengeHeader:byId('stickyChallengeHeader').checked,refereeRequired:byId('refereeRequired').checked,showCooldownSnapshot:byId('showCooldownSnapshot').checked,showLoaOnAvailability:byId('showLoaOnAvailability').checked,challengeTranscripts:byId('challengeTranscripts').checked,supportTranscripts:byId('supportTranscripts').checked,transcriptRetentionDays:number('transcriptRetentionDays',365),availabilityRefreshMinutes:number('availabilityRefreshMinutes',30),autowinReasons:byId('autowinReasons').value.split(/\\r?\\n/).map(value=>value.trim()).filter(Boolean)};
  if(kind==='roster')return{approvalRequired:byId('rosterApprovalRequired').checked,showRobloxName:byId('rosterShowRoblox').checked,showStage:byId('rosterShowStage').checked,showRegion:byId('rosterShowRegion').checked,lineupLimit:number('lineupLimit',15),boardDensity:byId('rosterDensity').value};
  if(kind==='blacklist')return{appealsEnabled:byId('appealsEnabled').checked,evidenceRequired:byId('blacklistEvidenceRequired').checked,bailEnabled:byId('bailEnabled').checked,appealCooldownDays:number('appealCooldownDays',30),publicReasonMode:byId('publicReasonMode').value};
  if(kind==='staffOperations')return{trainingQuota:number('trainingQuota',2),tryoutQuota:number('tryoutQuota',1),refereeQuota:number('refereeQuota',2),managerApprovalResults:byId('managerApprovalResults').checked,profileRequiredResults:byId('profileRequiredResults').checked,activityProofRequired:byId('activityProofRequired').checked};
  if(kind==='applications')return{enabled:byId('applicationsEnabled').checked,cooldownDays:Number(byId('applicationCooldownDays').value)||0,autoGrantRole:byId('applicationAutoGrant').checked,blockBlacklisted:byId('applicationBlockBlacklisted').checked,extraQuestions:JSON.parse(byId('applicationQuestions').value||'{}')};
  if(kind==='moderation')return{kickBanApprovalRequired:byId('kickBanApprovalRequired').checked,quarantineEnabled:byId('quarantineEnabled').checked,raidModeDefault:byId('raidModeDefault').checked,suspiciousAccountDays:Number(byId('suspiciousAccountDays').value)||0,defaultSpamTimeoutMinutes:number('defaultSpamTimeout',60),violationThreshold:number('violationThreshold',3)};
  if(kind==='events')return{dailyQuestionEnabled:byId('dailyQuestionEnabled').checked,dailyQuestionHour:Number(byId('dailyQuestionHour').value)||0,dailyQuestionReward:byId('dailyQuestionReward').value.trim(),dailyQuestionWinners:number('dailyQuestionWinners',1),eventImageRequired:byId('eventImageRequired').checked,giveawayAbuseProtection:byId('giveawayAbuseProtection').checked};
  if(kind==='voice')return{enabled:byId('voiceEnabled').checked,defaultLimit:Number(byId('voiceDefaultLimit').value)||0,autoDelete:byId('voiceAutoDelete').checked,safeNames:byId('voiceSafeNames').checked,allowTransfer:byId('voiceOwnerTransfer').checked,logActions:byId('voiceLogActions').checked};
  if(kind==='xp')return{enabled:byId('xpEnabled').checked,chatXp:number('chatXp',10),chatCooldownSeconds:number('chatXpCooldown',60),voiceXpPerInterval:number('voiceXp',15),levelUpDeleteSeconds:number('levelUpDeleteSeconds',60),weeklyLeaderboard:byId('weeklyLeaderboard').checked,monthlyLeaderboard:byId('monthlyLeaderboard').checked,excludedChannels:byId('xpExcludedChannels').value.split(/\\r?\\n/).map(value=>value.trim()).filter(value=>/^\\d{16,22}$/.test(value))};
}
async function save(kind){
  let value;try{value=valueFor(kind)}catch{show('Invalid JSON',false);return}
  if(!selectedGuildId)return show('Select a managed Paradise server first.',false);
  const buttons=[...document.querySelectorAll('[data-save="'+kind+'"]')];buttons.forEach(button=>{button.disabled=true;button.dataset.previousText=button.textContent;button.textContent='Saving…'});
  try{
    const{response,result}=await mutate('/api/paradise/config',{kind,value,guildId:selectedGuildId},'PATCH');
    if(!response.ok){show(result.error==='csrf_required'?'Security session could not be refreshed. Reload the panel.':result.error||'Save failed',false);return}
    const panelReport=result.panelSync?(' • panels: '+result.panelSync.updated+' updated, '+result.panelSync.skipped+' skipped'):'';
    show('Saved '+kind+' for the selected server'+panelReport);await load()
  }catch(error){show(error.message==='csrf_unavailable'?'Secure session token is unavailable. Sign in again.':'Save failed safely.',false)}
  finally{buttons.forEach(button=>{button.disabled=false;button.textContent=button.dataset.previousText||'Save'})}
}
function autoDetectChannels(){
  if(!currentPayload?.runtime?.channels?.length)return show('No readable channels are available for auto-detect.',false);
  const normalize=value=>String(value||'').toLowerCase().replace(/[^a-z0-9]+/g,'');
  const entries=Object.entries(selectorLookups.channels);let suggested=0;
  CHANNEL_KEYS.forEach(([key,label])=>{
    const input=byId('map_'+key);if(!input||input.value.trim())return;
    const targets=[key.replace(/_channel$/,''),label].map(normalize);
    const ranked=entries.map(([display,id])=>{const name=normalize(display.replace(/^.*?#/,''));let score=0;for(const target of targets){if(name===target)score=Math.max(score,100);else if(name.includes(target)||target.includes(name))score=Math.max(score,60)}return{display,id,score}}).filter(item=>item.score>0).sort((a,b)=>b.score-a.score);
    if(ranked[0]){input.value=ranked[0].display;input.dataset.selectedId=ranked[0].id;suggested+=1}
  });
  if(suggested){markDirty();show(suggested+' channel suggestions filled for review. Nothing was saved.')}else show('No safe new suggestions found.',false);
}
function previewChallengeRange(){
  const size=number('topSize',30),r1=number('top10Range',1),r2=number('top20Range',2),r3=number('top30Range',3);
  if(size<2||r1<1||r2<1||r3<1)return show('Leaderboard size and distances must be positive.',false);
  const bottom=Math.max(1,size-1);
  byId('challengeRangePreview').textContent='Top 1–10: '+r1+' upward • Top 11–20: '+r2+' upward • Top 21–'+size+': '+r3+' upward • Unranked → #'+bottom+'/#'+size+' • minimum Stage '+byId('unrankedMinimumStage').value+' '+byId('unrankedMinimumLevel').value+' '+byId('unrankedMinimumStrength').value;
}
async function repostGuides(mode){if(!confirm('Repost or update the '+mode+' guide messages in the selected Discord server?'))return;try{const{response,result}=await mutate('/api/paradise/actions/repost-guides',{mode,guildId:selectedGuildId});if(!response.ok){show(result.error||'Guide repost failed',false);return}show('Updated '+result.posted+' guide messages');await load()}catch{show('Guide repost failed safely.',false)}}
async function createMissingTemplate(repairPermissions){
  const mode=byId('template').value;
  const action=repairPermissions?'create missing channels/roles and repair managed permissions':'create missing channels/roles only';
  if(!confirm('This test-server action will '+action+'. It will not delete existing resources. Continue?'))return;
  const button=repairPermissions?byId('repairSelectedPermissions'):byId('createMissingSetup');
  const original=button.textContent;button.disabled=true;button.textContent='Working…';
  try{
    const{response,result}=await mutate('/api/paradise/actions/create-missing',{mode,guildId:selectedGuildId,repairPermissions});
    if(!response.ok){show(result.error||'Create-missing action failed',false);return}
    const summary=result.result||{};
    show('Created '+Number(summary.createdChannels||0)+' channels and '+Number(summary.createdRoles||0)+' roles; '+Number(summary.guidePosts||0)+' guides synchronized.');
    await load();
  }catch{show('Create-missing action failed safely.',false)}
  finally{button.disabled=false;button.textContent=original}
}
async function runManagedOperation(kind){
  if(!selectedGuildId)return show('Select a managed Paradise server first.',false);
  const button=kind==='audit'?byId('runRealAudit'):kind==='backup'?byId('runStructureBackup'):byId('runSetupPreview');
  button.disabled=true;setLoading(true);
  try{
    const body={guildId:selectedGuildId};if(kind==='preview')body.mode=byId('template').value;
    const{response,result}=await mutate('/api/paradise/actions/'+kind,body);
    if(!response.ok){show(result.error||kind+' failed',false);return}
    const value=result.audit||result.backup||result.preview||{};
    const safe=kind==='audit'
      ?{status:value.status,capturedAt:value.capturedAt,guild:value.guild?{name:value.guild.name,id:'…'+String(value.guild.id||'').slice(-6),botRolePosition:value.guild.botRolePosition,capabilities:value.guild.capabilities}:null,counts:value.counts,readableChannels:(value.sampledChannels||[]).filter(channel=>channel.readable).map(channel=>channel.name),blockedChannels:(value.sampledChannels||[]).filter(channel=>!channel.readable).map(channel=>({name:channel.name,reason:channel.missingPermission}))}
      :kind==='backup'
        ?{status:value.status,capturedAt:value.capturedAt,guild:value.guild?{name:value.guild.name,id:'…'+String(value.guild.id||'').slice(-6)}:null,categories:(value.categories||[]).length,channels:(value.channels||[]).length,roles:(value.roles||[]).length}
        :{status:value.status,generatedAt:value.generatedAt,template:value.templateLabel,createResources:(value.createResources||[]).length,keepResources:(value.keepResources||[]).length,extraResources:(value.extraResources||[]).length,createRoles:(value.createRoles||[]).length,warning:value.warning};
    byId('realAuditStatus').textContent=JSON.stringify(safe,null,2);show(kind+' completed for the selected server');
  }catch{show(kind+' failed safely.',false)}finally{button.disabled=false;setLoading(false)}
}
byId('brandPicker').oninput=e=>{const v=e.target.value.toUpperCase();byId('brandHex').value=v;applyBrand(v);markDirty()};byId('brandHex').oninput=e=>{if(/^#[0-9a-f]{6}$/i.test(e.target.value)){byId('brandPicker').value=e.target.value;applyBrand(e.target.value);markDirty()}};
byId('previewBrand').onclick=()=>{const value=byId('brandHex').value;if(!/^#[0-9a-f]{6}$/i.test(value))return show('Use a valid HEX color such as #000000',false);applyBrand(value);byId('brandPreview').scrollIntoView({behavior:'smooth',block:'center'})};
document.querySelectorAll('[data-template]').forEach(card=>card.onclick=()=>{byId('template').value=card.dataset.template;document.querySelectorAll('[data-template]').forEach(item=>item.classList.toggle('is-active',item===card))});
document.querySelectorAll('[data-save]').forEach(b=>b.onclick=()=>save(b.dataset.save));document.querySelectorAll('[data-guide-mode]').forEach(b=>b.onclick=()=>repostGuides(b.dataset.guideMode));byId('refresh').onclick=load;
document.querySelectorAll('[data-theme]').forEach(button=>button.onclick=()=>{currentTheme=button.dataset.theme;const accent=byId('brandHex').value||THEMES[currentTheme].accent;applyTheme(currentTheme,accent);markDirty()});
document.querySelectorAll('[data-page-button]').forEach(button=>button.onclick=()=>showPage(button.dataset.pageButton));
byId('serverSelect').onchange=async event=>{selectedGuildId=event.target.value;await load()};
byId('uiLanguage').onchange=event=>applyUiLanguage(event.target.value);
byId('runRealAudit').onclick=()=>runManagedOperation('audit');byId('runStructureBackup').onclick=()=>runManagedOperation('backup');byId('runSetupPreview').onclick=()=>runManagedOperation('preview');
byId('previewSelectedSetup').onclick=()=>runManagedOperation('preview');
byId('startSelectedSetup').onclick=()=>runManagedOperation('preview');
byId('createMissingSetup').onclick=()=>createMissingTemplate(false);
byId('repairSelectedPermissions').onclick=()=>createMissingTemplate(true);
byId('repostSelectedGuides').onclick=()=>repostGuides(byId('template').value);
byId('autoDetectChannels').onclick=autoDetectChannels;byId('previewChallengeRange').onclick=previewChallengeRange;
document.querySelectorAll('input,select,textarea').forEach(field=>{if(field.id!=='serverSelect')field.addEventListener('change',markDirty)});
byId('exportConfig').onclick=()=>{if(!currentPayload)return;const guild=currentPayload.runtime.guild;const safeGuild=guild?{name:guild.name,id:'…'+String(guild.id||'').slice(-6),memberCount:guild.memberCount}:null;const blob=new Blob([JSON.stringify({exportedAt:new Date().toISOString(),config:currentPayload.config,runtimeSummary:{guild:safeGuild,commandSync:currentPayload.runtime.commandSync}},null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='paradise-safe-config.json';a.click();URL.revokeObjectURL(a.href)};
async function start(){try{const uiLanguage=(()=>{try{return localStorage.getItem('paradiseUiLanguage')||'tr'}catch{return'tr'}})();byId('uiLanguage').value=uiLanguage;applyUiLanguage(uiLanguage);initializePages();const status=await sessionStatus();if(renderAccess(status)){await csrfToken();await load();applyUiLanguage(byId('uiLanguage').value)}else setLoading(false)}catch{setLoading(false);renderAccess({reasonCode:'session_check_failed',ownerAuthorized:false})}}
start();
</script>
</body></html>`;
}
