const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../src/wisdom-study-controller.js'), 'utf8');

function harness() {
  const video = { isConnected: true, currentSrc: 'https://example.invalid/one.mp4', getAttribute: () => '' };
  const container = { isConnected: true, contains: node => node === video };
  const root = { isConnected: true, contains: node => node === video };
  let calls = 0, receiver;
  const callback = { playerNext() { calls++; receiver = this; } };
  const instance = { id: 'container', options: { id: 101, control: { nextBtn: true } }, player: { el: () => root }, callback };
  const state = { instance, containers: [container] };
  const page = {
    location: { hostname: 'wisdom-mooc.zhihuishu.com', pathname: '/study/index', href: 'https://wisdom-mooc.zhihuishu.com/study/index?recruitAndCourseId=test' },
    document: { querySelectorAll: () => state.containers },
    PlayerStarter: { get(id) { assert.equal(id, 'container'); return state.instance; } }
  };
  const sandbox = {};
  vm.runInNewContext(source + '\nthis.createNavigation = createWisdomStudyNavigation;', sandbox);
  const navigation = sandbox.createNavigation(page);
  return { page, video, root, callback, instance, state, navigation, calls: () => calls, receiver: () => receiver };
}

test('native next invokes only the website callback with its original receiver', () => {
  const h = harness();
  const plan = h.navigation.prepare(h.video, h.video.currentSrc);
  assert.equal(h.calls(), 0);
  plan.invoke(() => true);
  assert.equal(h.calls(), 1);
  assert.equal(h.receiver(), h.callback);
});

test('lesson navigation key remains stable across refreshed signed media URLs', () => {
  const h = harness();
  const first = h.navigation.prepare(h.video, h.video.currentSrc).key;
  h.video.currentSrc += '?signature=changed';
  assert.equal(h.navigation.prepare(h.video, h.video.currentSrc).key, first);
  h.instance.options.id = 102;
  assert.notEqual(h.navigation.prepare(h.video, h.video.currentSrc).key, first);
});

for (const [name, mutate] of [
  ['wrong origin', h => { h.page.location.hostname = 'example.com'; }],
  ['wrong route', h => { h.page.location.pathname = '/exam'; }],
  ['missing player', h => { h.state.instance = null; }],
  ['missing callback', h => { h.callback.playerNext = null; }],
  ['disabled native next', h => { h.instance.options.control.nextBtn = false; }],
  ['missing lesson identity', h => { h.instance.options.id = ''; }],
  ['ambiguous containers', h => { h.state.containers.push(h.state.containers[0]); }],
  ['detached video', h => { h.video.isConnected = false; }],
  ['different player video', h => { h.instance.player.el = () => ({ isConnected: true, contains: () => false }); }],
  ['video outside the native container', h => { h.state.containers[0].contains = () => false; }]
]) {
  test(`native next rejects ${name}`, () => {
    const h = harness(); mutate(h);
    assert.throws(() => h.navigation.prepare(h.video, h.video.currentSrc));
    assert.equal(h.calls(), 0);
  });
}

for (const [name, mutate] of [
  ['source changed', h => { h.video.currentSrc = 'https://example.invalid/two.mp4'; }],
  ['player replaced', h => { h.state.instance = { ...h.instance }; }],
  ['callback replaced', h => { h.callback.playerNext = () => { throw new Error('must not call replacement'); }; }],
  ['lesson changed', h => { h.instance.options.id = 102; }]
]) {
  test(`native next rechecks ${name} immediately before invocation`, () => {
    const h = harness(), plan = h.navigation.prepare(h.video, h.video.currentSrc);
    mutate(h);
    assert.throws(() => plan.invoke(() => true));
    assert.equal(h.calls(), 0);
  });
}

test('native next honors cancellation immediately before invocation', () => {
  const h = harness(), plan = h.navigation.prepare(h.video, h.video.currentSrc);
  assert.throws(() => plan.invoke(() => false));
  assert.equal(h.calls(), 0);
});

test('native callback exceptions propagate without a DOM-click fallback', () => {
  const h = harness(); h.callback.playerNext = () => { throw new Error('website refused'); };
  const plan = h.navigation.prepare(h.video, h.video.currentSrc);
  assert.throws(() => plan.invoke(() => true), /website refused/);
  assert.equal(h.calls(), 0);
});

test('one native navigation plan cannot invoke its callback twice', () => {
  const h = harness(), plan = h.navigation.prepare(h.video, h.video.currentSrc);
  plan.invoke(() => true);
  assert.throws(() => plan.invoke(() => true));
  assert.equal(h.calls(), 1);
});

test('native next rejects page navigation after preparation', () => {
  const h = harness(), plan = h.navigation.prepare(h.video, h.video.currentSrc);
  h.page.location.href += '&changed=1';
  assert.throws(() => plan.invoke(() => true));
  assert.equal(h.calls(), 0);
});
