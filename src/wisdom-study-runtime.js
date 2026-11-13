  function isWisdomStudyPage() {
    return helperPage.location.hostname === 'wisdom-mooc.zhihuishu.com' && /^\/study\/index\/?$/.test(helperPage.location.pathname);
  }
  let wisdomStudySession = null;
  const useWisdomStudyLogic = () => {
    const page = _unsafeWindow;
    if (!isWisdomStudyPage() || page.top !== page.self || wisdomStudySession) return;
    const config = useConfigStore(), logs = useLogStore(), questions = useQuestionStore();
    const params = config.platformParams.wisdomStudy.parts[0].params;
    const labels = { enabled: '启用助手', play: '视频自动播放和续播', muted: '静音播放', answer: 'AI随堂练习自动答题', submit: '核对选项后自动提交', nextCourse: '完成后提醒手动切课' };
    const preferences = () => getHelperPreferences(config.helperPreferences);
    let panelUI = null, disposed = false, suspended = false, scheduled = false, heartbeat = null, observer;
    let coordinator, controller;
    const schedule = () => {
      if (disposed || suspended || scheduled || !controller) return;
      scheduled = true;
      queueMicrotask(async () => {
        scheduled = false;
        if (disposed || suspended) return;
        if (!isWisdomStudyPage()) { dispose(); return; }
        await controller.tick();
      });
    };
    coordinator = helperTabCoordinator = createHelperCoordinator(page, schedule);
    const pacer = getSharedHelperPacer();
    const networkStatus = helperNetworkStatus = (seconds, cooling) => {
      if (coordinator.isOwner()) panelUI?.update({ ...controller.getStatus(), label: cooling ? '请求冷却' : '等待请求', detail: `请求队列等待，${seconds} 秒后继续` });
    };
    controller = createWisdomStudyController(page, {
      canRun: () => coordinator.isOwner(),
      settings: () => Object.fromEntries(Object.entries(labels).map(([key, label]) => [key, params.find(param => param.name === label)?.value === true])),
      modelIdentity: () => JSON.stringify([config.queryApis[0], config.modelSearch, config.helperFallbackModel]),
      setEnabled: value => { params.find(param => param.name === labels.enabled).value = value; },
      delay: () => preferences().actionDelay * 1000,
      requestPacer: pacer,
      sharedReceipts: { get: key => coordinator.getReceipt(md5(key)), reserve: key => coordinator.reserve(md5(key)), record: (key, value) => coordinator.record(md5(key), value) },
      resolve: (question, context) => queryHelperAnswer(question, context, {
        primary: cloneLatestValue(config.queryApis[0]), fallback: getHelperFallback(config),
        waitSeconds: config.helperFallbackModel.waitSeconds, enabled: config.helperFallbackModel.enabled,
        resolve: getAnswer, log: (message, type) => logs.addLog(message, type)
      }),
      loadImages: (sources, context) => loadJcedutecImages(sources, context, /(^|\.)zhihuishu\.com$/i),
      addQuestion: parsed => { const question = vue.reactive(parsed); questions.addQuestion(question); return question; },
      onStatus: state => panelUI?.update(state), onWake: schedule, log: (message, type) => logs.addLog(message, type)
    });
    wisdomStudySession = controller;
    const instance = vue.getCurrentInstance();
    const mediaEvents = ['loadedmetadata', 'loadeddata', 'canplay', 'playing', 'waiting', 'ended', 'pause', 'emptied', 'error'];
    const onMedia = event => { if (event.target?.tagName === 'VIDEO') schedule(); };
    const relevant = 'video, source, .ai-class-exercise-dialog, .videoInnerQuestion, .video-quiz-wrap, .questionPopWrap, .yidun_popup, .yidun_panel, .geetest_panel, [class*="captcha"], .face-id-mask, .el-dialog';
    observer = new MutationObserver(records => {
      if (records.some(record => {
        const node = record.target.nodeType === 1 ? record.target : record.target.parentElement;
        return node?.matches(relevant) || node?.closest(relevant) || [...record.addedNodes, ...record.removedNodes].some(item => item.nodeType === 1 && (item.matches(relevant) || item.querySelector(relevant)));
      })) schedule();
    });
    observer.observe(page.document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class', 'style', 'src', 'disabled', 'aria-hidden', 'aria-checked'] });
    for (const event of mediaEvents) page.document.addEventListener(event, onMedia, true);
    page.addEventListener('popstate', schedule);
    page.addEventListener('hashchange', schedule);
    const stopConfig = vue.watch(() => [config.platformParams.wisdomStudy, config.queryApis, config.modelSearch, config.helperFallbackModel, config.helperPreferences], schedule, { deep: true });
    const start = () => { if (heartbeat === null) heartbeat = setInterval(schedule, 1000); schedule(); };
    const onHide = event => {
      suspended = true; clearInterval(heartbeat); heartbeat = null;
      if (event.persisted) { coordinator.suspend(); controller.suspend(); } else dispose();
    };
    const onShow = event => { if (event.persisted && !disposed) { suspended = false; coordinator.restore(); controller.restore(); start(); panelUI?.clamp(); } };
    function dispose() {
      if (disposed) return;
      disposed = true; clearInterval(heartbeat); heartbeat = null; observer.disconnect(); stopConfig(); controller.dispose(); coordinator.dispose(); panelUI?.dispose();
      for (const event of mediaEvents) page.document.removeEventListener(event, onMedia, true);
      page.removeEventListener('popstate', schedule); page.removeEventListener('hashchange', schedule);
      page.removeEventListener('pagehide', onHide); page.removeEventListener('pageshow', onShow);
      if (helperTabCoordinator === coordinator) helperTabCoordinator = null;
      if (helperNetworkStatus === networkStatus) helperNetworkStatus = null;
      wisdomStudySession = null;
    }
    page.addEventListener('pagehide', onHide); page.addEventListener('pageshow', onShow);
    vue.onMounted(() => {
      const panel = instance?.proxy?.$el?.closest('.main-page');
      if (panel) panelUI = mountJcedutecPanel(panel, config, controller, {
        takeover: () => coordinator.takeover(),
        diagnostic: () => createHelperDiagnostic(config, controller.getStatus(), logs.logList, page.location)
      });
    });
    vue.onBeforeUnmount(dispose);
    logs.addLog('智慧树学习助手已启动：AI随堂练习答题、确认后续播、保存后提醒手动切课', 'success');
    logs.addLog('网站要求真实点击切课，请手动点击网站下一节；新视频加载后自动续播', 'warning');
    logs.addLog('遇到验证码、登录验证或未知提交结果时暂停；本版本仍需真实登录课堂验收', 'warning');
    start();
  };
