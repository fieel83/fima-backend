import { createHash } from "node:crypto";
import { domainToASCII, domainToUnicode } from "node:url";

const OFFICIAL_HOSTS = ["discord.com", "discord.gg", "discord.gift", "discordapp.com", "roblox.com", "fimamacro.com"];
const DANGEROUS_FILE = /\.(?:exe|msi|scr|com|bat|cmd|ps1|js|vbs|jar|html?|svg)(?:[.\s]|$)/i;
const SHORTENERS = new Set(["bit.ly", "tinyurl.com", "t.co", "cutt.ly", "is.gd"]);
const hash = value => createHash("sha256").update(value).digest("hex");
const normalize = value => String(value || "").normalize("NFKC").replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g, "").toLowerCase();
const bounded = value => String(value || "").slice(0, 16000);

export function ftSafetyText({ content = "", embeds = [] } = {}) {
  return bounded([bounded(content), ...embeds.slice(0, 10).flatMap(embed => [
    embed.title, embed.description, embed.url, embed.author?.name, embed.author?.url,
    ...(embed.fields || []).slice(0, 25).flatMap(field => [field.name, field.value])
  ])].filter(Boolean).join("\n"));
}

export function ftSafetyHost(raw) {
  try {
    const url = new URL(raw);
    if (!["https:", "http:"].includes(url.protocol)) return null;
    const host = domainToASCII(url.hostname).toLowerCase().replace(/\.$/, "");
    const official = OFFICIAL_HOSTS.some(base => host === base || host.endsWith(`.${base}`));
    const skeleton = normalize(domainToUnicode(host)).replace(/[іıι]/g, "i").replace(/[оο]/g, "o").replace(/[аα]/g, "a").replace(/[еε]/g, "e").replace(/[^a-z0-9]/g, "");
    return { host, official, lookalike: !official && /discord|roblox|fimamacro/.test(skeleton), shortened: SHORTENERS.has(host), credentialUrl: Boolean(url.username || url.password) };
  } catch { return null; }
}

