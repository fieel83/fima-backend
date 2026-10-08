import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  inferFimaGuildSetupMode,
  isManagedContentStudioWebhook,
  upgradeManagedContentStudioWebhookIdentity
} from "../src/discordBot.js";
import {
  paradiseAutoModRuleNamesForTemplate,
  paradiseCommands,
  planParadiseAutoModRuleReconciliation
} from "../src/paradise3a59.js";
import { paradiseDashboardHtml } from "../src/paradiseDashboardHtml.js";

const discordBotSource = fs.readFileSync(new URL("../src/discordBot.js", import.meta.url), "utf8");
const discordRuntimeSource = fs.readFileSync(new URL("../src/paradise3a59.js", import.meta.url), "utf8");
const serverSource = fs.readFileSync(new URL("../src/server.js", import.meta.url), "utf8");
const dashboardSource = fs.readFileSync(new URL("../src/paradiseDashboardHtml.js", import.meta.url), "utf8");
const botPageSource = fs.readFileSync(new URL("../public/paradise-bot.html", import.meta.url), "utf8");
const applyPageSource = fs.readFileSync(new URL("../public/paradise-apply.html", import.meta.url), "utf8");
const commandsPageSource = fs.readFileSync(new URL("../public/fima-bot-commands.html", import.meta.url), "utf8");
const premiumPageSource = fs.readFileSync(new URL("../public/fima-bot-premium.html", import.meta.url), "utf8");
const feedbackPageSource = fs.readFileSync(new URL("../public/fima-bot-feedback.html", import.meta.url), "utf8");
const contentStudioSource = fs.readFileSync(new URL("../public/paradise-content-studio.html", import.meta.url), "utf8");
const accountShellSources = [
  "login.html",
  "register.html",
  "forgot-password.html",
  "reset-password.html",
  "dashboard.html",
  "my-products.html",
  "store.html",
  "payment-success.html",
  "payment-cancelled.html"
].map((file) => fs.readFileSync(new URL(`../public/${file}`, import.meta.url), "utf8"));
const accountClientSource = fs.readFileSync(new URL("../public/assets/js/account.js", import.meta.url), "utf8");
const profileSyncSource = fs.readFileSync(new URL("../src/fimaBotProfileSync.js", import.meta.url), "utf8");
const identitySource = fs.readFileSync(new URL("../src/fimaBotIdentity.js", import.meta.url), "utf8");

