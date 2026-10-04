import test from 'node:test';
import assert from 'node:assert/strict';
import { paradiseWorkspaceReadModel } from '../src/paradiseWorkspaceReadModel.js';

test('owner workspace projects only selected guild records and excludes private fields', () => {
  const record = {id:'a', guildId:'g1', status:'pending', createdAt:'2026-09-30', answers:{question:'answer'}, token:'secret', evidence:[{privatePath:'/private',token:'secret'}]};
  const model = paradiseWorkspaceReadModel({applications:{g1:{a:record,wrong:{...record,guildId:'g2'}},g2:{a:record}},giveaways:{a:record,b:{...record,guildId:'g2'}}},'g1');
  assert.equal(model.applications.total,1);
  assert.equal(model.events.total,1);
  assert.equal(model.applications.counts.pending,1);
  assert.equal(model.applications.items[0].evidenceCount,1);
  assert.deepEqual(model.applications.items[0].answers,[{key:'question',value:'answer'}]);
  assert.doesNotMatch(JSON.stringify(model),/secret|privatePath|\/private/);
});

test('workspace caps rows without changing authoritative totals and handles prototype status names', () => {
  const rows = Object.fromEntries(Array.from({length:205},(_,i)=>[i,{id:String(i),status:i===0?'__proto__':'open',createdAt:`2026-09-${String(1+i%30).padStart(2,'0')}`} ]));
  const result = paradiseWorkspaceReadModel({supportTickets:{g:rows}},'g').tickets;
  assert.equal(result.total,205);
  assert.equal(result.items.length,200);
  assert.equal(result.truncated,true);
  assert.equal(result.counts.__proto__,1);
  assert.equal(result.counts.open,204);
  assert.ok(result.items[0].createdAt>=result.items.at(-1).createdAt);
});

test('missing queues and activity produce honest empty states', () => {
  const model = paradiseWorkspaceReadModel({},'g');
  for(const key of ['applications','tickets','moderation','events']) assert.equal(model[key].total,0);
  assert.deepEqual(model.activity,[]);
});
