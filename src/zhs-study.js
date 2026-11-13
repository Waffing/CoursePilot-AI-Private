  // 智慧树 /study/index 学习页适配；选择器仍需真实页面验收。
  const ZHS_STUDY_SELECTORS = {
    quizContainer: ['.videoInnerQuestion', '.poped', '.popContainer', '.video-quiz-wrap', '.questionPopWrap', '.innerQuestion'],
    questionItem: ['.questionItem', '.examPaper_subject', '.subject-item', '.quiz-item', '.questionLi'],
    questionTitle: ['.questionDetail', '.subject_describe div', '.stem-content', '.questionStem p', '.questionStem', 'p.detail', '.titleText'],
    options: ['.questionOption', '.label', '.optionLi', '.option-item', '.answerItem'],
    optionText: ['.node_detail', '.option-text', 'span.txt', 'p', 'span'],
    confirmBtn: ['button.confirmBtn', '.sureBtn', 'button.submitBtn', 'button.confirmButton', 'button.sure-btn', '.confirmBtnBox button']
  };
  const _zhsFindEl = (selectors, root = _unsafeWindow.document) => {
    for (const selector of selectors) {
      const element = root.querySelector(selector);
      if (element) return element;
    }
    return null;
  };
  const _zhsFindEls = (selectors, root = _unsafeWindow.document) => {
    for (const selector of selectors) {
      const elements = Array.from(root.querySelectorAll(selector));
      if (elements.length) return elements;
    }
    return [];
  };
  const _zhsVisible = (element) => {
    if (!element || element.isConnected === false) return false;
    const style = _unsafeWindow.getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0' && element.getClientRects().length > 0;
  };
  const _zhsSelected = (element) => {
    if (element.querySelector('input')?.checked) return true;
    if (element.getAttribute('aria-checked') === 'true') return true;
    return /\b(active|checked|selected|is-checked)\b/.test(String(element.className || '')) ||
      !!element.querySelector('.active, .checked, .selected, .is-checked');
  };
  const _zhsClickEl = (element) => {
    if (!element) return false;
    if (!_zhsSelected(element)) {
      const input = element.querySelector('input');
      if (input) input.click();
      else element.click();
    }
    return _zhsSelected(element);
  };
  const _zhsMatchOption = (options, answer) => {
    const normalize = (value) => {
      const text = String(value).normalize('NFKC').replace(/\s+/g, '').toLowerCase();
      if (/^(正确|是|对|√|t|true)$/.test(text)) return 'true';
      if (/^(错误|否|错|×|f|false)$/.test(text)) return 'false';
      return text;
    };
    const value = normalize(answer);
    if (!value) return null;
    const matches = Object.entries(options).filter(([text]) => normalize(text) === value);
    return matches.length === 1 ? matches[0][1] : null;
  };
  const _zhsQuizInFlight = new WeakSet();
  const _zhsQuizSubmitted = new WeakMap();
  const _zhsHandleQuiz = async (logStore, questionStore, isCurrent = () => true) => {
    const container = _zhsFindEl(ZHS_STUDY_SELECTORS.quizContainer);
    if (!_zhsVisible(container) || !isCurrent() || _zhsQuizInFlight.has(container)) return false;
    const fingerprint = () => container.textContent?.trim() || '';
    const signature = fingerprint();
    if (_zhsQuizSubmitted.get(container) === signature) return false;
    _zhsQuizInFlight.add(container);
    const current = () => isCurrent() && _zhsVisible(container) && fingerprint() === signature;
    try {
      await sleep(1.5);
      if (!current()) return false;
      const questionElements = _zhsFindEls(ZHS_STUDY_SELECTORS.questionItem, container);
      if (!questionElements.length) return false;
      logStore.addLog(`视频弹题：发现 ${questionElements.length} 道题`, 'primary');
      let allFilled = true;
      for (const [index, element] of questionElements.entries()) {
        if (!current()) return false;
        const titleElement = _zhsFindEl(ZHS_STUDY_SELECTORS.questionTitle, element);
        const title = (titleElement?.textContent || '').trim();
        const optionElements = _zhsFindEls(ZHS_STUDY_SELECTORS.options, element);
        const options = Object.create(null);
        const optionTexts = [];
        for (const option of optionElements) {
          const textElement = _zhsFindEl(ZHS_STUDY_SELECTORS.optionText, option);
          const text = (textElement?.textContent || option.textContent || '').replace(/^[A-Za-z][.、\s]/, '').trim();
          if (text) { options[text] = option; optionTexts.push(text); }
        }
        if (!title || new Set(optionTexts).size !== optionTexts.length) { allFilled = false; continue; }
        const fields = [...element.querySelectorAll('input[type="text"], input:not([type]), textarea')].filter((field) => !field.disabled && !field.hidden);
        const isJudge = optionTexts.length === 2 && optionTexts.every((text) => /^(正确|错误|是|否|对|错|true|false|√|×)$/i.test(text));
        const isMulti = !!element.querySelector('input[type="checkbox"]');
        const type = isJudge ? '判断题' : isMulti ? '多选题' : optionTexts.length ? '单选题' : fields.length ? '填空题' : '其他';
        if (type === '其他') { allFilled = false; continue; }
        const question = vue.reactive({
          title, type, optionsText: optionTexts, options,
          searchText: { stem: title, options: optionTexts },
          answer: [], answerStatus: 'searching', workType: 'zhs', refer: _unsafeWindow.location.href
        });
        questionStore.addQuestion(question);
        const response = await getAnswer(question, { isCurrent: current });
        if (!current()) return false;
        const values = getAnswerValues(response, question);
        if (!values?.length) {
          question.answerStatus = 'error';
          question.answer = [response?.error?.message || '未获得答案'];
          allFilled = false;
          logStore.addLog(`弹题第${index + 1}题未获得答案`, 'danger');
          continue;
        }
        question.answer = values;
        let filled = true;
        if (optionTexts.length) {
          const matched = values.map((value) => _zhsMatchOption(options, value));
          filled = matched.every(Boolean) && new Set(matched).size === matched.length && (isMulti || matched.length === 1);
          if (filled) {
            const targets = new Set(matched);
            for (const option of optionElements) {
              if (_zhsSelected(option) && !targets.has(option)) {
                if (isMulti) (option.querySelector('input') || option).click();
                else if (isJudge || type === '单选题') continue;
              }
            }
            filled = matched.every((option) => _zhsClickEl(option));
            filled = filled && optionElements.every((option) => _zhsSelected(option) === targets.has(option));
          }
        } else {
          filled = fields.length === values.length;
          if (filled) fields.forEach((field, fieldIndex) => {
            const value = String(values[fieldIndex]);
            const proto = field.tagName === 'TEXTAREA' ? _unsafeWindow.HTMLTextAreaElement?.prototype : _unsafeWindow.HTMLInputElement?.prototype;
            const setter = proto && Object.getOwnPropertyDescriptor(proto, 'value')?.set;
            if (setter) setter.call(field, value);
            else field.value = value;
            const EventClass = field.ownerDocument?.defaultView?.Event || Event;
            field.dispatchEvent(new EventClass('input', { bubbles: true }));
            field.dispatchEvent(new EventClass('change', { bubbles: true }));
            if (field.value !== value) filled = false;
          });
        }
        question.answerStatus = filled ? 'success' : 'error';
        allFilled = allFilled && filled;
        logStore.addLog(`弹题第${index + 1}题${filled ? '已填选' : '填选未通过核对'}`, filled ? 'success' : 'danger');
      }
      if (!allFilled || !current()) return false;
      await sleep(1);
      if (!current()) return false;
      const confirm = _zhsFindEl(ZHS_STUDY_SELECTORS.confirmBtn, container);
      if (!confirm || confirm.disabled || confirm.getAttribute('aria-disabled') === 'true') return false;
      _zhsQuizSubmitted.set(container, signature);
      confirm.click();
      logStore.addLog('弹题已点击提交，等待网站确认', 'primary');
      return true;
    } catch {
      _zhsQuizSubmitted.delete(container);
      logStore.addLog('弹题处理失败，已停止本次提交', 'danger');
      return false;
    } finally {
      _zhsQuizInFlight.delete(container);
    }
  };
  let _zhsStudyCleanup = null;
  const useZhsStudyLogic = () => {
    const page = _unsafeWindow;
    if (page.location.hostname !== 'wisdom-mooc.zhihuishu.com' || !/^\/study\/index\/?$/.test(page.location.pathname)) return;
    if (_zhsStudyCleanup) return;
    const logStore = useLogStore();
    const questionStore = useQuestionStore();
    const configStore = useConfigStore();
    questionStore.clearQuestion();
    logStore.addLog('检测到智慧树学习页；本适配尚待真实页面验收', 'warning');
    let disposed = false;
    let quizTimer = null;
    const listeners = new Map();
    const isCurrent = () => !disposed && page.location.hostname === 'wisdom-mooc.zhihuishu.com' && /^\/study\/index\/?$/.test(page.location.pathname);
    const handleQuiz = () => _zhsHandleQuiz(logStore, questionStore, isCurrent);
    const goNextChapter = async () => {
      if (configStore.platformParams.zhs.parts[0].params[0].value !== true) return;
      await sleep(configStore.otherParams?.params?.[0]?.value ?? 3);
      if (!isCurrent()) return;
      const next = _zhsFindEl(['.nextChapter', 'button.nextBtn', '.next-chapter', '.studyBtn.next', '.go-next', '[data-action="next"]']);
      if (next && !next.disabled && _zhsVisible(next)) {
        next.click();
        logStore.addLog('视频已结束，已点击下一章节；进度以网站记录为准', 'primary');
      } else logStore.addLog('未找到可用的下一章节按钮，请手动切换', 'warning');
    };
    const bindVideo = (video) => {
      if (listeners.has(video)) return;
      const ended = () => { void goNextChapter(); };
      const pause = () => {
        void handleQuiz().then(async (handled) => {
          if (!handled) return;
          await sleep(1.5);
          if (isCurrent() && !_zhsVisible(_zhsFindEl(ZHS_STUDY_SELECTORS.quizContainer))) {
            video.play().catch(() => {});
          }
        });
      };
      video.addEventListener('ended', ended);
      video.addEventListener('pause', pause);
      listeners.set(video, { ended, pause });
      // 保留网站当前倍速，不强制覆盖播放器或用户的选择。
      if (video.paused && !video.ended && !_zhsVisible(_zhsFindEl(ZHS_STUDY_SELECTORS.quizContainer))) {
        video.play().catch(() => logStore.addLog('请手动点击一次播放以允许自动播放', 'warning'));
      }
    };
    const scanVideos = () => {
      if (!isCurrent()) { dispose(); return; }
      const doc = page.document;
      doc.querySelectorAll('video').forEach(bindVideo);
      doc.querySelectorAll('iframe').forEach((frame) => {
        try { frame.contentDocument?.querySelectorAll('video').forEach(bindVideo); } catch {}
      });
      for (const [video, handlers] of listeners) {
        if (video.isConnected === false) {
          video.removeEventListener('ended', handlers.ended);
          video.removeEventListener('pause', handlers.pause);
          listeners.delete(video);
        }
      }
    };
    const observer = new MutationObserver(() => {
      if (!isCurrent() || quizTimer !== null) return;
      quizTimer = setTimeout(() => { quizTimer = null; void handleQuiz(); }, 150);
    });
    const videoTimer = setInterval(scanVideos, 3000);
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      observer.disconnect();
      clearInterval(videoTimer);
      clearTimeout(quizTimer);
      for (const [video, handlers] of listeners) {
        video.removeEventListener('ended', handlers.ended);
        video.removeEventListener('pause', handlers.pause);
      }
      listeners.clear();
      page.removeEventListener('pagehide', dispose);
      _zhsStudyCleanup = null;
    };
    _zhsStudyCleanup = dispose;
    page.addEventListener('pagehide', dispose);
    observer.observe(page.document.body || page.document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] });
    scanVideos();
    void handleQuiz();
  };
