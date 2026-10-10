import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import express from 'express';
import { ChannelType, PermissionsBitField } from 'discord.js';
import { verifyTicketPrivacy } from '../src/webSupportDiscord.js';
import { prisma } from '../src/db.js';
import { createSupportStore, store, SUPPORT_GUILD, categories, canRead, validateAttachments, publicTicket, makeTranscript, addMessage, ticketAction, configureSupportDiscord, flushSupportOutbox, supportRouter } from '../src/webSupport.js';

function database() {
  const rows = new Map(), audit = [];
  const db = { setting: {
    async findUnique({where}) { return rows.has(where.key) ? { value: structuredClone(rows.get(where.key)) } : null; },
    async findMany() { return [...rows.values()].map(value => ({value: structuredClone(value)})); },
    async create({data}) { if(rows.has(data.key)) throw Object.assign(new Error(), {code:'P2002'}); rows.set(data.key, structuredClone(data.value)); },
    async update({where,data}) { rows.set(where.key, structuredClone(data.value)); }
  }, auditLog: { async create({data}) { audit.push(data); } } };
  let queue = Promise.resolve();
  db.$transaction = fn => { const run = queue.then(() => fn(db)); queue = run.catch(() => {}); return run; };
  return {db, audit};
}
const customer = {id:'customer-a', name:'A <script>alert(1)</script>', discordId:'123456789012345678', guildId:SUPPORT_GUILD};
const staff = {id:'staff-a', name:'Staff', discordId:'223456789012345678', guildId:SUPPORT_GUILD, work:true, manage:true, delete:true};
const input = () => ({requestId:crypto.randomUUID(), category:categories[0], title:'Timing help <script>', description:'Please help with this timing issue. <script>alert(1)</script>', attachments:[]});

test('archives localize safely and preserve private-note exclusion and legacy English', () => {
  const ticket = {id:'archive', title:'Title <script>', category:categories[0], status:'CLOSED', events:[{type:'close',actor:'Staff',at:'2026-10-10T12:00:00Z',reason:'Done <img>'}], messages:[{author:'Customer <script>',role:'customer',createdAt:'2026-10-10T12:00:00Z',text:'Public <script>',attachments:[{id:'file',name:'proof <img>.png',size:123}]},{author:'Staff',internal:true,text:'PRIVATE NOTE',attachments:[]}]};
  const en = makeTranscript(ticket), tr = makeTranscript({...ticket,locale:'tr'});
  assert.match(en, /lang="en"/); assert.match(en, /Participants: /); assert.match(en, /Not malware scanned/); assert.match(en, /Macro support · Closed/);
  assert.match(tr, /lang="tr"/); assert.match(tr, /Katılımcılar: /); assert.match(tr, /Macro desteği · Kapalı/); assert.match(tr, /Kapatıldı/); assert.match(tr, /Zararlı yazılım taraması yapılmadı/);
  for (const html of [en,tr]) { assert.doesNotMatch(html, /PRIVATE NOTE|<script>|<img>/); assert.match(html, /&lt;script&gt;/); assert.match(html, /overflow-wrap:anywhere/); assert.match(html, /UTC/); }
  assert.match(makeTranscript({...ticket,locale:'tr',status:'FUTURE_STATUS'}), /FUTURE_STATUS/);
});

test('Discord reassignment revokes recorded former assignees and rejects unexpected grants', async () => {
  const cache = new Map(), removed = [];
  const grant = id => cache.set(id, { id, type:1, allow:new PermissionsBitField([PermissionsBitField.Flags.ViewChannel]), async delete() { removed.push(id); cache.delete(id); } });
  const t = {id:'privacy-test',discordUserId:customer.discordId,assignedTo:staff.discordId,events:[{type:'assign',assignedTo:'former-staff'}]};
  const c = {type:ChannelType.GuildText,guildId:SUPPORT_GUILD,topic:`FIMA website ticket:${t.id}; owner:${t.discordUserId}`,guild:{roles:{everyone:{}},members:{me:{id:'bot'}}},permissionsFor:()=>new PermissionsBitField(),permissionOverwrites:{cache}};
  for (const id of ['bot',customer.discordId,staff.discordId,'former-staff']) grant(id);
  await verifyTicketPrivacy(c,t,[]);
  assert.deepEqual(removed,['former-staff']);
  assert.equal(cache.size,3);
  grant('unexpected-member');
  await assert.rejects(verifyTicketPrivacy(c,t,[]),/ticket_channel_acl_unverified/);
  assert.equal(cache.has('unexpected-member'),true);
  grant('former-staff'); c.guildId='other-guild';
  await assert.rejects(verifyTicketPrivacy(c,t,[]),/ticket_channel_not_private/);
  assert.equal(cache.has('former-staff'),true);
});

