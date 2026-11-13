const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../src/wisdom-study-controller.js'), 'utf8');
function harness() {
  const events = [], requests = [], snapshots = [];
  class Xhr extends EventTarget {
    open(...args) { requests.push(['open', ...args]); return 'opened'; }
    send(...args) { requests.push(['send', ...args]); return 'sent'; }
    respond(payload, status = 200) { this.status = status; this.responseType = ''; this.responseText = JSON.stringify(payload); this.dispatchEvent(new Event('loadend')); }
  }
  let response = { code: 0, data: true };
  const fetchResult = Promise.resolve({ status: 200, clone: () => ({ json: async () => response }) });
  const page = { location: { href: 'https://wisdom-mooc.zhihuishu.com/study/index' }, XMLHttpRequest: Xhr,
    fetch(...args) { requests.push(['fetch', ...args]); return fetchResult; } };
  const original = { open: Xhr.prototype.open, send: Xhr.prototype.send, fetch: page.fetch };
  const observe = vm.runInNewContext(source + '\n;observeWisdomStudyReceipts', { URL, AbortController, setTimeout });
  const stop = observe(page, event => events.push(event), kind => { const item = { kind, revision: snapshots.length }; snapshots.push(item); return item; });
  return { Xhr, page, events, requests, snapshots, original, stop, fetchResult, setResponse: value => { response = value; } };
}
const endpoint = 'https://studyservice-api.zhihuishu.com/gateway/t/v1/learning/batchSaveLessonPopupExamSaveAnswer';
const progress = 'https://studyservice-api.zhihuishu.com/gateway/t/v1/learning/saveDatabaseIntervalTimeV2';

test('XHR observer preserves request method, payload and return values', () => {
  const h = harness(), xhr = new h.Xhr();
  assert.equal(xhr.open('POST', endpoint, true), 'opened');
  assert.equal(xhr.send('unchanged-payload'), 'sent');
  xhr.respond({ code: 0, data: true });
  assert.deepEqual(h.requests[1], ['send', 'unchanged-payload']);
  assert.equal(h.events[0].kind, 'popup');
  assert.equal(h.events[0].accepted, true);
  h.stop();
});

test('progress observer captures context at request send rather than response', () => {
  const h = harness(), xhr = new h.Xhr(); xhr.open('POST', progress); xhr.send('heartbeat');
  const captured = h.snapshots[0]; xhr.respond({ code: 200, data: true });
  assert.equal(h.events[0].context, captured);
  assert.equal(h.events[0].kind, 'progress'); h.stop();
});

test('other websites and unrelated requests are never observed', () => {
  const h = harness();
  for (const url of ['https://evilzhihuishu.com/batchSaveLessonPopupExamSaveAnswer', 'https://zhihuishu.com.evil.test/saveDatabaseIntervalTimeV2', '/other']) {
    const xhr = new h.Xhr(); xhr.open('POST', url); xhr.send('payload'); xhr.respond({ code: 0 });
  }
  assert.equal(h.events.length, 0); assert.equal(h.snapshots.length, 0); h.stop();
});

test('website rejection and unknown payload are not accepted', () => {
  const h = harness();
  for (const payload of [{ code: 500 }, { code: 0, data: false }, { code: 0, success: false }, null]) {
    const xhr = new h.Xhr(); xhr.open('POST', endpoint); xhr.send(); xhr.respond(payload);
  }
  assert(h.events.every(event => !event.accepted)); assert.equal(h.events[3].unknown, true); h.stop();
});

test('fetch observer returns original promise and never consumes original response', async () => {
  const h = harness(); const payload = { method: 'POST', body: 'untouched' };
  const result = h.page.fetch(endpoint, payload);
  assert.equal(result, h.fetchResult); assert.equal(h.requests[0][2], payload);
  await result; await new Promise(setImmediate);
  assert.equal(h.events[0].accepted, true); h.stop();
});

test('dispose restores original methods and removes pending XHR listeners', () => {
  const h = harness(), xhr = new h.Xhr(); xhr.open('POST', endpoint); xhr.send(); h.stop(); xhr.respond({ code: 0 });
  assert.equal(h.events.length, 0); assert.equal(h.Xhr.prototype.open, h.original.open);
  assert.equal(h.Xhr.prototype.send, h.original.send); assert.equal(h.page.fetch, h.original.fetch);
});

test('dispose does not overwrite a later third-party wrapper', () => {
  const h = harness(); const wrapper = function () {}; h.Xhr.prototype.send = wrapper; h.page.fetch = wrapper; h.stop();
  assert.equal(h.Xhr.prototype.send, wrapper); assert.equal(h.page.fetch, wrapper);
});

test('distribution activates the new controller and skips legacy global hooks only for wisdom study', () => {
  const bundle = fs.readFileSync(path.join(__dirname, '../course-helper.user.js'), 'utf8');
  assert.match(bundle, /wisdom-mooc\.zhihuishu\.com\/study\/index", logic: useWisdomStudyLogic/);
  assert.match(bundle, /if \(url\.includes\("zhihuishu\.com"\) && !isWisdomStudyPage\(\)\)/);
  assert(!bundle.includes('const useZhsStudyLogic ='));
  assert.match(bundle, /AI随堂练习自动答题/);
});
