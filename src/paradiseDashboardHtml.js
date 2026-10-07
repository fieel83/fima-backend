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
  <title>FIMA Owner Console</title>
  <style>
    :root{--brand:#19d3c5;--brand-rgb:25,211,197;--brand-soft:rgba(var(--brand-rgb),.17);--cyan:#66e8ff;--bg:#050b0d;--panel:#0d1719;--panel2:#122326;--line:#224146;--text:#f3fffe;--muted:#91aaa9;--good:#62e7ae;--warn:#ffd171;--bad:#ff7894}
    *{box-sizing:border-box}[hidden]{display:none!important}html{scroll-behavior:smooth;scrollbar-color:var(--brand) #061012;scrollbar-width:thin}::-webkit-scrollbar{width:11px;height:11px}::-webkit-scrollbar-track{background:#061012}::-webkit-scrollbar-thumb{background:linear-gradient(180deg,var(--brand),#106c70);border:2px solid #061012;border-radius:999px}body{margin:0;min-height:100vh;background:radial-gradient(circle at 12% -10%,var(--brand-soft),transparent 32%),radial-gradient(circle at 90% 12%,#0c899339,transparent 30%),linear-gradient(145deg,var(--bg),#040809 62%,#061315);color:var(--text);font:15px Inter,Segoe UI,Arial,sans-serif;overflow-x:hidden}body:before{content:"";position:fixed;z-index:-1;width:44vw;height:44vw;left:-16vw;top:42vh;border-radius:50%;background:radial-gradient(circle,var(--brand-soft),transparent 66%);filter:blur(10px);animation:ambientDrift 16s ease-in-out infinite alternate}body:after{content:"";position:fixed;inset:0;z-index:-2;pointer-events:none;background:linear-gradient(115deg,rgba(var(--brand-rgb),.14),transparent 28%,#38bdf833 52%,transparent 74%),radial-gradient(circle at 72% 18%,rgba(var(--brand-rgb),.16),transparent 34%),linear-gradient(rgba(255,255,255,.026) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.02) 1px,transparent 1px);background-size:auto,auto,48px 48px,48px 48px;mix-blend-mode:screen;opacity:.72;animation:auroraPulse 22s ease-in-out infinite alternate}@keyframes ambientDrift{to{transform:translate(24vw,-20vh) scale(1.18);opacity:.68}}@keyframes auroraPulse{from{filter:hue-rotate(0deg) saturate(1);transform:translate3d(0,0,0)}to{filter:hue-rotate(18deg) saturate(1.25);transform:translate3d(-18px,12px,0)}}
    main{width:min(1540px,calc(100% - 32px));margin:18px auto 60px}.hero,.panel{border:1px solid var(--line);background:linear-gradient(145deg,rgba(15,30,32,.94),rgba(7,15,17,.97));border-radius:22px;box-shadow:0 22px 70px #0007,0 1px 0 #ffffff0b inset;backdrop-filter:blur(14px)}
    .hero{padding:32px 34px 28px;position:relative;overflow:hidden;border-color:#ffffff1c;background:radial-gradient(circle at 87% 0,rgba(var(--brand-rgb),.25),transparent 35%),linear-gradient(125deg,rgba(11,31,34,.98),rgba(5,14,16,.98) 70%)}.hero:after{content:"";position:absolute;inset:-80% -10% auto 55%;height:270px;background:radial-gradient(circle,var(--brand-soft),transparent 68%);pointer-events:none}.hero:before{content:"";position:absolute;inset:0;border-top:3px solid transparent;border-image:linear-gradient(90deg,var(--brand),var(--cyan),transparent 78%) 1;background:linear-gradient(120deg,#ffffff0d,transparent 38%,var(--brand-soft));opacity:.88;pointer-events:none}.hero-brandline{position:relative;z-index:2;display:flex;align-items:center;gap:12px;margin-bottom:25px}.hero-mark{position:relative;display:grid;place-items:center;width:46px;height:46px;overflow:hidden;border:1px solid #77fff05c;border-radius:14px;background:linear-gradient(145deg,var(--brand),#087982);box-shadow:0 12px 36px rgba(var(--brand-rgb),.34);color:#fff;font-size:22px;font-weight:1000}.hero-mark:after{content:"";position:absolute;inset:-80% 50% -80% -35%;transform:rotate(24deg);background:#ffffff2c}.hero-brandline strong,.hero-brandline span{display:block}.hero-brandline strong{font-size:12px;letter-spacing:.2em}.hero-brandline span{margin-top:4px;color:#8eb3b0;font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase}.badge{position:relative;z-index:1;color:#d9f3f1;font-weight:900;text-transform:uppercase;letter-spacing:.11em;font-size:12px}
    h1{font-size:clamp(30px,5vw,44px);margin:7px 0 4px}h2{margin:0 0 4px;font-size:21px}h3{margin:18px 0 8px;font-size:15px;color:#ddd9e3}.muted,.help{color:var(--muted)}.help{margin:4px 0 14px;font-size:13px;line-height:1.45}
    .chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px}.chip{border:1px solid var(--line);border-radius:999px;padding:7px 10px;background:#0c0b10;color:#d8d4dd;font-size:12px}.chip.good{border-color:#23583d;color:var(--good)}.chip.bad{border-color:#6a2937;color:var(--bad)}
    .server-directory{position:relative;overflow:hidden;margin-top:16px;padding:34px;border-color:#ffffff20;background:radial-gradient(circle at 86% -8%,rgba(var(--brand-rgb),.22),transparent 34%),linear-gradient(145deg,rgba(13,31,34,.98),rgba(5,13,15,.98))}.server-directory:before{content:"";position:absolute;inset:0;background:linear-gradient(115deg,#ffffff08,transparent 31%),linear-gradient(90deg,var(--brand),var(--cyan),transparent 70%) top/100% 2px no-repeat;pointer-events:none}.server-directory-head{position:relative;display:flex;align-items:end;justify-content:space-between;gap:24px}.server-directory-head h1{margin:5px 0 7px}.server-directory-search{position:relative;width:min(410px,100%)}.server-directory-search input{padding:13px 44px 13px 14px;background:#061113d9}.server-directory-search:after{content:"⌕";position:absolute;right:15px;bottom:11px;color:var(--brand);font-size:22px;pointer-events:none}.server-directory-meta{position:relative;display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:24px;color:var(--muted);font-size:12px}.server-directory-count{display:inline-flex;align-items:center;gap:8px}.server-directory-count:before{content:"";width:8px;height:8px;border-radius:50%;background:var(--good);box-shadow:0 0 13px var(--good)}.server-directory-grid{position:relative;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin-top:12px}.server-card{display:grid!important;grid-template-columns:62px minmax(0,1fr) auto;gap:15px;align-items:center;min-height:112px;margin:0!important;padding:17px!important;text-align:left!important;border-color:#ffffff18!important;background:radial-gradient(circle at 0 0,var(--brand-soft),transparent 48%),linear-gradient(145deg,#102427,#071214)!important;box-shadow:0 14px 38px #0004}.server-card:hover{border-color:rgba(var(--brand-rgb),.58)!important;box-shadow:0 20px 48px #0008,0 0 0 1px var(--brand-soft),0 0 38px var(--brand-soft)!important}.server-card:focus-visible,.workspace-option:focus-visible{outline:3px solid color-mix(in srgb,var(--brand) 76%,white);outline-offset:3px;box-shadow:0 0 0 7px var(--brand-soft)!important}.server-card-avatar{display:grid;place-items:center;width:62px;height:62px;border:1px solid #7effef43;border-radius:19px;background:linear-gradient(145deg,var(--brand),#087982);box-shadow:0 14px 32px var(--brand-soft);font-size:23px;font-weight:1000}.server-card-copy{min-width:0}.server-card-copy strong,.server-card-copy small,.server-card-copy em{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.server-card-copy strong{font-size:15px}.server-card-copy small{margin-top:6px;color:var(--muted);font:10px ui-monospace,Consolas,monospace}.server-card-copy em{margin-top:8px;color:var(--good);font-size:10px;font-style:normal;font-weight:900;letter-spacing:.08em;text-transform:uppercase}.server-card-open{display:grid;place-items:center;min-width:82px;padding:9px 11px;border:1px solid #ffffff1f;border-radius:999px;background:#ffffff08;color:#d9fffb;font-size:11px;font-weight:900}.server-state{grid-column:1/-1;display:grid;justify-items:center;gap:10px;padding:42px 24px;border:1px dashed #ffffff24;border-radius:18px;background:#04101280;color:var(--muted);text-align:center}.server-state strong{color:var(--text);font-size:15px}.server-state button{width:auto;min-width:140px;margin:2px 0 0}.server-state-spinner{width:28px;height:28px;border:3px solid #ffffff1a;border-top-color:var(--brand);border-radius:50%;animation:spin .8s linear infinite}.console-shell{display:grid;grid-template-columns:286px minmax(0,1fr);gap:16px;margin-top:16px}.page-nav{position:sticky;top:14px;align-self:start;padding:10px 10px 16px;max-height:calc(100vh - 28px);overflow:auto;overscroll-behavior:contain;border-color:#ffffff18;background:linear-gradient(180deg,rgba(12,27,29,.98),rgba(5,12,14,.97));box-shadow:0 18px 60px #0008;scrollbar-width:thin}.nav-brand{display:flex;align-items:center;gap:11px;margin:1px 1px 12px;padding:11px;border:1px solid #ffffff11;border-radius:15px;background:linear-gradient(135deg,var(--brand-soft),#ffffff04)}.nav-brand-mark{display:grid;place-items:center;width:34px;height:34px;border-radius:10px;background:linear-gradient(145deg,var(--brand),#087982);box-shadow:0 8px 25px var(--brand-soft);font-weight:1000}.nav-brand strong,.nav-brand span{display:block}.nav-brand strong{font-size:12px;letter-spacing:.09em}.nav-brand span{margin-top:2px;color:#82a09f;font-size:9px;font-weight:800;letter-spacing:.09em;text-transform:uppercase}.workspace-switcher{margin:0 1px 12px;padding:10px;border:1px solid #ffffff12;border-radius:15px;background:#061113}.workspace-current{display:grid;grid-template-columns:38px minmax(0,1fr) auto;gap:9px;align-items:center}.guild-avatar{display:grid;place-items:center;width:38px;height:38px;border-radius:12px;background:linear-gradient(145deg,var(--brand),#087982);box-shadow:0 8px 24px var(--brand-soft);font-weight:1000}.workspace-copy{min-width:0}.workspace-copy strong,.workspace-copy span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.workspace-copy strong{font-size:12px}.workspace-copy span{margin-top:3px;color:var(--muted);font:10px ui-monospace,Consolas,monospace}.workspace-status{width:8px;height:8px;border-radius:50%;background:var(--warn);box-shadow:0 0 10px var(--warn)}.workspace-status.online{background:var(--good);box-shadow:0 0 11px var(--good)}.workspace-search{margin-top:9px;padding:8px 9px;font-size:11px}.workspace-list{display:grid;gap:5px;max-height:180px;margin-top:7px;overflow:auto;scrollbar-width:thin;scrollbar-color:var(--brand) transparent}.workspace-option{display:grid!important;grid-template-columns:28px minmax(0,1fr);gap:8px;align-items:center;min-height:36px!important;margin:0!important;padding:6px!important}.workspace-option span:first-child{display:grid;place-items:center;width:28px;height:28px;border-radius:9px;background:#123033;color:#8ff6ed;font-weight:900}.workspace-option small{display:block;color:var(--muted);font:9px ui-monospace,Consolas,monospace}.workspace-option[aria-current="true"]{border-color:rgba(var(--brand-rgb),.55)!important;background:var(--brand-soft)!important}.workspace-empty{padding:9px;color:var(--muted);font-size:10px;text-align:center}.workspace-back{margin:0 1px 10px!important;background:#ffffff08!important}.nav-group{margin:4px 0;border:1px solid transparent;border-radius:13px}.nav-group[open]{border-color:#ffffff0c;background:#ffffff025}.nav-group summary{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 11px;color:#789291;font-size:9px;text-transform:uppercase;letter-spacing:.16em;font-weight:900;cursor:pointer;list-style:none}.nav-group summary::-webkit-details-marker{display:none}.nav-group summary:after{content:"+";font-size:14px;line-height:1;color:#79b8b4}.nav-group[open] summary:after{content:"−"}.nav-group>div{padding:0 5px 6px}.page-nav button{display:flex;align-items:center;min-height:40px;margin:2px 0;padding:9px 10px;text-align:left;background:transparent;border-color:transparent;color:#9fb2b1;font-size:12.5px;font-weight:760;transition:.18s ease;border-radius:10px}.page-nav button:hover,.page-nav button.active{color:#fff;background:linear-gradient(90deg,var(--brand-soft),#ffffff06,transparent);border-color:#ffffff16;transform:translateX(2px);box-shadow:0 8px 26px #0005}.page-nav button.active{box-shadow:inset 3px 0 0 var(--brand),0 8px 26px #0005}.nav-foot{margin:12px 4px 0;padding:10px 11px;border:1px solid #1e543c;border-radius:12px;background:#0b251a;color:#83e9b5;font-size:10px;font-weight:800;line-height:1.5}.nav-foot i{display:inline-block;width:7px;height:7px;margin-right:6px;border-radius:50%;background:var(--good);box-shadow:0 0 12px var(--good)}.mobile-page-picker,.mobile-nav-toggle,.mobile-nav-backdrop{display:none}
    .layout{display:grid;grid-template-columns:minmax(0,1fr);gap:14px}.stack{display:grid;gap:14px}.panel{padding:22px;transition:transform .2s ease,border-color .2s ease,box-shadow .2s ease}.panel:hover{border-color:color-mix(in srgb,var(--brand) 44%,var(--line));box-shadow:0 26px 80px #0008,0 0 0 1px var(--brand-soft)}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.grid.three{grid-template-columns:repeat(3,minmax(0,1fr))}
    label{display:block;margin:10px 0 6px;font-weight:800;font-size:13px}input,select,textarea,button,a.button{width:100%;border-radius:11px;border:1px solid var(--line);background:#071113;color:#fff;padding:11px;font:inherit;transition:border-color .18s,box-shadow .18s,transform .18s}
    input:focus,select:focus,textarea:focus{outline:none;border-color:var(--brand);box-shadow:0 0 0 3px var(--brand-soft)}textarea{min-height:120px;resize:vertical}button,a.button{display:block;position:relative;overflow:hidden;text-align:center;text-decoration:none;margin-top:11px;background:linear-gradient(135deg,var(--brand),#087982);border-color:#ffffff25;font-weight:900;cursor:pointer}button:after,a.button:after{content:"";position:absolute;inset:-80% auto -80% -35%;width:24%;transform:rotate(18deg);background:#ffffff22;transition:left .45s ease}button:hover:after,a.button:hover:after{left:120%}button:hover,a.button:hover{transform:translateY(-2px);filter:brightness(1.12);box-shadow:0 10px 28px var(--brand-soft)}button:active,a.button:active{transform:translateY(0) scale(.99)}button:disabled{opacity:.55;cursor:wait;transform:none}
    button.primary{background:linear-gradient(135deg,var(--brand),#22d3ee)}button.success{background:linear-gradient(135deg,#10b981,#047857)}button.ghost{background:#ffffff08;border-color:#ffffff20}button.danger-button{background:linear-gradient(135deg,#ef4444,#7f1d1d)}button.secondary{background:linear-gradient(145deg,#153033,#0b1b1d)}button.audit-action{background:linear-gradient(135deg,#2563eb,#4f46e5)}button.backup-action{background:linear-gradient(135deg,#0f766e,#115e59)}button.preview-action{background:linear-gradient(135deg,#a16207,#7c2d12)}.tip{display:inline-grid;place-items:center;width:18px;height:18px;margin-left:5px;border:1px solid #3f6c69;border-radius:50%;font-size:11px;color:#d8f1ef;cursor:help;position:relative}.tip:hover:after{content:attr(title);position:absolute;z-index:20;left:24px;top:-8px;width:240px;padding:9px 11px;border-radius:9px;background:#061012;border:1px solid var(--line);color:#e9fffd;box-shadow:0 10px 30px #000a;font-weight:500;line-height:1.35}
    .switch{display:flex;gap:9px;align-items:center;font-weight:700;margin:9px 0}.switch input{width:auto}.color-row{display:grid;grid-template-columns:72px 1fr;gap:10px}.color-row input[type=color]{height:45px;padding:3px}
    .mapping{display:grid;grid-template-columns:minmax(150px,.8fr) minmax(180px,1.2fr);gap:8px;align-items:center;margin:7px 0}.mapping label{margin:0}.search-select{position:relative}.search-select input{padding-right:38px}.search-select:after{content:"⌕";position:absolute;right:13px;top:50%;transform:translateY(-50%);color:var(--muted);pointer-events:none}.mapping-status{display:block;margin-top:4px;color:var(--muted);font-size:11px}.mapping-status.missing{color:var(--bad)}.danger{border-color:#6a2937;background:linear-gradient(180deg,#241016,#110b0e)}.danger h2{color:#ff9aaa}.notice{padding:12px;border:1px solid #55451f;background:#1c170c;border-radius:10px;color:#ffe0a0;line-height:1.5}.release-chain{display:grid;gap:8px;margin:14px 0;padding:0;counter-reset:release}.release-chain li{display:grid;grid-template-columns:34px minmax(0,1fr);gap:2px 10px;align-items:center;padding:11px 12px;border:1px solid #ffffff14;border-radius:12px;background:#070e11;list-style:none;counter-increment:release}.release-chain li:before{grid-row:1/3;content:counter(release);display:grid;place-items:center;width:30px;height:30px;border:1px solid #796436;border-radius:9px;background:#211a0c;color:#ffd780;font-weight:1000}.release-chain strong,.release-chain span{display:block}.release-chain span{color:var(--muted);font-size:11px;line-height:1.45}.release-status{min-height:92px;margin-top:12px;border-color:#725f2d;background:#171306;color:#ffe2a1}.release-status.ready{border-color:#286147;background:#092118;color:#9ff1c5}.release-status.expired,.release-status.failed{border-color:#713345;background:#210c13;color:#ffafbd}.release-arm{margin-top:12px;padding:12px;border:1px solid #6b3443;border-radius:12px;background:#1d0c12}.danger #executeProductionRebuild:disabled{cursor:not-allowed;filter:grayscale(.35)}
    .status{white-space:pre-wrap;word-break:break-word;max-height:440px;overflow:auto;background:#061012;border:1px solid var(--line);border-radius:11px;padding:12px;color:#cfe8e6;font:12px ui-monospace,Consolas,monospace}.overview-lead{position:relative;overflow:hidden;padding:27px}.overview-lead:before{content:"";position:absolute;inset:0;background:linear-gradient(110deg,var(--brand-soft),transparent 38%);pointer-events:none}.overview-heading{position:relative;display:flex;align-items:end;justify-content:space-between;gap:20px;margin-bottom:20px}.page-kicker{display:block;margin-bottom:7px;color:#66e1d7;font-size:10px;font-weight:900;letter-spacing:.2em;text-transform:uppercase}.overview-heading h2{font-size:25px}.overview-heading .help{max-width:660px;margin:6px 0 0}.overview-health{display:flex;align-items:center;gap:8px;min-width:max-content;padding:8px 11px;border:1px solid #245b42;border-radius:999px;background:#0c261b;color:#7febba;font-size:11px;font-weight:850}.overview-health i{width:7px;height:7px;border-radius:50%;background:var(--good);box-shadow:0 0 13px var(--good)}.metric-grid{position:relative;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.metric{position:relative;overflow:hidden;min-height:105px;padding:17px;border:1px solid #ffffff14;border-radius:16px;background:linear-gradient(145deg,#102528,#071416);box-shadow:0 12px 34px #0004;transition:transform .2s,border-color .2s}.metric:after{content:"";position:absolute;width:80px;height:80px;right:-28px;top:-32px;border-radius:50%;background:var(--brand-soft);filter:blur(2px)}.metric:hover{transform:translateY(-3px);border-color:rgba(var(--brand-rgb),.5)}.metric:nth-child(4n+2):after{background:#38bdf826}.metric:nth-child(4n+3):after{background:#22c55e20}.metric:nth-child(4n+4):after{background:#f59e0b20}.metric b{position:relative;z-index:1;display:block;font-size:27px;margin-bottom:11px}.metric span{position:relative;z-index:1;color:#9db7b4;font-size:11px;font-weight:750;text-transform:uppercase;letter-spacing:.06em}
    .toast{position:fixed;z-index:100;right:18px;bottom:18px;max-width:420px;padding:14px 17px;border-radius:12px;background:#102527;border:1px solid var(--line);box-shadow:0 15px 45px #0009;display:none;animation:toastIn .2s ease}.toast.ok{display:block;color:var(--good)}.toast.error{display:block;color:var(--bad)}@keyframes toastIn{from{opacity:0;transform:translateY(8px)}}
    .access{max-width:720px;margin:10vh auto 0;text-align:center;padding:34px}.access-icon{width:54px;height:54px;margin:0 auto 16px;display:grid;place-items:center;border:1px solid var(--line);border-radius:16px;background:#09090c;font-size:25px}.access-actions{display:flex;gap:10px;justify-content:center;margin-top:20px}.access-actions .button{width:auto;min-width:190px}.template-cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.template-card{padding:14px;border:1px solid var(--line);border-radius:12px;background:#0b0a0e;text-align:left}.template-card strong,.template-card span{display:block}.template-card span{color:var(--muted);font-size:12px;margin-top:5px;line-height:1.4}.template-card.is-active{border-color:var(--good);box-shadow:0 0 0 1px #23583d}.preview-card{margin-top:10px;padding:15px;border-left:5px solid var(--brand);background:#09090c;border-radius:10px}.permission-list{display:grid;gap:8px}.permission-item{padding:11px;border:1px solid var(--line);border-radius:10px;background:#0a090d}.permission-item strong{display:block;margin-bottom:4px}.guide-actions{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
    .hero-toggle{position:absolute;right:18px;top:18px;z-index:3;width:auto;min-width:118px;margin:0;padding:9px 12px;background:#ffffff0b;border-color:#ffffff25}.hero.is-collapsed{padding:18px 26px}.hero.is-collapsed p,.hero.is-collapsed .chips,.hero.is-collapsed .hero-actions{display:none}.hero-actions{display:grid;grid-template-columns:minmax(220px,420px) minmax(150px,220px) auto;gap:10px;align-items:end;margin-top:17px;position:relative;z-index:1;padding:12px;border:1px solid #ffffff12;border-radius:15px;background:linear-gradient(135deg,#ffffff0b,#00000020)}.hero-actions label{margin:0}.dirty{color:var(--warn);font-size:12px;font-weight:800;align-self:center;justify-self:end;padding:9px 11px;border-radius:999px;background:#0000002d;border:1px solid #ffffff12}.loading{position:fixed;z-index:90;inset:0;background:#041012e6;display:grid;place-items:center}.spinner{width:48px;height:48px;border:4px solid #ffffff1f;border-top-color:var(--brand);border-radius:50%;animation:spin .8s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}.theme-pills{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.theme-pills button{background:#102426}.theme-pills button.is-active{box-shadow:0 0 0 2px var(--brand) inset}.operation-actions{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}.audit-summary{margin-top:12px;max-height:360px}
    .fima-profile-head{display:flex;align-items:start;justify-content:space-between;gap:18px}.fima-profile-head h2{margin-bottom:7px}.fima-profile-badge{display:inline-flex;align-items:center;gap:7px;width:max-content;padding:7px 10px;border:1px solid #6b5b2f;border-radius:999px;background:#211b0d;color:var(--warn);font-size:10px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}.fima-profile-badge:before{content:"";width:7px;height:7px;border-radius:50%;background:currentColor;box-shadow:0 0 12px currentColor}.fima-profile-badge.good{border-color:#245b42;background:#0c261b;color:var(--good)}.fima-profile-badge.bad{border-color:#713345;background:#210c13;color:var(--bad)}.fima-profile-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:9px;margin-top:15px}.fima-profile-state{min-height:92px;padding:13px;border:1px solid #ffffff13;border-radius:13px;background:linear-gradient(145deg,#0d2022,#071315)}.fima-profile-state span,.fima-profile-state strong{display:block}.fima-profile-state span{color:#789795;font-size:9px;font-weight:900;letter-spacing:.1em;text-transform:uppercase}.fima-profile-state strong{margin-top:9px;color:var(--warn);font-size:11px;line-height:1.45}.fima-profile-state.good strong{color:var(--good)}.fima-profile-state.bad strong{color:var(--bad)}.fima-profile-remediation{margin-top:13px;padding:13px;border:1px solid #725f2d;border-radius:12px;background:#171306;color:#ffe2a1}.fima-profile-remediation p{margin:0 0 10px;line-height:1.5}.fima-profile-remediation a{color:#9ff7ef;font-weight:900}.fima-profile-actions{display:grid;grid-template-columns:minmax(240px,1fr) minmax(220px,.55fr);gap:11px;align-items:end;margin-top:13px}.fima-profile-actions label{margin:0}.fima-profile-actions button{margin:0}.fima-profile-actions button:disabled{cursor:not-allowed}.fima-profile-note{margin-top:10px;color:var(--muted);font-size:11px;line-height:1.5}
    .community-builder{margin-top:18px;padding-top:18px;border-top:1px solid var(--line)}.community-preview-grid{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(240px,.65fr);gap:12px;margin-top:12px}.community-device{min-height:260px;padding:14px;border:1px solid var(--line);border-radius:14px;background:linear-gradient(160deg,#0f2426,#061012);overflow:auto}.community-device.mobile{max-width:360px;justify-self:stretch}.community-tree{display:grid;gap:11px}.community-category{padding:9px;border:1px solid #ffffff12;border-radius:10px;background:#ffffff05}.community-category b{display:block;margin-bottom:7px;color:#fff}.community-channel{display:block;padding:4px 7px;color:#bfd8d6;font-size:12px}.community-channel.private{color:#75e8de}.community-channel.important{color:#ffe09a}.community-safety{display:flex;flex-wrap:wrap;gap:7px;margin:10px 0}.community-safety span{padding:6px 9px;border:1px solid #24563f;border-radius:999px;background:#0e281d;color:var(--good);font-size:11px;font-weight:800}.community-detail-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:12px}.community-detail-grid .status{max-height:330px}.community-actions{grid-template-columns:repeat(3,minmax(0,1fr))}.community-actions button[data-safe-only="true"]{background:linear-gradient(135deg,#334155,#1e293b)}.community-operation-status{margin-top:12px;max-height:260px}
    .guide-center{overflow:hidden;background:radial-gradient(circle at 96% -18%,rgba(var(--brand-rgb),.2),transparent 34%),linear-gradient(145deg,rgba(14,32,34,.97),rgba(5,13,15,.98))}.guide-center-head{display:flex;align-items:center;justify-content:space-between;gap:28px;padding-bottom:20px;border-bottom:1px solid #ffffff12}.guide-center-head h2{font-size:26px}.guide-center-head .help{max-width:780px;margin:7px 0 0}.guide-studio-link{width:auto;min-width:210px;margin:0;white-space:nowrap}.guide-toolbar{display:grid;grid-template-columns:minmax(260px,1fr) minmax(270px,.7fr);gap:12px;align-items:end;margin:18px 0 12px}.guide-toolbar label{margin:0}.guide-toolbar input{margin-top:7px;padding-left:14px}.guide-result-count{display:block;min-height:16px;margin:7px 2px 0;color:#8cc8c4;font-size:10px;font-weight:800;letter-spacing:.04em}.guide-status{display:flex;align-items:center;gap:11px;min-height:62px;padding:11px 14px;border:1px solid #1d5b56;border-radius:13px;background:linear-gradient(135deg,rgba(var(--brand-rgb),.12),#071719)}.guide-status i{flex:0 0 auto;width:9px;height:9px;border-radius:50%;background:var(--good);box-shadow:0 0 16px var(--good)}.guide-status span,.guide-status strong,.guide-status small{display:block}.guide-status strong{font-size:12px}.guide-status small{margin-top:4px;color:var(--muted);font-size:10px}.guide-guardrails{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;margin:0 0 18px}.guide-guardrail{display:grid;grid-template-columns:34px minmax(0,1fr);gap:10px;align-items:center;padding:11px 12px;border:1px solid #ffffff10;border-radius:13px;background:#071416b8}.guide-guardrail b{display:grid;place-items:center;width:34px;height:34px;border:1px solid #266c66;border-radius:10px;color:#8ff8ef;background:#0b2928;font-size:14px}.guide-guardrail strong,.guide-guardrail small{display:block}.guide-guardrail strong{font-size:11px}.guide-guardrail small{margin-top:3px;color:var(--muted);font-size:9px;line-height:1.35}.guide-library{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.guide-card{position:relative;display:flex;flex-direction:column;min-height:228px;padding:19px;border:1px solid #ffffff13;border-radius:17px;background:linear-gradient(145deg,#102325,#081214);box-shadow:0 15px 38px #0004;overflow:hidden;transition:transform .2s,border-color .2s,box-shadow .2s}.guide-card:after{content:"";position:absolute;width:130px;height:130px;right:-55px;top:-60px;border-radius:50%;background:var(--brand-soft)}.guide-card:hover{transform:translateY(-3px);border-color:rgba(var(--brand-rgb),.48);box-shadow:0 20px 48px #0006}.guide-card>span{position:relative;z-index:1;width:max-content;padding:5px 8px;border:1px solid #28746e;border-radius:999px;color:#89f3ea;background:#0b2a28;font-size:9px;font-weight:900;letter-spacing:.1em;text-transform:uppercase}.guide-card h3{position:relative;z-index:1;margin:14px 0 7px;color:#f4fffe;font-size:18px}.guide-card p{position:relative;z-index:1;flex:1;margin:0;color:var(--muted);font-size:12px;line-height:1.6}.guide-meta{position:relative;z-index:1;display:flex;flex-wrap:wrap;gap:6px;margin-top:13px}.guide-meta span{padding:5px 7px;border:1px solid #ffffff10;border-radius:999px;color:#a8c4c2;background:#ffffff05;font-size:9px;font-weight:750}.guide-card button,.guide-card a.button{position:relative;z-index:1;margin-top:14px}.guide-card.featured{background:radial-gradient(circle at 96% 0,rgba(var(--brand-rgb),.24),transparent 40%),linear-gradient(145deg,#123033,#071416);border-color:#2f6f69}.guide-empty{padding:17px;border:1px dashed var(--line);border-radius:13px;text-align:center}:is(a,button,input,select,textarea):focus-visible{outline:3px solid var(--cyan);outline-offset:3px;box-shadow:0 0 0 6px rgba(102,232,255,.13)}
    .application-builder{margin:18px 0;padding:16px;border:1px solid #ffffff14;border-radius:16px;background:linear-gradient(145deg,#0c1d20,#071113)}.application-builder-head{display:flex;align-items:center;justify-content:space-between;gap:16px}.application-builder-head h3{margin:0}.application-builder-head button{width:auto;min-width:150px;margin:0}.application-question-list{display:grid;gap:10px;margin-top:13px}.application-question{display:grid;grid-template-columns:42px minmax(130px,.55fr) minmax(220px,1fr) minmax(150px,.45fr) 42px 42px;gap:9px;align-items:end;padding:11px;border:1px solid #ffffff12;border-radius:13px;background:#061012}.application-question label{margin:0}.application-question button{width:42px;height:42px;margin:0;padding:0;background:#102426}.application-question .remove-question{color:#ffb5b5;background:#351519}.application-empty{padding:20px;border:1px dashed #ffffff20;border-radius:13px;color:var(--muted);text-align:center}.application-preview{margin-top:13px;padding:15px;border-left:4px solid var(--brand);border-radius:12px;background:#071719}.application-preview ol{margin:10px 0 0;padding-left:21px}.application-preview li{margin:7px 0;color:#dff8f5}.application-preview small{display:block;margin-top:3px;color:var(--muted)}.application-advanced{margin:13px 0;border:1px solid #ffffff12;border-radius:13px;background:#050d0f}.application-advanced summary{padding:13px;cursor:pointer;font-weight:850}.application-advanced>div{padding:0 13px 13px}.application-error{display:none;margin-top:10px;padding:10px;border:1px solid #7f1d1d;border-radius:10px;color:#fecaca;background:#2b1014}.application-error.visible{display:block}
    @media(max-width:980px){.application-question{grid-template-columns:42px minmax(120px,.65fr) minmax(180px,1fr) 42px 42px}.application-question .application-evidence{grid-column:2/4}.application-question label{min-width:0}}
    @media(max-width:620px){.application-builder-head{align-items:stretch;flex-direction:column}.application-builder-head button{width:100%}.application-question{grid-template-columns:repeat(3,minmax(0,1fr));align-items:stretch}.application-question label,.application-question .application-evidence{grid-column:1/-1}.application-question button{width:100%}}
    @media(max-width:980px){.server-directory-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.console-shell{grid-template-columns:1fr}.mobile-nav-toggle{position:sticky;top:8px;z-index:45;display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:11px;margin:0;padding:11px 13px;text-align:left;border-radius:15px;background:linear-gradient(135deg,#123337f5,#071719f5);box-shadow:0 14px 42px #0009;backdrop-filter:blur(18px)}.mobile-nav-toggle>span{display:grid;place-items:center;width:31px;height:31px;border:1px solid #61e8dd45;border-radius:9px;background:var(--brand-soft);font-size:17px}.mobile-nav-toggle strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;letter-spacing:.03em}.mobile-nav-toggle small{color:#85aaa7;font-size:9px;font-weight:900;letter-spacing:.12em;text-transform:uppercase}.page-nav{position:fixed;z-index:110;inset:0 auto 0 0;width:min(88vw,350px);max-height:none;margin:0;border-radius:0 22px 22px 0;transform:translateX(-108%);transition:transform .24s ease;box-shadow:24px 0 80px #000d}.page-nav.is-open{transform:translateX(0)}.mobile-nav-backdrop{position:fixed;z-index:105;inset:0;display:block;background:#010607b8;backdrop-filter:blur(4px)}.metric-grid{grid-template-columns:repeat(2,1fr)}.community-preview-grid,.community-detail-grid{grid-template-columns:1fr}.community-device.mobile{max-width:none}}@media(max-width:700px){main{width:min(100% - 18px,1460px);margin-top:9px}.server-directory{padding:22px 17px}.server-directory-head{display:block}.server-directory-search{margin-top:16px}.server-directory-grid{grid-template-columns:1fr}.hero{padding:24px 18px 18px}.hero-brandline{margin-bottom:19px}.hero h1{padding-right:96px;font-size:31px}.hero-toggle{right:13px;top:14px;min-width:92px}.grid,.grid.three,.template-cards,.guide-actions,.metric-grid,.hero-actions,.community-actions,.guide-library,.guide-toolbar,.guide-guardrails{grid-template-columns:1fr}.guide-center-head{display:block}.guide-studio-link{width:100%;margin-top:15px}.overview-heading{display:block}.overview-health{width:max-content;margin-top:14px}.metric{min-height:92px}.mapping{grid-template-columns:1fr}.mapping label{margin-top:8px}.access-actions{flex-direction:column}.access-actions .button{width:100%}.hero,.panel{border-radius:17px}.panel{padding:17px}}@media(max-width:700px){.console-content,.panel,.fima-profile-head>div{min-width:0}.fima-profile-head{flex-direction:column}.fima-profile-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.fima-profile-actions{grid-template-columns:minmax(0,1fr)}.fima-profile-state{overflow-wrap:anywhere}}@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}*,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}}
  </style>
<link rel="stylesheet" href="/assets/css/paradise-workspace.css">
</head>
<body>
<main>
  <section class="panel access" id="accessGate" aria-live="polite">
    <div class="access-icon">✦</div>
    <div class="badge">FIMA owner access</div>
    <h1 id="accessTitle">Checking secure session…</h1>
    <p class="muted" id="accessMessage">Your FIMA login and linked Discord identity are checked without exposing account details.</p>
    <div class="access-actions" id="accessActions"></div>
  </section>
  <div id="console" hidden>
  <section class="panel server-directory" id="serverDirectory">
<div class="server-directory-head"><div><span class="page-kicker">FIMA Bot Dashboard</span><h1>Select a server</h1><p class="help">Choose a server to manage. Modules and settings apply only to the selected server.</p></div><label class="server-directory-search" for="serverDirectorySearch">Search servers<input id="serverDirectorySearch" type="search" autocomplete="off" placeholder="Server name or last 6 digits"></label></div>
    <div class="server-directory-meta"><span class="server-directory-count" id="serverDirectoryCount" aria-live="polite">Loading servers</span><span class="directory-keyboard">↑ ↓ to select · Enter to open</span></div>
    <div class="server-directory-grid" id="serverDirectoryGrid" role="listbox" aria-label="Yönetilen sunucular" aria-busy="true"><div class="server-state" role="status"><span class="server-state-spinner" aria-hidden="true"></span><strong>Sunucular hazırlanıyor</strong><span>FIMA Bot bağlantıları güvenli biçimde denetleniyor.</span></div></div>
  </section>
  <section class="hero workspace-topbar" id="workspaceHero" hidden>
    <div class="workspace-breadcrumb"><span>FIMA</span><span aria-hidden="true">/</span><span id="workspaceCrumb">Overview</span></div>
    <div class="workspace-topbar-actions"><label for="serverSelect" class="visually-hidden">Managed server<select id="serverSelect"><option>Loading managed servers…</option></select></label><label for="uiLanguage" class="language-control"><select id="uiLanguage" aria-label="Panel language"><option value="tr">Türkçe</option><option value="en">English</option></select></label><span class="owner-shield">◈ <span data-workspace-en="Owner workspace" data-workspace-tr="Sahip çalışma alanı">Owner workspace</span></span></div>
    <div hidden><span id="guildChip"></span><span id="botChip"></span><span id="syncChip"></span><span id="templateChip"></span><button id="heroToggle" type="button">Collapse ▴</button></div>
  </section>

  <div class="console-shell" id="workspaceShell" hidden>
  <button class="mobile-nav-toggle secondary" id="mobileNavToggle" type="button" aria-controls="pageNav" aria-expanded="false"><span aria-hidden="true">☰</span><strong id="mobilePageLabel">Overview</strong><small>Sections</small></button>
  <nav class="panel page-nav" id="pageNav" aria-label="FIMA sections">
    <div class="nav-brand"><span class="nav-brand-mark" aria-hidden="true">F</span><div><strong>FIMA CONTROL</strong><span>Owner workspace</span></div></div>
    <button class="workspace-back ghost" id="backToServers" type="button">← Back to servers</button>
    <section class="workspace-switcher" aria-label="Managed server workspace">
      <div class="workspace-current"><span class="guild-avatar" id="selectedGuildAvatar" aria-hidden="true">—</span><div class="workspace-copy"><strong id="selectedGuildName">Loading server</strong><span id="selectedGuildMaskedId">ID unavailable</span></div><i class="workspace-status" id="selectedGuildStatus" aria-label="Server status"></i></div>
      <input class="workspace-search" id="serverSearch" type="search" autocomplete="off" placeholder="Search managed servers" aria-label="Search managed servers">
      <div class="workspace-list" id="serverWorkspaceList" role="listbox" aria-label="Managed servers"></div>
    </section>
<details class="nav-group" open><summary>Overview</summary><div><button data-page-button="overview" class="active">Overview</button></div></details>
<details class="nav-group"><summary>Community</summary><div><button data-page-button="channels">Channels</button><button data-page-button="roles">Roles & permissions</button><button data-page-button="roster">Roster / Lineups / Relations</button><button data-page-button="leaderboard">Leaderboard / Profiles</button></div></details>
<details class="nav-group"><summary>Moderation</summary><div><button data-page-button="moderation">Moderation / Security</button><button data-page-button="blacklist">Blacklist / Appeal / Bail</button><button data-page-button="challenge">Challenges</button></div></details>
<details class="nav-group"><summary>Engagement</summary><div><button data-page-button="events">Events / Daily Question</button><button data-page-button="xp">XP / Levels</button></div></details>
<details class="nav-group"><summary>Operations</summary><div><button data-page-button="applications">Applications</button><button data-page-button="tickets">Tickets & Support</button><button data-page-button="operations">Training / Staff</button><button data-page-button="availability">Availability & LOA</button></div></details>
<details class="nav-group"><summary>Voice</summary><div><button data-page-button="voice">Voice / Join-to-Create</button></div></details>
<details class="nav-group"><summary>Configuration</summary><div><button data-page-button="servers">Server Selector</button><button data-page-button="setup">Template Setup</button><button data-page-button="guides">Guides & Embeds</button><button data-page-button="branding">Branding / Theme / Language</button><button data-page-button="logs">Logs / Backups / Restore</button><button data-page-button="advanced">Advanced JSON</button></div></details>
    <div class="nav-foot"><i aria-hidden="true"></i><span data-workspace-en="Owner workspace" data-workspace-tr="Sahip çalışma alanı">Owner workspace</span></div>
  </nav>
  <div class="mobile-nav-backdrop" id="mobileNavBackdrop" hidden></div>
  <div class="layout">
    <header class="workspace-page-header"><div><span class="page-kicker" id="workspaceEyebrow">WORKSPACE</span><h1 id="workspaceTitle">Overview</h1><p id="workspaceDescription"></p></div><div class="workspace-page-actions"><span id="saveState" role="status">All settings loaded</span><button type="button" class="ghost" id="workspaceCancel" hidden>Cancel</button><button type="button" class="secondary" id="workspacePreview" hidden>Preview</button><button type="button" class="primary" id="workspaceSave" hidden>Save changes</button></div></header>
    <label class="mobile-page-picker" for="mobilePageSelect"><span>Current workspace</span><select id="mobilePageSelect" aria-label="FIMA workspace page"></select></label>
    <div class="stack">
      <section class="panel overview-lead" data-page="overview">
        <div class="overview-heading"><div><span class="page-kicker">Live command center</span><h2>Operations overview</h2><p class="help">A clean operational summary for the selected server. Detailed runtime data remains sanitized.</p></div><span class="overview-health"><i aria-hidden="true"></i>Owner controls protected</span></div>
        <div class="workspace-health" id="workspace-health" aria-live="polite"></div><div class="metric-grid" id="metricGrid"><div class="metric"><b>—</b><span>Loading</span></div></div>
      </section>
      <section class="panel" data-page="overview">
        <h2>Real server discovery</h2>
        <p class="help">Uses the official FIMA bot API. Audit samples only important visible channels and returns classifications without dumping private message text.</p>
        <div class="operation-actions">
          <button class="audit-action" id="runRealAudit">Run deep audit</button>
          <button class="backup-action" id="runStructureBackup">Create structure backup</button>
          <button class="preview-action" id="runSetupPreview">Generate template preview</button>
        </div>
        <pre class="status audit-summary" id="realAuditStatus">No audit has been run yet. Run an audit to review this server.</pre>
      </section>
      <section class="panel" id="fimaBotIdentityPanel" data-page="branding" aria-labelledby="fimaBotIdentityTitle">
        <div class="fima-profile-head">
          <div><span class="page-kicker">Verified Discord identity</span><h2 id="fimaBotIdentityTitle">FIMA Bot profile</h2><p class="help">Reads the connected bot profile without returning credentials. Supported profile fields require a fresh owner proof before any change.</p></div>
          <span class="fima-profile-badge" id="fimaBotProfileBadge" role="status" aria-live="polite">Checking</span>
        </div>
        <div class="fima-profile-grid" aria-label="FIMA Bot profile field status">
          <div class="fima-profile-state" id="fimaBotApplicationState"><span>Application name</span><strong>Checking…</strong></div>
          <div class="fima-profile-state" id="fimaBotUsernameState"><span>Bot username</span><strong>Checking…</strong></div>
          <div class="fima-profile-state" id="fimaBotNicknameState"><span>Guild nicknames</span><strong>Checking…</strong></div>
          <div class="fima-profile-state" id="fimaBotAvatarState"><span>Avatar</span><strong>Checking…</strong></div>
          <div class="fima-profile-state" id="fimaBotBannerState"><span>Banner</span><strong>Checking…</strong></div>
        </div>
        <div class="fima-profile-remediation" id="fimaBotApplicationRemediation" hidden>
          <p>The Discord bot-token API cannot change the application name. Update it only in the verified Discord Developer Portal application.</p>
          <a id="fimaBotDeveloperPortalLink" target="_blank" rel="noopener noreferrer" hidden>Open verified Developer Portal application</a>
        </div>
        <div class="fima-profile-actions">
          <label>Owner confirmation<input id="fimaBotProfileConfirmation" autocomplete="off" spellcheck="false" placeholder="APPLY FIMA BOT PROFILE"></label>
          <button class="success" id="applyFimaBotProfile" type="button" disabled>Apply supported profile fields</button>
        </div>
        <p class="fima-profile-note" id="fimaBotProfileActionStatus" role="status" aria-live="polite">Status is read-only until the exact confirmation is entered.</p>
      </section>
      <section class="panel" data-page="servers">
        <h2>Identity & installation <span class="tip" title="Administrator is allowed only for the isolated test setup. Production should use least privilege.">?</span></h2>
        <p class="help">Application ID and connected guild state are read live from the FIMA bot runtime.</p>
        <a class="button" href="${invite}" rel="noopener">Invite FIMA to another server</a>
      </section>

      <section class="panel" data-page="setup">
        <h2>Template Setup</h2>
        <p class="help">Choose the selected server's structure. Safe actions create or repair managed resources without deleting existing channels or roles.</p>
        <div class="template-cards">
          <button class="template-card" data-setup-template="tsbtr"><strong>TSBTR setup</strong><span>Leaderboard, profiles, challenges, referee and hoster operations.</span></button>
          <button class="template-card" data-setup-template="community"><strong>FIMA</strong><span>Community, FIMA support, events, applications, voice and XP without ranking systems.</span></button>
          <button class="template-card" data-setup-template="clan"><strong>FT Community</strong><span>Clan, roster, lineup, war, challenge, training and relations.</span></button>
        </div>
        <label for="setupTemplate">Selected template <span class="tip" title="The template is saved per managed server.">?</span></label>
        <select id="setupTemplate"><option value="community">FIMA</option><option value="clan">FT Community</option><option value="tsbtr">TSBTR-style</option></select>
        <button class="primary" id="saveSetupTemplate">Save selected template</button>
        <div class="operation-actions setup-actions">
          <button class="preview-action" id="setupPreviewAction">Preview setup</button>
          <button class="success" id="setupCreateMissingAction">Create missing only</button>
          <button class="secondary" id="setupRepostGuidesAction">Repost guides only</button>
          <button class="secondary" id="setupRepairAction">Repair permissions</button>
          <button class="primary" id="setupStartAction">Start setup</button>
        </div>
        <p class="help">Start setup opens a preview. Destructive rebuild remains in the separate Danger Zone and requires an exact typed Discord confirmation.</p>
      </section>

      <section class="panel" data-page="branding">
        <h2>Template & appearance</h2>
        <p class="help">Selecting a template here stores the owner preference. Destructive setup still requires backup, preview and Discord-side final confirmation.</p>
        <div class="template-cards">
          <button class="template-card" data-template="tsbtr"><strong>TSBTR setup</strong><span>Large community, leaderboard, referee and staff operations.</span></button>
          <button class="template-card" data-template="community"><strong>FIMA</strong><span>FIMA product, support, security and community channels.</span></button>
          <button class="template-card" data-template="clan"><strong>FT Community</strong><span>Training, tryout, challenge, events and clan relations.</span></button>
        </div>
        <div class="grid">
          <div><label for="template">Active template <span class="tip" title="Community, Clan and TSBTR remain separate schemas.">?</span></label><select id="template"><option value="community">FIMA</option><option value="clan">FT Community</option><option value="tsbtr">TSBTR-style</option></select><button data-save="template">Save template</button></div>
          <div><label>Accent color <span class="tip" title="Controls both the dashboard accent and the Discord embed side strip.">?</span></label><div class="color-row"><input id="brandPicker" type="color" value="#19D3C5" aria-label="Brand color"><input id="brandHex" maxlength="7" value="#19D3C5" spellcheck="false"></div><button class="secondary" id="previewBrand">Preview appearance</button><button data-save="branding">Save theme</button></div>
        </div>
        <h3>Dashboard theme</h3>
        <div class="theme-pills"><button type="button" data-theme="paradise">FIMA Violet</button><button type="button" data-theme="charcoal">Charcoal</button><button type="button" data-theme="midnight">Midnight</button></div>
        <div class="grid">
          <label>Message density <span class="tip" title="Comfortable spacing gives cards more room. Compact spacing keeps long lists easier to scan.">?</span><select id="messageDensity"><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select></label>
          <label>Separator style <span class="tip" title="Choose the separator used in leaderboard and guide cards.">?</span><select id="separatorStyle"><option value="diamond">Diamond</option><option value="line">Line</option><option value="minimal">Minimal</option></select></label>
          <label>Footer style <span class="tip" title="Choose the signature shown below Discord messages. Compact works well for busy boards.">?</span><select id="footerStyle"><option value="branded">Made By Fieel / FIMA</option><option value="compact">Compact</option></select></label>
          <label>Default language<select id="defaultLanguage"><option value="en">English</option><option value="tr">Türkçe</option></select></label>
        </div>
        <div class="preview-card" id="brandPreview"><b>✦ FIMA premium embed</b><p class="help">Structured headings, readable spacing, a configurable accent and “Made By Fieel” footer.</p></div>
        <div class="community-builder" id="communityStructureBuilder">
          <h3>FIMA — Identity &amp; Structure</h3>
          <p class="help">Design the international server tree while preserving existing role/channel IDs. The Turkish area is language-role based, hidden from @everyone and contains only Turkish Chat, Media, Announcements and Voice.</p>
          <div class="notice">Live production mutation is disabled. These controls save drafts and produce auditable plans only; test-guild application still stops before the final Discord mutation and requires screenshots, validation and owner confirmation.</div>
          <div class="community-safety" id="communityStructureSafety"><span>Loading safe policy…</span></div>
          <div class="grid three">
            <label>Preview language<select id="communityNamingLanguage"><option value="en">English names</option><option value="tr">Türkçe adlar</option></select></label>
            <label>Category frame<input id="communityCategoryFrame" maxlength="64" value="╾━ {name} ━╼"></label>
            <label>Role separator<input id="communityRoleSeparatorStyle" maxlength="64" value="╺╾ {name} ╼╸"></label>
            <label>Important marker<input id="communityImportantMarker" maxlength="8" value="⫸"></label>
            <label>Normal marker<input id="communityNormalMarker" maxlength="8" value="⟢"></label>
            <label>Private marker<input id="communityPrivateMarker" maxlength="8" value="⫷"></label>
            <label>Text separator<input id="communityTextSeparator" maxlength="8" value="・"></label>
            <label>Voice style<input id="communityVoiceStyle" maxlength="64" value="⟢ {name}"></label>
          </div>
          <div class="community-preview-grid">
            <div><h3>Desktop tree</h3><div class="community-device" id="communityDesktopPreview">Loading structure…</div></div>
            <div><h3>Mobile tree</h3><div class="community-device mobile" id="communityMobilePreview">Loading structure…</div></div>
          </div>
          <div class="community-detail-grid">
            <div><h3>Current → proposed</h3><pre class="status" id="communityMappingPreview">No mapping loaded.</pre></div>
            <div><h3>Role tree</h3><pre class="status" id="communityRolePreview">No role plan loaded.</pre></div>
            <div><h3>Persona checks</h3><pre class="status" id="communityPersonaPreview">No persona matrix loaded.</pre></div>
          </div>
          <div class="operation-actions community-actions">
            <button class="preview-action" id="previewCommunityStructure">Preview</button>
            <button class="primary" id="saveCommunityStructureDraft">Save Draft</button>
            <button class="success" id="applyCommunityTestGuild">Apply Test Guild</button>
            <button class="secondary" data-safe-only="true" id="compareCommunityStructure">Compare</button>
            <button class="secondary" data-safe-only="true" id="renameExistingCommunity">Rename Existing</button>
            <button class="secondary" data-safe-only="true" id="rollbackCommunityStructure">Rollback</button>
          </div>
          <pre class="status community-operation-status" id="communityOperationStatus">All Community actions are preview-only until the safety gates are satisfied.</pre>
        </div>
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

      <section class="panel" data-page="channels"><h2 data-workspace-en="Channel inventory" data-workspace-tr="Kanal envanteri">Channel inventory</h2><div class="workspace-toolbar"><input type="search" id="workspace-search-channels" data-workspace-placeholder-en="Search channels" data-workspace-placeholder-tr="Kanal ara" placeholder="Search channels"><span id="workspace-count-channels">—</span></div><div class="workspace-listing" id="workspace-channels" aria-live="polite"></div></section>
<section class="panel" data-page="channels">
        <h2>Discord channel mappings</h2>
        <p class="help">These mappings remove mystery channel names. Slash command <b>/set</b> updates the same fields.</p>
        <button class="preview-action" id="autoDetectChannels">Auto-detect channels (preview only)</button>
        <div id="mappingFields"></div>
        <button data-save="channelMappings">Save channel mappings</button>
      </section>

      <section class="panel" data-page="roles"><h2 data-workspace-en="Role hierarchy" data-workspace-tr="Rol hiyerarşisi">Role hierarchy</h2><div class="workspace-toolbar"><input type="search" id="workspace-search-roles" data-workspace-placeholder-en="Search roles" data-workspace-placeholder-tr="Rol ara" placeholder="Search roles"><span id="workspace-count-roles">—</span></div><div class="workspace-listing" id="workspace-roles" aria-live="polite"></div></section>
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
            <label class="switch"><input id="automodEnabled" type="checkbox"> Enable FIMA AutoMod</label>
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

      <section class="panel" data-page="moderation">
        <h2>Security boundaries</h2>
        <p class="help">Owner access requires both a valid FIMA session and the linked owner Discord identity. Mutations use a short-lived CSRF token, credentialed official-origin requests and audited owner-action headers.</p>
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

      <section class="panel guide-center" data-page="guides">
        <div class="guide-center-head"><div><span class="page-kicker">Publishing workspace</span><h2>Guides & Discord Content</h2><p class="help">Search the publishing surface, open the versioned editor or synchronize an approved guide collection. Every Discord write is owner-audited.</p></div><a class="button primary guide-studio-link" href="${apiBase}/fima-bot/content-studio">Open Content Studio</a></div>
        <div class="guide-toolbar"><label for="guideSearch">Find a workflow<input id="guideSearch" type="search" placeholder="Search guides, embeds, Outfits, Capes…" autocomplete="off" aria-describedby="guideResultCount"><span class="guide-result-count" id="guideResultCount" role="status" aria-live="polite">4/4 workflows shown</span></label><div class="guide-status"><i aria-hidden="true"></i><span><strong>Test-guild publishing</strong><small>Version, rollback and managed webhook protection active</small></span></div></div>
        <div class="guide-guardrails" aria-label="Publishing safeguards">
          <div class="guide-guardrail"><b aria-hidden="true">01</b><span><strong>Draft safely</strong><small>Preview before any managed Discord write.</small></span></div>
          <div class="guide-guardrail"><b aria-hidden="true">02</b><span><strong>Owner approval</strong><small>Protected actions keep CSRF and audit controls.</small></span></div>
          <div class="guide-guardrail"><b aria-hidden="true">03</b><span><strong>Test guild first</strong><small>Production remains read-only until final approval.</small></span></div>
        </div>
        <div class="guide-library" id="guideLibrary">
          <article class="guide-card" data-guide-search="community welcome rules support applications"><span>Community</span><h3>Community Handbook</h3><p>Welcome, rules, support, applications and safety guidance in one synchronized collection.</p><div class="guide-meta"><span>5 topics</span><span>Protected repost</span></div><button data-guide-mode="community">Review & repost</button></article>
          <article class="guide-card" data-guide-search="clan roster lineup training relations"><span>Clan</span><h3>Clan Operations</h3><p>Roster, lineup, training, tryout, relation and challenge guidance for clan workflows.</p><div class="guide-meta"><span>6 workflows</span><span>Owner reviewed</span></div><button data-guide-mode="clan">Review & repost</button></article>
          <article class="guide-card" data-guide-search="tsbtr leaderboard referee profile ranking"><span>Competition</span><h3>TSBTR Handbook</h3><p>Leaderboard, profiles, ranked challenges, referee boundaries and result handling.</p><div class="guide-meta"><span>Rank-safe</span><span>Audit logged</span></div><button data-guide-mode="tsbtr">Review & repost</button></article>
          <article class="guide-card featured" data-guide-search="outfits capes multi embed import edit version rollback"><span>Content Studio</span><h3>Outfits & Capes embeds</h3><p>Import existing Discord messages, edit multi-embeds, preview mobile/desktop and roll back versions.</p><div class="guide-meta"><span>Multi-embed</span><span>Version rollback</span></div><a class="button secondary" href="${apiBase}/fima-bot/content-studio">Build or import</a></article>
        </div>
        <p class="help guide-empty" id="guideEmpty" hidden>No publishing workflow matches this search.</p>
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
          <label>Board density <span class="tip" title="Rahat görünüm kadro kartlarını daha ferah yapar. Sıkı görünüm uzun roster/lineup panolarında daha az yer kaplar.">?</span><select id="rosterDensity"><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select></label>
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

      <section class="panel management-panel" data-page="applications" id="applicationManagement"><div class="section-heading"><div><h2 data-workspace-en="Review queue" data-workspace-tr="İnceleme kuyruğu">Review queue</h2><p class="help" data-workspace-en="Review submissions and manage your application forms." data-workspace-tr="Başvuruları inceleyin ve başvuru formlarını yönetin.">Review submissions and manage your application forms.</p></div><button type="button" class="primary" id="openApplicationBuilder" data-workspace-en="Edit form" data-workspace-tr="Formu düzenle">Edit form</button></div><div id="applicationStats" class="queue-stats"></div><div id="applicationRecords"></div></section>
      <section class="panel application-editor" data-page="applications" id="applicationEditor">
        <div class="builder-heading"><button type="button" class="ghost" id="closeApplicationBuilder" data-workspace-en="← Applications" data-workspace-tr="← Başvurular">← Applications</button><h2 data-workspace-en="Form builder" data-workspace-tr="Form oluşturucu">Form builder</h2></div><nav class="builder-tabs" id="applicationBuilderTabs" aria-label="Form builder"></nav>
        <p class="help">Community applications cover Helper, Staff, Moderator, Support, events, content and FIMA product teams. Partnership, Creator and Reseller use a separate business workflow, while clan and TSBTR servers expose their template-specific roles. Every website and Discord submission enters the same private review queue.</p>
        <div class="grid">
          <label class="switch"><input id="applicationsEnabled" type="checkbox"> Enable application forms</label>
          <label>Application cooldown days<input id="applicationCooldownDays" type="number" min="0" max="365"></label>
          <label class="switch"><input id="applicationAutoGrant" type="checkbox"> Grant an explicitly mapped template-server role after authorized approval</label>
          <label class="switch"><input id="applicationBlockBlacklisted" type="checkbox"> Block blacklisted applicants</label>
        </div>
        <div class="grid">
          <label>Panel title<input id="applicationPanelTitle" maxlength="80" placeholder="FIMA · APPLICATION CENTER"></label>
          <label>Panel button label<input id="applicationPanelButtonLabel" maxlength="40" placeholder="Apply"></label>
        </div>
        <label for="applicationPanelDescription">Panel description</label>
        <textarea id="applicationPanelDescription" maxlength="1200" placeholder="Explain the available application families, private review process and approval policy."></textarea>
        <div class="application-builder" aria-labelledby="applicationBuilderTitle">
          <div class="application-builder-head"><div><h3 id="applicationBuilderTitle">Application question editor</h3><p class="help">Choose an application type; each type stores its questions and visual evidence policy separately.</p></div><button class="primary" id="addApplicationQuestion" type="button">+ Add question</button></div>
          <label for="applicationQuestionType">Application type being edited
            <select id="applicationQuestionType">
              <optgroup label="Community">
                <option value="helper">Helper (public staff entry)</option>
                <option value="fima_support">FIMA Support Helper</option>
                <option value="macro_staff">Macro Staff</option>
                <option value="fflag_staff">FFlag Staff</option>
              </optgroup>
              <optgroup label="Business">
                <option value="partnership">Partnership / Ally</option>
                <option value="creator">Creator / Media Partner</option>
                <option value="reseller">Reseller / Affiliate</option>
              </optgroup>
              <optgroup label="Clan / TSBTR templates">
                <option value="staff">Staff</option>
                <option value="moderator">Moderator</option>
                <option value="support">Support</option>
                <option value="training_hoster">Training Hoster</option>
                <option value="tryout_hoster">Tryout Hoster</option>
                <option value="referee">Referee</option>
                <option value="event_staff">Event Staff</option>
                <option value="giveaway_staff">Giveaway Staff</option>
                <option value="content_creator">Content Creator</option>
                <option value="clan_mainer">Clan Member / Mainer</option>
                <option value="war_hoster">War Hoster</option>
              </optgroup>
            </select>
          </label>
          <div class="notice">Community and business applications are always review-only and never auto-grant roles. Template-server roles can be granted only after authorized approval when an explicit role mapping exists.</div>
          <div class="application-question-list" id="applicationQuestionList" aria-live="polite"></div>
          <div class="application-error" id="applicationQuestionError" role="alert"></div>
          <div class="application-preview" id="applicationQuestionPreview"><strong>FIMA · Başvurular</strong><p class="help">No additional questions yet. Standard motivation, experience and availability questions remain in the form.</p></div>
        </div>
        <details class="application-advanced" id="applicationAdvanced">
          <summary>Advanced JSON mode</summary>
          <div>
            <p class="help">For compatibility and bulk editing. Valid JSON automatically synchronizes the visual editor.</p>
            <label for="applicationQuestions">Additional questions JSON</label>
            <textarea id="applicationQuestions" spellcheck="false">{}</textarea>
            <label for="applicationEvidenceRequirements">Question evidence rules JSON</label>
            <textarea id="applicationEvidenceRequirements" spellcheck="false">{}</textarea>
          </div>
        </details>
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
        <p class="help">FT Community can ask a daily question at 13:00 Europe/Berlin. The winner submits one official Roblox gamepass and staff completes a manual payout review.</p>
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
          <button class="audit-action" data-managed-operation="audit">Refresh audit</button>
          <button class="backup-action" data-managed-operation="backup">Create backup</button>
          <button class="audit-action" data-managed-operation="migrate-channels">Move FT channels in place</button>
          <button class="preview-action" data-managed-operation="preview">Preview selected template</button>
        </div>
        <pre id="managedOperationStatus" aria-live="polite"></pre>
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
        <div class="notice"><b>Main servers cannot be rebuilt here.</b> The destructive button below is hard-locked to the isolated test guild. It creates a complete backup, removes old test channels/roles and installs the selected template from zero.</div>
        <label for="testRebuildConfirmation">Test server typed confirmation <span class="tip" title="Select a template above, then type REBUILD TEST CLAN, REBUILD TEST COMMUNITY or REBUILD TEST TSBTR exactly.">?</span></label>
        <input id="testRebuildConfirmation" autocomplete="off" placeholder="REBUILD TEST CLAN">
        <button class="danger-action" id="rebuildTestTemplate">Wipe and rebuild selected test template</button>
        <label for="testSmokeConfirmation">Live smoke confirmation <span class="tip" title="This posts one test suite only in the allowlisted disposable test server. A smoke run does not create production-ready rehearsal evidence.">?</span></label>
        <input id="testSmokeConfirmation" autocomplete="off" placeholder="SMOKE TEST COMMUNITY">
        <button class="secondary" id="runTestSmoke">Run live smoke only</button>
        <label for="testRehearsalConfirmation">Full reversible rehearsal <span class="tip" title="Creates and verifies a fresh backup, rebuilds the isolated test guild, runs two full smoke suites, restores the exact initial backup and requires a fresh zero-diff snapshot before signed evidence is recorded.">?</span></label>
        <input id="testRehearsalConfirmation" autocomplete="off" placeholder="REHEARSE TEST COMMUNITY">
        <button class="danger-action" id="runTestRehearsal">Run backup → rebuild → smoke ×2 → restore rehearsal</button>
        <div class="notice"><b>FT Community production release chain.</b> First clear any interrupted test rollback, then record two separate reversible rehearsals. Select the production server only after both rehearsals succeed. Preflight creates a five-minute, single-use plan tied to its sealed backup digest; the exact confirmation below is generated by the server and cannot be guessed.</div>
        <ol class="release-chain" aria-label="FT Community production release steps">
          <li><strong>Recover test rollback</strong><span>Use only on the allowlisted test server. A missing marker means there is nothing to recover.</span></li>
          <li><strong>Record rehearsal pair</strong><span>Run the reversible rehearsal above twice; backend verifies distinct, signed and chronological evidence.</span></li>
          <li><strong>Create production preflight</strong><span>Select FT Community production. This captures and validates a new sealed backup without changing Discord.</span></li>
          <li><strong>Execute once</strong><span>Review the gate summary, type the server-generated confirmation and explicitly arm execution.</span></li>
        </ol>
        <label for="testRecoveryConfirmation">Rollback recovery confirmation</label>
        <input id="testRecoveryConfirmation" autocomplete="off" placeholder="RECOVER TEST COMMUNITY ROLLBACK">
        <button class="secondary" id="recoverTestRollback">Check and recover interrupted test rollback</button>
        <button class="preview-action" id="createProductionPreflight">Create production preflight (no mutation)</button>
        <div class="status release-status" id="productionPlanStatus" role="status">No production plan is active in this browser session.</div>
        <label for="productionConfirmation">Server-generated production confirmation</label>
        <textarea id="productionConfirmation" autocomplete="off" spellcheck="false" placeholder="Create preflight first; then copy the exact confirmation shown above."></textarea>
        <label class="switch release-arm"><input id="productionExecutionArmed" type="checkbox"> I reviewed the target, sealed backup digest, rehearsal gates and plan expiry. Execute this single-use production plan now.</label>
        <button class="danger-action" id="executeProductionRebuild" disabled>Execute FT Community production rebuild once</button>
        <button class="secondary" id="exportConfig">Export safe configuration</button>
      </section>
    </div>

    <aside class="stack">
      <section class="panel" data-page="advanced"><details class="workspace-disclosure"><summary>Live runtime</summary><p class="help">Sanitized bot, guild and command-sync state. Tokens and secrets are never returned.</p><div class="status" id="runtimeStatus">Loading…</div><button id="refresh">Refresh live state</button></details></section>
      <section class="panel" data-page="advanced"><details class="workspace-disclosure"><summary>Mutation lease</summary><p class="help">Guild-scoped rebuild, repair and smoke-test ownership. A locked or acquiring lease prevents overlapping Discord writes.</p><div class="status" id="mutationLockStatus">Loading…</div></details></section>
      <section class="panel" data-page="advanced"><details class="workspace-disclosure"><summary>Current counters</summary><div class="status" id="summaryStatus">Loading…</div></details></section>
      <section class="panel" data-page="logs"><h2>Restore notes</h2><p class="help">Backups contain category, channel, role and permission-overwrite metadata. Restore remains an owner-confirmed Discord operation; it is not silently executed from the website.</p></section>
    </aside>
  </div>
  </div>
  </div>
</main>
<div class="toast" id="toast"></div>
<div class="loading" id="loadingState"><div><div class="spinner"></div><p class="muted">Loading FIMA safely…</p></div></div>
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
  let currentPayload=null,selectedGuildId='',csrfPromise=null,currentTheme='paradise',selectorLookups={channels:{},roles:{}},workspaceEntered=false,currentPage='overview',productionPlan=null,fimaBotProfileCanApply=false;
const byId=id=>document.getElementById(id);
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const FIMA_BOT_PROFILE_CONFIRMATION='APPLY FIMA BOT PROFILE';
const APPLICATION_EDITOR_TYPES=['helper','staff','moderator','support','training_hoster','tryout_hoster','referee','event_staff','giveaway_staff','content_creator','partnership','clan_mainer','fima_support','macro_staff','fflag_staff','war_hoster','creator','reseller'];
const APPLICATION_EDITOR_TYPE_SET=new Set(APPLICATION_EDITOR_TYPES);
let selectedApplicationType='helper',applicationQuestionRows=[],applicationQuestionBuckets={},applicationEvidenceBuckets={};
const safeApplicationKey=value=>String(value||'').trim().replace(/[^a-z0-9_]/gi,'').slice(0,32);
const isApplicationMap=value=>value&&typeof value==='object'&&!Array.isArray(value);
function normalizeApplicationQuestionBuckets(value){
  if(!isApplicationMap(value))throw new Error('Questions must be a JSON object.');
  const nested=Object.values(value).some(isApplicationMap);
  const source=nested?value:{helper:value},result={};
  for(const [type,bucket] of Object.entries(source)){
    if(!APPLICATION_EDITOR_TYPE_SET.has(type)||!isApplicationMap(bucket))continue;
    const clean={};
    for(const [rawKey,rawLabel] of Object.entries(bucket).slice(0,20)){
      const key=safeApplicationKey(rawKey),label=String(rawLabel||'').replace(/\\s+/g,' ').trim().slice(0,180);
      if(key&&label&&!(key in clean))clean[key]=label;
    }
    if(Object.keys(clean).length)result[type]=clean;
  }
  return result;
}
function normalizeApplicationEvidenceBuckets(value){
  if(!isApplicationMap(value))throw new Error('Evidence rules must be a JSON object.');
  const nested=Object.values(value).some(isApplicationMap);
  const source=nested?value:{helper:value},result={};
  for(const [type,bucket] of Object.entries(source)){
    if(!APPLICATION_EDITOR_TYPE_SET.has(type)||!isApplicationMap(bucket))continue;
    const clean={};
    for(const [rawKey,requirement] of Object.entries(bucket).slice(0,40)){
      const key=safeApplicationKey(rawKey);
      if(key&&!(key in clean))clean[key]=requirement==='required'?'required':'optional';
    }
    if(Object.keys(clean).length)result[type]=clean;
  }
  return result;
}
function applicationRowsForType(type=selectedApplicationType){
  const questions=applicationQuestionBuckets[type]||{},evidence=applicationEvidenceBuckets[type]||{};
  return Object.entries(questions).slice(0,20).map(([key,label])=>({key,label,evidence:evidence[key]==='required'?'required':'optional'}));
}
function loadApplicationJsonState(){
  applicationQuestionBuckets=normalizeApplicationQuestionBuckets(JSON.parse(byId('applicationQuestions').value||'{}'));
  applicationEvidenceBuckets=normalizeApplicationEvidenceBuckets(JSON.parse(byId('applicationEvidenceRequirements').value||'{}'));
  applicationQuestionRows=applicationRowsForType();
}
function syncApplicationJson(){
  const questions={},evidence={};
  for(const row of applicationQuestionRows){
    const key=safeApplicationKey(row.key),label=String(row.label||'').replace(/\\s+/g,' ').trim().slice(0,180);
    if(!key||!label||key in questions)continue;
    questions[key]=label;evidence[key]=row.evidence==='required'?'required':'optional';
  }
  if(Object.keys(questions).length){applicationQuestionBuckets[selectedApplicationType]=questions;applicationEvidenceBuckets[selectedApplicationType]=evidence}
  else{delete applicationQuestionBuckets[selectedApplicationType];delete applicationEvidenceBuckets[selectedApplicationType]}
  byId('applicationQuestions').value=JSON.stringify(applicationQuestionBuckets,null,2);
  byId('applicationEvidenceRequirements').value=JSON.stringify(applicationEvidenceBuckets,null,2);
}
function localizeApplicationEditor(){
  const lang=byId('uiLanguage')?.value==='en'?'en':'tr';
  document.querySelectorAll('#applicationQuestionList label,#applicationQuestionList option,#applicationQuestionList .question-block-type,#applicationQuestionList .question-advanced summary,#applicationQuestionList .question-actions button,#applicationQuestionList .application-empty,#applicationQuestionPreview>strong,#applicationQuestionPreview .help,#applicationQuestionPreview [data-en-text]').forEach(element=>translateDirectText(element,lang));
  document.querySelectorAll('#applicationQuestionList [aria-label],#applicationQuestionList input[placeholder]').forEach(element=>{
    for(const attribute of ['aria-label','placeholder']){if(!element.hasAttribute(attribute))continue;const key=attribute==='aria-label'?'enAria':'enPlaceholder';if(!element.dataset[key])element.dataset[key]=element.getAttribute(attribute);element.setAttribute(attribute,translateUiSource(element.dataset[key],lang))}
  });
}
function renderApplicationQuestions(sync=true,expandedIndex=0){
  const list=byId('applicationQuestionList'),preview=byId('applicationQuestionPreview'),error=byId('applicationQuestionError');
  error.classList.remove('visible');error.textContent='';
  if(!applicationQuestionRows.length){
    list.innerHTML='<div class="application-empty">No additional questions yet. Start with “Add question”.</div>';
    preview.innerHTML='<strong>FIMA · Applications</strong><p class="help">No additional questions yet. Standard motivation, experience and availability questions remain in the form.</p>';
    localizeApplicationEditor();if(sync)syncApplicationJson();return;
  }
  list.innerHTML=applicationQuestionRows.map((row,index)=>
    '<details class="application-question" name="application-editor-question" data-question-index="'+index+'" draggable="true" '+(index===expandedIndex?'open':'')+'>'+
      '<summary><span class="question-drag" aria-hidden="true">⠿</span><span class="question-number">'+String(index+1).padStart(2,'0')+'</span><span class="question-block-title">'+escapeHtml(row.label||tUi('Unnamed question'))+'</span><span class="question-block-type">Text</span></summary>'+
      '<div class="question-editor-fields"><label>Question text<input class="question-label" maxlength="180" value="'+escapeHtml(row.label)+'" placeholder="Write your question"></label>'+
      '<label class="application-evidence">Visual evidence<select class="question-evidence"><option value="optional" '+(row.evidence!=='required'?'selected':'')+'>Optional</option><option value="required" '+(row.evidence==='required'?'selected':'')+'>Required</option></select></label>'+
      '<details class="question-advanced"><summary>Advanced</summary><label>Key<input class="question-key" maxlength="32" value="'+escapeHtml(row.key)+'" placeholder="example_question"></label></details>'+
      '<div class="question-actions"><button type="button" class="move-question ghost" data-direction="-1" aria-label="Move question up" '+(index===0?'disabled':'')+'>↑</button><button type="button" class="move-question ghost" data-direction="1" aria-label="Move question down" '+(index===applicationQuestionRows.length-1?'disabled':'')+'>↓</button><button type="button" class="ghost duplicate-question">Duplicate</button><button type="button" class="remove-question ghost" aria-label="Remove question">Delete</button></div></div>'+
    '</details>'
  ).join('');
  preview.innerHTML='<strong>FIMA · Applications</strong><ol>'+applicationQuestionRows.map(row=>'<li>'+(row.label?escapeHtml(row.label):'<span data-en-text="Unnamed question">Unnamed question</span>')+'<small data-en-text="Visual: '+(row.evidence==='required'?'required':'optional')+'">Visual: '+(row.evidence==='required'?'required':'optional')+'</small></li>').join('')+'</ol>';
  localizeApplicationEditor();if(sync)syncApplicationJson();
}
function updateApplicationRowsFromEditor(){
  applicationQuestionRows=[...document.querySelectorAll('[data-question-index]')].map(item=>({
    key:safeApplicationKey(item.querySelector('.question-key').value),
    label:item.querySelector('.question-label').value.slice(0,180),
    evidence:item.querySelector('.question-evidence').value
  }));
  document.querySelectorAll('[data-question-index]').forEach((item,index)=>{item.querySelector('.question-block-title').textContent=applicationQuestionRows[index]?.label||tUi('Unnamed question')});
  syncApplicationJson();
  const preview=byId('applicationQuestionPreview');
  preview.innerHTML='<strong>FIMA · Applications</strong><ol>'+applicationQuestionRows.map(row=>'<li>'+(row.label?escapeHtml(row.label):'<span data-en-text="Unnamed question">Unnamed question</span>')+'<small data-en-text="Visual: '+(row.evidence==='required'?'required':'optional')+'">Visual: '+(row.evidence==='required'?'required':'optional')+'</small></li>').join('')+'</ol>';
  localizeApplicationEditor();
}
function showApplicationJsonError(error){
  const box=byId('applicationQuestionError');box.textContent=tUi(error instanceof SyntaxError?'Invalid JSON.':error?.message||'Invalid JSON.');box.classList.add('visible');
}
const UI_TR={
  'FIMA · Applications':'FIMA · Başvurular',
  'FIMA Operations Console':'FIMA Operasyon Paneli','Operations':'Operasyonlar','Overview':'Genel Bakış','Setup & templates':'Kurulum ve şablonlar',
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
  'FIMA login required':'FIMA girişi gerekli','Discord account required':'Discord hesabı gerekli','FIMA access is restricted':'FIMA erişimi kısıtlı',
  'Session check unavailable':'Oturum kontrolü kullanılamıyor','Sign in to FIMA':'FIMA hesabına giriş yap','Link Discord account':'Discord hesabını bağla',
  'Account settings':'Hesap ayarları','Review linked accounts':'Bağlı hesapları kontrol et','Try again':'Tekrar dene'
  ,'Managed server':'Yönetilen sunucu','Panel language':'Panel dili','Selected template':'Seçili şablon','Active template':'Aktif şablon'
  ,'Message density':'Mesaj yoğunluğu','Comfortable':'Rahat görünüm','Compact':'Sıkı görünüm','Default language':'Varsayılan dil'
  ,'Save selected template':'Seçili şablonu kaydet','Preview setup':'Kurulumu önizle','Create missing only':'Yalnızca eksikleri oluştur'
  ,'Repost guides only':'Yalnızca rehberleri yenile','Repair permissions':'Yetkileri onar','Start setup':'Kurulumu başlat'
  ,'Wipe and rebuild selected test template':'Seçili test şablonunu sil ve yeniden kur','Run live test suite':'Canlı test paketini çalıştır'
  ,'Preview panels before save':'Kaydetmeden önce panelleri önizle','Save and repost panel':'Kaydet ve paneli yenile','Open channel in Discord':'Kanalı Discord’da aç'
  ,'Leaderboard size':'Sıralama boyutu','Normal cooldown days':'Normal bekleme günü','Normal immunity days':'Normal dokunulmazlık günü'
  ,'Require proof on configured challenge results':'Ayarlı challenge sonuçlarında kanıt zorunlu','Board density':'Pano yoğunluğu'
  ,'All settings loaded':'Tüm ayarlar yüklendi','Unsaved changes':'Kaydedilmemiş değişiklikler','Type to search channels…':'Kanal adı yazıp arayın…'
  ,'Type to search roles…':'Rol adı yazıp arayın…','Not configured':'Ayarlanmadı','Safe name fallback':'Güvenli isim yedeği'
  ,'FIMA Violet':'FIMA Menekşe','Charcoal':'Kömür','Midnight':'Gece','Footer style':'Alt yazı stili','Made by FIMA':'Made By Fieel','Made By Fieel':'Made By Fieel','Collapse ▴':'Daralt ▴','Expand ▾':'Aç ▾'
  ,'Save branding':'Markayı kaydet','Missing channel — remap required':'Kanal eksik — yeniden eşleştir','Missing role — remap required':'Rol eksik — yeniden eşleştir'
  ,'Type to search. Stored as ':'Yazarak ara. Kayıt anahtarı: ','Board density changes how compact public board cards look.':'Pano yoğunluğu, herkese açık kartların ne kadar sıkı görüneceğini belirler.'
  ,'Rahat görünüm':'Rahat görünüm','Sıkı görünüm':'Sıkı görünüm'
};
Object.assign(UI_TR,{
  'FIMA Operations Console':'FIMA Operasyon Paneli',
  'Multi-server operations, templates, transcripts, staff workflows and safe setup metadata. No bot credential is exposed here.':'Çoklu sunucu yönetimi, şablonlar, transcriptler, staff akışları ve güvenli kurulum ayarları. Bot gizli bilgileri burada gösterilmez.',
  'Owner-only · FIMA account + Discord identity protected':'Sadece owner · FIMA hesabı + Discord kimliği korumalı',
  'Managed server':'Yönetilen sunucu','Panel language':'Panel dili','All settings loaded':'Tüm ayarlar yüklendi','Unsaved changes':'Kaydedilmemiş değişiklikler',
  'Operations':'Operasyonlar','Overview':'Genel Bakış','Server Selector':'Sunucu Seçici','Template Setup':'Şablon Kurulumu','Channels':'Kanallar','Roles & permissions':'Roller ve Yetkiler',
  'Challenges':'Meydan Okumalar','Leaderboard / Profiles':'Sıralama / Profiller','Availability & LOA':'Uygunluk & LOA','Applications':'Başvurular','Tickets & Support':'Ticket & Destek',
  'Moderation / Security':'Moderasyon / Güvenlik','Blacklist / Appeal / Bail':'Blacklist / İtiraz / Bail','Roster / Lineups / Relations':'Roster / Kadro / İlişkiler',
  'Events / Daily Question':'Etkinlikler / Günün Sorusu','Voice / Join-to-Create':'Ses / Join-to-Create','XP / Levels':'XP / Seviye','Guides & Embeds':'Rehberler & Embedler',
  'Branding / Theme / Language':'Marka / Tema / Dil','Logs / Backups / Restore':'Loglar / Yedek / Geri Yükleme','Advanced JSON':'Gelişmiş JSON',
  'Operations overview':'Operasyon Özeti','Real server discovery':'Gerçek Sunucu İncelemesi','Run deep audit':'Derin Audit Çalıştır','Create structure backup':'Yapı Yedeği Al',
  'Generate template preview':'Şablon Önizlemesi Oluştur','Identity & installation':'Kimlik & Kurulum','Invite FIMA to another server':'FIMA’yı başka sunucuya davet et',
  'Selected template':'Seçili şablon','Save selected template':'Seçili şablonu kaydet','Preview setup':'Kurulumu önizle','Create missing only':'Sadece eksikleri oluştur',
  'Repost guides only':'Sadece rehberleri yenile','Repair permissions':'Yetkileri onar','Start setup':'Kurulumu başlat','Message density':'Mesaj yoğunluğu',
  'Comfortable':'Rahat görünüm','Compact':'Sıkı görünüm','Board density':'Pano yoğunluğu','Footer style':'Footer stili','Save branding':'Markayı kaydet',
  'Auto-detect channels (preview only)':'Kanalları otomatik algıla (önizleme)','Preview panels before save':'Kaydetmeden önce panelleri önizle',
  'Save and repost panel':'Kaydet ve paneli yenile','Open channel in Discord':'Kanalı Discord’da aç','Not configured':'Ayarlanmadı','Safe name fallback':'Güvenli isim yedeği',
  'No managed server online':'Yönetilebilir sunucu çevrim içi değil','Loading managed servers…':'Yönetilen sunucular yükleniyor…','Checking secure session…':'Güvenli oturum kontrol ediliyor…',
  'Your FIMA login and linked Discord identity are checked without exposing account details.':'FIMA girişin ve bağlı Discord kimliğin, hesap detayları gösterilmeden kontrol edilir.',
  'Sign in to FIMA':'FIMA’ya giriş yap','Link Discord account':'Discord hesabını bağla','Try again':'Tekrar dene'
});
Object.assign(UI_TR,{
  'Sign in with the FIMA account that owns the FIMA console. You will return here after login.':'FIMA panelinin sahibi olan FIMA hesabıyla giriş yap. Girişten sonra buraya geri döneceksin.',
  'Your FIMA account is signed in, but Discord is not linked. Link the owner Discord account to continue.':'FIMA hesabına giriş yapılmış ama Discord bağlı değil. Devam etmek için owner Discord hesabını bağla.',
  'This signed-in account is not authorized to open the FIMA owner console.':'Bu FIMA hesabı FIMA owner panelini açmaya yetkili değil.',
  'The secure account check could not be completed. Refresh or try again shortly.':'Güvenli hesap kontrolü tamamlanamadı. Sayfayı yenile veya birazdan tekrar dene.',
  'Owner command center':'Owner yönetim merkezi','Owner workspace':'Owner çalışma alanı','Command center':'Yönetim merkezi',
  'Structure':'Yapı','Competition & staff':'Rekabet ve ekip','Community operations':'Topluluk operasyonları','Publishing':'Yayınlama','System':'Sistem',
  'Current workspace':'Geçerli çalışma alanı','Live command center':'Canlı yönetim merkezi','Owner controls protected':'Owner kontrolleri korumalı',
  'Sections':'Bölümler','Secure owner session':'Güvenli owner oturumu','Mutations remain lease-protected':'Değişiklikler işlem kilidiyle korunur',
  'A clean operational summary for the selected server. Detailed runtime data remains sanitized.':'Seçili sunucu için sade bir operasyon özeti. Ayrıntılı çalışma verileri güvenli biçimde maskelenir.',
  'Uses the official FIMA bot API. Audit samples only important visible channels and returns classifications without dumping private message text.':'Resmî FIMA bot API’sini kullanır. Denetim yalnızca önemli ve görünür kanalları örnekler; özel mesaj metinlerini göstermeden sınıflandırma döndürür.',
  'Managed servers':'Yönetilen sunucular','Commands':'Komutlar','Channels':'Kanallar','Roles':'Roller','Profiles':'Profiller',
  'Open challenges':'Açık meydan okumalar','Active sessions':'Aktif oturumlar','Active LOA':'Aktif LOA','Loading':'Yükleniyor'
});
Object.assign(UI_TR, {'Moderation':'Moderasyon','Owner-only · FIMA account + Discord identity protected':'Yalnız owner · FIMA hesabı ve Discord kimliğiyle korunur','Search managed servers':'Yönetilen sunucularda ara','Search managed servers…':'Yönetilen sunucularda ara…','Community':'Topluluk','Configuration':'Yapılandırma','Voice':'Ses','No audit has been run yet. Run an audit to review this server.':'Henüz denetim yapılmadı. Sunucuyu incelemek için denetim başlatın.'});
Object.assign(UI_TR, {'Use explicit mappings for referee, hoster and setup authority. Empty fields keep the safe role-name fallback.':'Hakem, host ve kurulum yetkileri için rol eşlemelerini seçin. Boş alanlar güvenli rol adı yedeğini kullanır.','FIMA sections':'FIMA bölümleri','Managed server workspace':'Yönetilen sunucu çalışma alanı','Server status':'Sunucu durumu','Only guilds where the official FIMA bot is currently connected appear here.':'Burada yalnız resmi FIMA botunun bağlı olduğu sunucular görünür.'});
Object.assign(UI_TR, {'Select a server':'Sunucu seç','Choose a server to manage. Modules and settings apply only to the selected server.':'Yönetmek istediğin sunucuyu seç. Modüller ve ayarlar yalnız seçilen sunucu kapsamında açılır.','Search servers':'Sunucularda ara','Server name or last 6 digits':'Sunucu adı veya son 6 hane','Loading servers':'Sunucular yükleniyor','Connection unavailable':'Bağlantı kurulamadı','No managed servers':'Yönetilebilir sunucu yok','Unable to load servers':'Sunucular alınamadı','Preparing servers':'Sunucular hazırlanıyor','No servers yet':'Henüz sunucu yok','managed servers':'yönetilebilir sunucu','Manage server':'Sunucuyu yönet','FIMA Bot connected':'FIMA Bot bağlı','Management access ready':'Yönetim erişimi hazır','Manage':'Yönet','No matching servers':'Eşleşen sunucu yok','No connected servers yet':'Henüz bağlı sunucu yok','Try a different name or the last 6 digits of the server ID.':'Farklı bir ad veya sunucu kimliğinin son 6 hanesini dene.','Managed servers appear here when FIMA Bot is added.':'FIMA Bot eklendiğinde yönetilebilir sunucular burada görünür.','Checking FIMA Bot connections securely.':'FIMA Bot bağlantıları güvenli biçimde denetleniyor.','Check your connection and try again.':'Bağlantıyı kontrol edip yeniden deneyebilirsin.','No matching managed server':'Eşleşen yönetilebilir sunucu yok','No managed server online':'Çevrimiçi yönetilebilir sunucu yok','↑ ↓ to select · Enter to open':'↑ ↓ ile seç · Enter ile aç','← Back to servers':'← Sunuculara dön'});
Object.assign(UI_TR, {
  'Security boundaries':'Güvenlik sınırları',
  'Owner access requires both a valid FIMA session and the linked owner Discord identity. Mutations use a short-lived CSRF token, credentialed official-origin requests and audited owner-action headers.':'Owner erişimi geçerli FIMA oturumu ve bağlı owner Discord kimliği gerektirir. Değişiklikler kısa ömürlü CSRF kodu, kimlik doğrulamalı resmi kaynak istekleri ve denetlenen owner işlem başlıklarıyla korunur.',
  'Owner-only dashboard':'Yalnız owner yönetim paneli',
  'Wrong linked Discord identities receive no configuration data.':'Yetkisiz bağlı Discord kimliklerine yapılandırma verisi verilmez.',
  'Guild isolation':'Sunucu kapsamı',
  'Every saved setting includes a managed guild ID; unknown guilds are rejected.':'Kaydedilen her ayar yönetilen sunucu kimliğini içerir; bilinmeyen sunucular reddedilir.',
  'No hidden destructive web action':'Gizli yıkıcı web işlemi yok',
  'Setup still requires Discord backup, preview and typed second confirmation.':'Kurulum Discord yedeği, önizleme ve yazılı ikinci onay gerektirir.',
  'Private transcripts':'Özel görüşme kayıtları',
  'Transcript destinations must be permission-restricted staff channels.':'Görüşme kayıtları yalnız yetkili personel kanallarına gönderilmelidir.',
  'Moderation, security & quarantine':'Moderasyon, güvenlik ve karantina',
  'Low-rank staff submit kick/ban requests; senior staff approve or deny them. Quarantine and audit logs are preferred over irreversible automatic punishment.':'Alt yetkili personel atma veya yasaklama talebi gönderir; üst yetkililer onaylar veya reddeder. Geri alınamaz otomatik cezalar yerine karantina ve denetim kayıtları kullanılır.',
  'Require senior kick/ban approval':'Atma ve yasaklama için üst yetkili onayı iste',
  'Enable quarantine workflow':'Karantina akışını etkinleştir',
  'Start in raid mode':'Baskın modunda başlat',
  'Suspicious account age (days)':'Şüpheli hesap yaşı (gün)',
  'Default spam timeout (minutes)':'Varsayılan spam zaman aşımı (dakika)',
  'Repeated violation threshold':'Tekrarlanan ihlal eşiği',
  'Save moderation policy':'Moderasyon politikasını kaydet',
  'Official mainer code':'Resmi mainer kodu','Save code':'Kodu kaydet',
  'Weekly quota JSON':'Haftalık kota JSON','Save quotas':'Kotaları kaydet',
  'Command-channel JSON':'Komut kanalı JSON','Save restrictions':'Kısıtlamaları kaydet',
  'Automation':'Otomasyon','Automatic activity checks':'Otomatik etkinlik denetimleri',
  'Remove roles after missed deadline':'Son tarih kaçırıldığında rolleri kaldır',
  'Save automation':'Otomasyonu kaydet'
});
Object.assign(UI_TR,{
  "No publishing workflow matches this search.": "Bu aramayla eşleşen yayın akışı yok.",
  "Reads the connected bot profile without returning credentials. Supported profile fields require a fresh owner proof before any change.": "Bağlı bot profili kimlik bilgileri açığa çıkarılmadan okunur. Desteklenen profil alanlarını değiştirmek için yeni bir owner doğrulaması gerekir.",
  "Application ID and connected guild state are read live from the FIMA bot runtime.": "Uygulama kimliği ve bağlı sunucu durumu FIMA botundan anlık olarak okunur.",
  "Choose the selected server's structure. Safe actions create or repair managed resources without deleting existing channels or roles.": "Seçili sunucunun yapısını belirleyin. Güvenli işlemler mevcut kanal ve rolleri silmeden yönetilen kaynakları oluşturur veya onarır.",
  "Start setup opens a preview. Destructive rebuild remains in the separate Danger Zone and requires an exact typed Discord confirmation.": "Kurulumu başlat düğmesi önizlemeyi açar. Silme içeren yeniden kurulum ayrı Tehlikeli İşlemler alanındadır ve Discord üzerinden onay metninin eksiksiz yazılmasını gerektirir.",
  "Selecting a template here stores the owner preference. Destructive setup still requires backup, preview and Discord-side final confirmation.": "Buradaki şablon seçimi owner tercihini kaydeder. Silme içeren kurulum için yedek, önizleme ve Discord üzerinden son onay gerekir.",
  "Structured headings, readable spacing, a configurable accent and “Made By Fieel” footer.": "Düzenli başlıklar, okunabilir aralıklar, ayarlanabilir vurgu rengi ve “Made By Fieel” alt bilgisi.",
  "Design the international server tree while preserving existing role/channel IDs. The Turkish area is language-role based, hidden from @everyone and contains only Turkish Chat, Media, Announcements and Voice.": "Mevcut rol ve kanal kimliklerini koruyarak uluslararası sunucu yapısını düzenleyin. Türkçe alan dil rolüne bağlıdır, @everyone için gizlidir ve yalnızca Türkçe sohbet, medya, duyuru ve ses kanallarını içerir.",
  "Start setup opens the safe preview. Permanent removal is never available here without a backup and the exact typed Discord confirmation.": "Kurulumu başlat düğmesi güvenli önizlemeyi açar. Yedek ve Discord üzerinden eksiksiz yazılan onay olmadan kalıcı silme yapılamaz.",
  "Controls ranked target distance and result-generated cooldown/immunity. Selection is rechecked when the user chooses and again before the ticket opens.": "Sıralamadaki hedef mesafesini ve sonuçlara bağlı bekleme süresi ile dokunulmazlığı yönetir. Seçim, kullanıcı hedefi seçtiğinde ve ticket açılmadan önce yeniden kontrol edilir.",
  "Leaderboard position (#1–#30) and fighter Stage/Level/Strength are separate systems. Unranked challenge eligibility uses the minimum fighter rank below.": "Sıralama konumu (#1–#30) ile dövüşçü aşaması, seviyesi ve gücü ayrı sistemlerdir. Sıralamasız meydan okuma uygunluğu aşağıdaki minimum dövüşçü rütbesine bağlıdır.",
  "These boundaries are enforced by the bot. Discord role hierarchy is checked again before role changes.": "Bu sınırları bot uygular. Rol değişikliklerinden önce Discord rol hiyerarşisi yeniden kontrol edilir.",
  "Search the publishing surface, open the versioned editor or synchronize an approved guide collection. Every Discord write is owner-audited.": "Yayın alanında arayın, sürümlü düzenleyiciyi açın veya onaylı rehber koleksiyonunu eşitleyin. Discord üzerindeki her yazma işlemi owner denetim kaydına alınır.",
  "Challenge and support transcripts are retained in their mapped private channels. Closing a ticket never silently discards its history.": "Meydan okuma ve destek dökümleri eşlenen özel kanallarda saklanır. Ticket kapatılması geçmişini sessizce silmez.",
  "Controls display and approval policy for main lineup, war lineup, EU roster and mainer proof workflows. Discord commands remain authoritative and audited.": "Ana kadro, savaş kadrosu, EU kadrosu ve mainer kanıt akışlarının görünüm ve onay politikasını yönetir. Discord komutları yetkili işlem kaynağıdır ve denetim kaydına alınır.",
  "Blacklist records require evidence and audit history. Bail is disabled by default and can never bypass owner approval.": "Kara liste kayıtları kanıt ve denetim geçmişi gerektirir. Bail varsayılan olarak kapalıdır ve owner onayını atlayamaz.",
  "Staff workflows stay structured: hosters create sessions, managers review restricted results, and weekly activity produces recommendations before any role change.": "Personel akışında hoster oturum oluşturur, yönetici kısıtlı sonuçları inceler ve haftalık etkinlik, rol değişikliğinden önce öneriler üretir.",
  "Community applications cover Helper, Staff, Moderator, Support, events, content and FIMA product teams. Partnership, Creator and Reseller use a separate business workflow, while clan and TSBTR servers expose their template-specific roles. Every website and Discord submission enters the same private review queue.": "Topluluk başvuruları Helper, personel, moderatör, destek, etkinlik, içerik ve FIMA ürün ekiplerini kapsar. Ortaklık, Creator ve Reseller ayrı iş akışını kullanır; klan ve TSBTR sunucuları şablona özgü rolleri gösterir. Web sitesi ve Discord başvuruları aynı özel inceleme kuyruğuna girer.",
  "FT Community can ask a daily question at 13:00 Europe/Berlin. The winner submits one official Roblox gamepass and staff completes a manual payout review.": "FT Community, Europe/Berlin saatine göre 13:00’te günlük soru sorabilir. Kazanan resmi bir Roblox gamepass gönderir; personel ödeme incelemesini elle tamamlar.",
  "Joining the lobby creates a temporary voice room under PRIVATE VOICE. Only the room owner can use rename, limits, lock, hide, permit, reject, transfer and delete controls.": "Lobiye katılmak PRIVATE VOICE altında geçici ses odası oluşturur. Ad değiştirme, sınır, kilitleme, gizleme, izin, ret, devir ve silme kontrollerini yalnızca oda sahibi kullanabilir.",
  "Chat XP is cooldown-limited and ignores bot, spam, log and transcript channels. Non-AFK, non-deaf voice activity receives interval XP.": "Sohbet XP’si bekleme süresine bağlıdır; bot, spam, log ve döküm kanalları sayılmaz. AFK olmayan ve sesi kapalı olmayan ses etkinliği belirli aralıklarla XP kazandırır.",
  "Backups contain structure and permission metadata. Restore stays behind Discord-side owner confirmation and is never executed silently from this page.": "Yedekler yapı ve izin metaverisini içerir. Geri yükleme Discord üzerinden owner onayı gerektirir; bu sayfadan sessizce çalıştırılmaz.",
  "Sanitized bot, guild and command-sync state. Tokens and secrets are never returned.": "Hassas verilerden arındırılmış bot, sunucu ve komut eşitleme durumu. Token ve gizli anahtarlar döndürülmez.",
  "Guild-scoped rebuild, repair and smoke-test ownership. A locked or acquiring lease prevents overlapping Discord writes.": "Sunucu kapsamındaki yeniden kurulum, onarım ve temel kontrol işlemlerinin sahipliği. Kilitli veya alınmakta olan işlem kilidi eşzamanlı Discord yazmalarını engeller.",
  "Backups contain category, channel, role and permission-overwrite metadata. Restore remains an owner-confirmed Discord operation; it is not silently executed from the website.": "Yedekler kategori, kanal, rol ve izin geçersiz kılma metaverisini içerir. Geri yükleme Discord üzerinden owner onayı gerektirir; web sitesinden sessizce çalıştırılmaz.",
  "Choose an application type; each type stores its questions and visual evidence policy separately.": "Başvuru türünü seçin; her türün soruları ve görsel kanıt politikası ayrı saklanır.",
  "No additional questions yet. Standard motivation, experience and availability questions remain in the form.": "Henüz ek soru yok. Standart motivasyon, deneyim ve uygunluk soruları formda kalır.",
  "For compatibility and bulk editing. Valid JSON automatically synchronizes the visual editor.": "Uyumluluk ve toplu düzenleme içindir. Geçerli JSON yazıldığında görsel düzenleyici otomatik eşitlenir.",
  "Guild: loading": "Sunucu: yükleniyor",
  "Bot: loading": "Bot: yükleniyor",
  "Commands: loading": "Komutlar: yükleniyor",
  "Template: loading": "Şablon: yükleniyor",
  "Discord: owner vault required": "Discord: Owner Vault gerekli"
});
Object.assign(UI_TR,{"Application question editor": "Başvuru soru düzenleyicisi", "+ Add question": "+ Soru ekle", "Application type being edited": "Düzenlenen başvuru türü", "Advanced JSON mode": "Gelişmiş JSON modu", "Additional questions JSON": "Ek sorular JSON", "Question evidence rules JSON": "Soru görsel kuralları JSON", "FIMA · APPLICATION CENTER": "FIMA · BAŞVURU MERKEZİ", "Apply": "Başvuru yap", "Visual: required": "Görsel: zorunlu", "Visual: optional": "Görsel: opsiyonel"});
Object.assign(UI_TR,{"Application settings": "Başvuru ayarları", "Enable application forms": "Başvuru formlarını etkinleştir", "Application cooldown days": "Başvuru bekleme süresi (gün)", "Grant an explicitly mapped template-server role after authorized approval": "Yetkili onayından sonra açıkça eşlenen şablon sunucu rolünü ver", "Block blacklisted applicants": "Kara listedeki başvuru sahiplerini engelle", "Panel title": "Panel başlığı", "Panel button label": "Panel düğme metni", "Panel description": "Panel açıklaması", "Explain the available application families, private review process and approval policy.": "Mevcut başvuru türlerini, özel inceleme sürecini ve onay politikasını açıklayın.", "Community and business applications are always review-only and never auto-grant roles. Template-server roles can be granted only after authorized approval when an explicit role mapping exists.": "Topluluk ve iş başvuruları yalnız incelemeye alınır; otomatik rol vermez. Şablon sunucu rolleri yalnız açık rol eşlemesi varsa yetkili onayından sonra verilebilir.", "Save application policy": "Başvuru politikasını kaydet"});
Object.assign(UI_TR,{"No additional questions yet. Start with “Add question”.": "Henüz ek soru yok. “Soru ekle” ile başlayın.", "Safe live preview": "Güvenli canlı önizleme", "Move question up": "Soruyu yukarı taşı", "Move question down": "Soruyu aşağı taşı", "Remove question": "Soruyu kaldır", "Key": "Anahtar", "Question text": "Soru metni", "Visual evidence": "Görsel kanıt", "Optional": "Opsiyonel", "Required": "Zorunlu", "example_question": "ornek_soru", "Write your question": "Sorunuzu yazın", "Unnamed question": "İsimsiz soru", "Visual: ": "Görsel: ", "required": "zorunlu", "optional": "opsiyonel"});
Object.assign(UI_TR,{"Questions must be a JSON object.": "Sorular bir JSON nesnesi olmalı.", "Evidence rules must be a JSON object.": "Görsel kuralları bir JSON nesnesi olmalı.", "Invalid JSON.": "Geçersiz JSON.", "At most 20 additional questions can be added.": "En fazla 20 ek soru eklenebilir.", "Unavailable": "Kullanılamıyor", "Failed to load": "Yüklenemedi", "Invalid JSON": "Geçersiz JSON", "Select a managed FIMA server first.": "Önce yönetilen bir FIMA sunucusu seçin.", "Select the isolated test server first.": "Önce izole test sunucusunu seçin.", "Select FT Community production first.": "Önce FT Community production sunucusunu seçin.", "Security session could not be refreshed. Reload the panel.": "Güvenlik oturumu yenilenemedi. Paneli yeniden yükleyin.", "Secure session token is unavailable. Sign in again.": "Güvenli oturum anahtarı kullanılamıyor. Yeniden giriş yapın.", "Save failed": "Kaydedilemedi", "Save failed safely": "Kaydetme güvenli şekilde durduruldu", "FIMA Bot profile sync failed": "FIMA Bot profili eşitlenemedi", "FIMA Bot profile sync failed safely.": "FIMA Bot profili eşitlemesi güvenli şekilde durduruldu.", "Supported FIMA Bot profile fields already match.": "Desteklenen FIMA Bot profil alanları zaten eşleşiyor.", "Applying verified fields…": "Doğrulanmış alanlar uygulanıyor…", "Developer Portal update required": "Developer Portal güncellemesi gerekli", "Supported sync required": "Desteklenen eşitleme gerekli", "FIMA Bot on every scoped guild": "Kapsamdaki her sunucuda FIMA Bot", "Verified asset ready to apply": "Doğrulanmış dosya uygulanmaya hazır", "Verified asset ready": "Doğrulanmış dosya hazır", "Verified asset unavailable": "Doğrulanmış dosya kullanılamıyor", "Verified scope": "Doğrulanmış kapsam", "Sync disabled": "Eşitleme devre dışı", "Scope blocked": "Kapsam engellendi", "Discord profile status is unavailable; no change can be submitted.": "Discord profil durumu kullanılamıyor; değişiklik gönderilemez.", "Application, guild scope or verified profile assets did not pass the exact-scope check.": "Uygulama, sunucu kapsamı veya doğrulanmış profil dosyaları kapsam denetiminden geçemedi.", "Profile synchronization is disabled in the trusted backend runtime.": "Profil eşitlemesi güvenilir backend çalışma ortamında devre dışı.", "Enter APPLY FIMA BOT PROFILE exactly. Application-name remediation remains a separate Developer Portal action.": "APPLY FIMA BOT PROFILE ifadesini aynen girin. Uygulama adını düzeltmek ayrı bir Developer Portal işlemidir.", "Guide post failed": "Rehber gönderilemedi", "Create-missing action failed": "Eksikleri oluşturma işlemi başarısız", "Create-missing action failed safely.": "Eksikleri oluşturma işlemi güvenli şekilde durduruldu.", "Backing up and rebuilding…": "Yedekleniyor ve yeniden oluşturuluyor…", "Test rebuild failed": "Test yeniden oluşturma işlemi başarısız", "Test rebuild failed safely.": "Test yeniden oluşturma işlemi güvenli şekilde durduruldu.", "Posting live tests…": "Canlı testler gönderiliyor…", "Live test failed": "Canlı test başarısız", "Live smoke completed. No rehearsal evidence was recorded.": "Canlı temel kontrol tamamlandı. Prova kanıtı kaydedilmedi.", "Live test failed safely.": "Canlı test güvenli şekilde durduruldu.", "Running reversible rehearsal…": "Geri alınabilir prova çalışıyor…", "Full rehearsal failed": "Tam prova başarısız", "Rehearsal returned without complete restore/evidence verification.": "Prova, tam geri yükleme ve kanıt doğrulaması olmadan döndü.", "Full rehearsal verified: two smoke runs passed, the original state was restored with zero diff, and signed evidence was recorded.": "Tam prova doğrulandı: iki temel kontrol başarılı, önceki durum fark olmadan geri yüklendi ve imzalı kanıt kaydedildi.", "Full rehearsal failed safely. Check rollback status before retrying.": "Tam prova güvenli şekilde durduruldu. Yeniden denemeden önce geri alma durumunu kontrol edin.", "Checking rollback marker…": "Geri alma işareti kontrol ediliyor…", "Interrupted test rollback recovered and reconciled with zero diff.": "Kesilen test geri alma işlemi kurtarıldı ve fark olmadan doğrulandı.", "Test rollback check completed; no recovery mutation was required.": "Test geri alma kontrolü tamamlandı; kurtarma değişikliği gerekmedi.", "Test rollback recovery failed safely.": "Test geri alma kurtarması güvenli şekilde durduruldu.", "Sealing backup and verifying gates…": "Yedek mühürleniyor ve güvenlik denetimleri doğrulanıyor…", "The server returned an incomplete production plan. Nothing can execute.": "Sunucu eksik bir production planı döndürdü. Hiçbir işlem çalıştırılamaz.", "Production plan validation failed safely.": "Production planı doğrulaması güvenli şekilde durduruldu.", "Production preflight ready. Review every immutable field before arming execution.": "Production ön kontrolü hazır. Çalıştırmayı etkinleştirmeden önce değişmez alanları inceleyin.", "Production preflight failed safely. No production mutation ran.": "Production ön kontrolü güvenli şekilde durduruldu. Production değişikliği yapılmadı.", "Executing the single-use production plan…": "Tek kullanımlık production planı çalıştırılıyor…", "Production rebuild request failed; automatic retry is disabled.": "Production yeniden oluşturma isteği başarısız; otomatik yeniden deneme devre dışı.", "Use a valid HEX color such as #000000": "#000000 gibi geçerli bir HEX renk kullanın", "No production plan is active in this browser session.": "Bu tarayıcı oturumunda aktif production planı yok.", "State:": "Durum:", "Target guild:": "Hedef sunucu:", "Plan ID:": "Plan kimliği:", "Sealed backup digest:": "Mühürlenmiş yedek özeti:", "Expires:": "Sona erme:", "Exact confirmation (type it below; it is not inserted automatically):": "Kesin onay (aşağıya yazın; otomatik eklenmez):", "(unavailable for this plan state)": "(bu plan durumunda kullanılamıyor)", "ready": "hazır", "expired": "süresi doldu", "unknown": "bilinmiyor", "failed": "başarısız", "The protected Discord operation failed safely.": "Korunan Discord işlemi güvenli şekilde durduruldu."});
Object.assign(UI_TR,{"No readable channels are available for auto-detect.": "Otomatik algılama için okunabilir kanal yok.", "No safe new suggestions found.": "Güvenli yeni öneri bulunamadı.", "Leaderboard size and distances must be positive.": "Sıralama boyutu ve aralıklar pozitif olmalıdır.", "Review the live plan, type its exact confirmation and arm execution first.": "Önce güncel planı inceleyin, kesin onayını yazın ve çalıştırmayı etkinleştirin.", "Execution status is uncertain. The plan was disabled; inspect the audit and server state before any retry.": "İşlemin durumu belirsiz. Plan devre dışı bırakıldı; yeniden denemeden önce denetim kaydını ve sunucuyu kontrol edin.", "Refresh the verified owner connection with Discord, then reopen this panel and try again.": "Discord ile doğrulanmış sahip bağlantısını yenileyin, ardından bu paneli yeniden açıp deneyin.", "There is no interrupted test rollback to recover. The test recovery gate is already clear.": "Kurtarılacak kesilmiş test geri alma işlemi yok. Test kurtarma denetimi zaten açık.", "Select the allowlisted FT Community production server for this step.": "Bu adım için izin listesindeki FT Community production sunucusunu seçin.", "Select the allowlisted disposable test server for this step.": "Bu adım için izin listesindeki geçici test sunucusunu seçin.", "The five-minute production plan expired. Create and review a new preflight.": "Beş dakikalık production planının süresi doldu. Yeni bir ön kontrol oluşturup inceleyin.", "Another protected Discord mutation owns the lease. Wait for it to finish, then refresh status.": "Başka bir korunan Discord işlemi kilidi kullanıyor. Tamamlanmasını bekleyip durumu yenileyin.", "The operation could not be completed. Refresh your session and try again.": "İşlem tamamlanamadı. Oturumunuzu yenileyip tekrar deneyin."});
function translateUiSource(source,lang){
  if(lang!=='tr')return source;
  if(UI_TR[source])return UI_TR[source];
  let m;
  if((m=/^(\\d+) update required$/u.exec(source)))return m[1]+" güncelleme gerekli";
  if((m=/^Applied (\\d+) supported FIMA Bot profile field\\(s\\)\\.$/u.exec(source)))return m[1]+" desteklenen FIMA Bot profil alanı güncellendi.";
  if((m=/^(\\d+) channel suggestions filled for review\\. Nothing was saved\\.$/u.exec(source)))return m[1]+" kanal önerisi inceleme için dolduruldu. Hiçbir şey kaydedilmedi.";
  if((m=/^Updated (\\d+) guide messages$/u.exec(source)))return m[1]+" rehber mesajı güncellendi";
  if((m=/^Created (\\d+) channels and (\\d+) roles; (\\d+) guides synchronized\\.$/u.exec(source)))return m[1]+" kanal ve "+m[2]+" rol oluşturuldu; "+m[3]+" rehber eşitlendi.";
  if((m=/^Type (.+) exactly\\. Nothing changed\\.$/u.exec(source)))return "Tam olarak "+m[1]+" yazın. Hiçbir şey değiştirilmedi.";
  if((m=/^Type (SMOKE TEST COMMUNITY|REHEARSE TEST COMMUNITY) exactly to run (.+)\\.$/u.exec(source)))return "Kontrolü çalıştırmak için tam olarak "+m[1]+" yazın.";
  if((m=/^Repost or update the (.+) guide messages in the selected Discord server\\?$/u.exec(source)))return "Seçilen Discord sunucusundaki "+m[1]+" rehber mesajları yeniden gönderilsin veya güncellensin mi?";
  if((m=/^FT Community rebuild completed: (\\d+) channels and (\\d+) roles created\\.$/u.exec(source)))return "FT Community yeniden oluşturuldu: "+m[1]+" kanal ve "+m[2]+" rol oluşturuldu.";
  if((m=/^Test rebuild complete: (\\d+) channels and (\\d+) roles removed; (\\d+) channels and (\\d+) roles created\\.$/u.exec(source)))return "Test yeniden oluşturuldu: "+m[1]+" kanal ve "+m[2]+" rol silindi; "+m[3]+" kanal ve "+m[4]+" rol oluşturuldu.";
  if((m=/^Saved (.+) for the selected server(.*)$/u.exec(source)))return "Seçilen sunucu için ayarlar kaydedildi.";
  if((m=/^(.+) completed for the selected server$/u.exec(source)))return "Seçilen sunucu için işlem tamamlandı.";
  if((m=/^(.+) failed(?: safely\\.)?$/u.exec(source)))return "İşlem güvenli şekilde durduruldu.";

  const chip=/^(Guild|Bot|Commands|Template): (.*)$/.exec(source);
  if(chip){const labels={Guild:'Sunucu',Bot:'Bot',Commands:'Komutlar',Template:'Şablon'};const statuses={'unavailable':'kullanılamıyor','FIMA online':'FIMA çevrimiçi','name check needed':'ad kontrolü gerekli','not selected':'seçilmedi'};const detail=statuses[chip[2]]||chip[2].replace(/ · synced$/,' · eşitlendi');return labels[chip[1]]+': '+detail;}
  const match=/^([^\\p{L}\\p{N}]*)([\\s\\S]+)$/u.exec(source);
  return match&&UI_TR[match[2]]?match[1]+UI_TR[match[2]]:source;
}
function tUi(source){
  const language=(()=>{try{return localStorage.getItem('paradiseUiLanguage')||byId('uiLanguage')?.value||'tr'}catch{return'tr'}})();
  return translateUiSource(source,language);
}
function setUiText(id,source){
  const element=byId(id);if(!element)return;
  element.dataset.enText=source;
  element.textContent=tUi(source);
}
function setUiText(id,source){
  const element=byId(id);element.dataset.enText=source;element.textContent=tUi(source);
}
function translateDirectText(element,lang){
  const nodes=[...element.childNodes].filter(item=>item.nodeType===3&&item.nodeValue.trim());if(!nodes.length)return;
  let sources;try{sources=JSON.parse(element.dataset.enDirectTexts||'null')}catch{sources=null}
  if(!Array.isArray(sources)||sources.length!==nodes.length){sources=nodes.map(node=>node.nodeValue.trim());element.dataset.enDirectTexts=JSON.stringify(sources)}
  nodes.forEach((node,index)=>{const current=node.nodeValue.trim();node.nodeValue=node.nodeValue.replace(current,translateUiSource(sources[index],lang))});
}
const PAGE_LABELS_TR={
  overview:'Genel Bakış',servers:'Sunucu Seçici',setup:'Şablon Kurulumu',channels:'Kanallar',roles:'Roller ve Yetkiler',
  challenge:'Meydan Okumalar',leaderboard:'Sıralama / Profiller',availability:'Uygunluk & LOA',operations:'Eğitim / Personel',
  applications:'Başvurular',tickets:'Ticket ve Destek',moderation:'Moderasyon / Güvenlik',blacklist:'Kara Liste / İtiraz / Bail',
  roster:'Roster / Kadro / İlişkiler',events:'Etkinlikler / Günün Sorusu',voice:'Ses / Join-to-Create',xp:'XP / Seviye',
  guides:'Rehberler ve Embedler',branding:'Marka / Tema / Dil',logs:'Loglar / Yedek / Geri Yükleme',advanced:'Gelişmiş JSON'
};
function applyPageButtonLabels(lang){
  document.querySelectorAll('[data-page-button]').forEach(button=>{
    if(!button.dataset.enText)button.dataset.enText=button.textContent.trim();
    const source=button.dataset.enText,label=PAGE_LABELS_TR[button.dataset.pageButton],prefix=/^[^\\p{L}\\p{N}]*/u.exec(source)?.[0]||'';
    button.textContent=lang==='tr'&&label?prefix+label:source;
  });
}
Object.assign(UI_TR,{'Separator style':'Ayırıcı stili','Diamond':'Elmas','Line':'Çizgi','Minimal':'Minimal','Comfortable spacing gives cards more room. Compact spacing keeps long lists easier to scan.':'Rahat aralık kartlara daha fazla alan verir. Sıkı aralık uzun listeleri taramayı kolaylaştırır.','Choose the separator used in leaderboard and guide cards.':'Sıralama ve rehber kartlarında kullanılan ayırıcıyı seçin.','Choose the signature shown below Discord messages. Compact works well for busy boards.':'Discord mesajlarının altında görünen imzayı seçin. Sıkı görünüm yoğun panolara uygundur.'});
Object.assign(UI_TR,{'Engagement':'Etkileşim','Text':'Metin','Advanced':'Gelişmiş','Duplicate':'Çoğalt','Delete':'Sil','Helper (public staff entry)':'Topluluk yardımcısı','Advanced JSON mode':'Geliştirici araçları','Acceptance question':'Kabul sorusu','Business':'İş ortaklıkları','Clan / TSBTR templates':'Klan / TSBTR şablonları'});
Object.assign(UI_TR,{'Application name':'Uygulama adı','Bot username':'Bot kullanıcı adı','Guild nicknames':'Sunucu takma adları','Avatar':'Avatar','Banner':'Kapak görseli'});
Object.assign(UI_TR,{'Verified Discord identity':'Doğrulanmış Discord kimliği','FIMA Bot profile':'FIMA Bot profili','Owner confirmation':'Owner onayı','Apply supported profile fields':'Desteklenen profil alanlarını uygula','Unavailable':'Kullanılamıyor','FIMA Bot profile field status':'FIMA Bot profil alanlarının durumu','Status is read-only until the exact confirmation is entered.':'Tam onay metni girilene kadar durum salt okunurdur.'});
function applyUiLanguage(language){
  const lang=language==='en'?'en':'tr';document.documentElement.lang=lang;try{localStorage.setItem('paradiseUiLanguage',lang)}catch{}
  document.querySelectorAll('h1,h2,h3,button,nav small,.help,.muted,.hero-brandline div span,.nav-brand div span,.mobile-page-picker>span,.page-kicker,.nav-group summary,#applicationAdvanced summary,[data-page="applications"] .notice,.badge,.directory-keyboard,#mobileNavToggle small,.mapping-status,.chips .chip,.fima-profile-state span,#serverDirectoryCount,#accessActions a').forEach(element=>{
    if(element.childElementCount){translateDirectText(element,lang);return}
    if(!element.dataset.enText)element.dataset.enText=element.textContent.trim();
    element.textContent=translateUiSource(element.dataset.enText,lang);
  });
  applyPageButtonLabels(lang);
  localizeApplicationEditor();
  document.querySelectorAll('.metric span[data-en-text]').forEach(element=>{
    element.textContent=translateUiSource(element.dataset.enText,lang);
  });
  document.querySelectorAll('label,option,.overview-health,.nav-foot,.panel p,.panel strong,.panel .field>span').forEach(element=>{if(element.id==='selectedGuildName'||(!element.childElementCount&&element.dataset.enText))return;translateDirectText(element,lang)});
  document.querySelectorAll('input[placeholder],textarea[placeholder]').forEach(element=>{
    if(!element.dataset.enPlaceholder)element.dataset.enPlaceholder=element.placeholder;
    element.placeholder=lang==='tr'?(UI_TR[element.dataset.enPlaceholder]||element.dataset.enPlaceholder):element.dataset.enPlaceholder;
  });
  document.querySelectorAll('[title]').forEach(element=>{
    if(!element.dataset.enTitle)element.dataset.enTitle=element.title;
    element.title=lang==='tr'?(UI_TR[element.dataset.enTitle]||element.dataset.enTitle):element.dataset.enTitle;
  });
  document.querySelectorAll('[aria-label]').forEach(element=>{
    if(!element.dataset.enAria)element.dataset.enAria=element.getAttribute('aria-label')||'';
    element.setAttribute('aria-label',lang==='tr'?(UI_TR[element.dataset.enAria]||element.dataset.enAria):element.dataset.enAria);
  });
  if(byId('saveState')){
    const dirty=byId('saveState').style.color!=='var(--good)';
    byId('saveState').textContent=lang==='tr'?(dirty?'Kaydedilmemiş değişiklikler':'Tüm ayarlar yüklendi'):(dirty?'Unsaved changes':'All settings loaded');
  }
  if(currentPayload){renderServerDirectory(currentPayload.servers||[],byId('serverDirectorySearch')?.value||'');renderServerWorkspaces(currentPayload.servers||[],byId('serverSearch')?.value||'')}
  document.querySelectorAll('#toast[data-en-text],.mapping-status strong[data-en-text],.fima-profile-state strong[data-en-text],#fimaBotProfileBadge[data-en-text],#fimaBotProfileActionStatus[data-en-text]').forEach(el=>el.textContent=translateUiSource(el.dataset.enText,lang));
  syncMobilePageLabels();
  updateGuideResultCount();
}
function show(message,ok=true){message=String(message);if(/^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/.test(message))message='The operation could not be completed. Refresh your session and try again.';const el=byId('toast');el.className='toast '+(ok?'ok':'error');el.dataset.enText=message;el.textContent=tUi(message);setTimeout(()=>el.className='toast',4500)}
function hexToRgb(value){const match=/^#([0-9a-f]{6})$/i.exec(value);if(!match)return'139,92,246';const n=parseInt(match[1],16);return[(n>>16)&255,(n>>8)&255,n&255].join(',')}
function applyBrand(value){document.documentElement.style.setProperty('--brand',value);document.documentElement.style.setProperty('--brand-rgb',hexToRgb(value));document.documentElement.style.setProperty('--brand-soft','rgba('+hexToRgb(value)+',.18)')}
const THEMES={paradise:{bg:'#050b0d',panel:'#0d1719',line:'#224146',accent:'#19D3C5'},charcoal:{bg:'#0b1011',panel:'#151d1f',line:'#354548',accent:'#7FD9D2'},midnight:{bg:'#051016',panel:'#0b1b24',line:'#1d4654',accent:'#35C8E0'}};
function applyTheme(name,accent){const theme=THEMES[name]||THEMES.paradise;currentTheme=name;for(const [key,value] of Object.entries(theme)){if(key!=='accent')document.documentElement.style.setProperty('--'+key,value)}applyBrand(accent||theme.accent);document.querySelectorAll('[data-theme]').forEach(button=>button.classList.toggle('is-active',button.dataset.theme===name))}
function setLoading(active){byId('loadingState').hidden=!active}
function markDirty(){byId('saveState').textContent=byId('uiLanguage')?.value==='tr'?'Kaydedilmemiş değişiklikler':'Unsaved changes';byId('saveState').className='dirty';byId('saveState').style.color='var(--warn)'}
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
function safeDiscordDeveloperPortalUrl(value){
  const url=String(value||'').trim();
  return /^https:\\/\\/discord\\.com\\/developers\\/applications\\/\\d{17,20}\\/information$/.test(url)?url:null;
}
function setFimaBotProfileState(id,ok,readyText,pendingText){
  const element=byId(id);if(!element)return;
  element.classList.toggle('good',ok===true);element.classList.toggle('bad',ok===false);
  const output=element.querySelector('strong');if(output){output.dataset.enText=ok===true?readyText:ok===false?pendingText:'Unavailable';output.textContent=tUi(output.dataset.enText);}
}
function updateFimaBotProfileApplyState(){
  const input=byId('fimaBotProfileConfirmation'),button=byId('applyFimaBotProfile');if(!input||!button)return;
  button.disabled=!(fimaBotProfileCanApply&&input.value.trim()===FIMA_BOT_PROFILE_CONFIRMATION);
}
function renderFimaBotProfileStatus(profile){
  const available=profile?.status==='ready';
  const badge=byId('fimaBotProfileBadge');
  const applicationMatches=available?profile.applicationNameMatches===true:null;
  const usernameMatches=available?profile.usernameMatches===true:null;
  const nicknamesMatch=available?profile.guildNicknameMismatches===0:null;
  const avatarReady=available?profile.avatar?.ready===true:null;
  const bannerReady=available?profile.banner?.ready===true:null;
  setFimaBotProfileState('fimaBotApplicationState',applicationMatches,'FIMA Bot','Developer Portal update required');
  setFimaBotProfileState('fimaBotUsernameState',usernameMatches,'fima.bot','Supported sync required');
  setFimaBotProfileState('fimaBotNicknameState',nicknamesMatch,'FIMA Bot on every scoped guild',String(profile?.guildNicknameMismatches||0)+' update required');
  setFimaBotProfileState('fimaBotAvatarState',avatarReady,profile?.avatarNeedsUpdate?'Verified asset ready to apply':'Verified asset ready','Verified asset unavailable');
  setFimaBotProfileState('fimaBotBannerState',bannerReady,profile?.bannerNeedsUpdate?'Verified asset ready to apply':'Verified asset ready','Verified asset unavailable');
  const exactScope=available&&profile.exactApplication===true&&profile.exactGuildScope===true&&profile.assetsReady===true;
  fimaBotProfileCanApply=exactScope&&profile.applyEnabled===true;
  setUiText('fimaBotProfileBadge',!available?'Unavailable':exactScope?(fimaBotProfileCanApply?'Verified scope':'Sync disabled'):'Scope blocked');
  badge.className='fima-profile-badge '+(!available||!exactScope?'bad':fimaBotProfileCanApply?'good':'');
  const remediation=byId('fimaBotApplicationRemediation'),link=byId('fimaBotDeveloperPortalLink');
  const portalUrl=safeDiscordDeveloperPortalUrl(profile?.applicationNameRemediation?.developerPortalUrl);
  remediation.hidden=!(available&&profile.applicationNameRemediation?.required===true);
  link.hidden=!portalUrl;link.removeAttribute('href');if(portalUrl)link.href=portalUrl;
  setUiText('fimaBotProfileActionStatus',!available
    ? 'Discord profile status is unavailable; no change can be submitted.'
    : !exactScope
      ? 'Application, guild scope or verified profile assets did not pass the exact-scope check.'
      : !profile.applyEnabled
        ? 'Profile synchronization is disabled in the trusted backend runtime.'
        : 'Enter APPLY FIMA BOT PROFILE exactly. Application-name remediation remains a separate Developer Portal action.');
  updateFimaBotProfileApplyState();
}
async function loadFimaBotProfileStatus(){
  try{
    const response=await fetch(API_BASE+'/api/fima-bot/actions/fima-bot-profile',{credentials:'include',headers:{accept:'application/json'},cache:'no-store'});
    const result=await response.json().catch(()=>({error:'invalid_response'}));
    if(!response.ok)throw new Error(result.error||'profile_status_failed');
    renderFimaBotProfileStatus(result.profile||{});
  }catch{
    renderFimaBotProfileStatus({status:'unavailable'});
  }
}
async function applyFimaBotProfile(){
  const confirmation=byId('fimaBotProfileConfirmation').value.trim();
  if(!fimaBotProfileCanApply||confirmation!==FIMA_BOT_PROFILE_CONFIRMATION)return updateFimaBotProfileApplyState();
  const button=byId('applyFimaBotProfile'),original=button.textContent;button.disabled=true;button.textContent=tUi('Applying verified fields…');
  try{
    const{response,result}=await mutate('/api/fima-bot/actions/fima-bot-profile',{apply:true,confirmation});
    if(!response.ok){show(result.error||'FIMA Bot profile sync failed',false);return}
    byId('fimaBotProfileConfirmation').value='';
    const changes=Array.isArray(result.changes)?result.changes.length:0;
    show(changes?'Applied '+changes+' supported FIMA Bot profile field(s).':'Supported FIMA Bot profile fields already match.');
    await loadFimaBotProfileStatus();
  }catch{show('FIMA Bot profile sync failed safely.',false)}
  finally{button.textContent=original;updateFimaBotProfileApplyState()}
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
function setMobileNavOpen(open){
  const nav=byId('pageNav'),toggle=byId('mobileNavToggle'),backdrop=byId('mobileNavBackdrop');
  if(!nav||!toggle||!backdrop)return;
  const shouldOpen=Boolean(open)&&matchMedia('(max-width: 980px)').matches;
  nav.classList.toggle('is-open',shouldOpen);
  toggle.setAttribute('aria-expanded',shouldOpen?'true':'false');
  backdrop.hidden=!shouldOpen;
  document.body.style.overflow=shouldOpen?'hidden':'';
  if(shouldOpen)nav.querySelector('button.active')?.focus({preventScroll:true});
  else if(open===false&&document.activeElement&&nav.contains(document.activeElement))toggle.focus({preventScroll:true});
}
function initializePages(){
  const mobileSelect=byId('mobilePageSelect');
  if(mobileSelect){
    syncMobilePageLabels();
    mobileSelect.onchange=event=>showPage(event.target.value);
  }
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
  document.querySelectorAll('#console section.panel').forEach(section=>{if(section.dataset.page||section.id==='serverDirectory'||section.id==='workspaceHero'||section.id==='loadingState')return;const title=section.querySelector('h2')?.textContent||'';const match=routes.find(([prefix])=>title.startsWith(prefix));section.dataset.page=match?match[1]:'overview'});
  document.querySelectorAll('#console aside .panel').forEach(panel=>{panel.parentElement?.classList.add('runtime-panels')});
  const route=readDashboardRoute();currentPage=route.page;selectedGuildId=route.guildId;workspaceEntered=Boolean(route.guildId);
  showPage(currentPage,false);
}
function syncMobilePageLabels(){
  const mobileSelect=byId('mobilePageSelect');if(!mobileSelect)return;
  const selected=mobileSelect.value||location.hash.replace('#','')||'overview';
  const buttons=[...document.querySelectorAll('[data-page-button]')];
  mobileSelect.innerHTML=buttons.map(button=>'<option value="'+escapeHtml(button.dataset.pageButton)+'">'+escapeHtml(button.textContent.trim())+'</option>').join('');
  mobileSelect.value=buttons.some(button=>button.dataset.pageButton===selected)?selected:'overview';
  const activeButton=buttons.find(button=>button.classList.contains('active'))||buttons.find(button=>button.dataset.pageButton===mobileSelect.value),mobilePageLabel=byId('mobilePageLabel');
  if(activeButton&&mobilePageLabel)mobilePageLabel.textContent=activeButton.textContent.trim();
}
function readDashboardRoute(){
  const raw=location.hash.replace(/^#/,'');
  if(!raw)return{guildId:'',page:'overview'};
  if(!raw.includes('='))return{guildId:'',page:raw};
  const params=new URLSearchParams(raw);
  return{guildId:/^\d{16,22}$/.test(params.get('guild')||'')?params.get('guild'):'',page:params.get('page')||'overview'};
}
function writeDashboardRoute(){
  const hash=workspaceEntered&&selectedGuildId?'guild='+encodeURIComponent(selectedGuildId)+'&page='+encodeURIComponent(currentPage):'';
  history.replaceState(null,'',hash?'#'+hash:location.pathname+location.search);
}
function syncWorkspaceVisibility(){
  byId('serverDirectory').hidden=workspaceEntered;
  byId('workspaceHero').hidden=!workspaceEntered;
  byId('workspaceShell').hidden=!workspaceEntered;
}
async function enterWorkspace(guildId,page='overview'){
  const managed=currentPayload?.servers||[];
  if(!managed.some(server=>server.id===guildId))return leaveWorkspace();
  if(selectedGuildId!==guildId)clearProductionPlan('Server changed. Create a new production preflight for this target.');
  selectedGuildId=guildId;workspaceEntered=true;currentPage=page;
  byId('serverSelect').value=guildId;syncWorkspaceVisibility();writeDashboardRoute();
  await load();
}
function leaveWorkspace(){
  clearProductionPlan('No production plan is active in this browser session.');
  workspaceEntered=false;selectedGuildId='';currentPage='overview';
  syncWorkspaceVisibility();writeDashboardRoute();
  renderServerDirectory(currentPayload?.servers||[],byId('serverDirectorySearch')?.value||'');
}
function showPage(page,updateRoute=true){
  const known=[...document.querySelectorAll('[data-page-button]')].some(button=>button.dataset.pageButton===page);if(!known)page='overview';
  currentPage=page;
  document.querySelectorAll('[data-page]').forEach(section=>section.hidden=section.dataset.page!==page);
  document.querySelectorAll('[data-page-button]').forEach(button=>{const active=button.dataset.pageButton===page;button.classList.toggle('active',active);if(active)button.closest('.nav-group')?.setAttribute('open','')});
  const mobileSelect=byId('mobilePageSelect');if(mobileSelect)mobileSelect.value=page;
  const activeButton=[...document.querySelectorAll('[data-page-button]')].find(button=>button.dataset.pageButton===page),mobilePageLabel=byId('mobilePageLabel');if(activeButton&&mobilePageLabel)mobilePageLabel.textContent=activeButton.textContent.trim();
  if(updateRoute)writeDashboardRoute();
  window.dispatchEvent(new CustomEvent('paradise:page-changed',{detail:{page}}));
  window.scrollTo({top:0,behavior:'instant'});
}
function updateGuideResultCount(){const cards=[...document.querySelectorAll('#guideLibrary .guide-card')],visible=cards.filter(card=>!card.hidden).length,count=byId('guideResultCount');if(!count)return;const lang=byId('uiLanguage')?.value==='en'?'en':'tr';count.textContent=lang==='tr'?visible+'/'+cards.length+' akış gösteriliyor':visible+'/'+cards.length+' workflows shown'}
function filterGuides(){const query=byId('guideSearch')?.value.trim().toLocaleLowerCase()||'';let visible=0;document.querySelectorAll('#guideLibrary .guide-card').forEach(card=>{const match=!query||card.dataset.guideSearch.toLocaleLowerCase().includes(query)||card.textContent.toLocaleLowerCase().includes(query);card.hidden=!match;if(match)visible+=1});byId('guideEmpty').hidden=visible!==0;updateGuideResultCount()}
const guideSearch=byId('guideSearch');if(guideSearch)guideSearch.oninput=filterGuides;
function updateHeroToggleLabel(){
  const button=byId('heroToggle');const hero=document.querySelector('.hero');if(!button||!hero)return;
  const collapsed=hero.classList.contains('is-collapsed');const lang=byId('uiLanguage')?.value==='en'?'en':'tr';
  button.textContent=collapsed?(lang==='tr'?'Aç ▾':'Expand ▾'):(lang==='tr'?'Daralt ▴':'Collapse ▴');
  button.setAttribute('aria-expanded',collapsed?'false':'true');
}
function renderAccess(status){
  const gate=byId('accessGate'),actions=byId('accessActions');
  actions.innerHTML='';
  if(status.ownerAuthorized){
    gate.hidden=true;byId('console').hidden=false;return true;
  }
  gate.hidden=false;byId('console').hidden=true;
  if(status.reasonCode==='login_required'){
    setUiText('accessTitle','FIMA login required');
    setUiText('accessMessage','Sign in with the FIMA account that owns the FIMA console. You will return here after login.');
    actions.innerHTML='<a class="button" href="/login?next=%2Ffima-bot%2Fowner">'+tUi('Sign in to FIMA')+'</a>';
  }else if(status.reasonCode==='discord_link_required'){
    setUiText('accessTitle','Discord account required');
    setUiText('accessMessage','Your FIMA account is signed in, but Discord is not linked. Link the owner Discord account to continue.');
    actions.innerHTML='<a class="button" href="'+API_BASE+'/auth/discord/start?returnTo=%2Ffima-bot%2Fowner">'+tUi('Link Discord account')+'</a><a class="button secondary" href="/dashboard/connected-accounts">'+tUi('Account settings')+'</a>';
  }else if(status.reasonCode==='not_owner'){
    setUiText('accessTitle','FIMA access is restricted');
    setUiText('accessMessage','This signed-in account is not authorized to open the FIMA owner console.');
    actions.innerHTML='<a class="button secondary" href="/dashboard/connected-accounts">'+tUi('Review linked accounts')+'</a>';
  }else{
    setUiText('accessTitle','Session check unavailable');
    setUiText('accessMessage','The secure account check could not be completed. Refresh or try again shortly.');
    actions.innerHTML='<button onclick="start()">'+tUi('Try again')+'</button>';
  }
  applyUiLanguage(byId('uiLanguage')?.value||'tr');
  return false;
}
async function sessionStatus(){
  const response=await fetch(API_BASE+'/api/fima-bot/session-status',{credentials:'include',headers:{accept:'application/json'},cache:'no-store'});
  if(!response.ok&&response.status>=500)throw new Error('session_check_failed');
  return response.json();
}
function guildInitial(name){return String(name||'?').trim().charAt(0).toLocaleUpperCase()||'?'}
function bindListboxKeyboard(list,selector){
  if(!list)return;
  list.onkeydown=event=>{
    if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
    const options=[...list.querySelectorAll(selector)];if(!options.length)return;
    event.preventDefault();
    const current=Math.max(0,options.indexOf(document.activeElement));
    const next=event.key==='Home'?0:event.key==='End'?options.length-1:event.key==='ArrowDown'?(current+1)%options.length:(current-1+options.length)%options.length;
    options[next].focus();
  };
}
function renderServerDirectoryState(kind,message){
  const list=byId('serverDirectoryGrid'),count=byId('serverDirectoryCount');if(!list)return;
  list.setAttribute('aria-busy',kind==='loading'?'true':'false');
  if(count)count.textContent=tUi(kind==='loading'?'Loading servers':kind==='error'?'Connection unavailable':'No managed servers');
  const retry=kind==='error'?'<button type="button" id="retryServerDirectory">'+tUi('Try again')+'</button>':'';
  list.innerHTML='<div class="server-state" role="'+(kind==='error'?'alert':'status')+'">'+(kind==='loading'?'<span class="server-state-spinner" aria-hidden="true"></span>':'')+'<strong>'+tUi(kind==='error'?'Unable to load servers':kind==='loading'?'Preparing servers':'No servers yet')+'</strong><span>'+escapeHtml(tUi(message))+'</span>'+retry+'</div>';
  if(kind==='error'&&byId('retryServerDirectory'))byId('retryServerDirectory').onclick=load;
}
function renderServerDirectory(servers,query=''){
  const managed=Array.isArray(servers)?servers:[],needle=String(query||'').trim().toLocaleLowerCase();
  const visible=managed.filter(server=>String(server.name||'').toLocaleLowerCase().includes(needle)||String(server.id||'').slice(-6).includes(needle));
  const list=byId('serverDirectoryGrid');if(!list)return;
  list.setAttribute('aria-busy','false');
  const count=byId('serverDirectoryCount');if(count)count.textContent=visible.length+' / '+managed.length+' '+tUi('managed servers');
  list.innerHTML=visible.map((server,index)=>'<button class="server-card" type="button" role="option" tabindex="'+(index===0?'0':'-1')+'" aria-label="'+escapeHtml(server.name)+' · '+tUi('Manage server')+'" data-directory-guild="'+escapeHtml(server.id)+'"><span class="server-card-avatar" aria-hidden="true">'+escapeHtml(guildInitial(server.name))+'</span><span class="server-card-copy"><strong>'+escapeHtml(server.name)+'</strong><small>'+tUi('FIMA Bot connected')+' · …'+escapeHtml(String(server.id).slice(-6))+'</small><em>'+tUi('Management access ready')+'</em></span><span class="server-card-open" aria-hidden="true">'+tUi('Manage')+' →</span></button>').join('')||'<div class="server-state" role="status"><strong>'+tUi(managed.length?'No matching servers':'No connected servers yet')+'</strong><span>'+tUi(managed.length?'Try a different name or the last 6 digits of the server ID.':'Managed servers appear here when FIMA Bot is added.')+'</span></div>';
  list.querySelectorAll('[data-directory-guild]').forEach(button=>button.onclick=()=>enterWorkspace(button.dataset.directoryGuild));
  bindListboxKeyboard(list,'[data-directory-guild]');
}
function renderServerWorkspaces(servers,query=''){
  const managed=Array.isArray(servers)?servers:[],needle=String(query||'').trim().toLocaleLowerCase();
  const visible=managed.filter(server=>String(server.name||'').toLocaleLowerCase().includes(needle)||String(server.id||'').slice(-6).includes(needle));
  const list=byId('serverWorkspaceList');if(!list)return;
  list.innerHTML=visible.map(server=>'<button class="workspace-option" type="button" role="option" data-managed-guild="'+escapeHtml(server.id)+'" aria-selected="'+(server.id===selectedGuildId?'true':'false')+'" aria-current="'+(server.id===selectedGuildId?'true':'false')+'"><span aria-hidden="true">'+escapeHtml(guildInitial(server.name))+'</span><span>'+escapeHtml(server.name)+'<small>…'+escapeHtml(String(server.id).slice(-6))+'</small></span></button>').join('')||'<div class="workspace-empty" role="status">'+tUi(managed.length?'No matching managed server':'No managed server online')+'</div>';
  list.querySelectorAll('[data-managed-guild]').forEach(button=>button.onclick=()=>enterWorkspace(button.dataset.managedGuild,currentPage));
}
async function load(){
  setLoading(true);
  if(!workspaceEntered)renderServerDirectoryState('loading','Checking FIMA Bot connections securely.');
  const requestedGuildId=workspaceEntered?selectedGuildId:'';
  const query=selectedGuildId?'?guildId='+encodeURIComponent(selectedGuildId):'';
  const r=await fetch(API_BASE+'/api/fima-bot/config'+query,{credentials:'include',headers:{accept:'application/json'},cache:'no-store'});const j=await r.json().catch(()=>({error:'invalid_response'}));
  if(!r.ok){setLoading(false);if(!workspaceEntered)renderServerDirectoryState('error','Check your connection and try again.');show(j.error||'Failed to load',false);return}
  currentPayload=j;const c=j.config||{},rt=j.runtime||{},ch=c.challenge||{},loa=c.loa||{},ver=c.verification||{},act=c.activity||{},am=c.automod||{},rel=c.relationSettings||{},ops=c.operations||{},roster=c.roster||{},blacklist=c.blacklist||{},staff=c.staffOperations||{},apps=c.applicationSettings||{},moderation=c.moderationSettings||{},events=c.eventSettings||{},voice=c.voiceSettings||{},xp=c.xpSettings||{};
  const managedServers=j.servers||[];
  if(workspaceEntered&&!managedServers.some(server=>server.id===requestedGuildId)){leaveWorkspace()}else if(workspaceEntered){selectedGuildId=requestedGuildId}
  byId('serverSelect').innerHTML=managedServers.map(server=>'<option value="'+server.id+'" '+(server.id===selectedGuildId?'selected':'')+'>'+escapeHtml(server.name)+' · …'+String(server.id).slice(-6)+'</option>').join('')||'<option value="">No managed server online</option>';
  renderServerDirectory(managedServers,byId('serverDirectorySearch')?.value||'');
  renderServerWorkspaces(managedServers,byId('serverSearch')?.value||'');
  syncWorkspaceVisibility();showPage(currentPage,false);writeDashboardRoute();
  const credential=rt.credential||{};const credentialBlocked=credential.configured===false;
  const selectedServer=managedServers.find(server=>server.id===selectedGuildId);
  byId('selectedGuildAvatar').textContent=guildInitial(selectedServer?.name);
  byId('selectedGuildName').textContent=selectedServer?.name||'No managed server';
  byId('selectedGuildMaskedId').textContent=selectedServer?'ID …'+String(selectedServer.id).slice(-6):'Bot connection unavailable';
  byId('selectedGuildStatus').classList.toggle('online',Boolean(selectedServer));
  const guildLabel=rt.guild?rt.guild.name+' · …'+String(rt.guild.id||'').slice(-6):'unavailable';
  setUiText('guildChip','Guild: '+guildLabel);byId('guildChip').className='chip '+(rt.status==='ready'?'good':'bad');
  const identity=rt.botIdentity||{};setUiText('botChip','Bot: '+(rt.status==='ready'?(identity.nicknameMatches?'FIMA online':'name check needed'):'unavailable'));byId('botChip').className='chip '+(rt.status==='ready'&&identity.nicknameMatches?'good':'bad');
  setUiText('syncChip',credentialBlocked?'Discord: owner vault required':'Commands: '+((rt.commandSync&&rt.commandSync.count)||0)+' · '+((rt.commandSync&&rt.commandSync.lastError)||'synced'));byId('syncChip').className='chip '+(credentialBlocked||rt.commandSync&&rt.commandSync.lastError?'bad':'good');
  setUiText('templateChip','Template: '+(c.activeSetupMode||'not selected'));
  byId('template').value=c.activeSetupMode||'clan';byId('setupTemplate').value=byId('template').value;byId('mainer').value=c.mainerCode||'';byId('quotas').value=JSON.stringify(c.weeklyQuotas||{},null,2);byId('channels').value=JSON.stringify(c.commandChannels||{},null,2);
  document.querySelectorAll('[data-template]').forEach(card=>card.classList.toggle('is-active',card.dataset.template===byId('template').value));
  document.querySelectorAll('[data-setup-template]').forEach(card=>card.classList.toggle('is-active',card.dataset.setupTemplate===byId('setupTemplate').value));
  byId('autoChecks').checked=c.autoActivityChecks===true;byId('autoRemoval').checked=c.autoActivityRoleRemoval===true;
  const theme=["paradise","charcoal","midnight"].includes(c.dashboardTheme)?c.dashboardTheme:'paradise';const storedBrand=/^#[0-9a-f]{6}$/i.test(c.brandColor||'')?c.brandColor.toUpperCase():THEMES[theme].accent;const brand=storedBrand==='#8B5CF6'?'#19D3C5':storedBrand;byId('brandPicker').value=brand.toLowerCase();byId('brandHex').value=brand;applyTheme(theme,brand);
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
  byId('applicationsEnabled').checked=apps.enabled!==false;byId('applicationCooldownDays').value=apps.cooldownDays??7;byId('applicationAutoGrant').checked=apps.autoGrantRole!==false;byId('applicationBlockBlacklisted').checked=apps.blockBlacklisted!==false;byId('applicationPanelTitle').value=apps.panelTitle||'';byId('applicationPanelDescription').value=apps.panelDescription||'';byId('applicationPanelButtonLabel').value=apps.panelButtonLabel||'';byId('applicationQuestions').value=JSON.stringify(apps.extraQuestions||{},null,2);byId('applicationEvidenceRequirements').value=JSON.stringify(apps.evidenceRequirements||{},null,2);selectedApplicationType=APPLICATION_EDITOR_TYPE_SET.has(byId('applicationQuestionType').value)?byId('applicationQuestionType').value:'helper';try{loadApplicationJsonState();renderApplicationQuestions()}catch(error){showApplicationJsonError(error)}
  byId('kickBanApprovalRequired').checked=moderation.kickBanApprovalRequired!==false;byId('quarantineEnabled').checked=moderation.quarantineEnabled!==false;byId('raidModeDefault').checked=moderation.raidModeDefault===true;byId('suspiciousAccountDays').value=moderation.suspiciousAccountDays??7;byId('defaultSpamTimeout').value=moderation.defaultSpamTimeoutMinutes??60;byId('violationThreshold').value=moderation.violationThreshold??3;
  byId('dailyQuestionEnabled').checked=events.dailyQuestionEnabled!==false;byId('dailyQuestionHour').value=events.dailyQuestionHour??13;byId('dailyQuestionReward').value=events.dailyQuestionReward||'25 Robux';byId('dailyQuestionWinners').value=events.dailyQuestionWinners??1;byId('eventImageRequired').checked=events.eventImageRequired!==false;byId('giveawayAbuseProtection').checked=events.giveawayAbuseProtection!==false;
  byId('voiceEnabled').checked=voice.enabled!==false;byId('voiceDefaultLimit').value=voice.defaultLimit??0;byId('voiceAutoDelete').checked=voice.autoDelete!==false;byId('voiceSafeNames').checked=voice.safeNames!==false;byId('voiceOwnerTransfer').checked=voice.allowTransfer!==false;byId('voiceLogActions').checked=voice.logActions!==false;
  byId('xpEnabled').checked=xp.enabled!==false;byId('chatXp').value=xp.chatXp??10;byId('chatXpCooldown').value=xp.chatCooldownSeconds??60;byId('voiceXp').value=xp.voiceXpPerInterval??15;byId('levelUpDeleteSeconds').value=xp.levelUpDeleteSeconds??60;byId('weeklyLeaderboard').checked=xp.weeklyLeaderboard!==false;byId('monthlyLeaderboard').checked=xp.monthlyLeaderboard!==false;byId('xpExcludedChannels').value=(xp.excludedChannels||[]).join('\\n');
  buildMappings(rt,c.channelMappings||{});buildRoleMappings(rt,c.roleMappings||{});
  const runtimeView={
    status:rt.status,
    credential:credential,
    capturedAt:rt.capturedAt||null,
    guild:rt.guild?{name:rt.guild.name,id:'…'+String(rt.guild.id||'').slice(-6),memberCount:rt.guild.memberCount,botRolePosition:rt.guild.botRolePosition}:null,
    botIdentity:rt.botIdentity||null,
    commandSync:rt.commandSync||null,
    inventory:{categories:(rt.categories||[]).length,channels:(rt.channels||[]).length,roles:(rt.roles||[]).length,autoModRules:(rt.autoModRules||[]).length,webhooks:(rt.webhooks||[]).length}
  };
  const lease=j.mutationLock||{};
  const mutationView={
    locked:lease.locked===true,
    acquiring:lease.acquiring===true||lease.phase==='acquiring',
    operation:lease.operation||null,
    phase:lease.phase||null,
    correlationId:lease.correlationId||null,
    acquiredAt:lease.acquiredAt||null,
    heartbeatAt:lease.heartbeatAt||null,
    waiting:Number(lease.waiting||0),
    recoverable:lease.recoverable===true,
    recoveryReason:lease.recoveryReason||null
  };
  byId('runtimeStatus').textContent=JSON.stringify(runtimeView,null,2);byId('mutationLockStatus').textContent=JSON.stringify(mutationView,null,2);byId('summaryStatus').textContent=JSON.stringify(j.summary,null,2);
  byId('relationSummary').textContent='Current Allies: '+Number(j.summary&&j.summary.allies||0)+'\\nEnemy Clans: '+Number(j.summary&&j.summary.enemies||0)+'\\nManage entries in Discord with /relation add, /relation edit and /relation remove.';
  const metrics=[['Channels',(rt.channels||[]).length],['Roles',(rt.roles||[]).length],['Profiles',j.summary?.verifiedProfiles||0],['Open challenges',j.summary?.pendingChallenges||0],['Active sessions',j.summary?.activeSessions||0],['Active LOA',j.summary?.activeLoa||0]];
  byId('metricGrid').innerHTML=metrics.map(([label,value])=>'<div class="metric"><b>'+escapeHtml(value)+'</b><span data-en-text="'+escapeHtml(label)+'">'+escapeHtml(tUi(label))+'</span></div>').join('');
  await loadFimaBotProfileStatus();
  byId('saveState').textContent='All settings loaded';byId('saveState').className='dirty';byId('saveState').style.color='var(--good)';
  window.dispatchEvent(new CustomEvent('paradise:config-loaded',{detail:{guildId:selectedGuildId,payload:j}}));
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
  if(kind==='applications'){updateApplicationRowsFromEditor();return{enabled:byId('applicationsEnabled').checked,cooldownDays:Number(byId('applicationCooldownDays').value)||0,autoGrantRole:byId('applicationAutoGrant').checked,blockBlacklisted:byId('applicationBlockBlacklisted').checked,panelTitle:byId('applicationPanelTitle').value.trim(),panelDescription:byId('applicationPanelDescription').value.trim(),panelButtonLabel:byId('applicationPanelButtonLabel').value.trim(),extraQuestions:JSON.parse(byId('applicationQuestions').value||'{}'),evidenceRequirements:JSON.parse(byId('applicationEvidenceRequirements').value||'{}')}};
  if(kind==='moderation')return{kickBanApprovalRequired:byId('kickBanApprovalRequired').checked,quarantineEnabled:byId('quarantineEnabled').checked,raidModeDefault:byId('raidModeDefault').checked,suspiciousAccountDays:Number(byId('suspiciousAccountDays').value)||0,defaultSpamTimeoutMinutes:number('defaultSpamTimeout',60),violationThreshold:number('violationThreshold',3)};
  if(kind==='events')return{dailyQuestionEnabled:byId('dailyQuestionEnabled').checked,dailyQuestionHour:Number(byId('dailyQuestionHour').value)||0,dailyQuestionReward:byId('dailyQuestionReward').value.trim(),dailyQuestionWinners:number('dailyQuestionWinners',1),eventImageRequired:byId('eventImageRequired').checked,giveawayAbuseProtection:byId('giveawayAbuseProtection').checked};
  if(kind==='voice')return{enabled:byId('voiceEnabled').checked,defaultLimit:Number(byId('voiceDefaultLimit').value)||0,autoDelete:byId('voiceAutoDelete').checked,safeNames:byId('voiceSafeNames').checked,allowTransfer:byId('voiceOwnerTransfer').checked,logActions:byId('voiceLogActions').checked};
  if(kind==='xp')return{enabled:byId('xpEnabled').checked,chatXp:number('chatXp',10),chatCooldownSeconds:number('chatXpCooldown',60),voiceXpPerInterval:number('voiceXp',15),levelUpDeleteSeconds:number('levelUpDeleteSeconds',60),weeklyLeaderboard:byId('weeklyLeaderboard').checked,monthlyLeaderboard:byId('monthlyLeaderboard').checked,excludedChannels:byId('xpExcludedChannels').value.split(/\\r?\\n/).map(value=>value.trim()).filter(value=>/^\\d{16,22}$/.test(value))};
}
async function save(kind){
  let value;try{value=valueFor(kind)}catch{show('Invalid JSON',false);return}
  if(!selectedGuildId)return show('Select a managed FIMA server first.',false);
  const buttons=[...document.querySelectorAll('[data-save="'+kind+'"]')];const workspaceSave=document.getElementById('workspaceSave');if(workspaceSave&&!workspaceSave.hidden)buttons.push(workspaceSave);buttons.forEach(button=>{button.disabled=true;button.dataset.previousText=button.textContent;button.textContent=byId('uiLanguage').value==='tr'?'Kaydediliyor…':'Saving…'});
  try{
    const{response,result}=await mutate('/api/fima-bot/config',{kind,value,guildId:selectedGuildId},'PATCH');
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
async function repostGuides(mode){if(!confirm(tUi('Repost or update the '+mode+' guide messages in the selected Discord server?')))return;try{const{response,result}=await mutate('/api/fima-bot/actions/repost-guides',{mode,guildId:selectedGuildId});if(!response.ok){show(result.error||'Guide repost failed',false);return}show('Updated '+result.posted+' guide messages');await load()}catch{show('Guide repost failed safely.',false)}}
async function createMissingTemplate(repairPermissions,buttonOverride=null){
  const mode=byId('template').value;
  const action=repairPermissions?'create missing channels/roles and repair managed permissions':'create missing channels/roles only';
  if(!confirm('This test-server action will '+action+'. It will not delete existing resources. Continue?'))return;
  const button=buttonOverride||(repairPermissions?byId('repairSelectedPermissions'):byId('createMissingSetup'));
  const original=button.textContent;button.disabled=true;button.textContent='Working…';
  try{
    const{response,result}=await mutate('/api/fima-bot/actions/create-missing',{mode,guildId:selectedGuildId,repairPermissions});
    if(!response.ok){show(result.error||'Create-missing action failed',false);return}
    const summary=result.result||{};
    show('Created '+Number(summary.createdChannels||0)+' channels and '+Number(summary.createdRoles||0)+' roles; '+Number(summary.guidePosts||0)+' guides synchronized.');
    await load();
  }catch{show('Create-missing action failed safely.',false)}
  finally{button.disabled=false;button.textContent=original}
}
async function rebuildSelectedTestTemplate(){
  const mode=byId('setupTemplate').value;
  const confirmation=byId('testRebuildConfirmation').value.trim();
  const expected='REBUILD TEST '+mode.toUpperCase();
  if(confirmation.toUpperCase()!==expected)return show('Type '+expected+' exactly. Nothing changed.',false);
  const button=byId('rebuildTestTemplate'),original=button.textContent;
  button.disabled=true;button.textContent=tUi('Backing up and rebuilding…');
  try{
    const{response,result}=await mutate('/api/fima-bot/actions/rebuild-test-template',{mode,guildId:selectedGuildId,confirmation});
    if(!response.ok){show(result.error||'Test rebuild failed',false);return}
    const summary=result.result||{};
    byId('testRebuildConfirmation').value='';
    show('Test rebuild complete: '+Number(summary.deleted?.channels||0)+' channels and '+Number(summary.deleted?.roles||0)+' roles removed; '+Number(summary.createdChannels||0)+' channels and '+Number(summary.createdRoles||0)+' roles created.');
    await load();
  }catch{show('Test rebuild failed safely.',false)}
  finally{button.disabled=false;button.textContent=original}
}
async function runSelectedTestSmoke(){
  if(!selectedGuildId)return show('Select the isolated test server first.',false);
  const confirmation=byId('testSmokeConfirmation').value.trim();
  if(confirmation!=='SMOKE TEST COMMUNITY')return show('Type SMOKE TEST COMMUNITY exactly to run the smoke-only check.',false);
  const button=byId('runTestSmoke'),original=button.textContent;
  button.disabled=true;button.textContent=tUi('Posting live tests…');
  try{
    const{response,result}=await mutate('/api/fima-bot/actions/run-test-smoke',{guildId:selectedGuildId,confirmation});
    if(!response.ok){show(result.error||'Live test failed',false);return}
    byId('testSmokeConfirmation').value='';
    show('Live smoke completed. No rehearsal evidence was recorded.');
  }catch{show('Live test failed safely.',false)}
  finally{button.disabled=false;button.textContent=original}
}
async function runSelectedTestRehearsal(){
  if(!selectedGuildId)return show('Select the isolated test server first.',false);
  const confirmation=byId('testRehearsalConfirmation').value.trim();
  if(confirmation!=='REHEARSE TEST COMMUNITY')return show('Type REHEARSE TEST COMMUNITY exactly to run the reversible rehearsal.',false);
  const button=byId('runTestRehearsal'),original=button.textContent;
  button.disabled=true;button.textContent=tUi('Running reversible rehearsal…');
  try{
    const{response,result}=await mutate('/api/fima-bot/actions/run-test-rehearsal',{guildId:selectedGuildId,confirmation});
    if(!response.ok){show(result.error||'Full rehearsal failed',false);return}
    const verified=result.rehearsal?.recorded===true
      && result.result?.smokeRunsCompleted===2
      && result.result?.restoredOriginalState===true
      && result.result?.originalStateMutationsPlanned===0;
    if(!verified){show('Rehearsal returned without complete restore/evidence verification.',false);return}
    byId('testRehearsalConfirmation').value='';
    show('Full rehearsal verified: two smoke runs passed, the original state was restored with zero diff, and signed evidence was recorded.');
    await load();
  }catch{show('Full rehearsal failed safely. Check rollback status before retrying.',false)}
  finally{button.disabled=false;button.textContent=original}
}
function productionErrorMessage(code){
  if(code==='fresh_owner_proof_required')return 'Refresh the verified owner connection with Discord, then reopen this panel and try again.';
  if(code==='rollback_marker_missing')return 'There is no interrupted test rollback to recover. The test recovery gate is already clear.';
  if(code==='production_guild_only')return 'Select the allowlisted FT Community production server for this step.';
  if(code==='test_guild_only')return 'Select the allowlisted disposable test server for this step.';
  if(code==='production_rebuild_plan_expired')return 'The five-minute production plan expired. Create and review a new preflight.';
  if(code==='guild_mutation_locked'||code==='guild_mutation_wait_timeout')return 'Another protected Discord mutation owns the lease. Wait for it to finish, then refresh status.';
  return 'The protected Discord operation failed safely.';
}
function clearProductionPlan(message='No production plan is active in this browser session.'){
  productionPlan=null;
  const confirmation=byId('productionConfirmation'),armed=byId('productionExecutionArmed'),status=byId('productionPlanStatus');
  if(confirmation)confirmation.value='';if(armed)armed.checked=false;
  if(status){status.className='status release-status';status.textContent=tUi(message)}
  updateProductionExecuteState();
}
function renderProductionPlan(plan){
  const status=byId('productionPlanStatus');if(!status)return;
  if(!plan){clearProductionPlan();return}
  const state=String(plan.state||'unknown'),expiresAt=String(plan.expiresAt||''),expiresMs=Date.parse(expiresAt);
  const expired=state==='expired'||(state==='ready'&&Number.isFinite(expiresMs)&&Date.now()>=expiresMs);
  if(expired)plan.state='expired';
  status.className='status release-status '+(expired?'expired':state==='ready'?'ready':'failed');
  status.textContent=[
    tUi('State:')+' '+tUi(expired?'expired':state),
    tUi('Target guild:')+' '+String(plan.guildId||selectedGuildId),
    tUi('Plan ID:')+' '+String(plan.planId||''),
    tUi('Sealed backup digest:')+' '+String(plan.backup?.digest||plan.backupDigest||''),
    tUi('Expires:')+' '+(expiresAt||'unavailable'),
    tUi('Exact confirmation (type it below; it is not inserted automatically):'),
    String(plan.requiredConfirmation||tUi('(unavailable for this plan state)'))
  ].join('\\n');
  updateProductionExecuteState();
}
function updateProductionExecuteState(){
  const button=byId('executeProductionRebuild');if(!button)return;
  const expiresMs=Date.parse(String(productionPlan?.expiresAt||''));
  const live=productionPlan?.state==='ready'&&Number.isFinite(expiresMs)&&Date.now()<expiresMs;
  const exact=byId('productionConfirmation')?.value===productionPlan?.requiredConfirmation;
  const armed=byId('productionExecutionArmed')?.checked===true;
  button.disabled=!(live&&exact&&armed);
}
async function recoverSelectedTestRollback(){
  if(!selectedGuildId)return show('Select the isolated test server first.',false);
  const confirmation=byId('testRecoveryConfirmation').value.trim();
  if(confirmation!=='RECOVER TEST COMMUNITY ROLLBACK')return show('Type RECOVER TEST COMMUNITY ROLLBACK exactly. Nothing changed.',false);
  const button=byId('recoverTestRollback'),original=button.textContent;button.disabled=true;button.textContent=tUi('Checking rollback marker…');
  try{
    const{response,result}=await mutate('/api/fima-bot/actions/recover-test-rollback',{guildId:selectedGuildId,confirmation});
    if(!response.ok){show(productionErrorMessage(result.error),result.error==='rollback_marker_missing');return}
    byId('testRecoveryConfirmation').value='';
    const recovered=result.result?.rollbackRecovered===true;
    show(recovered?'Interrupted test rollback recovered and reconciled with zero diff.':'Test rollback check completed; no recovery mutation was required.');
    await load();
  }catch{show('Test rollback recovery failed safely.',false)}
  finally{button.disabled=false;button.textContent=original}
}
async function createProductionPreflight(){
  if(!selectedGuildId)return show('Select FT Community production first.',false);
  clearProductionPlan('Creating a sealed production preflight. Discord is not being changed.');
  const button=byId('createProductionPreflight'),original=button.textContent;button.disabled=true;button.textContent=tUi('Sealing backup and verifying gates…');
  try{
    const{response,result}=await mutate('/api/fima-bot/actions/rebuild-fima-community/preflight',{guildId:selectedGuildId});
    if(!response.ok){clearProductionPlan(productionErrorMessage(result.error));show(productionErrorMessage(result.error),false);return}
    const plan=result.plan||{};
    if(!plan.planId||!plan.backup?.digest||!plan.requiredConfirmation||plan.state!=='ready'){
      clearProductionPlan('The server returned an incomplete production plan. Nothing can execute.');show('Production plan validation failed safely.',false);return;
    }
    productionPlan=plan;renderProductionPlan(productionPlan);show('Production preflight ready. Review every immutable field before arming execution.');
  }catch{clearProductionPlan('Production preflight failed safely. No production mutation ran.');show('Production preflight failed safely.',false)}
  finally{button.disabled=false;button.textContent=original}
}
async function refreshProductionPlanStatus(){
  if(!productionPlan?.planId)return clearProductionPlan();
  try{
    const query='?guildId='+encodeURIComponent(selectedGuildId)+'&planId='+encodeURIComponent(productionPlan.planId);
    const response=await fetch(API_BASE+'/api/fima-bot/actions/rebuild-fima-community/status'+query,{credentials:'include',headers:{accept:'application/json'},cache:'no-store'});
    const result=await response.json().catch(()=>({error:'invalid_response'}));
    if(!response.ok){clearProductionPlan(productionErrorMessage(result.error));return null}
    productionPlan=result.plan||null;renderProductionPlan(productionPlan);return productionPlan;
  }catch{clearProductionPlan('Production plan status could not be refreshed. Execution remains disabled.');return null}
}
async function executeProductionRebuild(){
  updateProductionExecuteState();
  const button=byId('executeProductionRebuild');if(button.disabled)return show('Review the live plan, type its exact confirmation and arm execution first.',false);
  const planId=productionPlan.planId,backupDigest=productionPlan.backup.digest,confirmation=byId('productionConfirmation').value;
  button.disabled=true;button.textContent=tUi('Executing the single-use production plan…');
  try{
    const{response,result}=await mutate('/api/fima-bot/actions/rebuild-fima-community',{mode:'community',guildId:selectedGuildId,planId,backupDigest,confirmation});
    if(!response.ok){show(productionErrorMessage(result.error),false);await refreshProductionPlanStatus();return}
    const summary=result.result||{};
    clearProductionPlan('Production plan completed and was consumed. Create a fresh preflight for any future operation.');
    show('FT Community rebuild completed: '+Number(summary.createdChannels||0)+' channels and '+Number(summary.createdRoles||0)+' roles created.');
    await load();
  }catch{clearProductionPlan('Execution status is uncertain. The plan was disabled; inspect the audit and server state before any retry.');show('Production rebuild request failed; automatic retry is disabled.',false)}
  finally{button.textContent='Execute FT Community production rebuild once';updateProductionExecuteState()}
}
async function runManagedOperation(kind){
  if(!selectedGuildId)return show('Select a managed FIMA server first.',false);
  const button=kind==='audit'?byId('runRealAudit'):kind==='backup'?byId('runStructureBackup'):kind==='preview'?byId('runSetupPreview'):null;
  const buttons=[button,...document.querySelectorAll('[data-managed-operation="'+kind+'"]')];
  buttons.filter(Boolean).forEach(item=>item.disabled=true);setLoading(true);
  try{
    const body={guildId:selectedGuildId};if(kind==='preview')body.mode=byId('template').value;
    if(kind==='migrate-channels'){
      const auditResponse=await fetch(API_BASE+'/api/fima-bot/real-audit?guildId='+encodeURIComponent(selectedGuildId),{credentials:'include',headers:{accept:'application/json'},cache:'no-store'});
      const auditResult=await auditResponse.json();
      if(!auditResponse.ok||!auditResult.migrationPlan?.sourceDigest)return show('Run an FT audit first.',false);
      body.expectedDigest=auditResult.migrationPlan.sourceDigest;
    }
    const{response,result}=await mutate('/api/fima-bot/actions/'+kind,body);
    if(!response.ok){show(result.error||kind+' failed',false);return}
    const value=result.audit||result.backup||result.preview||result.migration||{};
    const safe=kind==='audit'
      ?{status:value.status,capturedAt:value.capturedAt,guild:value.guild?{name:value.guild.name,id:'…'+String(value.guild.id||'').slice(-6),botRolePosition:value.guild.botRolePosition,capabilities:value.guild.capabilities}:null,counts:value.counts,coverage:value.coverage,discoveryFailures:value.discoveryFailures,categories:value.categories,channels:value.channels,roles:value.roles,autoModRules:value.autoModRules,webhooks:value.webhooks,migrationPlan:result.migrationPlan,readableChannels:(value.sampledChannels||[]).filter(channel=>channel.readable).map(channel=>channel.name),blockedChannels:(value.sampledChannels||[]).filter(channel=>!channel.readable||channel.messagesFetchFailed||channel.pinsFetchFailed).map(channel=>({name:channel.name,reason:channel.missingPermission,messagesFetchFailed:channel.messagesFetchFailed,pinsFetchFailed:channel.pinsFetchFailed})),sampledChannels:value.sampledChannels}
      :kind==='backup'
        ?{status:value.status,capturedAt:value.capturedAt,guild:value.guild?{name:value.guild.name,id:'…'+String(value.guild.id||'').slice(-6)}:null,categories:(value.categories||[]).length,channels:(value.channels||[]).length,roles:(value.roles||[]).length}
        :kind==='migrate-channels'?value:{status:value.status,generatedAt:value.generatedAt,template:value.templateLabel,createResources:(value.createResources||[]).length,keepResources:(value.keepResources||[]).length,extraResources:(value.extraResources||[]).length,createRoles:(value.createRoles||[]).length,warning:value.warning};
    byId('realAuditStatus').textContent=JSON.stringify(safe,null,2);byId('managedOperationStatus').textContent=JSON.stringify(safe,null,2);show(kind+' completed for the selected server');
  }catch{show(kind+' failed safely.',false)}finally{buttons.filter(Boolean).forEach(item=>item.disabled=false);setLoading(false)}
}
document.querySelectorAll('[data-managed-operation]').forEach(button=>button.addEventListener('click',()=>runManagedOperation(button.dataset.managedOperation)));
byId('brandPicker').oninput=e=>{const v=e.target.value.toUpperCase();byId('brandHex').value=v;applyBrand(v);markDirty()};byId('brandHex').oninput=e=>{if(/^#[0-9a-f]{6}$/i.test(e.target.value)){byId('brandPicker').value=e.target.value;applyBrand(e.target.value);markDirty()}};
byId('addApplicationQuestion').onclick=()=>{
  if(applicationQuestionRows.length>=20)return show('At most 20 additional questions can be added.',false);
  let suffix=applicationQuestionRows.length+1,key='ek_soru_'+suffix;
  while(applicationQuestionRows.some(row=>row.key===key)){suffix+=1;key='ek_soru_'+suffix}
  applicationQuestionRows.push({key,label:'',evidence:'optional'});renderApplicationQuestions(true,applicationQuestionRows.length-1);
  document.querySelector('[data-question-index="'+(applicationQuestionRows.length-1)+'"] .question-label')?.focus();markDirty();
};
byId('applicationQuestionList').addEventListener('input',event=>{if(event.target.matches('.question-key,.question-label,.question-evidence')){updateApplicationRowsFromEditor();markDirty()}});
byId('applicationQuestionList').addEventListener('change',event=>{if(event.target.matches('.question-evidence')){updateApplicationRowsFromEditor();markDirty()}});
byId('applicationQuestionList').addEventListener('click',event=>{
  const row=event.target.closest('[data-question-index]');if(!row)return;
  const index=Number(row.dataset.questionIndex);
  if(event.target.closest('.duplicate-question')){if(applicationQuestionRows.length>=20)return;const copy={...applicationQuestionRows[index],key:'copy_'+Date.now().toString(36)};applicationQuestionRows.splice(index+1,0,copy);renderApplicationQuestions(true,index+1);markDirty();return}
  if(event.target.closest('.remove-question')){applicationQuestionRows.splice(index,1);renderApplicationQuestions();markDirty();return}
  const move=event.target.closest('.move-question');if(!move)return;
  const target=index+Number(move.dataset.direction);if(target<0||target>=applicationQuestionRows.length)return;
  [applicationQuestionRows[index],applicationQuestionRows[target]]=[applicationQuestionRows[target],applicationQuestionRows[index]];
  renderApplicationQuestions(true,target);document.querySelector('[data-question-index="'+target+'"] .question-label')?.focus();markDirty();
});
let draggedApplicationQuestion=null;
byId('applicationQuestionList').addEventListener('dragstart',event=>{const row=event.target.closest('[data-question-index]');if(event.target.matches('input,select,textarea')){event.preventDefault();return}if(row){draggedApplicationQuestion=Number(row.dataset.questionIndex);event.dataTransfer.effectAllowed='move'}});
byId('applicationQuestionList').addEventListener('dragover',event=>{if(event.target.closest('[data-question-index]'))event.preventDefault()});
byId('applicationQuestionList').addEventListener('drop',event=>{const row=event.target.closest('[data-question-index]');if(row&&draggedApplicationQuestion!==null){event.preventDefault();updateApplicationRowsFromEditor();const target=Number(row.dataset.questionIndex);const [moved]=applicationQuestionRows.splice(draggedApplicationQuestion,1);applicationQuestionRows.splice(target,0,moved);draggedApplicationQuestion=null;renderApplicationQuestions(true,target);markDirty()}});
byId('applicationQuestionList').addEventListener('toggle',event=>{if(event.target.open&&event.target.matches('[data-question-index]')){byId('applicationQuestionList').querySelectorAll('[data-question-index]').forEach(row=>{if(row!==event.target)row.open=false})}},true);
byId('applicationQuestionType').addEventListener('change',event=>{
  updateApplicationRowsFromEditor();
  selectedApplicationType=APPLICATION_EDITOR_TYPE_SET.has(event.target.value)?event.target.value:'helper';
  applicationQuestionRows=applicationRowsForType();renderApplicationQuestions();markDirty();
});
for(const id of ['applicationQuestions','applicationEvidenceRequirements']){
  byId(id).addEventListener('input',()=>{try{loadApplicationJsonState();renderApplicationQuestions(false);markDirty()}catch(error){showApplicationJsonError(error)}});
}
byId('previewBrand').onclick=()=>{const value=byId('brandHex').value;if(!/^#[0-9a-f]{6}$/i.test(value))return show('Use a valid HEX color such as #000000',false);applyBrand(value);byId('brandPreview').scrollIntoView({behavior:'smooth',block:'center'})};
document.querySelectorAll('[data-template]').forEach(card=>card.onclick=()=>{byId('template').value=card.dataset.template;document.querySelectorAll('[data-template]').forEach(item=>item.classList.toggle('is-active',item===card))});
document.querySelectorAll('[data-setup-template]').forEach(card=>card.onclick=()=>{byId('setupTemplate').value=card.dataset.setupTemplate;byId('template').value=card.dataset.setupTemplate;document.querySelectorAll('[data-setup-template]').forEach(item=>item.classList.toggle('is-active',item===card));markDirty()});
document.querySelectorAll('[data-save]').forEach(b=>b.onclick=()=>save(b.dataset.save));document.querySelectorAll('[data-guide-mode]').forEach(b=>b.onclick=()=>repostGuides(b.dataset.guideMode));byId('refresh').onclick=load;
document.querySelectorAll('[data-theme]').forEach(button=>button.onclick=()=>{currentTheme=button.dataset.theme;const accent=byId('brandHex').value||THEMES[currentTheme].accent;applyTheme(currentTheme,accent);markDirty()});
document.querySelectorAll('[data-page-button]').forEach(button=>button.onclick=()=>{showPage(button.dataset.pageButton);setMobileNavOpen(false)});
byId('mobileNavToggle').onclick=()=>setMobileNavOpen(!byId('pageNav').classList.contains('is-open'));
byId('mobileNavBackdrop').onclick=()=>setMobileNavOpen(false);
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&byId('pageNav').classList.contains('is-open'))setMobileNavOpen(false)});
addEventListener('resize',()=>{if(!matchMedia('(max-width: 980px)').matches)setMobileNavOpen(false)});
byId('heroToggle').onclick=()=>{document.querySelector('.hero')?.classList.toggle('is-collapsed');updateHeroToggleLabel()};
byId('serverSelect').onchange=event=>enterWorkspace(event.target.value,currentPage);
byId('serverSearch').oninput=event=>renderServerWorkspaces(currentPayload?.servers||[],event.target.value);
byId('serverDirectorySearch').oninput=event=>renderServerDirectory(currentPayload?.servers||[],event.target.value);
byId('backToServers').onclick=leaveWorkspace;
byId('uiLanguage').onchange=event=>{applyUiLanguage(event.target.value);updateHeroToggleLabel()};
byId('defaultLanguage').onchange=event=>{byId('uiLanguage').value=event.target.value;applyUiLanguage(event.target.value);updateHeroToggleLabel();markDirty()};
byId('runRealAudit').onclick=()=>runManagedOperation('audit');byId('runStructureBackup').onclick=()=>runManagedOperation('backup');byId('runSetupPreview').onclick=()=>runManagedOperation('preview');
byId('previewSelectedSetup').onclick=()=>runManagedOperation('preview');
byId('startSelectedSetup').onclick=()=>runManagedOperation('preview');
byId('createMissingSetup').onclick=()=>createMissingTemplate(false);
byId('repairSelectedPermissions').onclick=()=>createMissingTemplate(true);
byId('repostSelectedGuides').onclick=()=>repostGuides(byId('template').value);
byId('saveSetupTemplate').onclick=()=>{byId('template').value=byId('setupTemplate').value;save('template')};
byId('setupPreviewAction').onclick=()=>runManagedOperation('preview');
byId('setupStartAction').onclick=()=>runManagedOperation('preview');
byId('setupCreateMissingAction').onclick=()=>createMissingTemplate(false,byId('setupCreateMissingAction'));
byId('setupRepairAction').onclick=()=>createMissingTemplate(true,byId('setupRepairAction'));
byId('setupRepostGuidesAction').onclick=()=>repostGuides(byId('setupTemplate').value);
byId('rebuildTestTemplate').onclick=rebuildSelectedTestTemplate;
byId('runTestSmoke').onclick=runSelectedTestSmoke;
byId('runTestRehearsal').onclick=runSelectedTestRehearsal;
byId('recoverTestRollback').onclick=recoverSelectedTestRollback;
byId('createProductionPreflight').onclick=createProductionPreflight;
byId('executeProductionRebuild').onclick=executeProductionRebuild;
byId('productionConfirmation').addEventListener('input',updateProductionExecuteState);
byId('productionExecutionArmed').addEventListener('change',updateProductionExecuteState);
byId('fimaBotProfileConfirmation').addEventListener('input',updateFimaBotProfileApplyState);
byId('applyFimaBotProfile').onclick=applyFimaBotProfile;
byId('autoDetectChannels').onclick=autoDetectChannels;byId('previewChallengeRange').onclick=previewChallengeRange;
document.querySelectorAll('input,select,textarea').forEach(field=>{if(!['serverSelect','uiLanguage','fimaBotProfileConfirmation'].includes(field.id))field.addEventListener('change',markDirty)});
byId('exportConfig').onclick=()=>{if(!currentPayload)return;const guild=currentPayload.runtime.guild;const safeGuild=guild?{name:guild.name,id:'…'+String(guild.id||'').slice(-6),memberCount:guild.memberCount}:null;const blob=new Blob([JSON.stringify({exportedAt:new Date().toISOString(),config:currentPayload.config,runtimeSummary:{guild:safeGuild,commandSync:currentPayload.runtime.commandSync}},null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='fima-safe-config.json';a.click();URL.revokeObjectURL(a.href)};
async function start(){try{const uiLanguage=(()=>{try{return localStorage.getItem('paradiseUiLanguage')||'tr'}catch{return'tr'}})();byId('uiLanguage').value=uiLanguage;applyUiLanguage(uiLanguage);updateHeroToggleLabel();initializePages();const status=await sessionStatus();if(renderAccess(status)){await csrfToken();await load();applyUiLanguage(byId('uiLanguage').value);updateHeroToggleLabel()}else setLoading(false)}catch{setLoading(false);renderAccess({reasonCode:'session_check_failed',ownerAuthorized:false})}}
window.__PARADISE_OWNER_CONSOLE__={apiBase:API_BASE,getSelectedGuildId:()=>selectedGuildId,mutate,show,reload:load,markDirty,showPage};
start();
</script>
<script src="/assets/js/paradise-workspace.js"></script>
<script src="/assets/js/paradise-community-structure.js"></script>
</body></html>`;
}
