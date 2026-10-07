import { paradiseDashboardHtml } from './paradiseDashboardHtml.js';
import fs from 'node:fs';

// This fragment is served only after the same owner check as the mutation APIs.
// Scope the existing workflow styles so they cannot restyle the common shell.
const workspaceCss = fs.readFileSync(new URL('../public/assets/css/paradise-workspace.css', import.meta.url), 'utf8');
export function fimaOwnerToolsFragment(options) {
  const html = paradiseDashboardHtml(options);
  const css = html.match(/<style>([\s\S]*?)<\/style>/)[1] + '\n' + workspaceCss;
  const body = html.match(/<body>([\s\S]*?)<script>/)[1]
    .replace(/data-page="overview"/g, 'data-page="advanced"')
    .replace(/data-page="servers"/g, 'data-page="logs"')
    .replace(/ onclick="[^"]*"/g, '');
  return `<style>@scope (.owner-tools) {${css.replace(/:root\s*\{[^}]*\}/g, '').replace(/\bbody\b/g, ':scope')}
    :scope {--page:transparent;--surface:var(--panel);--elevated:var(--panel-strong);--border:var(--line);--text:var(--ink);--brand:var(--teal);--brand-rgb:32,223,191;--brand-soft:rgba(32,223,191,.12);color:var(--ink);font-family:inherit;min-height:0;background:transparent!important}
    :scope::before,:scope::after {display:none!important}
    main {width:100%!important;max-width:none!important;padding:0!important;margin:0!important}
    .layout,.console-shell,.workspace-grid,.console-main {display:block!important;margin:0!important}
    #pageNav,#workspaceHero,#serverDirectory,.mobile-nav-toggle,.mobile-nav-backdrop,.mobile-page-picker {display:none!important}
    .hero {display:none!important}
    .panel {border-radius:16px;box-shadow:none!important;background:var(--panel)!important;border-color:var(--line)!important}
    .metric {background:var(--panel-strong)!important;border-color:var(--line)!important;color:var(--ink)!important}
    .metric::before {display:none}
    .metric:hover {border-color:var(--teal)!important}
    input,select,textarea {background:var(--panel-strong)!important;border-color:var(--line)!important;color:var(--ink)!important}
    /* Override the legacy workspace's important typography and interaction rules. */
    :scope button,:scope .button {
      min-height:42px!important;padding:9px 14px!important;border:1px solid rgba(32,223,191,.58)!important;border-radius:10px!important;
      font:inherit!important;font-size:.68rem!important;font-weight:900!important;line-height:1.3!important;letter-spacing:normal!important;text-transform:none!important;
      background:linear-gradient(135deg,var(--teal),var(--cyan))!important;color:#061314!important;box-shadow:none!important;filter:none!important;
      transition:transform .18s,border-color .18s,background .18s!important;
    }
    :scope button:hover,:scope .button:hover {background:linear-gradient(135deg,#63eed6,#8ae7ff)!important;transform:translateY(-1px)!important;box-shadow:none!important;filter:none!important}
    :scope button.secondary,:scope .button.secondary,:scope .btn-secondary {background:rgba(255,255,255,.025)!important;border-color:var(--line-strong)!important;color:#b9cdcf!important}
    :scope button.secondary:hover,:scope .button.secondary:hover,:scope .btn-secondary:hover {background:rgba(32,223,191,.08)!important;border-color:rgba(32,223,191,.48)!important}
    :scope button.ghost {background:transparent!important;border-color:transparent!important;color:var(--muted)!important}
    :scope button.ghost:hover {background:rgba(32,223,191,.08)!important;color:var(--ink)!important}
    :scope button:is(.danger-action,.danger-button) {background:rgba(255,130,149,.08)!important;border-color:rgba(255,130,149,.32)!important;color:var(--danger)!important}
    :scope button:is(.danger-action,.danger-button):hover {background:rgba(255,130,149,.16)!important;border-color:var(--danger)!important}
    :scope button:disabled,:scope .button[aria-disabled="true"] {opacity:.42!important;cursor:not-allowed!important;transform:none!important}
    :scope button:focus-visible,:scope .button:focus-visible {outline:2px solid var(--cyan)!important;outline-offset:3px!important;box-shadow:none!important}
    :scope button.template-card {background:var(--panel-strong)!important;color:var(--ink)!important;border-color:var(--line)!important;font-size:.8rem!important;font-weight:700!important;text-align:left!important}
    :scope button.template-card:hover {border-color:var(--line-strong)!important}
    :scope button.template-card.is-active {background:var(--brand-soft)!important;border-color:var(--teal)!important}
    :scope .fima-select-trigger {background:#0a1b23!important;border-color:var(--line-strong)!important;color:var(--ink)!important;font-size:.8rem!important;font-weight:600!important;min-height:46px!important;border-radius:12px!important}
    :scope .fima-select-trigger:hover {background:#102934!important;border-color:var(--cyan)!important;transform:none!important}
    :scope .fima-select-option {background:transparent!important;color:var(--ink)!important;font-size:.8rem!important;font-weight:500!important;text-align:left!important;border:0!important;border-radius:8px!important}
    :scope .fima-select-option:hover {background:rgba(32,223,191,.08)!important;transform:none!important}
    @media(prefers-reduced-motion:reduce) { :scope button,:scope .button {transition:none!important} }
    button.template-card {background:var(--panel-strong)!important;color:var(--ink)!important;border-color:var(--line)!important}
    button.template-card.is-active {background:var(--brand-soft)!important;border-color:var(--teal)!important}
    button.template-card span {color:var(--muted)!important}
    .panel + .panel {margin-top:16px}
    #console {padding:0}
    [hidden] {display:none!important}
    .workspace-page-header {position:static!important;min-height:0;padding:0 0 16px!important}
    .workspace-page-actions {margin-left:auto}
    .workspace-page-header > div:first-child {display:none}
    .owner-tools-label {font-weight:700;font-size:1rem;padding:16px;cursor:pointer}
  }</style>${body}`;
}
