  async function loadJcedutecImages(sources, context, allowedHost = /(^|\.)jcedutec\.cn$/i) {
    if (sources.length > 6) return Promise.reject(new Error("本题图片超过6张，请人工处理"));
    const assets = [];
    for (const source of sources) {
      if (context.beforeRequest && !await context.beforeRequest()) throw new Error("图片请求已取消");
      assets.push(await new Promise((resolve, reject) => {
      const url = new URL(source, window.location.href);
      if (!["https:", "http:"].includes(url.protocol) || !allowedHost.test(url.hostname)) {
        reject(new Error("题目图片不在本站资源域名内，请人工确认"));
        return;
      }
      let request;
      let settled = false;
      const finish = (error, value) => {
        if (settled) return;
        settled = true;
        context.signal.removeEventListener("abort", abort);
        if (error) reject(error); else resolve(value);
      };
      const abort = () => { finish(new Error("图片请求已取消")); request?.abort(); };
      context.signal.addEventListener("abort", abort, { once: true });
      if (context.signal.aborted || !context.isCurrent()) return abort();
      try {
        request = _GM_xmlhttpRequest({
          url: url.href, method: "GET", responseType: "arraybuffer", timeout: 20000,
          anonymous: url.hostname !== window.location.hostname,
          onload: (response) => {
            if (!context.isCurrent()) return abort();
            if (response.status < 200 || response.status >= 300) return finish(new Error(`题目图片读取失败（HTTP ${response.status}）`));
            const bytes = new Uint8Array(response.response);
            if (!bytes.length || bytes.length > 5 * 1024 * 1024) return finish(new Error("题目图片为空或超过5MB"));
            const mimeType = bytes[0] === 0x89 && bytes[1] === 0x50 ? "image/png" :
              bytes[0] === 0xff && bytes[1] === 0xd8 ? "image/jpeg" :
              bytes[0] === 0x47 && bytes[1] === 0x49 ? "image/gif" :
              String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP" ? "image/webp" : "";
            if (!mimeType) return finish(new Error("题目图片格式不受模型支持，请人工处理"));
            let binary = "";
            for (let i = 0; i < bytes.length; i += 16384) binary += String.fromCharCode(...bytes.subarray(i, i + 16384));
            finish(null, { mimeType, data: btoa(binary) });
          },
          onerror: () => finish(new Error("题目图片读取失败，请检查网络")),
          ontimeout: () => finish(new Error("题目图片读取超时")),
          onabort: () => finish(new Error("图片请求已取消"))
        });
      } catch { finish(new Error("无法读取题目图片，请检查脚本管理器权限")); }
      }));
    }
    return assets;
  }

  const useJcedutecLogic = () => {
    if (_unsafeWindow.location.hostname !== "bbgu.jcedutec.cn" || _unsafeWindow.top !== _unsafeWindow.self) return;
    if (_unsafeWindow.__courseHelperSession291) return;
    const config = useConfigStore();
    const logs = useLogStore();
    const questions = useQuestionStore();
    const labels = {
      enabled: "启用助手", play: "视频自动播放和续播", muted: "静音播放", speed: "视频自动倍速",
      answer: "视频弹题和题库练习自动答题", submit: "核对选项后自动提交",
      nextCourse: "课程完成后自动下一视频", nextQuestion: "题库练习自动下一题"
    };
    let panelUI = null;
    let timer = null;
    let wakeToken = null;
    let disposed = false;
    let suspended = false;
    let running = false;
    let dirty = false;
    function schedule() {
      if (disposed || suspended) return;
      dirty = true;
      if (wakeToken !== null) return;
      const token = wakeToken = {};
      queueMicrotask(async () => {
        if (wakeToken !== token) return;
        wakeToken = null;
        if (disposed || suspended) return;
        if (running) { void controller.tick(); return; }
        dirty = false;
        running = true;
        try { await controller.tick(); }
        finally { running = false; if (dirty) schedule(); }
      });
    }
    const instance = vue.getCurrentInstance();
    const preferences = () => getHelperPreferences(config.helperPreferences);
    let coordinator;
    coordinator = helperTabCoordinator = createHelperCoordinator(_unsafeWindow, () => {
      if (coordinator && !coordinator.isOwner()) void controller.tick();
      schedule();
    });
    const pacer = getSharedHelperPacer();
    helperNetworkStatus = (seconds, cooling) => {
      if (coordinator.isOwner()) panelUI?.update({...controller.getStatus(), label: cooling ? "请求冷却" : "等待请求", detail: `请求队列等待，${seconds} 秒后可继续`});
    };
    const speedRate = config.platformParams.jcedutec.parts[0].params.find((param) => param.name === "视频倍速档位（0为自动）");
    const controller = createJcedutecController(_unsafeWindow, {
      canRun: () => coordinator.isOwner(),
      requestPacer: pacer,
      sharedReceipts: {get: (key) => coordinator.getReceipt(md5(key)), reserve: (key) => coordinator.reserve(md5(key)), record: (key, result) => coordinator.record(md5(key), result)},
      settings: () => Object.fromEntries(Object.entries(labels).map(([key, label]) => [key,
        config.platformParams.jcedutec.parts[0].params.find((param) => param.name === label)?.value === true
      ])),
      modelIdentity: () => JSON.stringify([config.queryApis[0], config.modelSearch, config.helperFallbackModel]),
      setEnabled: (value) => { config.platformParams.jcedutec.parts[0].params.find((param) => param.name === labels.enabled).value = value; },
      onStatus: (state) => panelUI?.update(state),
      onSpeedStatus: () => panelUI?.update(controller.getStatus()),
      onWake: schedule,
      initialSpeed: () => speedRate?.value ?? 0,
      saveSpeed: (rate) => { if (speedRate) speedRate.value = rate; },
      delay: () => preferences().actionDelay * 1000,
      requestInterval: () => preferences().requestInterval * 1000,
      resolve: (question, context) => queryHelperAnswer(question, context, {
        primary: cloneLatestValue(config.queryApis[0]), fallback: getHelperFallback(config),
        waitSeconds: config.helperFallbackModel.waitSeconds, enabled: config.helperFallbackModel.enabled,
        resolve: getAnswer, log: (message, type) => logs.addLog(message, type)
      }),
      loadImages: loadJcedutecImages,
      addQuestion: (parsed) => {
        const question = vue.reactive(parsed);
        questions.addQuestion(question);
        return question;
      },
      log: (message, type) => logs.addLog(message, type)
    });
    logs.addLog("助手已启动：进入课程、练习，或在考试列表选择正式／模拟试卷后开始", "success");
    logs.addLog("模型连接沿用“答题”页配置；可在“设置”暂停答题、提交或切换", "primary");
    const start = () => {
      if (disposed) return;
      if (timer === null) timer = setInterval(schedule, 1000);
      schedule();
    };
    const stop = () => {
      clearInterval(timer); timer = null;
      wakeToken = null; dirty = false;
    };
    const mediaEvents = ["loadedmetadata", "loadeddata", "canplay", "playing", "waiting", "ended", "pause", "emptied", "error", "ratechange"];
    const onMedia = (event) => { if (event.target?.tagName === "VIDEO") schedule(); };
    const modalSelector = ".ant-modal-root, .ant-modal-wrap, .ant-modal-content, .exam-modal, .geetest_panel, .geetest_holder, .yidun_popup, [class*='captcha']";
    const relevantSelector = "video, source, " + modalSelector;
    const observer = new MutationObserver((records) => {
      if (records.some((record) => (record.target.nodeType === 1 ? record.target.matches(relevantSelector) || record.target.closest(modalSelector) : record.target.parentElement?.closest(modalSelector)) ||
          Array.from(record.addedNodes).concat(Array.from(record.removedNodes)).some((node) =>
            node.nodeType === 1 && (node.matches(relevantSelector) || node.querySelector(relevantSelector))))) schedule();
    });
    observer.observe(_unsafeWindow.document.documentElement, {subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["src", "style", "class", "disabled", "value", "type", "aria-hidden"]});
    for (const event of mediaEvents) _unsafeWindow.document.addEventListener(event, onMedia, true);
    _unsafeWindow.addEventListener("popstate", schedule);
    const stopConfig = vue.watch(() => [config.platformParams.jcedutec, config.queryApis, config.modelSearch, config.helperFallbackModel, config.helperPreferences], schedule, {deep: true});
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      stop(); observer.disconnect(); stopConfig();
      for (const event of mediaEvents) _unsafeWindow.document.removeEventListener(event, onMedia, true);
      _unsafeWindow.removeEventListener("popstate", schedule);
      controller.dispose(); panelUI?.dispose(); coordinator.dispose();
      helperTabCoordinator = null; helperNetworkStatus = null;
      _unsafeWindow.removeEventListener("pagehide", onHide);
      _unsafeWindow.removeEventListener("pageshow", onShow);
      if (_unsafeWindow.__courseHelperSession291?.controller === controller) delete _unsafeWindow.__courseHelperSession291;
    };
    const onHide = (event) => {
      suspended = true; stop();
      if (event.persisted) { coordinator.suspend(); controller.suspend(); } else dispose();
    };
    const onShow = (event) => { if (event.persisted && !disposed) { suspended = false; coordinator.restore(); controller.restore(); start(); panelUI?.clamp(); } };
    _unsafeWindow.__courseHelperSession291 = {controller};
    _unsafeWindow.addEventListener("pagehide", onHide);
    _unsafeWindow.addEventListener("pageshow", onShow);
    vue.onMounted(() => {
      const panel = instance.proxy.$el.closest(".main-page");
      if (panel) panelUI = mountJcedutecPanel(panel, config, controller, {takeover: () => coordinator.takeover(), diagnostic: () => createHelperDiagnostic(config, controller.getStatus(), logs.logList, _unsafeWindow.location)});
    });
    vue.onBeforeUnmount(dispose);
    start();
  };
