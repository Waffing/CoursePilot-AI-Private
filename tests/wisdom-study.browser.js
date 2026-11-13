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
      if (/单选|判断/.test(host.querySelector('.type, .kind')?.textContent || '')) host.querySelectorAll('.class-question-select').forEach(node => node.classList.remove('isSelect'));
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
  await test('hidden stale selection markers cannot verify an unselected option', async () => {
    const h = harness(); h.state.answer = ['选项甲']; h.state.ignoreSelection = true;
    const hidden = document.createElement('span'); hidden.hidden = true; hidden.className = 'class-question-select isSelect';
    h.host.querySelector('.option').append(hidden); await h.solve();
    assert(h.state.answers === 1 && h.state.submits === 0, 'hidden markers must not bypass visible selection verification');
  });
  await test('missing first stem without a type label cannot borrow second-question radio controls', async () => {
    const h = harness(); const first = h.host.querySelector('.item'), second = first.cloneNode(true); first.after(second);
    h.host.querySelector('.ques-list').className = 'exercise-body';
    for (const card of [first, second]) { card.className = 'exercise-card'; card.querySelector('.row').remove(); }
    first.querySelectorAll('.option').forEach(option => option.remove()); second.querySelector('.question-info').textContent = '第二题';
    second.querySelectorAll('.option').forEach(option => { const input = document.createElement('input'); input.type = 'radio'; input.name = 'second'; option.prepend(input); });
    await h.tick(); assert(h.state.answers === 0 && h.state.submits === 0, 'distinct stems must enforce boundaries even without type labels');
  });
  await test('a missing first semantic question cannot absorb the next complete question', async () => {
    const h = harness(); const first = h.host.querySelector('.item'), second = first.cloneNode(true); first.after(second);
    first.querySelectorAll('.option').forEach(option => option.remove()); second.querySelector('.question-info').textContent = '第二题';
    h.host.querySelector('.ques-list').className = 'exercise-body'; for (const card of [first, second]) card.className = 'exercise-card';
    await h.tick(); assert(h.state.answers === 0 && h.state.submits === 0, 'an incomplete first question must not absorb the complete second one');
  });
  await test('official AiClassExerciseDialog el-scrollbar wrappers retain question discovery', async () => {
    const h = harness(); const item = h.host.querySelector('.item');
    const scrollbar = document.createElement('div'); scrollbar.className = 'el-scrollbar';
    scrollbar.innerHTML = '<div class="el-scrollbar__wrap"><div class="el-scrollbar__view"></div></div>';
    item.before(scrollbar); scrollbar.querySelector('.el-scrollbar__view').append(item);
    await h.solve();
    assert(h.state.answers === 1 && h.state.submits === 1, 'official scrollbar wrapper must not hide question roots');
    assert(h.state.status.recognition?.questionCount === 1 && h.state.status.recognition?.optionCounts[0] === 3, 'diagnostics must report discovered question/choice counts');
  });
  const wrap = (node, className = '') => { const parent = document.createElement('div'); parent.className = className; node.before(parent); parent.append(node); return parent; };
  await test('nested question list, nested options and inline type match the reported five-choice layout', async () => {
    const h = harness();
    const item = h.host.querySelector('.item'); wrap(item, 'question-layout');
    const group = wrap(item.querySelector('.option'), 'options');
    group.append(...item.querySelectorAll(':scope > .option'));
    const type = item.querySelector('.type'); item.prepend(type); item.querySelector('.row').remove();
    const title = '夏商周时期中国古代军事思想的特点包括（ ）。';
    const choices = ['把军事视为对内统治的特殊手段', '以“礼”和“刑”为治军的基础', '迷信色彩重', '以车战为主体的作战指导思想', '中国军事思想发展的第一个高峰期'];
    item.querySelector('.question-info').textContent = title;
    for (let index = 0; index < 2; index++) {
      const option = group.firstElementChild.cloneNode(true);
      option.addEventListener('click', () => option.querySelector('.class-question-select').classList.toggle('isSelect'));
      group.append(option);
    }
    [...group.children].forEach((option, index) => { option.querySelector('.answer').textContent = choices[index]; option.querySelector('.class-question-select').textContent = String.fromCharCode(65 + index); });
    h.state.answer = [choices[0], choices[2]]; await h.solve();
    assert(h.state.calls[0]?.searchText.stem === title, 'must extract full visible stem from nested layout');
    assert(h.state.calls[0]?.type === '多选题' && JSON.stringify(h.state.calls[0].optionsText) === JSON.stringify(choices), 'must read inline type and all five choices');
    assert(h.state.submits === 1, 'must fill, verify and submit nested choices once');
  });
  await test('visible choice text excludes hidden duplicates and reading remains stable after selection', async () => {
    const h = harness();
    const duplicate = h.host.querySelector('.item').cloneNode(true); duplicate.hidden = true; h.host.querySelector('.ques-list').prepend(duplicate);
    h.host.querySelectorAll('.item:not([hidden]) .option').forEach(option => {
      const answer = option.querySelector('.answer'); const hidden = document.createElement('span'); hidden.hidden = true; hidden.textContent = '隐藏模板'; answer.prepend(hidden);
    });
    await h.solve();
    assert(h.state.calls[0]?.optionsText[0] === '选项甲', 'must send only visible option text');
    assert(h.state.answers === 1 && h.state.submits === 1, 'hidden templates must not block or create duplicate questions');
  });
  await test('display-contents question wrapper is recognized through visible descendants', async () => {
    const h = harness(); h.host.querySelector('.item').style.display = 'contents'; await h.solve();
    assert(h.state.answers === 1 && h.state.submits === 1, 'visible children must make a layout-less question recognizable');
  });
  await test('semantic title and explicit option controls work when presentation class names change', async () => {
    const h = harness(); const item = h.host.querySelector('.item'); item.className = 'exercise-card'; h.host.querySelector('.ques-list').className = 'exercise-body';
    item.querySelector('.type').parentElement.className = 'question-header';
    item.querySelector('.type').className = 'kind'; item.querySelector('.question-info').className = 'prompt';
    item.querySelectorAll('.option').forEach(option => { option.className = 'choice-row'; option.querySelector('.answer').className = 'choice-copy'; });
    await h.solve();
    assert(h.state.calls[0]?.type === '多选题' && h.state.calls[0]?.searchText.stem === '测试题：哪些选项符合题意？', 'must recover stem/type from semantic relationships');
    assert(h.state.submits === 1, 'semantic fallback must preserve real selection verification');
  });
  await test('unknown question type is explained and never guessed as single-choice', async () => {
    const h = harness(); h.host.querySelector('.type').textContent = '[填空题]'; await h.solve();
    assert(h.state.answers === 0 && h.state.submits === 0, 'unsupported explicit type must not be treated as single-choice');
    assert(/题型/.test(h.state.status.detail) && h.state.status.canRetry, 'must explain parse failure and allow re-scan');
  });
  await test('incomplete loading exposes counts, supports retry and automatically recovers', async () => {
    const h = harness(); const item = h.host.querySelector('.item'), options = [...item.querySelectorAll('.option')]; options.forEach(option => option.remove());
    await h.tick();
    assert(h.state.answers === 0 && h.state.submits === 0, 'incomplete DOM must never query or submit');
    assert(/选项/.test(h.state.status.detail) && h.state.status.canRetry, 'must identify missing choices');
    assert(h.controller.retryCurrent(), 'parse errors must be retryable without a model request');
    item.append(...options); await h.solve(); assert(h.state.answers === 1 && h.state.submits === 1, 'late options must recover without reload');
  });
  await test('duplicate visible options and encrypted text remain blocked with distinct reasons', async () => {
    const h = harness(); h.host.querySelectorAll('.answer')[1].textContent = '选项甲'; await h.tick();
    assert(h.state.answers === 0 && /重复/.test(h.state.status.detail), 'duplicate choices must be rejected explicitly');
    h.host.querySelectorAll('.answer')[1].textContent = '选项乙'; h.host.querySelector('.question-info').textContent = '\uE001'; await h.tick();
    assert(h.state.answers === 0 && /加密/.test(h.state.status.detail), 'private-use glyphs must not be sent as readable questions');
  });
  await test('semantic fallback never combines two visible question cards into one model prompt', async () => {
    const h = harness(); h.state.settings.submit = false;
    const first = h.host.querySelector('.item'), second = first.cloneNode(true); second.querySelector('.question-info').textContent = '第二题：哪些选项符合题意？'; first.after(second);
    h.host.querySelector('.ques-list').className = 'exercise-body';
    for (const card of [first, second]) card.className = 'exercise-card';
    second.querySelectorAll('.option').forEach(option => option.addEventListener('click', () => option.querySelector('.class-question-select').classList.toggle('isSelect')));
    await h.tick();
    assert(h.state.calls.length === 2 && h.state.calls.every(question => question.optionsText.length === 3), 'each semantic question must retain its own choices');
    assert(h.state.calls[0].searchText.stem !== h.state.calls[1].searchText.stem, 'must not merge separate question stems');
  });
  await test('question-info containing the entire question excludes type and choices from the stem', async () => {
    const h = harness(); const item = h.host.querySelector('.item');
    const stem = item.querySelector('.question-info'); stem.className = 'stem-copy'; item.classList.add('question-info');
    await h.solve();
    assert(h.state.calls[0]?.searchText.stem === '测试题：哪些选项符合题意？', 'wrapper must not leak type labels or choices into stem');
    assert(h.state.submits === 1, 'wrapper layout must complete selection verification');
  });
  await test('choices without a type label or native input type never default to single-choice', async () => {
    const h = harness(); h.host.querySelector('.row').remove(); await h.tick();
    assert(h.state.answers === 0 && h.state.submits === 0 && /题型/.test(h.state.status.detail), 'unknown choice type must remain blocked');
  });
  await test('a partially loaded second semantic question prevents all model requests and submission', async () => {
    const h = harness(); const first = h.host.querySelector('.item'), second = first.cloneNode(true);
    second.querySelector('.question-info').textContent = '第二题'; second.querySelectorAll('.option').forEach(option => option.remove()); first.after(second);
    h.host.querySelector('.ques-list').className = 'exercise-body'; for (const card of [first, second]) card.className = 'exercise-card';
    await h.tick();
    assert(h.state.answers === 0 && h.state.submits === 0, 'partial semantic batch must not answer only its first question');
  });
  await test('legacy study quiz with label choices remains recognized in the active controller', async () => {
    const h = harness(); h.popup.className = 'videoInnerQuestion'; const item = h.host.querySelector('.item'); item.className = 'questionItem';
    item.querySelector('.question-info').className = 'questionDetail';
    item.querySelectorAll('.option').forEach(option => { option.className = 'label'; option.querySelector('.answer').className = 'node_detail'; });
    await h.solve(); assert(h.state.submits === 1, 'legacy choice labels must still be supported');
  });
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
  await test('website trusted-click guard is not triggered after a saved video ends', async () => {
    const h = harness(); h.popup.remove(); h.media.ended = true; h.media.currentTime = 20;
    let rejectedClicks = 0;
    h.host.querySelector('#container').addEventListener('click', event => { if (!event.isTrusted) rejectedClicks++; }, true);
    await h.tick(); h.receipt('progress'); await h.tick(); await h.tick();
    assert(rejectedClicks === 0 && h.state.next === 0, 'scripted next clicks trigger the website home redirect guard');
    assert(h.state.status.label === '等待手动切课' && /手动/.test(h.state.status.detail), 'must clearly request a genuine user next action');
  });
  await test('video end waits for saved learning receipt then asks for manual next without clicking', async () => {
    const h = harness(); h.popup.remove(); h.media.ended = true; h.media.currentTime = 20; await h.tick();
    assert(h.state.next === 0 && h.state.status.label === '等待网站确认', 'must wait for website progress save');
    h.receipt('progress'); await h.tick(); await h.tick();
    assert(h.state.next === 0 && h.state.status.label === '等待手动切课', 'must request manual next only after save');
  });
  await test('manual source change on the same video resumes and requires a fresh progress save', async () => {
    const h = harness(); h.popup.remove(); h.media.ended = true; h.media.currentTime = 20; await h.tick(); h.receipt('progress'); await h.tick();
    h.video.src = 'https://example.invalid/lesson-2.mp4'; h.media.ended = false; h.media.currentTime = 0; h.media.paused = true; await h.tick();
    assert(h.state.plays === 1 && h.state.status.label === '播放中', 'must play new source on reused element');
    h.media.ended = true; h.media.currentTime = 20; await h.tick();
    assert(h.state.status.label === '等待网站确认', 'new lesson needs its own save');
    h.receipt('progress'); await h.tick();
    assert(h.state.next === 0 && h.state.status.label === '等待手动切课', 'second lesson must also avoid synthetic navigation');
  });
  await test('late progress response for prior source cannot mark the new lesson saved', async () => {
    const h = harness(); h.popup.remove(); h.media.currentTime = 20; h.media.ended = true; await h.tick(); const old = h.capture('progress');
    h.video.src = 'https://example.invalid/lesson-2.mp4'; await h.tick(); h.receipt('progress', true, old); await h.tick();
    assert(h.state.next === 0 && h.state.status.label === '等待网站确认', 'old save receipt must not apply to new source');
  });
  await test('autoplay rejection prompts once rather than repeatedly calling play', async () => {
    const h = harness(); h.popup.remove(); h.state.playError = true; await h.tick(); await h.tick(); await h.tick();
    assert(h.state.plays === 1, 'must not hammer autoplay');
  });
  await test('disabled next reminder reports completion without navigation', async () => {
    const h = harness(); h.popup.remove(); h.state.settings.nextCourse = false; h.media.ended = true; h.media.currentTime = 20; await h.tick(); h.receipt('progress'); await h.tick();
    assert(h.state.next === 0 && h.state.status.label === '播放完成', 'reminder setting must be honored');
  });
  await test('unavailable next button does not claim course completion or trigger navigation', async () => {
    const h = harness(); h.popup.remove(); h.host.querySelector('.nextButton').disabled = true; h.media.ended = true; h.media.currentTime = 20; await h.tick(); h.receipt('progress'); await h.tick();
    assert(h.state.next === 0 && h.state.status.label === '等待手动切课', 'must leave directory and course-end decisions to the user');
  });
  await test('rejected or early progress receipts do not announce a saved lesson', async () => {
    const h = harness(); h.popup.remove(); h.media.currentTime = 10; await h.tick(); const early = h.capture('progress');
    h.media.ended = true; h.media.currentTime = 20; h.receipt('progress', true, early); await h.tick();
    assert(h.state.status.label === '等待网站确认', 'early save is not final confirmation');
    h.receipt('progress', false); h.state.now += 16000; await h.tick();
    assert(h.state.next === 0 && h.state.status.label === '需要人工处理', 'rejected final save must not allow progression');
  });
  await test('unrelated next links and the website player are never clicked at completion', async () => {
    const h = harness(); h.popup.remove(); h.host.querySelector('.nextButton').remove();
    const link = document.createElement('a'); link.className = 'nextChapter'; link.href = 'https://www.zhihuishu.com/'; link.textContent = '下一节';
    let clicked = 0; link.addEventListener('click', event => { event.preventDefault(); clicked++; }); h.host.append(link);
    h.media.ended = true; h.media.currentTime = 20; await h.tick(); h.receipt('progress'); await h.tick();
    assert(clicked === 0 && h.state.status.label === '等待手动切课', 'must not follow broad next-like links');
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
