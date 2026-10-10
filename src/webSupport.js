import crypto from 'node:crypto';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { prisma } from './db.js';

export const SUPPORT_GUILD = '1419335632324657306';
export const categories = ['Macro support', 'Payment / purchase / license', 'HWID / device', 'Account recovery', 'Fake Headless', 'Report a user', 'Scam / security', 'Partnership / business', 'Other'];
const prefix = 'web-support:v1:';
const key = id => prefix + 'ticket:' + id;
const now = () => new Date().toISOString();
const error = (code, status = 400) => Object.assign(new Error(code), { status, code });
export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const redact = value => String(value ?? '').replace(/\b(?:FIMA[-_])?[A-Z0-9]{5}(?:-[A-Z0-9]{5}){3,}\b/gi, '[license redacted]');
const text = (value, max) => redact(String(value ?? '').trim()).slice(0, max);
let gateway;
let ownerCheck;
export function configureSupportDiscord(value) { gateway = value; }
const safeSyncFailures = new Set(['transcript_log_unconfigured', 'transcript_log_ambiguous', 'transcript_log_not_private', 'transcript_log_acl_unverified', 'transcript_log_readback_failed', 'ticket_channel_not_private', 'ticket_channel_acl_unverified']);
export function supportSyncFailure(e) {
  if (safeSyncFailures.has(e?.message)) return e.message;
  return typeof e?.code === 'string' && /^[a-z][a-z0-9_]{0,63}$/.test(e.code) ? e.code : 'discord_unavailable';
}
export async function verifiedSupportOwner(discordId) {
  if (!ownerCheck) return false;
  const user = await prisma.user.findFirst({ where: { discordUserId: discordId } });
  if (!user) return false;
  const link = await prisma.oAuthLink.findFirst({ where: { userId: user.id, provider: 'discord' } });
  return !!(link?.providerSubject === discordId && await ownerCheck(user, link));
}

