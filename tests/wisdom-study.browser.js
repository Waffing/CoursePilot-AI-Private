/* Browser regression suite: real DOM, simulated media/model/site acknowledgements. */
window.runWisdomStudyTests = async function () {
  const results = [];
  const assert = (value, message) => { if (!value) throw new Error(message); };
  const flush = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };
  const fixtures = [];
  function harness(overrides = {}) {
    const host = document.createElement('section');
    host.className = 'test-fixture';
    host.innerHTML = `<div id="container"><video src="https://example.invalid/lesson-1.mp4"></video><button class="nextButton">下一节</button></div>
      <div class="ai-class-exercise-dialog"><h2>AI随堂练习</h2><p>以下所有内容均由AI生成请注意甄别</p><div class="ques-list"><div class="item">
      <div class="row"><span class="type">1. [多选题]</span></div><div class="question-info">测试题：哪些选项符合题意？</div>
      <div class="option"><span class="class-question-select">A</span><span class="answer">选项甲</span></div>
      <div class="option"><span class="class-question-select">B</span><span class="answer">选项乙</span></div>
      <div class="option"><span class="class-question-select">C</span><span class="answer">选项丙</span></div>
      </div></div><div class="dialog-footer"><button>提交作答</button></div></div>`;
    document.querySelector('#fixtures').append(host);
    const doc = { querySelector: selector => host.querySelector(selector), querySelectorAll: selector => host.querySelectorAll(selector), contains: node => host.contains(node) };
    const state = { now: 0, answers: 0, submits: 0, next: 0, plays: 0, calls: [], records: [], settings: { enabled: true, answer: true, submit: true, play: true, nextCourse: true, muted: false, speed: false } };
    const popup = host.querySelector('.ai-class-exercise-dialog');
    const video = host.querySelector('video');
    const media = { ended: false, paused: true, readyState: 4, duration: 20, currentTime: 0, error: null };
    for (const key of Object.keys(media)) Object.defineProperty(video, key, { configurable: true, get: () => media[key] });
    video.play = () => { state.plays++; if (state.playError) return Promise.reject(new Error('autoplay')); media.paused = false; return Promise.resolve(); };
    video.pause = () => { media.paused = true; };
    host.querySelectorAll('.option').forEach(option => option.addEventListener('click', () => {
      if (state.ignoreSelection) return;
      if (/单选|判断/.test(host.querySelector('.type').textContent)) host.querySelectorAll('.class-question-select').forEach(node => node.classList.remove('isSelect'));
      option.querySelector('.class-question-select').classList.toggle('isSelect');
    }));
    host.querySelector('.dialog-footer button').addEventListener('click', () => { state.submits++; });
    host.querySelector('.nextButton').addEventListener('click', () => { state.next++; });
    const receipts = new Map();
    let notify, capture;
    const page = { document: doc, location: { hostname: 'wisdom-mooc.zhihuishu.com', pathname: '/study/index', href: 'https://wisdom-mooc.zhihuishu.com/study/index?recruitAndCourseId=test' }, getComputedStyle: element => window.getComputedStyle(element), AbortController, Event };
    const options = {
      settings: () => state.settings, canRun: () => !state.standby, modelIdentity: () => state.model || 'model-1',
      now: () => state.now, wait: async () => {}, delay: () => 1000,
      setEnabled: value => { state.settings.enabled = value; },
      log: () => {}, onStatus: value => { state.status = value; },
      addQuestion: question => { state.records.push(question); return question; },
      requestPacer: { beforeRequest: async () => true, remaining: () => 0 },
      sharedReceipts: { get: key => receipts.get(key), reserve: key => { if (receipts.has(key)) return false; receipts.set(key, 'pending'); return true; }, record: (key, value) => receipts.set(key, value) },
      resolve: async (question, context) => {
        state.answers++; state.calls.push(question);
        if (state.resolveError) throw new Error('offline');
        if (state.pending) return state.pending;
        return { success: true, data: { items: [{ answer: { values: state.noAnswer ? [] : state.answer || ['选项甲', '选项丙'] } }] } };
      },
      observeReceipts: (callback, context) => { notify = callback; capture = context; return () => { state.observerDisposed = true; }; },
      ...overrides
    };
    const controller = createWisdomStudyController(page, options);
    const receipt = (kind, accepted = true, context = capture(kind)) => notify({ kind, accepted, context });
    const tick = async () => { await controller.tick(); await flush(); };
    const solve = async () => { await tick(); state.now += 1200; await tick(); };
    fixtures.push({ host, controller });
    return { host, state, media, popup, video, controller, tick, solve, receipt, capture };
  }
  async function test(name, action) {
    try { await action(); results.push({ name, pass: true }); }
    catch (error) { results.push({ name, pass: false, error: error.message }); }
    finally { while (fixtures.length) { const fixture = fixtures.pop(); fixture.controller.dispose(); fixture.host.remove(); } }
  }
  await test('AI multi-select without native inputs is recognized, filled and submitted once', async () => {
    const h = harness(); await h.solve();
    assert(h.state.calls[0].type === '多选题', 'must read [多选题]');
    assert(h.host.querySelectorAll('.isSelect').length === 2, 'must select both target options');
    assert(h.state.submits === 1, 'must submit exactly once');
    await h.tick(); await h.tick(); assert(h.state.submits === 1 && h.state.answers === 1, 'must not repeat requests or submissions');
  });
  await test('button click alone never confirms submission or resumes video', async () => {
    const h = harness(); await h.solve(); h.state.now += 20000; await h.tick();
    assert(h.state.plays === 0, 'must not play behind open quiz');
    assert(/确认|人工/.test(h.state.status.label), 'must expose unconfirmed status');
  });
  await test('accepted popup followed by closing resumes playback', async () => {
    const h = harness(); await h.solve(); h.receipt('popup'); h.popup.remove(); await h.tick();
    assert(h.state.plays === 1, 'must resume after site acknowledgement and popup closes');
  });
  await test('removed popup without acknowledgement stops instead of assuming success', async () => {
    const h = harness(); await h.solve(); h.popup.remove(); await h.tick();
    assert(h.state.plays === 0, 'unknown submission must not auto-resume');
  });
  await test('rejected submission stops retries and playback', async () => {
    const h = harness(); await h.solve(); h.receipt('popup', false); h.popup.remove(); await h.tick();
    assert(h.state.submits === 1 && h.state.plays === 0, 'rejection must stop automation');
  });
  await test('model failures and mutation notifications do not repeatedly spend requests', async () => {
    const h = harness(); h.state.resolveError = true; await h.tick(); await h.tick(); await h.tick();
    assert(h.state.answers === 1 && h.state.submits === 0, 'must block until explicit retry');
    h.state.resolveError = false; assert(h.controller.retryCurrent(), 'manual retry should be possible'); await h.solve();
    assert(h.state.answers === 2 && h.state.submits === 1, 'retry should query once');
  });
  await test('ambiguous or partial answers never submit', async () => {
    const h = harness(); h.state.answer = ['选项']; await h.solve();
    assert(h.state.submits === 0, 'partial match must not submit');
  });
  await test('changed question discards an in-flight model response', async () => {
    const h = harness(); let resolve; h.state.pending = new Promise(r => { resolve = r; });
    const pending = h.controller.tick(); await flush();
    h.host.querySelector('.question-info').textContent = '另外一道题';
    resolve({ success: true, data: { items: [{ answer: { values: ['选项甲'] } }] } }); await pending;
    assert(h.state.submits === 0 && !h.host.querySelector('.isSelect'), 'stale model must not change options');
  });
  await test('pause cancels an in-flight model response', async () => {
    const h = harness(); let resolve; h.state.pending = new Promise(r => { resolve = r; });
    const pending = h.controller.tick(); await flush(); h.controller.pause();
    resolve({ success: true, data: { items: [{ answer: { values: ['选项甲'] } }] } }); await pending;
    assert(h.state.submits === 0 && !h.host.querySelector('.isSelect'), 'paused controller must discard response');
  });
  await test('failed selection verification prevents submission', async () => {
    const h = harness(); h.state.ignoreSelection = true; await h.solve();
    assert(h.state.submits === 0, 'unverified selections must not submit');
  });
  await test('single-choice uses exclusive selection and does not toggle selected target', async () => {
    const h = harness(); h.host.querySelector('.type').textContent = '[单选题]'; h.state.answer = ['选项乙']; await h.solve();
    assert(h.host.querySelectorAll('.isSelect').length === 1 && h.state.submits === 1, 'single choice must work');
  });
  await test('human verification stops model and playback', async () => {
    const h = harness(); const node = document.createElement('div'); node.className = 'yidun_popup'; node.textContent = '请完成安全验证'; h.host.append(node);
    await h.solve(); assert(h.state.answers === 0 && h.state.plays === 0 && h.state.submits === 0, 'must stop for verification');
  });
  await test('standby tab never queries or submits', async () => {
    const h = harness(); h.state.standby = true; await h.solve(); assert(h.state.answers === 0 && h.state.submits === 0, 'standby tab must do nothing');
  });
  await test('video end waits for saved learning receipt then advances only once', async () => {
    const h = harness(); h.popup.remove(); h.media.ended = true; h.media.currentTime = 20; await h.tick();
    assert(h.state.next === 0, 'must wait for website progress save');
    h.receipt('progress'); await h.tick(); await h.tick(); assert(h.state.next === 1, 'must advance once');
  });
  await test('same video element with a new source starts next video and can advance again', async () => {
    const h = harness(); h.popup.remove(); h.media.ended = true; h.media.currentTime = 20; await h.tick(); h.receipt('progress'); await h.tick();
    h.video.src = 'https://example.invalid/lesson-2.mp4'; h.media.ended = false; h.media.currentTime = 0; h.media.paused = true; await h.tick();
    assert(h.state.plays === 1, 'must play new source on reused element');
    h.media.ended = true; h.media.currentTime = 20; await h.tick(); h.receipt('progress'); await h.tick(); assert(h.state.next === 2, 'second lesson must advance');
  });
  await test('late progress response for prior source cannot advance new lesson', async () => {
    const h = harness(); h.popup.remove(); h.media.currentTime = 20; h.media.ended = true; await h.tick(); const old = h.capture('progress');
    h.video.src = 'https://example.invalid/lesson-2.mp4'; await h.tick(); h.receipt('progress', true, old); await h.tick();
    assert(h.state.next === 0, 'old save receipt must not apply to new source');
  });
  await test('autoplay rejection prompts once rather than repeatedly calling play', async () => {
    const h = harness(); h.popup.remove(); h.state.playError = true; await h.tick(); await h.tick(); await h.tick();
    assert(h.state.plays === 1, 'must not hammer autoplay');
  });
  await test('disabled auto-next setting prevents advancement', async () => {
    const h = harness(); h.popup.remove(); h.state.settings.nextCourse = false; h.media.ended = true; h.media.currentTime = 20; await h.tick(); h.receipt('progress'); await h.tick();
    assert(h.state.next === 0, 'auto-next setting must be honored');
  });
  await test('disabled final next button marks course end', async () => {
    const h = harness(); h.popup.remove(); h.host.querySelector('.nextButton').disabled = true; h.media.ended = true; h.media.currentTime = 20; await h.tick(); h.receipt('progress'); await h.tick();
    assert(h.state.next === 0, 'must not click disabled last button');
  });
  await test('accepted quiz can continue using the explicit website continue button', async () => {
    const h = harness(); await h.solve(); h.receipt('popup');
    const button = h.host.querySelector('.dialog-footer button'); button.textContent = '继续学习';
    button.addEventListener('click', () => h.popup.remove(), { once: true });
    await h.tick(); await h.tick();
    assert(h.state.plays === 1, 'must use website continue action before playback');
  });
  await test('disposing controller detaches passive acknowledgement observers', async () => {
    const h = harness(); h.controller.dispose(); await h.tick(); assert(h.state.observerDisposed && h.state.answers === 0, 'disposed controller must stop');
  });
  const summary = { total: results.length, passed: results.filter(r => r.pass).length, failed: results.filter(r => !r.pass).length, results };
  document.querySelector('#results').textContent = JSON.stringify(summary, null, 2);
  window.wisdomTestResults = summary;
  return summary;
};
