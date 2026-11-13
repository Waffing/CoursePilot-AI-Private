const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');

function harness({ answer = ['Beta'], title = 'Choose an option', visible = true, empty = false } = {}) {
  const state = { calls: 0, submitted: 0, logs: [], questions: [], seenTitle: '' };
  const option = (text) => {
    const input = { checked: false, click() { this.checked = !this.checked; } };
    return {
      textContent: text, className: '', input,
      querySelector: (selector) => selector === 'input' ? input : null,
      getAttribute: () => null,
      click() { input.click(); }
    };
  };
  const options = [option('Alpha'), option('Beta')];
  const question = {
    textContent: title,
    querySelector(selector) {
      if (selector === '.questionDetail') return { textContent: title };
      return null;
    },
    querySelectorAll(selector) {
      return selector === '.questionOption' ? options : [];
    }
  };
  const submit = { disabled: false, click() { state.submitted++; }, getAttribute: () => null };
  const container = {
    isConnected: true, className: '', textContent: title,
    querySelector: (selector) => selector === 'button.confirmBtn' ? submit : null,
    querySelectorAll: (selector) => selector === '.questionItem' && !empty ? [question] : [],
    getClientRects: () => visible ? [{}] : [],
    getAttribute: () => null
  };
  const doc = { querySelector: (selector) => selector === '.videoInnerQuestion' ? container : null };
  const sandbox = {
    _unsafeWindow: {
      document: doc, location: { hostname: 'wisdom-mooc.zhihuishu.com', pathname: '/study/index', href: 'https://wisdom-mooc.zhihuishu.com/study/index' },
      getComputedStyle: () => ({ display: visible ? 'block' : 'none', visibility: 'visible', opacity: '1' })
    },
    vue: { reactive: (value) => value },
    sleep: async () => {},
    getAnswer: async (value) => {
      state.calls++;
      state.seenTitle = value.title;
      return typeof answer === 'function' ? answer() : answer;
    },
    getAnswerValues: (value) => value,
    Event: class Event { constructor(type) { this.type = type; } }
  };
  const modulePath = path.join(root, 'src', 'zhs-study.js');
  const bundle = fs.readFileSync(path.join(root, 'course-helper.user.js'), 'utf8');
  const source = fs.existsSync(modulePath) ? fs.readFileSync(modulePath, 'utf8') :
    bundle.slice(bundle.indexOf('  // ── 智慧树 /study/index'), bundle.indexOf('  const useZhsAnswerLogic'));
  const api = vm.runInNewContext(source + '\n;({ handle: _zhsHandleQuiz, click: _zhsClickEl, match: _zhsMatchOption });', sandbox);
  const logStore = { addLog: (...args) => state.logs.push(args) };
  const questionStore = { addQuestion: (value) => state.questions.push(value) };
  return { api, state, options, container, run: () => api.handle(logStore, questionStore) };
}

test('a visible quiz fills the exact option before submitting', async () => {
  const h = harness();
  await h.run();
  assert.equal(h.state.calls, 1);
  assert.equal(h.options[1].input.checked, true);
  assert.equal(h.state.submitted, 1);
});

test('duplicate observer notifications cannot issue parallel requests or repeat submission', async () => {
  let resolveAnswer;
  const answer = new Promise((resolve) => { resolveAnswer = resolve; });
  const h = harness({ answer: () => answer });
  const first = h.run();
  const second = h.run();
  await new Promise(setImmediate);
  const calls = h.state.calls;
  resolveAnswer(['Beta']);
  await Promise.all([first, second]);
  await h.run();
  assert.equal(calls, 1);
  assert.equal(h.state.calls, 1);
  assert.equal(h.state.submitted, 1);
});

test('no model answer leaves the quiz unsubmitted', async () => {
  const h = harness({ answer: null });
  await h.run();
  assert.equal(h.state.submitted, 0);
});

test('unmatched model answer leaves the quiz unsubmitted', async () => {
  const h = harness({ answer: ['Gamma'] });
  await h.run();
  assert.equal(h.state.submitted, 0);
});

test('unparsed quiz is not confirmed automatically', async () => {
  const h = harness({ empty: true });
  await h.run();
  assert.equal(h.state.submitted, 0);
});

test('hidden quizzes do not trigger model requests', async () => {
  const h = harness({ visible: false });
  await h.run();
  assert.equal(h.state.calls, 0);
});

test('checking an already selected option is idempotent', () => {
  const h = harness();
  h.options[0].input.checked = true;
  h.api.click(h.options[0]);
  assert.equal(h.options[0].input.checked, true);
});

test('empty and partial answers cannot match an unrelated option', () => {
  const h = harness();
  const opts = { Alpha: h.options[0], Beta: h.options[1] };
  assert.equal(h.api.match(opts, ''), null);
  assert.equal(h.api.match(opts, 'Al'), null);
});

test('long question stems are preserved for the model', async () => {
  const title = 'Long question '.repeat(40);
  const h = harness({ title });
  await h.run();
  assert.equal(h.state.seenTitle, title.trim());
});

test('model failure does not submit and releases the in-flight lock', async () => {
  let calls = 0;
  const h = harness({ answer: () => { if (++calls === 1) throw new Error('offline'); return ['Beta']; } });
  await h.run();
  assert.equal(h.state.submitted, 0);
  await h.run();
  assert.equal(h.state.submitted, 1);
});

test('a quiz removed during a model request is never submitted', async () => {
  let resolveAnswer;
  const pending = new Promise((resolve) => { resolveAnswer = resolve; });
  const h = harness({ answer: () => pending });
  const task = h.run();
  await new Promise(setImmediate);
  h.container.isConnected = false;
  resolveAnswer(['Beta']);
  await task;
  assert.equal(h.state.submitted, 0);
});
