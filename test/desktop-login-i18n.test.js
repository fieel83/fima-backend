import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const script=fs.readFileSync(new URL('../public/assets/js/desktop-login-i18n.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../public/desktop-login.html',import.meta.url),'utf8');
const login=fs.readFileSync(new URL('../public/assets/js/desktop-login.js',import.meta.url),'utf8');
function render(language, languages=['tr']) {
 const nodes=[...html.matchAll(/>([^<>]+)</g)].map(match=>({nodeValue:match[1],parentElement:{closest:()=>null}}));
 let index=-1;
 const document={body:{},documentElement:{},querySelectorAll:()=>[],createTreeWalker:()=>({nextNode:()=>++index<nodes.length,get currentNode(){return nodes[index];}})};
 const context={document,window:{},location:{search:'?lang='+encodeURIComponent(language)},navigator:{languages},URLSearchParams};
 vm.runInNewContext(script,context);
 return {...context,nodes};
}
test('all Macro languages translate browser approval, terminal statuses and account templates',()=>{
 const statusSources=[...login.matchAll(/setStatus\("([^"]+)", "([^"]+)"/g)].flatMap(match=>match.slice(1,3));
 for(const lang of ['en','de','fr','es','pt','bs','ru','pl','ar']) {
  const context=render(lang);const {t}=context.window.FIMA_DESKTOP_I18N;
  assert.equal(context.document.documentElement.lang,lang);
  assert.equal(context.document.documentElement.dir,lang==='ar'?'rtl':'ltr');
  for(const source of statusSources) assert.notEqual(t(source),source,`${lang}: ${source}`);
  assert.ok(context.nodes.some(node=>node.nodeValue===t('Hesabını bu cihaza bağla.')));
  assert.ok(t('{name} olarak devam et',{name:'fieel'}).includes('fieel'));
  assert.ok(t('Sen {name} misin?',{name:'<img onerror=evil>'}).includes('<img onerror=evil>'));
 }
});
test('unsupported language falls back to supported browser preference',()=>{
 assert.equal(render('unknown',['ru-RU']).document.documentElement.lang,'ru');
 assert.equal(render('unknown',['unknown']).document.documentElement.lang,'en');
 assert.equal(render('DE-de').document.documentElement.lang,'de');
});