// Each ticket is a separately addressable durable record. Serializable transactions
// protect claims and deduplication across workers; no production schema migration.
export function createSupportStore(db = prisma) {
  const get = async id => (await db.setting.findUnique({ where: { key: key(id) } }))?.value || null;
  async function change(id, actor, fn) {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return await db.$transaction(async tx => {
          const row = await tx.setting.findUnique({ where: { key: key(id) } });
          if (!row) throw error('ticket_not_found', 404);
          const ticket = structuredClone(row.value);
          const result = await fn(ticket, tx);
          if (result === false) return ticket;
          if (!actor.noTouch) ticket.updatedAt = now();
          await tx.setting.update({ where: { key: key(id) }, data: { value: ticket } });
          await tx.auditLog.create({ data: { action: 'support_ticket_' + (actor.action || 'update'), targetType: 'support_ticket', targetId: id, metadata: { actorId: actor.id, guildId: ticket.guildId, revision: ticket.events.length } } });
          return ticket;
        }, { isolationLevel: 'Serializable' });
      } catch (e) { if (!['P2034', 'P2002'].includes(e.code) || attempt === 4) throw e; }
    }
  }
  async function create(actor, input) {
    const requestId = validateRequestId(input.requestId);
    const id = crypto.createHash('sha256').update(actor.id + ':' + requestId).digest('hex').slice(0, 20);
    const existing = await get(id);
    if (existing) return existing;
    const title = text(input.title, 120), description = text(input.description, 6000);
    if (!categories.includes(input.category) || title.length < 5 || description.length < 20) throw error('invalid_ticket_details');
    const attachments = validateAttachments(input.attachments);
    const details = {};
    for (const name of ['product', 'appVersion', 'errorCode', 'device', 'operatingSystem', 'attempts', 'reference', 'reportedUser', 'incidentTime']) if (input.details?.[name]) details[name] = text(input.details[name], 500);
    if (details.reference) details.reference = '…' + details.reference.slice(-4);
    const ticket = { id, guildId: SUPPORT_GUILD, ownerId: actor.id, discordUserId: actor.discordId || null, locale: input.locale === 'tr' ? 'tr' : 'en', title, category: input.category, details, priority: 'NORMAL', status: 'WAITING_FOR_STAFF', assignedTo: null, createdAt: now(), updatedAt: now(), sync: 'PENDING', channelId: null, channelDeleted: false, events: [], messages: [], transcripts: [] };
    ticket.messages.push({ id: requestId, authorId: actor.id, author: actor.name, role: 'customer', text: description, attachments, createdAt: now(), source: 'website', delivery: 'PENDING', internal: false });
    ticket.events.push({ type: 'created', actor: actor.name, at: now() });
    try {
      await db.$transaction(async tx => {
        await tx.setting.create({ data: { key: key(id), value: ticket } });
        await tx.auditLog.create({ data: { action: 'support_ticket_create', targetType: 'support_ticket', targetId: id, metadata: { actorId: actor.id, guildId: SUPPORT_GUILD } } });
      });
    } catch (e) { if (e.code !== 'P2002') throw e; return get(id); }
    return ticket;
  }
  return { get, change, create, async all() { return (await db.setting.findMany({ where: { key: { startsWith: prefix + 'ticket:' } } })).map(r => r.value); } };
}
export const store = createSupportStore();
export function validateRequestId(value) { if (!/^[\w-]{16,80}$/.test(String(value || ''))) throw error('request_id_required'); return value; }
export function validateAttachments(input = []) {
  if (!Array.isArray(input) || input.length > 4) throw error('attachment_count_limit');
  let total = 0;
  return input.map(file => {
    const name = String(file.name || '').replace(/[^\p{L}\p{N}._ -]/gu, '_').slice(0, 100);
    const ext = name.split('.').pop().toLowerCase();
    const mimes = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', pdf: 'application/pdf', txt: 'text/plain', log: 'text/plain', mp4: 'video/mp4', webm: 'video/webm' };
    if (!mimes[ext] || typeof file.data !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(file.data)) throw error('unsafe_attachment');
    const bytes = Buffer.from(file.data, 'base64');
    total += bytes.length;
    if (!bytes.length || bytes.length > 5 * 1024 * 1024 || total > 8 * 1024 * 1024) throw error('attachment_size_limit');
    const starts = hex => bytes.subarray(0, hex.length / 2).toString('hex') === hex;
    const valid = ext === 'png' ? starts('89504e470d0a1a0a') : ['jpg', 'jpeg'].includes(ext) ? starts('ffd8ff') : ext === 'gif' ? /^GIF8[79]a/.test(bytes.subarray(0,6).toString()) : ext === 'webp' ? bytes.subarray(0,4).toString() === 'RIFF' && bytes.subarray(8,12).toString() === 'WEBP' : ext === 'pdf' ? bytes.subarray(0,5).toString() === '%PDF-' : ext === 'mp4' ? bytes.subarray(4,8).toString() === 'ftyp' : ext === 'webm' ? starts('1a45dfa3') : !bytes.includes(0) && !/<\s*(?:script|html|svg|iframe)\b/i.test(bytes.toString());
    if (!valid) throw error('attachment_content_mismatch');
    return { id: crypto.randomUUID(), name, mime: mimes[ext], size: bytes.length, data: bytes.toString('base64'), scan: 'NOT_SCANNED' };
  });
}
export function canRead(ticket, actor) { return !!(ticket.guildId === actor.guildId && (ticket.ownerId === actor.id || actor.manage || (actor.work && (!actor.assignedOnly || ticket.assignedTo === actor.discordId)))); }
export function publicTicket(ticket, actor, page = 1) {
  const copy = structuredClone(ticket);
  delete copy.syncLease;
  copy.deleting = !!copy.deleting;
  const messages = copy.messages.filter(m => !m.internal || actor.work || actor.manage);
  copy.messageCount = messages.length;
  copy.messages = messages.slice(Math.max(0, messages.length - page * 40), Math.max(0, messages.length - (page - 1) * 40)).map(m => ({ ...m, attachments: m.attachments.map(({ data, ...f }) => f) }));
  copy.transcripts = copy.transcripts.map(({ html, ...t }) => t);
  copy.permissions = { work: !!actor.work, manage: !!actor.manage, delete: !!actor.delete, close: ticket.ownerId === actor.id || !!actor.work || !!actor.manage, reopen: ticket.ownerId === actor.id || !!actor.manage };
  return copy;
}
export function makeTranscript(ticket) {
  const tr = ticket.locale === 'tr';
  const labels = tr ? { 'Macro support':'Macro desteği', 'Payment / purchase / license':'Ödeme / satın alma / lisans', 'HWID / device':'HWID / cihaz', 'Account recovery':'Hesap kurtarma', 'Report a user':'Kullanıcı bildir', 'Scam / security':'Dolandırıcılık / güvenlik', 'Partnership / business':'İş ortaklığı / ticari', Other:'Diğer', WAITING_FOR_STAFF:'Destek yanıtı bekleniyor', WAITING_FOR_USER:'Yanıtınız bekleniyor', IN_PROGRESS:'İşlem sürüyor', ESCALATED:'Üst incelemede', CLOSED:'Kapalı', REOPENED:'Yeniden açıldı', created:'Oluşturuldu', claim:'Üstlenildi', assign:'Atandı', escalate:'Üst incelemeye alındı', close:'Kapatıldı', reopen:'Yeniden açıldı', channel_deleted:'Discord kanalı silindi', channel_delete_failed:'Discord kanalı silinemedi', account_linked:'Hesap bağlandı', customer:'Müşteri', staff:'Destek ekibi' } : { WAITING_FOR_STAFF:'Waiting for staff', WAITING_FOR_USER:'Waiting for user', IN_PROGRESS:'In progress', ESCALATED:'Escalated', CLOSED:'Closed', REOPENED:'Reopened', created:'Created', claim:'Claimed', assign:'Assigned', escalate:'Escalated', close:'Closed', reopen:'Reopened', channel_deleted:'Discord channel deleted', channel_delete_failed:'Discord channel deletion failed', account_linked:'Account linked', customer:'Customer', staff:'Support team' };
  const label = value => labels[value] || value;
  const date = value => Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString(tr ? 'tr-TR' : 'en-GB', { timeZone:'UTC' }) + ' UTC' : value;
  const participants = [...new Set(ticket.messages.filter(m => !m.internal).map(m => m.author))].join(', ');
  return '<!doctype html><html lang="' + (tr ? 'tr' : 'en') + '"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>FIMA ' + (tr ? 'destek talebi ' : 'ticket ') + escapeHtml(ticket.id) + '</title><style>*{box-sizing:border-box}body{font:16px system-ui;background:#0d0b18;color:#eee;max-width:900px;margin:32px auto;padding:24px;overflow-wrap:anywhere}h1{font-size:clamp(28px,4vw,36px)}article{border:1px solid #403459;padding:20px;margin:16px 0;border-radius:12px}p{white-space:pre-wrap;line-height:1.6}small{color:#c5bad7}a{color:#bfadff}@media(max-width:480px){body{margin:8px auto;padding:16px}article{padding:16px}}</style><h1>' + escapeHtml(ticket.title) + '</h1><p>' + escapeHtml(ticket.id + ' · ' + label(ticket.category) + ' · ' + label(ticket.status) + '\n' + (tr ? 'Katılımcılar: ' : 'Participants: ') + participants) + '</p>' + ticket.events.map(e => '<p>' + escapeHtml(date(e.at) + ' · ' + label(e.type) + ' · ' + e.actor + (e.reason ? ' · ' + e.reason : '')) + '</p>').join('') + ticket.messages.filter(m => !m.internal).map(m => '<article><strong>' + escapeHtml(m.author + ' · ' + label(m.role)) + '</strong><small> ' + escapeHtml(date(m.createdAt)) + '</small><p>' + escapeHtml(m.text) + '</p>' + m.attachments.map(f => '<p><a href="/api/support/tickets/' + encodeURIComponent(ticket.id) + '/files/' + encodeURIComponent(f.id) + '">' + escapeHtml(f.name) + '</a> · ' + f.size + (tr ? ' bayt · Zararlı yazılım taraması yapılmadı' : ' bytes · Not malware scanned') + '</p>').join('') + '</article>').join('') + '</html>';
}
export async function addMessage(id, actor, input, source = 'website') {
  const requestId = validateRequestId(input.requestId);
  const body = text(input.text, 6000), files = validateAttachments(input.attachments);
  if (!body && !files.length) throw error('message_required');
  return store.change(id, { id: actor.id, action: 'message' }, t => {
    if (!canRead(t, actor)) throw error('ticket_not_found', 404);
    if (t.deleting) throw error('ticket_busy', 409);
    if (t.status === 'CLOSED') throw error('ticket_closed', 409);
    if (input.internal && !actor.work && !actor.manage) throw error('staff_only', 403);
    if (t.messages.some(m => m.id === requestId)) return false;
    if (t.messages.length >= 500) throw error('ticket_message_limit', 409);
    if (t.messages.flatMap(m => m.attachments).reduce((sum, f) => sum + f.size, 0) + files.reduce((sum, f) => sum + f.size, 0) > 32 * 1024 * 1024) throw error('ticket_storage_limit', 409);
    const internal = !!input.internal;
    t.messages.push({ id: requestId, authorId: actor.id, author: actor.name, role: actor.id === t.ownerId ? 'customer' : 'staff', text: body, attachments: files, source, internal, createdAt: source === 'discord' && Number.isFinite(Date.parse(input.createdAt)) ? new Date(input.createdAt).toISOString() : now(), delivery: source === 'discord' || internal ? 'DELIVERED' : 'PENDING' });
    if (!internal) t.status = actor.id === t.ownerId ? 'WAITING_FOR_STAFF' : 'WAITING_FOR_USER';
  });
}
export async function ticketAction(id, actor, input) {
  const action = input.action;
  if (!['claim', 'assign', 'escalate', 'close', 'reopen', 'delete'].includes(action)) throw error('invalid_action');
  if (action === 'delete') {
    if (!gateway) throw error('discord_unavailable', 503);
    const operation = crypto.randomUUID();
    const reserved = await store.change(id, { id: actor.id, action: 'delete_reserved' }, t => {
      if (!canRead(t, actor)) throw error('ticket_not_found', 404);
      if (t.deleting) throw error('ticket_busy', 409);
      const transcript = t.transcripts.at(-1);
      if (!actor.delete || t.channelDeleted || t.status !== 'CLOSED' || !transcript?.verified || !transcript?.logMessageId || input.confirm !== t.channelId || input.secondConfirm !== true) throw error('delete_preconditions_failed', 403);
      t.deleting = operation;
    });
    try {
      await gateway.delete(reserved);
      return await store.change(id, { id: actor.id, action }, t => { t.deleting = null; t.channelDeleted = true; t.events.push({ type: 'channel_deleted', actor: actor.name, at: now() }); });
    } catch (e) {
      await store.change(id, { id: actor.id, action: 'delete_failed' }, t => { if (t.deleting === operation) t.deleting = null; t.events.push({ type: 'channel_delete_failed', actor: actor.name, at: now(), reason: String(e.code || 'discord_unavailable') }); });
      throw error('discord_delete_failed', 503);
    }
  }
  const result = await store.change(id, { id: actor.id, action }, t => {
    if (!canRead(t, actor)) throw error('ticket_not_found', 404);
    if (t.deleting) throw error('ticket_busy', 409);
    const ownLifecycle = t.ownerId === actor.id && ['close', 'reopen'].includes(action);
    if (!actor.work && !actor.manage && !ownLifecycle) throw error('staff_only', 403);
    if (['assign', 'reopen'].includes(action) && !actor.manage && !ownLifecycle) throw error('ticket_manage_required', 403);
    if (action === 'close' && t.status === 'CLOSED') return false;
    if (action === 'reopen' && t.status !== 'CLOSED') throw error('ticket_not_closed', 409);
    if (!['reopen'].includes(action) && t.status === 'CLOSED') throw error('ticket_closed', 409);
    const reason = text(input.reason, 1000);
    if (['close', 'escalate'].includes(action) && reason.length < 5) throw error('reason_required');
    if (action === 'claim') { if (t.assignedTo && t.assignedTo !== actor.discordId) throw error('already_claimed', 409); t.assignedTo = actor.discordId; t.status = 'IN_PROGRESS'; }
    if (action === 'assign') { if (!/^\d{17,20}$/.test(input.assignedTo || '')) throw error('invalid_assignee'); t.assignedTo = input.assignedTo; t.status = 'IN_PROGRESS'; }
    if (action === 'escalate') { t.status = 'ESCALATED'; t.priority = 'HIGH'; }
    if (action === 'reopen') { if (t.channelDeleted) { t.channelId = null; t.channelDeleted = false; } t.status = 'REOPENED'; t.sync = 'PENDING'; }
    if (action === 'close') t.status = 'CLOSED';
    t.events.push({ type: action, actor: actor.name, at: now(), reason, assignedTo: t.assignedTo });
    t.controlPending = true;
    if (action === 'close') { const html = makeTranscript(t); t.transcripts.push({ id: crypto.randomUUID(), at: now(), html, sha256: crypto.createHash('sha256').update(html).digest('hex'), verified: false, logMessageId: null }); }
  });
  if (action === 'close') {
    const saved = await store.get(id), transcript = saved.transcripts.at(-1);
    if (!transcript || crypto.createHash('sha256').update(transcript.html).digest('hex') !== transcript.sha256) throw error('transcript_readback_failed', 503);
    return store.change(id, { id: actor.id, action: 'transcript_verify' }, t => { t.transcripts.find(x => x.id === transcript.id).verified = true; });
  }
  return result;
}

