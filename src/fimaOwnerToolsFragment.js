import { paradiseDashboardHtml } from './paradiseDashboardHtml.js';

// Workflow IDs remain intact; presentation uses the customer dashboard components.
// The endpoint still requires the same owner authorization as the mutation APIs.
export function fimaOwnerToolsFragment(options) {
  const body = paradiseDashboardHtml(options).match(/<body>([\s\S]*?)<script>/)[1]
    .replace(/data-page="overview"/g, 'data-page="advanced"')
    .replace(/data-page="servers"/g, 'data-page="logs"')
    .replace(/ onclick="[^"]*"/g, '')
    .replace(/class="panel([^"\n]*)"/g, 'class="panel module-panel$1"')
    .replace(/<button([^>]*)>/g, (_, attributes) => {
      const primary = /class="[^"]*\b(primary|success)\b/.test(attributes) || /data-save=/.test(attributes);
      const component = primary ? 'editor-primary' : 'editor-secondary';
      attributes = attributes.replace(/class="([^"]*)"/, (_, classes) =>
        `class="${classes.split(/\s+/).filter(name => !['primary', 'success', 'ghost', 'secondary', 'audit-action', 'backup-action', 'preview-action'].includes(name)).join(' ')}"`);
      return '<button' + (/class="/.test(attributes)
        ? attributes.replace(/class="/, `class="${component} `)
        : ` class="${component}"${attributes}`) + '>';
    })
    .replace(/<label for="(testRebuildConfirmation|testSmokeConfirmation|testRehearsalConfirmation|testRecoveryConfirmation)">([\s\S]*?<\/button>)/g,
      '<div class="owner-operation"><label for="$1">$2</div>');
  return `<style>@scope (.owner-tools) {
    :scope {--brand:var(--teal);--brand-soft:rgba(32,223,191,.12);--good:var(--teal);--bad:var(--danger);--warn:#ffd171;color:var(--ink);min-width:0;scroll-margin-top:100px}
    [hidden] {display:none!important}
    main {width:100%;max-width:none;padding:0;margin:0}
    #pageNav,#workspaceHero,#serverDirectory,.hero,.mobile-nav-toggle,.mobile-nav-backdrop,.mobile-page-picker,.workspace-page-header>div:first-child {display:none}
    .console-shell,.console-main {display:block;min-width:0}
    .layout,.stack {display:grid;grid-template-columns:minmax(0,1fr);gap:20px;min-width:0}
    .stack:has(>[data-page]):not(:has(>[data-page]:not([hidden]))) {display:none}
    .panel.module-panel {display:grid;align-content:start;gap:16px;min-width:0;margin:0;border:1px solid var(--line);border-radius:25px;background:linear-gradient(145deg,rgba(12,28,33,.91),rgba(6,14,18,.96));box-shadow:0 28px 72px rgba(0,0,0,.28)}
    .owner-tools-label {padding:16px 0;font-size:.8rem;font-weight:850;cursor:pointer}
    details[open]>.owner-tools-label {display:none}
    h2 {margin:0;font-size:clamp(1.75rem,3vw,2.65rem);letter-spacing:-.035em;line-height:1.15}
    h3 {margin:8px 0 0;font-size:1rem}
    p,.help {margin:0;color:var(--muted);font-size:.8rem;line-height:1.65}
    label {display:block;color:#b9cdcf;font-size:.7rem;font-weight:850;line-height:1.6}
    label input,label select,label textarea,label .fima-select {margin-top:8px}
    input:not([type=checkbox]):not([type=color]),select,textarea {display:block;width:100%;min-width:0;min-height:44px;padding:10px 12px;border:1px solid var(--line-strong);border-radius:11px;color:var(--ink);background:rgba(3,12,15,.76);font:inherit;font-size:.8rem}
    textarea {min-height:120px;resize:vertical;line-height:1.55}
    input:focus-visible,textarea:focus-visible {outline:3px solid rgba(86,217,255,.25);outline-offset:2px}
    button {max-width:100%;white-space:normal;overflow-wrap:anywhere;line-height:1.5}
    .panel>button,.grid>div>button {justify-self:start}
    .grid,.community-preview-grid,.community-detail-grid {display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px;min-width:0}
    .grid.three {grid-template-columns:repeat(3,minmax(0,1fr))}
    .grid>div,.owner-operation {display:grid;align-content:start;gap:12px;min-width:0}
    .owner-operation {padding:18px;border:1px solid var(--line);border-radius:15px;background:rgba(3,12,15,.42)}
    .owner-operation button {justify-self:start}
    .operation-actions,.workspace-page-actions,.theme-pills,.guide-actions,.access-actions {display:flex;flex-wrap:wrap;align-items:center;gap:12px}
    .operation-actions {padding-top:16px;border-top:1px solid var(--line)}
    .workspace-page-header {margin-bottom:16px}
    .workspace-page-actions {justify-content:flex-end}
    .workspace-page-actions #saveState {font-size:.72rem;color:var(--muted)}
    .workspace-page-header:not(:has(button:not([hidden]))) {display:none}
    .template-cards {display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:15px}
    .template-card.editor-secondary {display:grid;align-content:start;gap:8px;padding:18px;text-align:left;font-size:.8rem;font-weight:700;background:rgba(3,12,15,.42);border-color:var(--line);border-radius:14px}
    .template-card span {font-size:.75rem;font-weight:400;color:var(--muted);line-height:1.65}
    .template-card.is-active {border-color:var(--teal);background:var(--brand-soft)}
    .danger-action.editor-secondary,.danger-button.editor-secondary {color:var(--danger);border-color:rgba(255,130,149,.32);background:rgba(255,130,149,.08)}
    .danger-action.editor-secondary:hover {background:rgba(255,130,149,.16);border-color:var(--danger)}
    .notice,.preview-card,.status,pre,.permission-item,.metric,.fima-profile-state,.community-device,.fima-profile-remediation {padding:16px;border:1px solid var(--line);border-radius:14px;background:rgba(3,12,15,.42);min-width:0;font-size:.8rem;line-height:1.65;overflow-wrap:anywhere}
    .notice,.fima-profile-remediation {border-color:rgba(255,209,113,.25);background:rgba(255,209,113,.04);color:#ffe2a1}
    .danger {border-color:rgba(255,130,149,.25)}
    pre,.status {margin:0;white-space:pre-wrap;word-break:break-word;font-family:ui-monospace,Consolas,monospace;max-width:100%}
    .metrics,.fima-profile-grid {display:grid;grid-template-columns:repeat(auto-fit,minmax(min(150px,100%),1fr));gap:15px}
    .metric strong,.metric span,.fima-profile-state strong,.fima-profile-state span,.permission-item strong {display:block}
    .metric strong {font-size:1.5rem;color:var(--teal)}
    .fima-profile-state span {color:var(--muted)}
    .fima-profile-state strong {margin-top:8px}
    .fima-profile-state.good strong,.fima-profile-badge.good {color:var(--teal)}
    .fima-profile-state.bad strong,.fima-profile-badge.bad {color:var(--danger)}
    .permission-list,.release-chain {display:grid;gap:12px;margin:0}
    .permission-item strong {margin-bottom:6px}
    .release-chain {padding-left:24px}
    .release-chain li {padding:12px 16px;border:1px solid var(--line);border-radius:12px;font-size:.8rem;line-height:1.65}
    .release-chain strong,.release-chain span {display:block}
    .release-chain span {color:var(--muted);margin-top:4px}
    .switch {display:flex;align-items:flex-start;gap:10px;font-size:.8rem;font-weight:500}
    .switch input {flex:0 0 auto;width:18px;height:18px;margin:2px 0 0;accent-color:var(--teal)}
    .color-row {display:flex;align-items:center;gap:10px}
    .color-row input[type=color] {width:44px;height:44px;flex-shrink:0;border:1px solid var(--line);border-radius:11px;background:transparent}
    .fima-profile-head {display:flex;align-items:flex-start;justify-content:space-between;gap:16px}
    .fima-profile-head .help {margin-top:12px}
    .fima-profile-badge {flex-shrink:0;padding:8px 12px;border:1px solid var(--line);border-radius:999px;font-size:.65rem;color:var(--muted)}
    .fima-profile-actions {display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:end;gap:16px}
    .workspace-disclosure summary {font-size:1rem;font-weight:850;cursor:pointer}
    .workspace-disclosure[open] {display:grid;gap:16px}
    .tip {color:var(--cyan);cursor:help}
    .toast {display:none;position:fixed;z-index:100;right:20px;bottom:20px;max-width:min(420px,calc(100vw - 40px));padding:16px;border:1px solid var(--line-strong);border-radius:14px;background:#0a1b23}
    .toast.ok,.toast.error {display:block}.toast.ok {color:var(--teal)}.toast.error {color:var(--danger)}
    .loading {position:fixed;inset:0;z-index:90;display:grid;place-items:center;background:rgba(3,12,15,.85)}
    .community-category,.community-role {padding:8px 0;border-bottom:1px solid var(--line)}
    .community-channel {padding:5px 12px;color:var(--muted)}
    @media(max-width:900px) {.grid.three,.community-detail-grid {grid-template-columns:repeat(2,minmax(0,1fr))}.fima-profile-head {flex-wrap:wrap}}
    @media(max-width:540px) {
      .template-cards,.grid,.grid.three,.community-preview-grid,.community-detail-grid,.fima-profile-actions {grid-template-columns:minmax(0,1fr)}
      .operation-actions,.theme-pills,.guide-actions,.workspace-page-actions {display:grid;grid-template-columns:minmax(0,1fr);align-items:stretch}
      .panel>button,.grid>div>button,.owner-operation button {justify-self:stretch;width:100%}
      .owner-operation {padding:14px}.release-chain {padding-left:20px}
    }
  }</style>${body}`;
}
