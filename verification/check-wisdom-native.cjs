// Fetch pinned public assets, then run original navigation functions with isolated state/network mocks.
// No credentials, classroom requests, progress writes or downloaded source files are used.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const assets = [
  { name: 'study', url: 'https://wisdom-mooc.zhihuishu.com/assets/index-QJOUvpDU.js', sha256: '2eadbe0f6c66edf25c9f5c9f60afa3e7d3a8f57cb941da8bda57494a2793d59c' },
  { name: 'player', url: 'https://lc.zhihuishu.com/ableVideoPlayerAiv2/js/videoPlayer.min.js?v=20250526', sha256: 'c28dd9cccc6966964c5f1b0844757bda85b8cef39210624a8f17c36e4c24ab6c' }
];
(async () => {
  const fetched = {};
  for (const asset of assets) {
    const response = await fetch(asset.url, { signal: AbortSignal.timeout(30000) });
    assert(response.ok, `${asset.name}: HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), asset.sha256, `${asset.name} source changed; investigate before updating hash`);
    fetched[asset.name] = bytes.toString('utf8');
  }
  for (const marker of ['window.PlayerStarter=PlayerStarter', 'obj.callback.playerNext()', 'callback:callback']) assert(fetched.player.includes(marker), marker);
  assert(fetched.study.includes('playerNext:()=>{Ls()}'));
  const extract = (start, end) => {
    const from = fetched.study.indexOf(start, 990000), to = fetched.study.indexOf(end, from);
    assert(from >= 990000 && to > from, `missing ${start}`);
    return fetched.study.slice(from, to);
  };
  const original = extract('function Ls(){', 'function Mo(') + '\n' + extract('function gn(', 'function In(') + '\n' + extract('function qt(', 'function _e(');
  const controller = fs.readFileSync(path.join(__dirname, '../src/wisdom-study-controller.js'), 'utf8');
  function harness({ code = 0, busy = false } = {}) {
    const state = { calls: [], saves: 0, dialogs: [], messages: [], timers: [], guard: 0 };
    const first = { id: 1, chapterId: 1, videoId: 101, ishaveChildrenLesson: 0, isStudiedLesson: 1, percentage: 100 };
    const second = { id: 2, chapterId: 1, videoId: 102, ishaveChildrenLesson: 0, isStudiedLesson: 1, percentage: 100 };
    const video = { isConnected: true, currentSrc: 'https://example.invalid/one.mp4', getAttribute: () => '' };
    const container = { isConnected: true, contains: node => node === video };
    const env = {
      window: { ablePlayerX: () => ({ exitFullPlay() {}, getPosition: () => 20 }) },
      PointerEvent: class PointerEvent {}, ve() { state.guard++; },
      S: { value: [{ id: 1, videoLessons: [first, second] }] }, b: { value: 101 }, l: { value: { id: 1, lessonId: 1, smallLessonId: 0, chapterId: 1 } },
      Ve: { value: true }, V: { value: '' }, at: { value: 0 }, yt: { value: false }, vt: { value: false },
      m: { value: { type: 1, canJumpChapter: false } }, H: { value: { studyTimeDto: { canBeStudyNow: true } } },
      v: { value: { studyStatus: 0 } }, j: { value: busy }, P: { value: 10 }, x: { value: 20 }, y: { value: 1 }, g: { value: 2 },
      oe: { value: '' }, M: { value: { studiedLessonDto: { id: 1 } } }, vn: { value: null }, Ft: { value: false },
      Rs: { Z: value => JSON.stringify(value) }, eb: { encode: value => String(value) }, su: value => value, _e: () => 'ISOLATED',
      s: value => value, ur() {}, qo() { state.dialogs.push('auth'); },
      ue(type, payload) { state.dialogs.push({ type, payload }); }, We: value => state.messages.push(value),
      Yn(chapter, lesson, child) { state.calls.push({ chapter: chapter.id, video: (child || lesson).videoId }); env.b.value = (child || lesson).videoId; },
      wr: { saveLearningDBInTime() { state.saves++; return Promise.resolve({ code }); } },
      setTimeout(fn) { state.timers.push(fn); return state.timers.length; }, clearTimeout() {}, console: { log() {} }
    };
    vm.createContext(env); vm.runInContext(original + '\n' + controller, env, { timeout: 1000 });
    const instance = { id: 'container', options: { id: 101, control: { nextBtn: true } }, player: { el: () => container }, callback: { playerNext: () => env.Ls() } };
    const page = { location: { hostname: 'wisdom-mooc.zhihuishu.com', pathname: '/study/index', href: 'https://wisdom-mooc.zhihuishu.com/study/index?recruitAndCourseId=ISOLATED' }, document: { querySelectorAll: () => [container] }, PlayerStarter: { get: () => instance } };
    const navigation = env.createWisdomStudyNavigation(page);
    return { env, state, first, second, run: () => navigation.prepare(video, video.currentSrc).invoke(() => true) };
  }
  const results = [];
  const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
  async function check(name, action) { await action(); results.push({ name, pass: true }); }
  await check('official next waits for its own save before selecting the next lesson', async () => {
    const h = harness(); h.run(); assert.equal(h.state.saves, 1); assert.equal(h.state.calls.length, 0); await flush(); assert.equal(h.state.calls[0].video, 102); assert.equal(h.state.guard, 0);
  });
  await check('save rejection retains current lesson', async () => {
    const h = harness({ code: 500 }); h.run(); await flush(); assert.equal(h.state.calls.length, 0); assert.equal(h.state.dialogs[0].type, 'triggerDialog');
  });
  await check('captcha remains handled by website verification', async () => {
    const h = harness({ code: -12 }); h.run(); await flush(); assert.equal(h.state.calls.length, 0); assert.equal(h.state.dialogs[0].type, 'popupYidunInstance');
  });
  await check('authentication rejection is retained', async () => {
    const h = harness({ code: 403 }); h.run(); await flush(); assert.equal(h.state.calls.length, 0); assert.equal(h.state.dialogs[0], 'auth');
  });
  await check('cross-chapter restriction prevents progression', async () => {
    const h = harness(); h.env.S.value = [{ id: 1, videoLessons: [h.first] }, { id: 2, videoLessons: [h.second] }]; h.first.isStudiedLesson = 0; h.run(); await flush(); assert.equal(h.state.calls.length, 0); assert.equal(h.state.saves, 0); assert.equal(h.state.messages.length, 1);
  });
  await check('study-window restriction prevents progression', async () => {
    const h = harness(); h.env.H.value.studyTimeDto = { canBeStudyNow: false, studyTimeDetials: {} }; h.run(); await flush(); assert.equal(h.state.calls.length, 0); assert.equal(h.state.saves, 0);
  });
  await check('final lesson does not select a fabricated next lesson', async () => {
    const h = harness(); h.env.b.value = 102; h.run(); await flush(); assert.equal(h.state.calls.length, 0); assert.equal(h.state.saves, 0);
  });
  await check('child-lesson order is retained', async () => {
    const h = harness(); h.first.ishaveChildrenLesson = 1; h.first.videoSmallLessons = [{ id: 11, videoId: 101 }, { id: 12, videoId: 103 }]; h.run(); await flush(); assert.equal(h.state.calls[0].video, 103);
  });
  await check('in-flight website save guard prevents an extra transition', async () => {
    const h = harness({ busy: true }); h.run(); await flush(); assert.equal(h.state.saves, 0); assert.equal(h.state.calls.length, 0);
  });
  console.log(JSON.stringify({ total: results.length, passed: results.length, assets, evidence: 'Original official Ls/gn/qt in isolated VM; network and state mocked; no login classroom execution', results }, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