let working = false;
export async function flushSupportOutbox() {
  if (working || !gateway) return;
  working = true;
  try {
    for (const candidate of await store.all()) {
      if (!candidate.discordUserId || candidate.channelDeleted) continue;
      if (candidate.status === 'CLOSED' && candidate.channelId && !candidate.controlPending && !candidate.syncError && !candidate.messages.some(m => !m.internal && m.delivery === 'PENDING') && !candidate.transcripts.some(t => t.verified && !t.logMessageId)) continue;
      const lease = crypto.randomUUID();
      let acquired = false, heartbeat;
      try {
        let t = await store.change(candidate.id, { id: 'worker', action: 'sync_lease', noTouch: true }, v => {
          if (v.deleting || v.syncLease?.until > Date.now()) return false;
          v.syncLease = { token: lease, until: Date.now() + 120000 }; acquired = true;
        });
        if (!acquired || t.syncLease?.token !== lease) continue;
        const renew = async () => { t = await store.change(t.id, { id: 'worker', action: 'sync_lease', noTouch: true }, v => { if (v.syncLease?.token !== lease || v.deleting) throw error('sync_lease_lost', 409); v.syncLease.until = Date.now() + 120000; }); };
        heartbeat = setInterval(() => { void renew().catch(() => {}); }, 30000); heartbeat.unref();
        if (!t.channelId) {
          const channelId = await gateway.ensureChannel(t);
          t = await store.change(t.id, { id: 'worker', action: 'discord_link' }, v => { if (v.syncLease?.token !== lease || v.deleting) throw error('sync_lease_lost', 409); v.channelId = channelId; v.sync = 'CONNECTED'; v.syncError = null; });
        }
        for (const m of t.messages.filter(m => !m.internal && m.delivery === 'PENDING')) {
          await renew();
          const discordMessageId = await gateway.send(t, m);
          await store.change(t.id, { id: 'worker', action: 'delivered' }, v => { if (v.syncLease?.token !== lease || v.deleting) throw error('sync_lease_lost', 409); const target = v.messages.find(x => x.id === m.id); target.delivery = 'DELIVERED'; target.discordMessageId = discordMessageId; });
        }
        if (t.controlPending) {
          await renew();
          const controlRevision = t.events.length, controlStatus = t.status, controlAssignee = t.assignedTo;
          await gateway.controls(t);
          await store.change(t.id, { id: 'worker', action: 'discord_controls' }, v => { if (v.syncLease?.token !== lease || v.deleting) throw error('sync_lease_lost', 409); if (v.events.length === controlRevision && v.status === controlStatus && v.assignedTo === controlAssignee) v.controlPending = false; });
        }
        if (gateway.reconcileMessages) await gateway.reconcileMessages(t);
        for (const transcript of t.transcripts.filter(x => x.verified && !x.logMessageId)) {
          await renew();
          const logMessageId = await gateway.logTranscript(t, transcript);
          await store.change(t.id, { id: 'worker', action: 'transcript_log' }, v => { if (v.syncLease?.token !== lease || v.deleting) throw error('sync_lease_lost', 409); v.transcripts.find(x => x.id === transcript.id).logMessageId = logMessageId; });
        }
        if (t.syncError) await store.change(t.id, { id: 'worker', action: 'sync_recovered' }, v => { if (v.syncLease?.token !== lease || v.deleting) return false; v.syncError = null; v.sync = 'CONNECTED'; });
      } catch (e) { if (acquired) await store.change(candidate.id, { id: 'worker', action: 'sync_failed' }, v => { if (v.syncLease?.token !== lease || v.deleting) return false; v.sync = 'PENDING'; v.syncError = supportSyncFailure(e); }).catch(() => {}); }
      finally { clearInterval(heartbeat); if (acquired) await store.change(candidate.id, { id: 'worker', action: 'sync_release', noTouch: true }, v => { if (v.syncLease?.token !== lease) return false; v.syncLease = null; }).catch(() => {}); }
    }
  } finally { working = false; }
}
export function startSupportWorker() { const timer = setInterval(() => { void flushSupportOutbox().catch(() => {}); }, 15000); timer.unref(); void flushSupportOutbox().catch(() => {}); return timer; }

