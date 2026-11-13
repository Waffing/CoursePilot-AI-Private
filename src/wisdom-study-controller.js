  // Observe website-owned requests only. Never fabricate answers, heartbeats or progress.
  function observeWisdomStudyReceipts(page, notify, capture) {
    const kindOf = (address) => {
      try {
        const url = new URL(String(address), page.location.href);
        if (!/(^|\.)zhihuishu\.com$/i.test(url.hostname)) return '';
        if (/\/batchSaveLessonPopupExamSaveAnswer\/?$/.test(url.pathname)) return 'popup';
        if (/\/saveDatabaseIntervalTimeV2\/?$/.test(url.pathname)) return 'progress';
      } catch {}
      return '';
    };
    let disposed = false;
    const pending = new Set();
    const report = (kind, context, status, payload) => {
      if (disposed || !context) return;
      const accepted = status >= 200 && status < 300 && [0, 200].includes(payload?.code) && payload?.success !== false && payload?.data !== false;
      notify({ kind, context, accepted, unknown: !payload || payload.code === undefined });
    };
    const proto = page.XMLHttpRequest?.prototype;
    const oldOpen = proto?.open, oldSend = proto?.send, watched = new WeakMap();
    function open(method, address, ...rest) {
      const result = oldOpen.call(this, method, address, ...rest);
      const kind = kindOf(address);
      if (kind) watched.set(this, kind); else watched.delete(this);
      return result;
    }
    function send(...args) {
      const kind = watched.get(this), context = kind && capture(kind);
      let handler;
      if (context) {
        const item = { xhr: this, handler: null };
        handler = item.handler = () => {
          pending.delete(item);
          let payload;
          try { payload = this.responseType === 'json' ? this.response : JSON.parse(this.responseText); } catch {}
          report(kind, context, this.status, payload);
        };
        pending.add(item);
        this.addEventListener('loadend', handler, { once: true });
      }
      try { return oldSend.apply(this, args); }
      catch (error) { if (handler) this.removeEventListener('loadend', handler); throw error; }
    }
    if (proto) { proto.open = open; proto.send = send; }
    const oldFetch = page.fetch;
    function fetch(...args) {
      const address = typeof args[0] === 'string' || args[0] instanceof URL ? args[0] : args[0]?.url;
      const kind = kindOf(address), context = kind && capture(kind);
      const result = oldFetch.apply(this, args);
      if (context) result.then(response => {
        if (!disposed) response.clone().json().then(payload => report(kind, context, response.status, payload), () => report(kind, context, response.status, null));
      }, () => report(kind, context, 0, null));
      return result;
    }
    if (oldFetch) page.fetch = fetch;
    return () => {
      disposed = true;
      for (const item of pending) item.xhr.removeEventListener('loadend', item.handler);
      pending.clear();
      if (proto?.open === open) proto.open = oldOpen;
      if (proto?.send === send) proto.send = oldSend;
      if (page.fetch === fetch) page.fetch = oldFetch;
    };
  }

  function createWisdomStudyController(page, options) {
    const doc = page.document, now = options.now || Date.now;
    const wait = options.wait || (ms => new Promise(resolve => setTimeout(resolve, ms)));
    const hidden = node => {
      if (!node?.isConnected) return true;
      for (let element = node; element; element = element.parentElement) {
        const style = page.getComputedStyle(element);
        if (element.hidden || element.getAttribute('aria-hidden') === 'true' || style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return true;
      }
      return false;
    };
    const visible = node => !hidden(node) && (node.getClientRects().length > 0 || page.getComputedStyle(node).display === 'contents' && Array.from(node.children).some(child => child.getClientRects().length > 0 && !hidden(child)));
    const text = (node, exclude = new Set()) => {
      const read = current => {
        if (current.nodeType === 3) return current.nodeValue || '';
        if (current.nodeType !== 1 || exclude.has(current) || hidden(current) || current.matches('script, style, template, noscript')) return '';
        return Array.from(current.childNodes).map(read).join(' ');
      };
      return (node ? read(node) : '').replace(/[\s\u200B-\u200D\uFEFF]+/g, ' ').trim();
    };
    const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
    const log = (message, type = 'primary') => options.log?.(escape(message), type);
    const usable = node => visible(node) && !node.disabled && node.getAttribute('aria-disabled') !== 'true' && !node.classList.contains('disabled');
    const findVideo = () => Array.from(doc.querySelectorAll('#container video, .video-play video, video')).find(visible);
    const sourceOf = video => video?.currentSrc || video?.getAttribute('src') || '';
    let disposed = false, suspended = false, paused = false, busy = false, active = null, receipt = null, media = null;
    let model = options.modelIdentity(), verificationSeen = false, parseBlocked = false, recognition = null;
    let status = { label: '准备学习', detail: '', paused: false, canRetry: false, cacheSize: 0 };
    const records = new Map(), cache = new Map();
    const owned = () => options.canRun?.() ?? true;
    const enabled = () => !disposed && !suspended && !paused && owned() && options.settings().enabled;
    const verification = () => Array.from(doc.querySelectorAll('.yidun_popup, .yidun_panel, .geetest_panel, [class*="captcha"], .face-id-mask, .faceid-wrapper, .el-dialog, .dialog-wrapper')).some(node => visible(node) &&
      (node.matches('.yidun_popup, .yidun_panel, .geetest_panel, [class*="captcha"], .face-id-mask, .faceid-wrapper') || /人脸|身份验证|安全验证|滑动验证|验证码|重新登录|异常学习|诚信学习/.test(text(node))));
    const allowed = () => enabled() && !verification();
    function publish(label, detail = '', canRetry = false) {
      status = { label, detail, canRetry, paused: !enabled(), standby: !owned(), cacheSize: cache.size, recognition,
        speedText: media ? '倍速：' + (Number(media.video.playbackRate) || 1) + '×（使用网站播放器）' : '', speedRates: [], selectedSpeed: 0, speedEnabled: false };
      options.onStatus?.({ ...status });
    }
    function currentMedia() {
      const video = findVideo();
      if (!video) return null;
      const source = sourceOf(video);
      if (!media || media.video !== video || media.source !== source) {
        media = { video, source, saved: false, advanced: false, playPending: false, playBlocked: false, endedAt: null };
      }
      return media;
    }
    const lessonKey = () => {
      const selected = doc.querySelector('.video-list .active, .catalogue .active, .chapter-list .active, [aria-current="true"]');
      return JSON.stringify([page.location.href, sourceOf(findVideo()), selected?.getAttribute('data-id') || text(selected)]);
    };
    const choiceSelector = '.option, .questionOption, .option-item, .answerItem, .optionLi, .label';
    const controlSelector = '.class-question-select, input[type="radio"], input[type="checkbox"], [role="radio"], [role="checkbox"]';
    const stemSelector = '.question-info, .questionDetail, .subject_describe, .stem-content, .questionStem, .titleText, .question-title, .question-stem';
    const typePattern = /单项选择题|多项选择题|单选题|多选题|判断题|填空题|简答题|问答题|排序题|匹配题/;
    const typeHeader = /^(?:\d+\s*[.、．]\s*)?[\[【（(]?\s*(?:单项选择题|多项选择题|单选题|多选题|判断题|填空题|简答题|问答题|排序题|匹配题)\s*[\]】）)]?$/;
    function choiceElements(root) {
      let nodes = Array.from(root.querySelectorAll(choiceSelector)).filter(visible);
      nodes = nodes.filter(node => !nodes.some(other => other !== node && node.contains(other)));
      if (nodes.length) return nodes;
      const controls = Array.from(root.querySelectorAll(controlSelector)).filter(node => !hidden(node));
      return [...new Set(controls.map(control => {
        let element = control.matches('input') ? control.closest('label') || control.parentElement : control.parentElement;
        while (element && element !== root && element.querySelectorAll(controlSelector).length === 1) {
          const copy = text(element, new Set([control]));
          if (copy && !/^[A-L][.、．:]?$/.test(copy)) return element;
          element = element.parentElement;
        }
        return null;
      }).filter(node => node && visible(node)))];
    }
    function parse() {
      const popup = Array.from(doc.querySelectorAll('.ai-class-exercise-dialog, .videoInnerQuestion, .video-quiz-wrap, .questionPopWrap')).find(visible);
      if (!popup) return { popup: null, questions: [], unsupported: false, diagnostic: null };
      const semanticOrphans = [];
      const modern = popup.matches('.ai-class-exercise-dialog');
      let roots = Array.from(popup.querySelectorAll(modern ? '.ques-list .item, .question-item, .ques-item' : '.questionItem, .examPaper_subject, .subject-item, .quiz-item, .questionLi')).filter(visible);
      const headers = Array.from(popup.querySelectorAll('.type, .subject_type, .question-type, span, div, p, strong, b')).filter(node => visible(node) && typeHeader.test(text(node)) && !Array.from(node.children).some(child => typeHeader.test(text(child))));
      const stemNodes = Array.from(popup.querySelectorAll(stemSelector)).filter(node => visible(node) && !node.closest(choiceSelector));
      const stems = stemNodes.filter(node => !stemNodes.some(other => other !== node && node.contains(other)));
      // Recover question boundaries from explicit type labels and actual choice controls,
      // not from a fixed number of wrapping divs or the whole popup's text.
      for (const anchor of [...headers, ...stems]) {
        if (roots.some(root => root.contains(anchor))) continue;
        for (let candidate = anchor.parentElement; candidate && candidate !== popup; candidate = candidate.parentElement) {
          if (headers.filter(header => candidate.contains(header)).length > 1 || stems.filter(stem => candidate.contains(stem)).length > 1) break;
          if (choiceElements(candidate).length < 2) continue;
          if (!roots.some(root => root.contains(candidate) || candidate.contains(root))) roots.push(candidate);
          break;
        }
      }
      roots = roots.filter(root => !roots.some(other => other !== root && root.contains(other)));
      roots.sort((a, b) => a.compareDocumentPosition(b) & 4 ? -1 : 1);
      for (const anchor of [...headers, ...stems]) if (!roots.some(root => root === anchor || root.contains(anchor))) semanticOrphans.push(anchor);
      const questions = [], issues = [], counts = [];
      for (const [index, root] of roots.entries()) {
        const elements = choiceElements(root);
        const localHeaders = headers.filter(node => root.contains(node));
        const typeNode = Array.from(root.querySelectorAll('.type, .subject_type, .question-type')).find(visible);
        const typeText = text(typeNode) || localHeaders.map(node => text(node)).join(' ');
        const exclusion = new Set([...elements, ...localHeaders, ...root.querySelectorAll('button, .dialog-footer')]);
        if (typeNode) exclusion.add(typeNode);
        const stem = (root.matches(stemSelector) ? [root] : []).concat(Array.from(root.querySelectorAll(stemSelector))).find(node => visible(node) && !elements.some(element => element.contains(node)));
        const title = text(stem || root, exclusion).replace(/^\d+\s*[.、．]\s*(?=[\[【（(])/, '').replace(/^[\[【（(]\s*(?:单项选择题|多项选择题|单选题|多选题|判断题)\s*[\]】）)]\s*/, '').trim();
        const choices = elements.map(element => {
          const copy = Array.from(element.querySelectorAll('.answer, .node_detail, .option-text, span.txt')).find(visible);
          const markers = new Set(element.querySelectorAll('.class-question-select, .option-label, .option-index, input, [aria-hidden="true"]'));
          return { element, input: element.matches('input') ? element : element.querySelector('input[type="radio"], input[type="checkbox"]'),
            text: text(copy || element, markers).replace(/^[A-L]\s*[.、．:：]\s*/, '').replace(/^[A-L]\s+(?=\S)/, '') };
        });
        const explicit = typeText.match(typePattern)?.[0];
        const type = /多选|多项选择/.test(explicit || '') ? '多选题' : /单选|单项选择/.test(explicit || '') ? '单选题' : explicit === '判断题' ? '判断题' :
          explicit ? null : choices.some(choice => choice.input?.type === 'checkbox') ? '多选题' : choices.length && choices.every(choice => choice.input?.type === 'radio') ? '单选题' : null;
        const images = [...new Set(Array.from(root.querySelectorAll('img')).filter(image => !hidden(image)).map(image => image.getAttribute('src')).filter(Boolean).map(address => { try { return new URL(address, page.location.href).href; } catch { return ''; } }).filter(Boolean))];
        let issue = !title ? '未读取到可见题干' : !type ? '题型未识别或暂不支持' : /[\uE000-\uF8FF]/.test(title + choices.map(choice => choice.text).join('')) ? '检测到加密文字，需人工处理' :
          choices.length < 2 || choices.length > 12 ? `选项数量为 ${choices.length}，等待完整加载或结构不兼容` : choices.some(choice => !choice.text) ? '存在未读取到文字的选项' :
          choices.some(choice => choice.input?.disabled || choice.element.getAttribute('aria-disabled') === 'true' || choice.element.classList.contains('disabled')) ? '选项暂不可用' :
          new Set(choices.map(choice => choice.text.normalize('NFKC').replace(/\s+/g, ''))).size !== choices.length ? '可见选项文字重复，无法唯一匹配' : '';
        counts.push(choices.length);
        if (issue) { issues.push(`第 ${index + 1} 题：${issue}`); continue; }
        const key = JSON.stringify([lessonKey(), title, type, choices.map(choice => choice.text), images]);
        questions.push({ root, popup, title, type, choices, images, key, cacheKey: images.length ? null : JSON.stringify([model, title, type, choices.map(choice => choice.text)]) });
      }
      if (!roots.length) issues.push('未定位到可见题目容器（等待题型、题干和选项加载）');
      const diagnostic = { source: 'visible-dom', questionCount: roots.length, parsedCount: questions.length, optionCounts: counts, issues };
      if (semanticOrphans.length) issues.push('存在尚未读取到独立题干和选项的题目');
      return { popup, questions, unsupported: issues.length > 0, diagnostic };
    }
    const checked = choice => choice.input ? choice.input.checked : choice.element.getAttribute('aria-checked') === 'true' || choice.element.classList.contains('isSelect') || Array.from(choice.element.querySelectorAll('.class-question-select.isSelect, .is-checked, [aria-checked="true"]')).some(visible);
    const selected = state => state.parsed.choices.every((choice, index) => checked(choice) === state.targets.includes(index));
    const current = state => allowed() && options.settings().answer && active === state && !state.controller.signal.aborted && state.model === options.modelIdentity() &&
      parse().questions.some(parsed => parsed.root === state.parsed.root && parsed.key === state.parsed.key);
    function cancel(message) {
      if (!active) return;
      active.controller.abort();
      if (active.phase === 'resolving') {
        active.question.answerStatus = 'error'; active.question.answer = [message]; records.delete(active.parsed.key);
      }
      delete active.question.imageAssets;
      active = null;
    }
    function answerIndices(values, parsed) {
      const normalize = value => {
        const token = String(value).normalize('NFKC').replace(/\s+/g, '').toLowerCase();
        if (parsed.type === '判断题') {
          if (/^(正确|对|是|true|√)$/.test(token)) return 'true';
          if (/^(错误|错|否|false|×)$/.test(token)) return 'false';
        }
        return token;
      };
      return values.map(value => {
        const token = normalize(value);
        const matches = parsed.choices.flatMap((choice, index) => token && normalize(choice.text) === token ? [index] : []);
        return matches.length === 1 ? matches[0] : -1;
      });
    }
    async function solve(parsed) {
      let state = records.get(parsed.key);
      if (state) { state.parsed = parsed; active = state; if (state.controller.signal.aborted) state.controller = new AbortController(); return state; }
      const question = options.addQuestion({ title: escape(parsed.title), type: parsed.type, optionsText: parsed.choices.map(choice => choice.text),
        searchText: { stem: parsed.title, options: parsed.choices.map(choice => choice.text) }, answer: [], answerStatus: 'searching', workType: 'zhs' });
      state = { parsed, question, phase: 'resolving', targets: [], controller: new AbortController(), model, at: now() };
      records.set(parsed.key, state); active = state;
      while (records.size > 100) { const key = records.keys().next().value; if (records.get(key) === active) break; records.delete(key); }
      publish('查询答案', '正在读取视频弹题');
      try {
        const context = { signal: state.controller.signal, isCurrent: () => current(state), skipDelay: true };
        context.beforeRequest = candidate => options.requestPacer.beforeRequest(candidate || context);
        if (parsed.images.length) {
          if (!options.loadImages) throw new Error('图片题暂不能读取，请人工处理');
          question.imageAssets = await options.loadImages(parsed.images, context);
        }
        const saved = parsed.cacheKey && cache.get(parsed.cacheKey);
        const result = saved ? { success: true, data: { items: [{ answer: { values: saved } }] } } : await options.resolve(question, context);
        if (!current(state)) return null;
        const values = result?.success && result.data?.items?.[0]?.answer?.values;
        if (!Array.isArray(values) || !values.length) throw new Error(result?.error?.message || '模型未返回可用答案');
        const targets = answerIndices(values, parsed);
        if (targets.includes(-1) || new Set(targets).size !== targets.length || parsed.type !== '多选题' && targets.length !== 1) throw new Error('答案无法唯一对应选项，请人工核对');
        state.targets = targets;
        for (const [index, choice] of parsed.choices.entries()) {
          if (!current(state)) return null;
          const expected = targets.includes(index);
          if (checked(choice) !== expected && (parsed.type === '多选题' || expected)) { choice.element.click(); await wait(60); }
        }
        if (!current(state)) return null;
        if (!selected(state)) throw new Error('选中状态核对失败，停止自动提交');
        state.phase = 'filled'; state.at = now(); question.answer = [...values]; question.answerStatus = 'success'; question.submissionStatus = '已填选';
        if (parsed.cacheKey) { cache.delete(parsed.cacheKey); cache.set(parsed.cacheKey, [...values]); if (cache.size > 100) cache.delete(cache.keys().next().value); }
        publish('等待提交', '全部选项核对后按设置的间隔提交');
      } catch (error) {
        if (!current(state)) return null;
        state.phase = 'blocked'; state.question.answerStatus = 'error'; state.question.answer = [String(error.message || '答题失败')];
        publish('需要人工处理', state.question.answer[0], true); log(state.question.answer[0], 'warning');
      } finally { delete question.imageAssets; }
      return state;
    }
    const capture = kind => {
      if (disposed) return null;
      if (kind === 'popup') return receipt ? { receipt } : null;
      const candidate = currentMedia();
      return candidate ? { media: candidate, position: candidate.video.currentTime, duration: candidate.video.duration } : null;
    };
    const notify = event => {
      if (disposed || !event.context) return;
      if (event.kind === 'popup' && receipt && event.context.receipt === receipt) {
        receipt.status = event.accepted ? 'accepted' : event.unknown ? 'unknown' : 'rejected';
        options.sharedReceipts.record(receipt.key, receipt.status);
        for (const state of receipt.states) state.question.submissionStatus = event.accepted ? '网站已接受提交' : '提交尚未确认或被拒绝';
      }
      if (event.kind === 'progress' && event.accepted && event.context.media === currentMedia() && Number.isFinite(event.context.duration) && event.context.duration > 0 && event.context.position >= event.context.duration - 0.75) {
        media.saved = true;
      }
      options.onWake?.();
    };
    const stopReceiptObserver = (options.observeReceipts || ((callback, context) => observeWisdomStudyReceipts(page, callback, context)))(notify, capture);
    async function processVideo() {
      const candidate = currentMedia();
      if (!candidate) { publish('等待视频', '请进入课程视频页面'); return; }
      const video = candidate.video;
      if (video.error) { publish('需要人工处理', '网站视频加载失败，请检查网络'); return; }
      if (video.ended) {
        candidate.endedAt ??= now();
        if (!candidate.saved) { publish(now() - candidate.endedAt > 15000 ? '需要人工处理' : '等待网站确认', '视频已自然结束，等待网站保存学习记录'); return; }
        if (candidate.advanced) { publish('切换视频', '已点击下一节，等待新视频加载'); return; }
        if (!options.settings().nextCourse) { publish('播放完成', '自动下一节已关闭'); return; }
        const next = doc.querySelector('#container .nextButton, .video-play .nextButton, .nextChapter, button.nextBtn');
        if (!usable(next)) { publish('播放完成', '已到最后一节或下一节暂不可用，请检查目录'); return; }
        candidate.advanced = true; next.click(); publish('切换视频', '学习记录已保存，已点击下一节'); return;
      }
      if (video.readyState < 1) { publish('缓冲中', '等待网站加载视频'); return; }
      if (options.settings().play && video.paused && candidate.source && !candidate.playPending && !candidate.playBlocked) {
        candidate.playPending = true;
        try {
          if (options.settings().muted) video.muted = true;
          await Promise.resolve(video.play());
        } catch { candidate.playBlocked = true; }
        finally { candidate.playPending = false; }
      }
      if (candidate !== currentMedia() || !allowed()) return;
      publish(candidate.playBlocked ? '需要人工处理' : video.paused ? '等待播放' : '播放中', candidate.playBlocked ? '自动播放被阻止，请手动点击一次网站播放按钮' : '使用网站原播放器；自然播放，完成后继续下一节');
    }
    async function tick() {
      if (disposed || suspended) return;
      if (!enabled()) { cancel('已暂停或其他标签页接管'); findVideo()?.pause(); publish(owned() ? '已暂停' : '另一标签页运行中', '点击恢复或在此页接管后继续'); return; }
      if (verification()) { cancel('网站要求人工验证'); findVideo()?.pause(); publish('需要人工处理', '请手动完成网站验证码、身份或登录验证'); if (!verificationSeen) log('出现人工验证，自动操作已暂停', 'warning'); verificationSeen = true; return; }
      verificationSeen = false;
      const identity = options.modelIdentity();
      if (identity !== model) { cancel('模型配置已变化'); cache.clear(); for (const [key, state] of records) if (state.phase !== 'submitted') records.delete(key); model = identity; }
      if (active && !current(active)) cancel('题目或页面已切换');
      if (busy) return;
      busy = true;
      try {
        const batch = parse();
        if (receipt) {
          if (receipt.status === 'accepted' && batch.popup && !receipt.continued) {
            const button = Array.from(batch.popup.querySelectorAll('.dialog-footer button, button')).find(node => usable(node) && /^(继续学习|继续播放|返回视频)$/.test(text(node)));
            if (button) { receipt.continued = true; button.click(); publish('等待网站确认', '已点击继续学习，等待题框关闭'); return; }
          }
          if (receipt.status !== 'accepted' || batch.popup) {
            const failed = receipt.status === 'rejected' || receipt.status === 'unknown' || now() - receipt.at > 15000;
            publish(failed ? '需要人工处理' : '等待网站确认', receipt.status === 'accepted' ? '网站已接受，等待题框关闭' : '提交结果尚未确认；不会重复提交');
            return;
          }
          receipt = null; active = null;
        }
        if (batch.popup) {
          findVideo()?.pause();
          recognition = batch.diagnostic;
          parseBlocked = batch.unsupported;
          if (batch.unsupported) { publish('需要人工处理', `识别到 ${batch.diagnostic.questionCount} 题、成功 ${batch.questions.length} 题；${batch.diagnostic.issues.join('；')}`, true); return; }
          if (!options.settings().answer) { publish('已暂停答题', '自动答题已关闭'); return; }
          const states = [];
          for (const parsed of batch.questions) {
            if (!allowed()) return;
            const state = await solve(parsed);
            if (!state) return;
            if (state.phase === 'blocked') { publish('需要人工处理', state.question.answer.join('；'), true); return; }
            states.push(state);
          }
          if (!states.length || !options.settings().submit) { publish('已填选', '自动提交已关闭，请人工确认'); return; }
          if (!states.every(state => state.phase === 'filled' && selected(state))) { publish('需要人工处理', '答案被修改或填选未完成'); return; }
          if (states.some(state => now() - state.at < options.delay())) { publish('等待提交', '等待操作间隔'); return; }
          const button = Array.from(batch.popup.querySelectorAll('.dialog-footer button, button, [role="button"]')).find(node => usable(node) && /^(提交作答|提交答案|提交|确定)$/.test(text(node)));
          if (!button) { publish('需要人工处理', '未找到可用的提交作答按钮'); return; }
          const key = JSON.stringify(['wisdom-study-popup', batch.questions.map(parsed => parsed.key)]);
          if (options.sharedReceipts.get(key) || !options.sharedReceipts.reserve(key)) { publish('需要人工处理', '本题已有提交记录，请检查网站结果'); return; }
          receipt = { key, states, at: now(), status: 'pending' };
          for (const state of states) { state.phase = 'submitted'; state.question.submissionStatus = '等待网站确认'; }
          button.click(); publish('等待网站确认', '已点击提交作答，等待网站回执'); return;
        }
        parseBlocked = false; recognition = null;
        await processVideo();
      } catch (error) { publish('需要人工处理', String(error.message || '流程异常')); log('当前流程停止，请检查页面状态', 'warning'); }
      finally { busy = false; }
    }
    return {
      tick, getStatus: () => ({ ...status, cacheSize: cache.size }), setVideoSpeed: () => false,
      clearCache() { cache.clear(); publish(status.label, status.detail, status.canRetry); },
      retryCurrent() {
        if (!allowed() || receipt) return false;
        if (parseBlocked) { parseBlocked = false; options.onWake?.(); return true; }
        if (!active || active.phase !== 'blocked' || options.requestPacer.remaining() > 0) return false;
        records.delete(active.parsed.key); cache.delete(active.parsed.cacheKey); cancel('重试当前题'); options.onWake?.(); return true;
      },
      pause() { paused = true; options.setEnabled(false); cancel('用户暂停'); findVideo()?.pause(); publish('已暂停', '助手与视频已暂停'); },
      resume() { paused = false; options.setEnabled(true); if (media) media.playBlocked = false; options.onWake?.(); },
      suspend() { suspended = true; cancel('页面已挂起'); },
      restore() { suspended = false; if (media) media.playBlocked = false; options.onWake?.(); },
      dispose() { if (disposed) return; disposed = true; cancel('流程结束'); stopReceiptObserver(); records.clear(); cache.clear(); }
    };
  }