function capitalizedParadiseStringLiterals(source) {
  const matches = [];
  for (const [index, line] of String(source || "").split(/\r?\n/).entries()) {
    const literals = line.match(/(["'`])(?:(?!\1|\\).|\\.)*\1/g) || [];
    for (const literal of literals) {
      const quote = literal[0];
      const rawValue = literal.slice(1, -1);
      const visibleValue = quote === "`"
        ? rawValue.replace(/\$\{[^}]*\}/g, "")
        : rawValue;
      if (/Paradise|PARADISE/.test(visibleValue)) {
        matches.push({ line: index + 1, value: visibleValue });
      }
    }
  }
  return matches;
}

function publicHtmlAndJavaScriptSources() {
  const publicRoot = new URL("../public/", import.meta.url);
  const pending = [publicRoot];
  const sources = [];
  while (pending.length) {
    const directory = pending.pop();
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const entryUrl = new URL(entry.name + (entry.isDirectory() ? "/" : ""), directory);
      if (entry.isDirectory()) {
        pending.push(entryUrl);
      } else if (/\.(?:html|js)$/i.test(entry.name)) {
        sources.push({ file: entryUrl.pathname, source: fs.readFileSync(entryUrl, "utf8") });
      }
    }
  }
  return sources;
}

function visibleHtmlSurface(source) {
  return String(source || "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
}

function visibleHtmlLegacyBrandMatches(source) {
  const visible = visibleHtmlSurface(source);
  const matches = [];
  for (const match of visible.matchAll(/>([^<]*paradise[^<]*)</gi)) {
    matches.push({ kind: "text", value: match[1].trim().replace(/\s+/g, " ") });
  }
  for (const match of visible.matchAll(/\b(aria-label|alt|title|placeholder|content)\s*=\s*(["'])([^"']*paradise[^"']*)\2/gi)) {
    matches.push({ kind: match[1].toLowerCase(), value: match[3].trim().replace(/\s+/g, " ") });
  }
  return matches;
}

test("FT Community, FIMA and legacy Community guild names select the community setup", () => {
  assert.equal(inferFimaGuildSetupMode({ id: "ft", name: "FT Community" }), "community");
  assert.equal(inferFimaGuildSetupMode({ id: "ft-case", name: " ft community " }), "community");
  assert.equal(inferFimaGuildSetupMode({ id: "fima", name: "FIMA" }), "community");
  assert.equal(inferFimaGuildSetupMode({ id: "legacy-ascii", name: "Fieel's Community" }), "community");
  assert.equal(inferFimaGuildSetupMode({ id: "legacy-smart", name: "Fieel’s Community" }), "community");
});

test("automatic FT Community audits target the immutable production guild id", () => {
  assert.match(discordBotSource, /String\(guild\.id \|\| ""\) === FIMA_COMMUNITY_PRODUCTION_GUILD_ID/);
  assert.doesNotMatch(discordBotSource, /\|\|\s*\[[^\]]+\]\.includes\(guild\.name\)/);
});

test("explicit guild configuration has priority over name inference", () => {
  const guild = { id: "configured", name: "FIMA" };
  assert.equal(inferFimaGuildSetupMode(guild, {
    guildConfigs: { configured: { activeSetupMode: "tsbtr" } }
  }), "tsbtr");
  assert.equal(inferFimaGuildSetupMode({ id: "tsbtr", name: "TSBTR Yedek" }), "tsbtr");
  assert.equal(inferFimaGuildSetupMode({ id: "clan", name: "Paradise Clan" }), "clan");
});

test("Content Studio accepts only bot-owned tokenized managed webhooks", () => {
  const current = { name: "FIMA Content Studio", owner: { id: "bot" }, token: "token" };
  const legacy = { name: "Paradise Content Studio", owner: { id: "bot" }, token: "token" };
  assert.equal(isManagedContentStudioWebhook(current, "bot"), true);
  assert.equal(isManagedContentStudioWebhook(legacy, "bot"), true);
  assert.equal(isManagedContentStudioWebhook({ ...legacy, owner: { id: "other" } }, "bot"), false);
  assert.equal(isManagedContentStudioWebhook({ ...legacy, token: null }, "bot"), false);
  assert.equal(isManagedContentStudioWebhook({ ...current, name: "Unmanaged" }, "bot"), false);
});

test("legacy Content Studio webhook identity migrates without rotating or breaking its token", async () => {
  const edits = [];
  const renamed = { name: "FIMA Content Studio", owner: { id: "bot" }, token: "same-token" };
  const legacy = {
    name: "Paradise Content Studio",
    owner: { id: "bot" },
    token: "same-token",
    edit: async (payload) => {
      edits.push(payload);
      return renamed;
    }
  };
  assert.equal(await upgradeManagedContentStudioWebhookIdentity(legacy, "bot"), renamed);
  assert.deepEqual(edits, [{
    name: "FIMA Content Studio",
    reason: "FIMA Content Studio identity migration"
  }]);

  const denied = { ...legacy, owner: { id: "other" } };
  assert.equal(await upgradeManagedContentStudioWebhookIdentity(denied, "bot"), denied);

  const retryLater = { ...legacy, edit: async () => { throw new Error("discord unavailable"); } };
  assert.equal(await upgradeManagedContentStudioWebhookIdentity(retryLater, "bot"), retryLater);
});

test("public identity is FIMA while safe internal routes and legacy aliases remain", () => {
  assert.match(discordBotSource, /\.setName\("setupfima"\)/);
  assert.match(discordBotSource, /interaction\.commandName === "setupfieelscommunity"/);
  assert.match(discordBotSource, /intendedName:\s*"FIMA Bot"/);
  assert.match(discordBotSource, /usernameMatches:\s*String\(client\.user\?\.username \|\| ""\)\.toLowerCase\(\) === "fima\.bot"/);
  assert.match(discordBotSource, /nicknameMatches:[^\n]+=== "FIMA Bot"/);
  assert.match(serverSource, /intendedName:\s*"FIMA Bot"/);
  assert.match(dashboardSource, /FIMA Owner Console/);
  assert.match(botPageSource, /<title>FIMA Discord Bot \| FIMA<\/title>/);
  assert.match(botPageSource, />Invite FIMA Bot</);
  assert.match(botPageSource, /<h3>FIMA<\/h3>/);
  assert.doesNotMatch(botPageSource, /Invite Paradise|Fieel[’']s Community|Paradise Discord Bot/);
  assert.match(applyPageSource, /FIMA Başvuru Merkezi/);
  assert.match(contentStudioSource, /FIMA Content Studio/);
});

test("FIMA owner authentication returns use the owner route", () => {
  assert.doesNotMatch(dashboardSource, /%2Fparadise/);
  assert.match(dashboardSource, /\/login\?next=%2Ffima-bot%2Fowner/);
  assert.match(dashboardSource, /\/auth\/discord\/start\?returnTo=%2Ffima-bot%2Fowner/);
  assert.doesNotMatch(serverSource, /dashboardUrl:\s*`\$\{frontendUrl\(\)\}\/paradise`/);
  assert.equal(
    (serverSource.match(/dashboardUrl:\s*`\$\{frontendUrl\(\)\}\/fima-bot\/dashboard`/g) || []).length,
    3
  );
});

test("FIMA Bot profile mutation requires exact application and owner confirmation", () => {
  assert.match(profileSyncSource, /applicationId === expectedApplicationId/);
  assert.match(profileSyncSource, /botUserId === expectedApplicationId/);
  assert.match(profileSyncSource, /FIMA_BOT_PROFILE_CONFIRMATION = "APPLY FIMA BOT PROFILE"/);
  assert.match(profileSyncSource, /authorization\?\.confirmation\) !== FIMA_BOT_PROFILE_CONFIRMATION/);
  assert.match(profileSyncSource, /export const FIMA_BOT_PROFILE_NAME = "FIMA Bot"/);
});

test("Discord-facing copy uses FIMA Bot while legacy compatibility aliases remain internal", () => {
  assert.match(discordBotSource, /Preview the dedicated FIMA Bot clan\/training system/);
  assert.match(discordRuntimeSource, /FIMA Bot lifecycle rendering test/);
  assert.match(discordRuntimeSource, /FIMA Bot Clan/);
  assert.match(discordRuntimeSource, /FIMA BOT BLACKLIST/);
  assert.doesNotMatch(discordBotSource, /Preview the dedicated Paradise|Paradise lifecycle rendering test|Paradise\/Fima support ticket transcript/);
  assert.doesNotMatch(discordRuntimeSource, /Paradise lifecycle rendering test|Paradise fighter profile|Paradise Rank|PARADISE BLACKLIST|Paradise Dashboard|selected Paradise plan/);
  assert.doesNotMatch(discordRuntimeSource, /(?:setTitle|setDescription|setFooter|setName|setLabel)\([^\n)]*(?:Paradise|PARADISE)/);
  assert.doesNotMatch(discordRuntimeSource, /title:\s*["'`][^"'`\n]*(?:Paradise|PARADISE)/);
  assert.doesNotMatch(discordRuntimeSource, /PARADISE-TEST/);
  assert.match(discordRuntimeSource, /FIMA BOT ACTIVITY LEADERBOARD/);
  assert.match(discordRuntimeSource, /FIMA COMMUNITY RULES/);
  assert.match(discordRuntimeSource, /FIMA BOT DASHBOARD GUIDE/);
  assert.match(discordRuntimeSource, /fima-bot-support-\$\{record\.id\.slice\(0, 8\)\}\.txt/);
  assert.match(discordRuntimeSource, /fima-bot-challenge-\$\{ticket\.ticketId \|\| channel\.id\}\.txt/);
  assert.match(discordRuntimeSource, /https:\/\/fimamacro\.com\/fima-bot/);
  assert.doesNotMatch(discordRuntimeSource, /paradise-(?:support|challenge)-|https:\/\/fimamacro\.com\/paradise/);
  assert.match(discordRuntimeSource, /`Paradise \$\{suffix\}`/);
  assert.match(botPageSource, /<h3>FIMA Bot Clan<\/h3>/);
  assert.doesNotMatch(botPageSource, /alt="Paradise|<h3>Paradise/);
});

test("staff activity summary command describes its implemented private report", () => {
  assert.match(
    discordBotSource,
    /\.setName\("activity_summary"\)\s*\.setDescription\("Review a private staff activity summary for the selected period\."\)/
  );
  assert.doesNotMatch(discordBotSource, /Staff-only activity summary placeholder/);
  assert.match(
    discordBotSource,
    /interaction\.commandName === "activity_summary" \|\| interaction\.commandName === "staff_quota"/
  );
  assert.match(discordBotSource, /staffSummaryEmbed\(interaction\.commandName, period\)/);
});

test("capitalized Paradise literals are confined to exact legacy migration allowlists", () => {
  assert.deepEqual(capitalizedParadiseStringLiterals(discordBotSource).map(({ value }) => value), [
    "Paradise Content Studio"
  ]);
  assert.deepEqual(capitalizedParadiseStringLiterals(discordRuntimeSource).map(({ value }) => value), [
    "Paradise ",
    "Paradise "
  ]);
  assert.deepEqual(capitalizedParadiseStringLiterals(identitySource).map(({ value }) => value), [
    "Paradise",
    "Paradise Bot"
  ]);

  const publicLeaks = publicHtmlAndJavaScriptSources().flatMap(({ file, source }) => (
    capitalizedParadiseStringLiterals(source).map((match) => ({ file, ...match }))
  ));
  assert.deepEqual(publicLeaks, []);
});

test("legacy AutoMod identities are migration inputs and always reconcile to FIMA names", () => {
  const communityPolicy = paradiseAutoModRuleNamesForTemplate("community");
  const clanPolicy = paradiseAutoModRuleNamesForTemplate("clan");

  assert.equal(communityPolicy.link, "FIMA Invite & Scam Link Guard");
  assert.equal(communityPolicy.mention, "FIMA Mention Spam Guard");
  assert.equal(clanPolicy.link, "FIMA Bot Invite & Scam Link Guard");
  assert.equal(clanPolicy.mention, "FIMA Bot Mention Spam Guard");

  const legacyCommunity = planParadiseAutoModRuleReconciliation([
    "Paradise Invite & Scam Link Guard",
    "Paradise Mention Spam Guard"
  ], "community");
  assert.deepEqual(legacyCommunity.rules.map(({ desiredName, action }) => ({ desiredName, action })), [
    { desiredName: "FIMA Invite & Scam Link Guard", action: "rename" },
    { desiredName: "FIMA Mention Spam Guard", action: "rename" }
  ]);

  const currentClan = planParadiseAutoModRuleReconciliation([
    "FIMA Bot Invite & Scam Link Guard",
    "FIMA Bot Mention Spam Guard"
  ], "clan");
  assert.deepEqual(currentClan.rules.map(({ desiredName, action }) => ({ desiredName, action })), [
    { desiredName: "FIMA Bot Invite & Scam Link Guard", action: "keep" },
    { desiredName: "FIMA Bot Mention Spam Guard", action: "keep" }
  ]);
});

test("every public HTML surface hides the legacy product name from visible copy and accessibility metadata", () => {
  const publicLeaks = publicHtmlAndJavaScriptSources()
    .filter(({ file }) => file.toLowerCase().endsWith(".html"))
    .flatMap(({ file, source }) => (
      visibleHtmlLegacyBrandMatches(source).map(match => ({ file, ...match }))
    ));
  assert.deepEqual(publicLeaks, []);
});

test("legacy Paradise command aliases stay dispatcher-only and are never registered", () => {
  const registeredNames = paradiseCommands().map(command => command.toJSON().name);
  assert.equal(registeredNames.includes("paradisehelp"), false);
  assert.equal(registeredNames.includes("paradisetraining"), false);
  assert.equal(registeredNames.some(name => name.startsWith("paradise")), false);

  // Existing deployments can still dispatch stale Discord payloads while the
  // registered command surface remains entirely FIMA-branded.
  assert.match(discordRuntimeSource, /interaction\.commandName === "paradisehelp"/);
  assert.match(discordRuntimeSource, /interaction\.commandName === "paradisetraining" \|\| interaction\.commandName === "training"/);
});

test("public bot, dashboard and Content Studio copy never exposes the legacy product name", () => {
  const publicSurfaces = [
    botPageSource,
    applyPageSource,
    contentStudioSource,
    paradiseDashboardHtml({ clientId: "public-identity-test" })
  ];
  for (const source of publicSurfaces.map(visibleHtmlSurface)) {
    assert.doesNotMatch(source, />[^<]*(?:Paradise|PARADISE)[^<]*</);
    assert.doesNotMatch(source, /(?:aria-label|alt|title|placeholder)=["'][^"']*(?:Paradise|PARADISE)/);
  }
});

test("FIMA Bot marketing hub is parseable and delegates detailed jobs to focused pages", () => {
  const inlineScripts = [...botPageSource.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
  assert.ok(inlineScripts.length >= 1);
  assert.doesNotThrow(() => inlineScripts.forEach((script) => new Function(script)));
  assert.match(botPageSource, /id="languageSelect"/);
  assert.match(botPageSource, /id="themeSelect"/);
  assert.match(botPageSource, /rel="canonical" href="https:\/\/fimamacro\.com\/fima-bot"/);
  assert.match(botPageSource, /id="workspaces"/);
  for (const path of ["commands", "apply", "premium", "feedback", "dashboard", "invite"]) {
    assert.match(botPageSource, new RegExp(`href="/fima-bot/${path}"`));
  }
  assert.doesNotMatch(botPageSource, /id="(?:commands|applications|premium|feedback)"/);
  assert.doesNotMatch(botPageSource, /#commands,#applications,#premium,#feedback\{display:none\}/);
  assert.doesNotMatch(botPageSource, /commandSearch|commandEmpty|data-command=/);
  assert.match(commandsPageSource, /data-command-search/);
  assert.match(commandsPageSource, /data-command-empty/);
  assert.match(commandsPageSource, /data-command-card/);
  assert.match(premiumPageSource, /href="\/fima-bot\/feedback"/);
  assert.match(feedbackPageSource, /data-fima-surface="feedback"/);
  assert.match(botPageSource, /href="\/fima-bot\/invite"/);
  assert.match(botPageSource, /href="\/fima-bot\/dashboard"/);
  assert.doesNotMatch(botPageSource, /href="\/paradise-bot"/);
  assert.doesNotMatch(botPageSource, /href="\/paradise(?:\/invite)?"/);
  assert.doesNotMatch(botPageSource, /(?:Ã.|Â.|â€|ï¿½|�)/);
});

test("public FIMA surfaces share the teal obsidian identity and real navigation targets", () => {
  for (const source of [botPageSource, applyPageSource, contentStudioSource]) {
    assert.match(source, /data-fima-design-system="teal-obsidian"/);
    assert.match(source, /#20d(?:9ba|fbf)|#20e3c2/i);
  }
  assert.match(botPageSource, /<option value="violet-dragon">FIMA<\/option>/);
  assert.match(botPageSource, /href="\/fima-bot\/invite"/);
  assert.match(botPageSource, /href="\/fima-bot\/apply"/);
  assert.match(applyPageSource, /href="\/login\?returnTo=%2Ffima-bot%2Fapply"/);
  assert.match(applyPageSource, /href="https:\/\/api\.fimamacro\.com\/auth\/discord\/start\?returnTo=%2Ffima-bot%2Fapply"/);
  assert.match(contentStudioSource, /Library → Editor → Publish/);
  assert.match(contentStudioSource, /Test guild only/);
});

test("FIMA Bot application page exposes server-scoped staff and business routes", () => {
  assert.match(applyPageSource, /<h3>Community Staff<\/h3>/);
  assert.match(applyPageSource, /<h3>Clan Operations<\/h3>/);
  assert.match(applyPageSource, /<h3>Competitive \/ TSBTR<\/h3>/);
  assert.match(applyPageSource, /href="\/fima-bot\/apply\/staff"[^>]*>Staff<\/a>/);
  assert.match(applyPageSource, /href="\/fima-bot\/apply\/moderator"[^>]*>Moderator<\/a>/);
  assert.match(applyPageSource, /href="\/fima-bot\/apply\/event-staff"[^>]*>Event Staff<\/a>/);
  assert.match(applyPageSource, /href="\/fima-bot\/apply\/giveaway-staff"[^>]*>Giveaway Staff<\/a>/);
  assert.match(applyPageSource, /FIMA Support/);
  assert.match(applyPageSource, /Macro Staff/);
  assert.match(applyPageSource, /FFlag Staff/);
  assert.match(applyPageSource, /<h3>Partnership<\/h3>/);
  assert.match(applyPageSource, /<h3>Creator \/ Media Partner<\/h3>/);
  assert.match(applyPageSource, /Content, Video, Creative ve Development collaboration/);
  assert.match(applyPageSource, /<h3>Reseller \/ Affiliate<\/h3>/);
  assert.match(applyPageSource, /href="\/fima-bot\/apply\/helper"/);
  assert.match(applyPageSource, /href="\/fima-bot\/apply\/partnership"[^>]*data-application-workflow="business"/);
  assert.match(applyPageSource, /context\.types/);
  assert.match(applyPageSource, /Helper dahil hiçbir rol otomatik verilmez/);
  assert.doesNotMatch(applyPageSource, /Helper only|yalnız Helper'dır|Website-first Helper akışı|private ticket · Helper/);
});

test("account and commerce pages use the shared FIMA ecosystem shell", () => {
  for (const source of accountShellSources) {
    assert.match(source, /<title>[^<]+ \| FIMA<\/title>/);
    assert.match(source, /<strong>FIMA<\/strong>/);
    assert.match(source, /FIMA is the secure account, product and support hub for FIMA Macro, FIMA AI and FIMA Bot\./);
    assert.doesNotMatch(source, /<title>[^<]+ \| Fima Macro<\/title>|<strong>Fima Macro<\/strong>|Fima Account/);
  }
  assert.match(accountClientSource, /<strong>FIMA<\/strong>/);
  assert.match(accountClientSource, /"registerEyebrow":\s*"FIMA Account"/);
});
