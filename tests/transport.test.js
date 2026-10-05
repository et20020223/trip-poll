import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';

test('transport validates deployment URL, Google origin, nonce and response window', async () => {
  const source = readFileSync(new URL('../web/transport.js',import.meta.url),'utf8').replace('export function createTransport','function createTransport');
  let listener, iframe; const calls = [], timers = new Map(); let timerId = 0;
  const context = vm.createContext({
    URL, crypto:webcrypto,
    setTimeout: fn => { timers.set(++timerId,fn); return timerId; }, clearTimeout: id => timers.delete(id),
    document: { createElement: () => ({}), body:{append: node => {iframe = node;}} },
    window:{addEventListener:(type,fn) => {listener = fn;}}
  });
  vm.runInContext(source,context);
  assert.throws(() => context.createTransport('https://evil.invalid/macros/s/id/exec'), /格式錯誤/);
  assert.throws(() => context.createTransport('https://script.google.com/macros/s/id/dev'), /格式錯誤/);
  const request = context.createTransport('https://script.google.com/macros/s/id/exec');
  const channel = new URL(iframe.src).searchParams.get('channel');
  const target = {postMessage:(m,origin) => calls.push({m,origin})};
  const origin = 'https://n-123-0lu-script.googleusercontent.com';
  const ready = {protocol:'trip-poll-v2',channel,type:'ready'};
  listener({origin:'https://evil.invalid',source:target,data:ready});
  listener({origin,source:target,data:{...ready,channel:'wrong'}});
  const result = request({action:'load',token:'a'.repeat(64)});
  await Promise.resolve(); assert.equal(calls.length,0);
  listener({origin,source:target,data:ready});
  await Promise.resolve(); assert.equal(calls.length,1);
  assert.equal(calls[0].origin,origin);
  const reply = {protocol:'trip-poll-v2',channel,type:'response',id:calls[0].m.id,result:{confirmed:true}};
  let completed = false; result.then(() => {completed = true;});
  listener({origin,source:{},data:reply});
  listener({origin:'https://evil.invalid',source:target,data:reply});
  await Promise.resolve(); assert.equal(completed,false);
  listener({origin,source:target,data:reply});
  assert.equal((await result).confirmed,true);
  assert.equal(timers.size,0);
  const save = request({action:'vote'});
  await Promise.resolve(); [...timers.values()][0]();
  await assert.rejects(save,/尚未收到儲存確認/);
});
