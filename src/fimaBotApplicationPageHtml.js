import fs from "node:fs";
import { resolveFimaBotApplicationRoute } from "./fimaBotApplicationRoute.js";

const applicationTemplate = fs.readFileSync(
  new URL("../public/paradise-apply.html", import.meta.url),
  "utf8"
);

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function removeRegion(html, name) {
  const startMarker = `<!-- fima:${name}:start -->`;
  const endMarker = `<!-- fima:${name}:end -->`;
  const start = html.indexOf(startMarker);
  const end = html.indexOf(endMarker);
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`Missing or invalid FIMA application template region: ${name}`);
  }
  return `${html.slice(0, start)}${html.slice(end + endMarker.length)}`;
}

function replaceRequired(html, search, replacement, field) {
  if (!html.includes(search)) {
    throw new Error(`Missing FIMA application template field: ${field}`);
  }
  return html.replace(search, replacement);
}

function replaceElementText(html, id, value) {
  const matcher = new RegExp(`(<[^>]+id="${id}"[^>]*>)[\\s\\S]*?(</[^>]+>)`);
  if (!matcher.test(html)) {
    throw new Error(`Missing FIMA application template field: ${id}`);
  }
  return html.replace(matcher, `$1${escapeHtml(value)}$2`);
}

function stripMarkers(html) {
  return html.replace(/\s*<!-- fima:(?:catalog|detail)-[a-z-]+:(?:start|end) -->\s*/g, "\n");
}

export function renderFimaBotApplicationCatalogHtml() {
  let html = applicationTemplate;
  for (const region of ["detail-focus", "detail-journey", "detail-form"]) {
    html = removeRegion(html, region);
  }
  return stripMarkers(html);
}

export function renderFimaBotApplicationDetailHtml(slug) {
  const route = resolveFimaBotApplicationRoute(slug);
  if (!route) return null;

  let html = applicationTemplate;
  for (const region of ["catalog-hero", "catalog-content"]) {
    html = removeRegion(html, region);
  }
  html = replaceRequired(
    html,
    'data-application-page="catalog"',
    `data-application-page="detail" data-application-slug="${escapeHtml(route.slug)}"`,
    "application page mode"
  );
  html = replaceRequired(
    html,
    "<title>FIMA Başvuru Merkezi</title>",
    `<title>${escapeHtml(route.label)} Başvurusu · FIMA Bot</title>`,
    "document title"
  );
  html = replaceElementText(html, "applicationRouteBreadcrumb", route.label);
  html = replaceElementText(html, "applicationRouteFamily", route.family);
  html = replaceElementText(html, "applicationRouteTitle", `${route.label} başvurusu`);
  html = replaceElementText(html, "applicationRouteDescription", route.description);
  return stripMarkers(html);
}