/** No URLs are followed. Evidence contains categories, hostnames and a hash, never message bodies. */
export function evaluateFtMessageSafety({ content = "", embeds = [], attachments = [], privateTicket = false, roleKeys = [], isOwner = false, config = {}, extractedText = "", qrDestinations = [], mediaScan = null } = {}) {
  const source = ftSafetyText({ content, embeds });
  const text = normalize(bounded([source, extractedText, ...qrDestinations.slice(0, 3)].join("\n")));
  const urls = [...text.matchAll(/https?:\/\/[^\s<>"`]+/g)].slice(0, 30).map(match => ftSafetyHost(match[0].replace(/[),.!?]+$/, ""))).filter(Boolean);
  const external = urls.some(url => !url.official);
  const lookalike = urls.some(url => url.lookalike || url.credentialUrl);
  const reward = /free\s+(?:nitro|robux)|(?:nitro|robux)\s+(?:gift|giveaway)|ücretsiz\s+(?:nitro|robux)|bedava\s+(?:nitro|robux)/.test(text);
  const influencer = /mr\.?\s*beast|influencer|youtuber/.test(text) && /giveaway|çekiliş|reward|ödül/.test(text);
  const callToAction = qrDestinations.length > 0 || /claim|redeem|verify|scan|login|log\s*in|giriş|doğrula|tara|hemen|limited|only today/.test(text);
  const paymentUnlock = /withdraw|withdrawal|cash\s*out|çekim|bakiy/.test(text) && /(?:pay|deposit|activation|unlock|yatır|ödeme|aktivasyon|kilit)/.test(text);
  const walletSecret = /(?:send|enter|share|provide|gönder|gir|paylaş).{0,45}(?:seed phrase|recovery phrase|private key|kurtarma kelime|özel anahtar|\.roblosecurity|session cookie)/.test(text);
  const educational = /(?:scam report|reporting a scam|this is a scam|beware|don't fall|do not scan|never share|don't share|dolandırıcılık bildir|dolandırıcı|sakın|taramayın|dikkat edin)/.test(normalize(source));
  const riskyAttachment = attachments.slice(0, 10).some(file => DANGEROUS_FILE.test(normalize(file.name || file.filename)) || /^(?:text\/html|application\/(?:javascript|x-msdownload|x-sh)|image\/svg\+xml)$/.test(String(file.contentType || file.content_type || "").toLowerCase()));
  const roles = new Set(roleKeys);
  const inviteApproved = isOwner || ["owner", "admin", "invite_approved"].some(role => roles.has(role));
  const hasInvite = /discord\s*\.\s*gg\s*\/|discord(?:app)?\.com\/invite\//.test(text);
  const evidence = [];
  if (lookalike) evidence.push("lookalike_or_credential_url");
  if (reward) evidence.push("reward_offer");
  if (influencer) evidence.push("influencer_giveaway");
  if (callToAction) evidence.push("call_to_action");
  if (paymentUnlock) evidence.push("payment_to_unlock_withdrawal");
  if (walletSecret) evidence.push("credential_or_wallet_secret_request");
  if (riskyAttachment) evidence.push("unsafe_attachment");
  if (extractedText) evidence.push("local_ocr_text");
  if (qrDestinations.length) evidence.push("qr_destination_decoded_not_followed");
  if (urls.some(url => url.shortened)) evidence.push("shortened_url_unresolved");
  const strongScam = paymentUnlock || walletSecret || (external && callToAction && (lookalike || (influencer && (reward || /cash|money|dollars|para|nakit/.test(text)))));
  let risk = strongScam || riskyAttachment ? "HIGH" : lookalike || (external && (reward || influencer)) || urls.some(url => url.shortened) ? "MEDIUM" : "LOW";
  const inviteBlocked = hasInvite && config.blockInvites !== false && !inviteApproved;
  if (inviteBlocked && risk === "LOW") risk = "MEDIUM";
  // Reports remain available to staff. Attachments are never executed, even inside tickets.
  const retainForReview = privateTicket || educational;
  const blocked = !retainForReview && (risk === "HIGH" || inviteBlocked);
  const reason = riskyAttachment ? "unsafe_attachment" : strongScam ? "combined_scam_evidence" : inviteBlocked ? "invite_not_approved" : risk !== "LOW" ? "staff_review" : null;
  return Object.freeze({ blocked, reason, risk, retainForReview, evidence, hosts: [...new Set(urls.map(url => url.host))].slice(0, 10),
    fingerprint: hash(source + JSON.stringify(attachments.slice(0, 10).map(file => [file.id, file.name, file.size, file.contentType]))),
    mediaScan: mediaScan || (attachments.length ? "not_scanned" : "no_attachments") });
}

/** Bounded edit deduplication and per-message serialization; no private content is retained. */
export function createFtSafetyProcessor({ maxEntries = 2000, ttlMs = 300000, now = Date.now } = {}) {
  const seen = new Map();
  const pending = new Map();
  return async function process({ message, safety, record }) {
    const key = `${message.guild.id}:${message.id}`;
    while (pending.has(key)) await pending.get(key).catch(() => null);
    const time = now();
    for (const [id, value] of seen) if (time - value.at > ttlMs) seen.delete(id);
    if (seen.get(key)?.fingerprint === safety.fingerprint) return safety.blocked;
    const operation = (async () => {
      let removed = false;
      let failureCode = null;
      if (safety.blocked) {
        try { await message.delete(); removed = true; }
        catch (error) { failureCode = String(error?.code || "delete_failed").slice(0, 80); }
      }
      if (safety.risk !== "LOW" || safety.blocked) await record({ channelId: message.channelId, authorId: message.author.id, messageId: message.id,
        reason: safety.reason, risk: safety.risk, evidence: safety.evidence, hosts: safety.hosts, fingerprint: safety.fingerprint,
        mediaScan: safety.mediaScan, retainedForReview: safety.retainForReview, removed, failureCode }).catch(() => null);
      if (removed) await message.author.send?.({ content: "FIMA removed a message containing unsafe content. If this was a mistake, open a support ticket for staff review. / Güvenli olmayan içerik kaldırıldı. Hata olduğunu düşünüyorsanız destek talebi açın.", allowedMentions: { parse: [] } }).catch(() => null);
      if (!safety.blocked || removed) {
        seen.delete(key);
        seen.set(key, { fingerprint: safety.fingerprint, at: time });
        while (seen.size > maxEntries) seen.delete(seen.keys().next().value);
      }
      return safety.blocked;
    })();
    pending.set(key, operation);
    try { return await operation; }
    finally { if (pending.get(key) === operation) pending.delete(key); }
  };
}