export function supportRouter({ requireUser, ownerAccess }) {
  ownerCheck = ownerAccess;
  const router = express.Router();
  router.use(requireUser);
  router.use(rateLimit({ windowMs: 60000, limit: 60, standardHeaders: true, legacyHeaders: false }));
  router.use(express.json({ limit: '12mb' }));
  router.use(async (req, res, next) => {
    try {
      const link = await prisma.oAuthLink.findFirst({ where: { userId: req.user.id, provider: 'discord' }, select: { providerSubject: true } });
      const discordId = link?.providerSubject && link.providerSubject === req.user.discordUserId ? link.providerSubject : null;
      const owner = await ownerAccess(req.user, link);
      const grants = discordId && gateway ? await gateway.permissions(discordId).catch(() => ({})) : {};
      req.supportActor = { id: req.user.id, name: req.user.displayName || req.user.username || 'FIMA member', discordId, guildId: SUPPORT_GUILD, ...grants, ...(owner ? { work: true, manage: true, delete: true, assignedOnly: false } : {}) };
      if (discordId) {
        for (const ticket of (await store.all()).filter(t => t.ownerId === req.user.id && t.guildId === SUPPORT_GUILD && !t.discordUserId)) {
          await store.change(ticket.id, { id: req.user.id, action: 'account_link' }, t => {
            if (t.discordUserId) return false;
            t.discordUserId = discordId; t.sync = 'PENDING';
            t.events.push({ type: 'account_linked', actor: req.supportActor.name, at: now() });
          });
        }
      }
      next();
    } catch (e) { next(e); }
  });
  const route = fn => async (req, res, next) => { try { await fn(req, res); } catch (e) { next(e); } };
  async function read(req) { const t = await store.get(req.params.id); if (!t || !canRead(t, req.supportActor)) throw error('ticket_not_found', 404); return t; }
  router.get('/session', (req, res) => res.json({ actor: req.supportActor, categories, limits: { files: 4, eachBytes: 5242880, totalBytes: 8388608, scan: 'NOT_SCANNED' } }));
  router.get('/tickets', route(async (req, res) => {
    const actor = req.supportActor;
    let tickets = (await store.all()).filter(t => canRead(t, actor));
    if (req.query.workspace !== 'staff') tickets = tickets.filter(t => t.ownerId === actor.id);
    if (req.query.status === 'OPEN') tickets = tickets.filter(t => t.status !== 'CLOSED');
    else if (req.query.status === 'UNASSIGNED') tickets = tickets.filter(t => !t.assignedTo && t.status !== 'CLOSED');
    else if (req.query.status === 'ASSIGNED_TO_ME') tickets = tickets.filter(t => t.assignedTo === actor.discordId && t.status !== 'CLOSED');
    else if (req.query.status && req.query.status !== 'ALL') tickets = tickets.filter(t => t.status === req.query.status);
    if (req.query.priority) tickets = tickets.filter(t => (t.priority || 'NORMAL') === req.query.priority);
    if (req.query.category) tickets = tickets.filter(t => t.category === req.query.category);
    if (req.query.assignedTo) tickets = tickets.filter(t => t.assignedTo === req.query.assignedTo);
    const search = text(req.query.search, 100).toLowerCase();
    if (search) tickets = tickets.filter(t => (t.id + ' ' + t.title + ' ' + t.category).toLowerCase().includes(search));
    tickets.sort((a,b) => (req.query.sort === 'oldest' ? a.createdAt.localeCompare(b.createdAt) : b.updatedAt.localeCompare(a.updatedAt)));
    const page = Math.max(1, Math.min(10000, parseInt(req.query.page) || 1));
    res.json({ total: tickets.length, page, tickets: tickets.slice((page - 1) * 15, page * 15).map(t => ({ id: t.id, title: t.title, category: t.category, status: t.status, createdAt: t.createdAt, updatedAt: t.updatedAt, assignedTo: t.assignedTo, priority: t.priority || 'NORMAL', lastResponder: t.messages.filter(m => !m.internal).at(-1)?.author })) });
  }));
  router.post('/tickets', route(async (req, res) => { const t = await store.create(req.supportActor, req.body); res.status(201).json(publicTicket(t, req.supportActor)); void flushSupportOutbox().catch(() => {}); }));
  router.get('/tickets/:id', route(async (req, res) => { res.json(publicTicket(await read(req), req.supportActor, Math.max(1, parseInt(req.query.page) || 1))); }));
  router.post('/tickets/:id/messages', route(async (req, res) => { await read(req); res.json(publicTicket(await addMessage(req.params.id, req.supportActor, req.body), req.supportActor)); void flushSupportOutbox().catch(() => {}); }));
  router.post('/tickets/:id/actions', route(async (req, res) => {
    await read(req);
    if (req.body.action === 'assign' && (!gateway || !(await gateway.permissions(req.body.assignedTo)).work)) throw error('assignee_not_ticket_staff', 400);
    res.json(publicTicket(await ticketAction(req.params.id, req.supportActor, req.body), req.supportActor)); void flushSupportOutbox().catch(() => {});
  }));
  router.get('/tickets/:id/files/:fileId', route(async (req, res) => {
    const t = await read(req);
    const f = t.messages.filter(m => !m.internal || req.supportActor.work || req.supportActor.manage).flatMap(m => m.attachments).find(f => f.id === req.params.fileId);
    if (!f) throw error('file_not_found', 404);
    res.set({ 'Content-Type': f.mime, 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(f.name)}`, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store', 'Content-Security-Policy': "sandbox; default-src 'none'" }).send(Buffer.from(f.data, 'base64'));
  }));
  router.get('/tickets/:id/transcripts/:transcriptId', route(async (req, res) => {
    const t = await read(req), transcript = t.transcripts.find(x => x.id === req.params.transcriptId && x.verified);
    if (!transcript) throw error('transcript_unavailable', 404);
    res.set({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox allow-same-origin" }).send(transcript.html);
  }));
  router.use((err, req, res, next) => { if (res.headersSent) return next(err); res.status(err.status || 503).json({ error: err.code && !/^P\d/.test(err.code) ? err.code : 'support_unavailable' }); });
  return router;
}