test('ticket isolation, guild scope and assignment-only staff', () => {
  const t = {ownerId:customer.id, guildId:SUPPORT_GUILD, assignedTo:staff.discordId};
  assert.equal(canRead(t,customer), true);
  assert.equal(canRead(t,{...customer,id:'other'}), false);
  assert.equal(canRead(t,{...staff,guildId:'other'}), false);
  assert.equal(canRead(t,{...staff,manage:false,assignedOnly:true}), true);
  assert.equal(canRead(t,{...staff,manage:false,assignedOnly:true,discordId:'other'}), false);
});

test('HTTP router enforces authenticated ownership, verified Discord grants and private artifacts', async () => {
  const {db} = database(); Object.assign(store,createSupportStore(db));
  const originalLink = prisma.oAuthLink.findFirst;
  prisma.oAuthLink.findFirst = async ({where}) => ({providerSubject: where.userId === staff.id ? staff.discordId : customer.discordId});
  configureSupportDiscord({async permissions(id) { return id === staff.discordId ? {work:true,manage:true,delete:true} : {}; }});
  const t = await store.create(customer,{...input(),attachments:[{name:'diagnostic.txt',data:Buffer.from('Private diagnostic').toString('base64')}]});
  await addMessage(t.id,staff,{requestId:crypto.randomUUID(),text:'PRIVATE_STAFF_NOTE',internal:true,attachments:[{name:'internal.txt',data:Buffer.from('Private staff attachment').toString('base64')}]});
  const closed = await ticketAction(t.id,staff,{action:'close',reason:'HTTP artifact test'});
  const app = express();
  app.use('/api/support',supportRouter({requireUser(req,res,next) {
    const id = req.headers['x-test-user'];
    if (!id) return res.status(401).json({error:'authentication_required'});
    req.user = {id,username:id,discordUserId:req.headers['x-test-discord'] || customer.discordId}; next();
  },ownerAccess:async()=>false}));
  const server = app.listen(0,'127.0.0.1'); await new Promise(r=>server.once('listening',r));
  const base = `http://127.0.0.1:${server.address().port}/api/support`;
  const request = (path,id,options={}) => fetch(base+path,{...options,headers:{...(id?{'x-test-user':id}:{}),...options.headers}});
  try {
    assert.equal((await request('/tickets')).status,401);
    const publicFile = `/tickets/${t.id}/files/${closed.messages[0].attachments[0].id}`;
    const noteFile = `/tickets/${t.id}/files/${closed.messages[1].attachments[0].id}`;
    const transcript = `/tickets/${t.id}/transcripts/${closed.transcripts[0].id}`;
    for (const path of [`/tickets/${t.id}`,publicFile,noteFile,transcript]) assert.equal((await request(path,'intruder')).status,404,path);
    const detail = await (await request(`/tickets/${t.id}`,customer.id)).json();
    assert.ok(!JSON.stringify(detail).includes('PRIVATE_STAFF_NOTE'));
    assert.ok(!JSON.stringify(detail).includes('Private diagnostic'));
    assert.equal((await request(noteFile,customer.id)).status,404);
    const file = await request(publicFile,customer.id);
    assert.equal(file.status,200); assert.equal(await file.text(),'Private diagnostic');
    assert.equal(file.headers.get('x-content-type-options'),'nosniff');
    assert.match(file.headers.get('cache-control'),/no-store/);
    const archive = await request(transcript,customer.id);
    assert.equal(archive.status,200); assert.ok(!(await archive.text()).includes('PRIVATE_STAFF_NOTE'));
    const forged = await (await request('/session','intruder',{headers:{'x-test-discord':staff.discordId}})).json();
    assert.equal(forged.actor.discordId,null); assert.ok(!forged.actor.work);
    const legitimate = await (await request('/session',staff.id,{headers:{'x-test-discord':staff.discordId}})).json();
    assert.equal(legitimate.actor.work,true);
    assert.equal((await request(noteFile,staff.id,{headers:{'x-test-discord':staff.discordId}})).status,200);
    const denied = await request(`/tickets/${t.id}/actions`,customer.id,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'claim'})});
    assert.equal(denied.status,403);
    assert.equal((await (await request('/tickets?workspace=staff','intruder')).json()).total,0);
  } finally { await new Promise(r=>server.close(r)); prisma.oAuthLink.findFirst=originalLink; configureSupportDiscord(null); }
});
test('attachment extension, content, size and count gates', () => {
  assert.throws(() => validateAttachments([{name:'safe.png',data:Buffer.from('<script>bad</script>').toString('base64')}]), /attachment_content_mismatch/);
  assert.throws(() => validateAttachments([{name:'x.svg',data:'YWJj'}]), /unsafe_attachment/);
  assert.throws(() => validateAttachments(Array(5).fill({name:'x.txt',data:'YWJj'})), /attachment_count_limit/);
  assert.throws(() => validateAttachments([{name:'x.txt',data:Buffer.alloc(5242881,65).toString('base64')}]), /attachment_size_limit/);
  const [file] = validateAttachments([{name:'../../my.log',data:Buffer.from('Diagnostic line').toString('base64')}]);
  assert.equal(file.scan,'NOT_SCANNED'); assert.equal(file.mime,'text/plain'); assert.ok(!file.name.includes('/'));
});
test('durable lifecycle: deduplication, notes, concurrent claims, transcript, delete guard, reopen, offline retry', async () => {
  const {db,audit} = database(); Object.assign(store,createSupportStore(db));
  const request = input(), t = await store.create(customer,request);
  assert.equal((await store.create(customer,request)).id,t.id);
  assert.equal((await store.all()).length,1);
  await assert.rejects(addMessage(t.id,{...customer,id:'other'},{requestId:crypto.randomUUID(),text:'Intrusion'}), /ticket_not_found/);
  await assert.rejects(addMessage(t.id,customer,{requestId:crypto.randomUUID(),text:'secret',internal:true}), /staff_only/);
  const claims = await Promise.allSettled([ticketAction(t.id,staff,{action:'claim'}),ticketAction(t.id,{...staff,id:'staff-b',discordId:'323456789012345678'},{action:'claim'})]);
  assert.equal(claims.filter(x => x.status === 'fulfilled').length,1);
  assert.equal(claims.find(x => x.status === 'rejected').reason.code,'already_claimed');
  const note = {requestId:crypto.randomUUID(),text:'CONFIDENTIAL_NOTE',internal:true};
  await addMessage(t.id,staff,note); await addMessage(t.id,staff,note);
  const reply = {requestId:crypto.randomUUID(),text:'Reply from Discord',createdAt:'2026-10-10T12:00:00.000Z'};
  await addMessage(t.id,staff,reply,'discord');
  const beforeClose = await store.get(t.id);
  assert.equal(beforeClose.messages.filter(m=>m.id===note.requestId).length,1);
  assert.ok(!publicTicket(beforeClose,customer).messages.some(m=>m.internal));
  assert.equal(beforeClose.messages.at(-1).delivery,'DELIVERED');
  await assert.rejects(ticketAction(t.id,staff,{action:'close',reason:''}), /reason_required/);
  const closed = await ticketAction(t.id,staff,{action:'close',reason:'Resolved safely'});
  assert.equal(closed.transcripts[0].verified,true);
  assert.ok(!closed.transcripts[0].html.includes('<script>'));
  assert.ok(!closed.transcripts[0].html.includes('CONFIDENTIAL_NOTE'));
  assert.equal(crypto.createHash('sha256').update(closed.transcripts[0].html).digest('hex'), closed.transcripts[0].sha256);
  await ticketAction(t.id,staff,{action:'close',reason:'Repeated close'});
  assert.equal((await store.get(t.id)).transcripts.length,1);
  configureSupportDiscord({ async delete(){throw new Error('must never execute');} });
  await assert.rejects(ticketAction(t.id,staff,{action:'delete',confirm:'wrong',secondConfirm:true}), /delete_preconditions_failed/);
  assert.equal((await store.get(t.id)).channelDeleted,false);
  const reopened = await ticketAction(t.id,staff,{action:'reopen'});
  assert.equal(reopened.id,t.id); assert.equal(reopened.status,'REOPENED');
  configureSupportDiscord({ async ensureChannel(){throw Object.assign(new Error(), {code:'discord_offline'});} });
  await flushSupportOutbox();
  assert.equal((await store.get(t.id)).sync,'PENDING');
  assert.equal((await store.get(t.id)).messages[0].delivery,'PENDING');
  let sends=0, controls=0;
  configureSupportDiscord({async ensureChannel(){return '423456789012345678';},async send(){sends++;return '523456789012345678';},async controls(){controls++;},async logTranscript(){return '623456789012345678';}});
  await flushSupportOutbox(); await flushSupportOutbox();
  assert.equal(sends,1); assert.equal(controls,1);
  assert.equal((await store.get(t.id)).messages[0].delivery,'DELIVERED');
  assert.ok(audit.some(x=>x.action==='support_ticket_sync_failed'));
  assert.ok(audit.some(x=>x.action==='support_ticket_transcript_verify'));
  // Deletion reservation prevents a concurrent reopen while Discord is running.
  await ticketAction(t.id,staff,{action:'close',reason:'Final resolution'});
  await flushSupportOutbox();
  let release; const waiting = new Promise(r=>release=r);
  configureSupportDiscord({async delete(){await waiting;}});
  const deleting = ticketAction(t.id,staff,{action:'delete',confirm:'423456789012345678',secondConfirm:true});
  await new Promise(r=>setImmediate(r));
  await assert.rejects(ticketAction(t.id,staff,{action:'reopen'}),/ticket_busy/);
  release(); await deleting;
  assert.equal((await store.get(t.id)).channelDeleted,true);
  assert.ok((await store.get(t.id)).messages.length > 0);
});
