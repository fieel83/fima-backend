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
    button,.button,.btn-primary {background:var(--teal)!important;color:#06221c!important;box-shadow:none!important}
    button.secondary,.button.secondary,.btn-secondary {background:var(--panel-strong)!important;border-color:var(--line)!important;color:var(--ink)!important;box-shadow:none!important}
    button.ghost {background:transparent!important;color:var(--muted)!important}
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
