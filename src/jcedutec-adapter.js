  // BEGIN JCEDUTEC ADAPTER
  function createJcedutecController(pageWindow, options) {
    const doc = pageWindow.document;
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const visible = (element) => {
      if (!element?.isConnected || !element.getClientRects().length) return false;
      const style = pageWindow.getComputedStyle(element);
      return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
    };
    const available = (element) => visible(element) && !element.disabled && element.getAttribute("aria-disabled") !== "true";
    const text = (element) => (element?.textContent || "").replace(/\s+/g, " ").trim();
    const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
    const normalized = (value) => String(value).normalize("NFKC").replace(/^\s*[A-Z]\s*[.:：、]\s*/i, "").replace(/\s+/g, "").toLowerCase();
    const judgement = (value) => {
      const token = normalized(value);
      if (["正确", "对", "是", "true", "√", "是正确的"].includes(token)) return "正确";
      if (["错误", "错", "否", "false", "×", "不正确"].includes(token)) return "错误";
      return "";
    };
    const route = () => pageWindow.location.pathname.replace(/\/$/, "");
    const isCourse = () => route() === "/students/courseDetail";
    const isPractice = () => route() === "/students/practice";
    const isExam = () => route() === "/students/questionList";
    const log = (message, type = "primary") => options.log(escapeHtml(message), type);
    let disposed = false;
    let suspended = false;
    let manualPaused = false;
    let busy = false;
    let active = null;
    let view = null;
    let lastLocation = "";
    let wasEnabled = true;
    let playBlocked = "";
    let videoSource = "";
    let navigation = null;
    let completionNotice = "";
    let verificationShown = false;
    let parseNotice = false;
    let bufferSince = 0;
    let bufferWarned = false;
    let endedSince = 0;
    let cacheModel = options.modelIdentity();
    const cache = new Map();
    const submissions = new Map();
    let status = { label: "需要人工处理", detail: "等待课程或练习页面", canRetry: false, paused: false, cacheSize: 0 };
    const enabled = () => options.settings().enabled && !manualPaused;
    const requestPacer = createHelperRequestPacer({
      interval: () => Math.max(0, options.requestInterval?.() || 0),
      onWait: (seconds, cooling) => publish(cooling ? "请求冷却" : "等待请求", `${cooling ? "接口暂时不可用" : "按请求间隔等待"}，${seconds} 秒后可继续`)
    });
    const speedController = createVideoSpeedController(pageWindow, {isEnabled: () => options.settings().speed === true, initialRate: options.initialSpeed, saveRate: options.saveSpeed, log, onStatus: () => options.onSpeedStatus?.(speedController.getStatus())});
    const examFlow = createExamFlow(pageWindow, {
      getView: () => isExam() ? findView() : null, isCurrent: (state) => current(state),
      settings: options.settings, delay: options.delay, button, publish: (...args) => publish(...args), log,
      allowed: () => !disposed && !suspended && enabled() && !blocked() && isExam(),
      onSubmit: () => cancelQuestion("网站已发出交卷请求")
    });
    const publish = (label, detail = "", canRetry = false) => {
      status = { label, detail, canRetry, paused: !enabled() || suspended, cacheSize: cache.size, speedText: speedController.getStatus(), speedRates: speedController.getRates(), selectedSpeed: speedController.getSelectedRate(), speedEnabled: options.settings().speed === true };
      options.onStatus?.({ ...status });
    };
    const blocked = () => Array.from(doc.querySelectorAll(".geetest_panel, .geetest_holder, .yidun_popup, [class*='captcha']")).some(visible) ||
      Array.from(doc.querySelectorAll(".ant-modal-content")).some((element) => visible(element) && /验证码|人机验证|滑动验证|身份验证|重新登录/.test(text(element)));
    const cacheKey = (parsed) => parsed.images.length ? null : JSON.stringify([parsed.question.searchText.stem, parsed.question.type, parsed.question.searchText.options]);
    const completion = new Map();
    const completedCourses = new Set();
    const sourceOf = (video) => video?.getAttribute("src") || video?.currentSrc || "";
    const courseKey = (id, graphId) => JSON.stringify([String(id || ""), String(graphId || "")]);

    function findView() {
      if (view && !view._isDestroyed && doc.contains(view.$el) &&
          (isCourse() ? Array.isArray(view.treeData) : isExam() ? "recordId" in view && Array.isArray(view.records) : view.form && Array.isArray(view.records))) return view;
      const queue = [doc.querySelector("#app")?.__vue__].filter(Boolean);
      const seen = new Set();
      for (let i = 0; i < queue.length && i < 500; i++) {
        const candidate = queue[i];
        if (!candidate || seen.has(candidate)) continue;
        seen.add(candidate);
        if (isCourse() && Array.isArray(candidate.treeData) && candidate.$refs?.videoPlayer ||
            isPractice() && candidate.form && Array.isArray(candidate.records) && typeof candidate.confirm === "function" ||
            isExam() && "recordId" in candidate && Array.isArray(candidate.records) && typeof candidate.selectQuestion === "function") {
          view = candidate;
          return view;
        }
        queue.push(...(candidate.$children || []));
      }
      return null;
    }

    // Observe native receipts; the helper never generates progress or receipt requests.
    const prototype = pageWindow.XMLHttpRequest.prototype;
    const originalOpen = prototype.open;
    const originalSend = prototype.send;
    const finishRequests = new WeakMap();
    function observedOpen(method, address, ...rest) {
      let url;
      try { url = new URL(String(address), pageWindow.location.href); } catch {}
      let backendOrigin = pageWindow.location.origin;
      try { backendOrigin = new URL(pageWindow._CONFIG?.domianURL || pageWindow.location.href).origin; } catch {}
      if (url && [pageWindow.location.origin, backendOrigin].includes(url.origin) && /\/jcedutec\/courseSource\/(finish|submitAnswer)$/.test(url.pathname))
        finishRequests.set(this, { url, kind: url.pathname.endsWith("/finish") ? "finish" : "submit" });
      else if (url && [pageWindow.location.origin, backendOrigin].includes(url.origin) && /\/jcedutec\/exam\/submitExam\/[^/]+$/.test(url.pathname))
        finishRequests.set(this, {url, kind: "exam"});
      else finishRequests.delete(this);
      return originalOpen.call(this, method, address, ...rest);
    }
    function observedSend(body) {
      const request = finishRequests.get(this);
      if (request?.kind === "exam") {
        examFlow.observe(this, request.url);
        return originalSend.call(this, body);
      }
      if (request) {
        let data = {};
        try { data = typeof body === "string" ? JSON.parse(body) : {}; } catch {}
        const id = data?.id || request.url.searchParams.get("id");
        const graphId = data?.graphId || request.url.searchParams.get("graphId");
        const key = courseKey(id, graphId);
        const source = sourceOf(findView()?.$refs?.videoPlayer);
        const state = request.kind === "submit" && active && String(data?.questionId) === String(findView()?.questionId) ? active : null;
        if (state) {
          state.phase = "submitted";
          state.at = Date.now();
          state.receipt = "pending";
          state.question.submissionStatus = "等待网站确认";
          submissions.set(state.parsed.key, state);
        }
        this.addEventListener("loadend", () => {
          if (disposed || !id || !graphId) return;
          let payload;
          try { payload = this.responseType === "json" ? this.response : JSON.parse(this.responseText); } catch {}
          const success = this.status >= 200 && this.status < 300 && payload?.success === true;
          const rejected = payload?.success === false;
          const result = success ? "accepted" : rejected ? "rejected" : "unknown";
          const message = typeof payload?.message === "string" ? payload.message.slice(0, 200) : "";
          if (request.kind === "finish") completion.set(key, { success, result, message, source, at: Date.now() });
          else if (state) {
            state.receipt = result;
            state.receiptMessage = message;
            state.question.submissionStatus = success ? "网站已接受提交" : rejected ? "网站拒绝提交" : "提交尚未确认";
            log(state.question.submissionStatus + (rejected && message ? `：${message}` : ""), success ? "success" : "warning");
            if (active === state && enabled() && !suspended) publish(success ? "等待网站确认" : "需要人工处理", state.question.submissionStatus + (rejected && message ? `：${message}` : ""));
          }
        }, { once: true });
      }
      return originalSend.call(this, body);
    }
    prototype.open = observedOpen;
    prototype.send = observedSend;

    function findQuestion() {
      if (!isCourse() && !isPractice() && !isExam()) return null;
      const expected = isCourse() ? "视频习题" : "开始练习";
      const roots = isExam() ? Array.from(doc.querySelectorAll(".exam-modal")).filter(visible) :
        Array.from(doc.querySelectorAll(".ant-modal-content")).filter((root) => visible(root) && text(root.querySelector(".ant-modal-title")) === expected);
      if (roots.length !== 1) return null;
      const root = roots[0];
      const heading = root.querySelector(isCourse() ? ".sub-title" : ".stem");
      const inputs = Array.from(root.querySelectorAll('.can-scroll input[type="radio"], .can-scroll input[type="checkbox"]'));
      if (!heading || inputs.length < 2 || inputs.length > 12) return null;
      const images = [];
      const read = (element) => {
        const clone = element.cloneNode(true);
        clone.querySelectorAll("input, svg, .grey, .type").forEach((node) => node.remove());
        clone.querySelectorAll("img").forEach((image) => {
          const source = image.getAttribute("src");
          if (source) {
            const url = new URL(source, pageWindow.location.href).href;
            let index = images.indexOf(url);
            if (index < 0) { index = images.length; images.push(url); }
            image.replaceWith(doc.createTextNode(`[图片${index + 1}]`));
          } else image.replaceWith(doc.createTextNode("[图片未加载]"));
        });
        return text(clone);
      };
      let stem = read(heading).replace(/^第\s*\d+\s*题\s*[:：]\s*/, "");
      const choices = inputs.map((input) => {
        const row = input.closest(".mb-12, .ant-form-item-control") || input.closest("label");
        return { input, label: input.closest("label"), value: input.value, text: row ? read(row).replace(/^\s*[A-Z]\s*[:：.、]\s*/i, "") : "" };
      });
      root.querySelectorAll("form img").forEach((image) => {
        const source = image.getAttribute("src");
        if (!source) return;
        const url = new URL(source, pageWindow.location.href).href;
        if (!images.includes(url)) { images.push(url); stem += ` [题目附图${images.length}]`; }
      });
      if (!stem || choices.some((choice) => !choice.text || !choice.label) || new Set(choices.map((choice) => choice.value)).size !== choices.length) return null;
      const multiple = inputs.every((input) => input.type === "checkbox");
      if (!multiple && inputs.some((input) => input.type !== "radio")) return null;
      const kind = !multiple && /判断/.test(text(heading)) && choices.every((choice) => judgement(choice.text)) ? "3" : multiple ? "1" : "0";
      const currentView = findView();
      const identity = isCourse() ? [currentView?.model?.id, currentView?.questionId] : isExam() ? [currentView?.recordId, currentView?.model?.id, currentView?.index] : [currentView?.form?.id, currentView?.index];
      const key = JSON.stringify([pageWindow.location.href, ...identity, stem, kind, choices.map((choice) => [choice.value, choice.text]), images]);
      return { root, key, choices, images, question: {
        title: escapeHtml(stem), type: kind, optionsText: choices.map((choice) => `${choice.value}. ${choice.text}`),
        searchText: { stem, options: choices.map((choice) => choice.text) }, answer: [], answerStatus: "searching"
      } };
    }

    function cancelQuestion(message, preserveSubmitted = false) {
      if (!active) return;
      if (preserveSubmitted && ["submitted", "exam-confirming", "exam-sent"].includes(active.phase)) return;
      active.controller.abort();
      if (active.question.answerStatus === "searching") {
        active.question.answerStatus = "error";
        active.question.answer = [message];
      }
      active = null;
    }

    function current(state) {
      const settings = options.settings();
      if (disposed || suspended || blocked() || isExam() && examFlow.hasSubmitted() || active !== state || state.controller.signal.aborted || !enabled() || !settings.answer ||
          state.phase !== "submitted" && options.modelIdentity() !== state.model) return false;
      const parsed = findQuestion();
      return parsed?.root === state.parsed.root && parsed.key === state.parsed.key;
    }

    function button(root, caption) {
      return Array.from(root.querySelectorAll("button")).find((element) => available(element) && text(element).replace(/\s/g, "") === caption);
    }

    function selected(state) {
      return state.parsed.choices.every((choice, index) => choice.input.checked === state.targets.includes(index));
    }

    async function processQuestion(parsed) {
      if (active && (active.parsed.key !== parsed.key || active.parsed.root !== parsed.root || active.model !== options.modelIdentity()))
        cancelQuestion("题目或模型配置已改变，已取消旧请求");
      if (!active) {
        const sent = submissions.get(parsed.key);
        if (sent) {
          active = sent;
          active.parsed = parsed;
          active.controller = new AbortController();
        }
      }
      if (!active) {
        const state = active = { parsed, model: options.modelIdentity(), controller: new AbortController(), phase: "resolving", targets: [], at: Date.now(), warned: false, cacheKey: cacheKey(parsed) };
        state.question = options.addQuestion(parsed.question);
        publish("查询答案", "正在调用已配置的模型");
        log("检测到题目，正在准备答案");
        try {
          const context = { signal: state.controller.signal, isCurrent: () => current(state), skipDelay: true };
          context.beforeRequest = () => requestPacer.beforeRequest(context);
          if (parsed.images.length) {
            if (!options.loadImages) throw new Error("该题包含图片，请配置支持图片的模型后重试");
            state.question.imageAssets = await options.loadImages(parsed.images, context);
          }
          const saved = state.cacheKey && cache.get(state.cacheKey);
          const response = saved ? { success: true, data: {items: [{answer: {values: [...saved]}}]}, meta: null } :
            await options.resolve(state.question, context);
          if (!current(state)) return;
          if (!saved) requestPacer.record(response);
          const answers = response?.success ? response.data?.items?.[0]?.answer?.values : null;
          if (!answers?.length) throw new Error(response?.error?.message || "模型没有给出可用答案");
          const targets = answers.map((answer) => {
            const matches = parsed.choices.flatMap((choice, index) =>
              (state.question.type === "3" ? judgement(choice.text) === judgement(answer) && !!judgement(answer) : state.question.optionsText[index] === String(answer)) ? [index] : []);
            return matches.length === 1 ? matches[0] : -1;
          });
          if (targets.includes(-1) || new Set(targets).size !== targets.length || state.question.type !== "1" && targets.length !== 1)
            throw new Error("模型答案不能唯一对应页面选项，已暂停");
          if (parsed.choices.some((choice) => choice.input.disabled)) throw new Error("题目选项不可操作，已暂停");
          state.targets = targets;
          for (const [index, choice] of parsed.choices.entries()) {
            if (!current(state)) return;
            const expected = targets.includes(index);
            if (choice.input.checked !== expected && (choice.input.type === "checkbox" || expected)) {
              choice.input.click();
              await wait(60);
            }
          }
          if (!current(state)) return;
          if (!selected(state)) throw new Error("页面选中状态未通过核对，已停止提交");
          state.question.answer = answers;
          state.question.answerStatus = "success";
          state.question.submissionStatus = "已填选";
          state.question.searchInfo = response.meta?.search || null;
          state.phase = "filled";
          state.at = Date.now();
          if (state.cacheKey) {
            cache.delete(state.cacheKey);
            cache.set(state.cacheKey, [...answers]);
            if (cache.size > 100) cache.delete(cache.keys().next().value);
          }
          publish("等待提交", saved ? "已复用本页答案；已填选并核对" : "已填选并核对");
          log("模型答案已填入，选中状态核对通过", "success");
        } catch (error) {
          if (!current(state)) return;
          state.phase = "blocked";
          state.question.answerStatus = "error";
          state.question.answer = [error.message];
          publish("需要人工处理", error.message, requestPacer.remaining() === 0);
          log(`${error.message}；修正配置后点击“重试当前题”`, "danger");
        } finally {
          delete state.question.imageAssets;
        }
      }
      const state = active;
      if (!state || !current(state)) return;
      if (isPractice() && visible(parsed.root.querySelector(".cred")) && state.cacheKey) cache.delete(state.cacheKey);
      if (isPractice() && state.phase === "submitted" && !button(parsed.root, "下一题") &&
          (visible(parsed.root.querySelector(".cred")) || visible(parsed.root.querySelector(".cgreen")))) {
        state.question.submissionStatus = "网站已显示练习结果";
        publish("需要人工处理", "本轮练习已完成，可关闭题框或选择其他题库");
        return;
      }
      if (state.phase === "blocked") {
        const seconds = Math.ceil(requestPacer.remaining() / 1000);
        publish(seconds ? "请求冷却" : "需要人工处理", state.question.answer.join("；") + (seconds ? `；${seconds} 秒后可手动重试` : ""), !seconds);
        return;
      }
      if (state.phase === "filled") publish("等待提交", state.question.submissionStatus || "已填选");
      if (isExam()) { await examFlow.process(state); return; }
      if (!options.settings().submit) return;
      if (state.phase === "filled" && (isCourse() || Date.now() - state.at >= options.delay())) {
        if (!selected(state)) { state.phase = "blocked"; state.question.answer = ["答案被手动修改，已停止自动提交"]; publish("需要人工处理", state.question.answer[0], true); log(state.question.answer[0], "warning"); return; }
        const submit = button(parsed.root, "提交") || (isPractice() && options.settings().nextQuestion ? button(parsed.root, "下一题") : null);
        if (!submit) return;
        state.phase = "submitted";
        state.at = Date.now();
        state.receipt = "pending";
        state.question.submissionStatus = "等待网站确认";
        submissions.set(parsed.key, state);
        publish("等待网站确认", "已发出提交，等待网站回执");
        submit.click();
        log(isCourse() ? "已点击原生提交，等待网站确认并继续播放" : "已点击原生提交／下一题", "primary");
      } else if (state.phase === "submitted" && isPractice() && options.settings().nextQuestion && !state.feedbackAdvanced && visible(parsed.root.querySelector(".cred")) && Date.now() - state.at >= Math.max(1000, options.delay())) {
        const next = button(parsed.root, "下一题");
        if (next && selected(state)) {
          if (!current(state)) return;
          state.feedbackAdvanced = true;
          next.click();
          log("网站已显示本题订正，继续下一题", "warning");
        }
      } else if (state.phase === "submitted" && isCourse() && Date.now() - state.at > 15000 && !state.warned) {
        state.warned = true;
        log("网站尚未确认本题提交，请检查页面提示；本题不会重复提交", "warning");
      }
      if (state.phase === "submitted") {
        const accepted = state.receipt === "accepted";
        const rejected = state.receipt === "rejected";
        const overdue = !accepted && Date.now() - state.at > 15000;
        publish(rejected || overdue ? "需要人工处理" : "等待网站确认", accepted ? "网站已接受提交" : rejected ? `网站拒绝提交${state.receiptMessage ? `：${state.receiptMessage}` : ""}` : overdue ? "提交尚未确认，请检查网站提示；不会重复提交" : "已发出提交，等待网站回执");
      }
    }

    function flatten(nodes, path = []) {
      return (nodes || []).flatMap((node) => [{ node, path }, ...flatten(node.children, [...path, node])]);
    }

    function treeElement(node) {
      const candidates = Array.from(doc.querySelectorAll(".custom-tree .ant-tree-node-content-wrapper"));
      const exact = candidates.filter((element) => {
        const vm = element.parentElement?.__vue__;
        return String(vm?.eventKey ?? vm?.dataRef?.key ?? "") === String(node.key);
      });
      if (exact.length === 1) return exact[0];
      const titles = candidates.filter((element) => text(element.querySelector(".ant-tree-title")) === String(node.title));
      return titles.length === 1 ? titles[0] : null;
    }

    async function processVideo() {
      if (!isCourse()) return;
      const settings = options.settings();
      const currentView = findView();
      const video = currentView?.$refs?.videoPlayer || doc.querySelector(".right video");
      if (!video || !visible(video) || Array.from(doc.querySelectorAll(".ant-modal-content")).some(visible)) return;
      const source = sourceOf(video);
      if (videoSource !== source) { videoSource = source; playBlocked = ""; navigation = null; completionNotice = ""; bufferSince = 0; bufferWarned = false; endedSince = 0; }
      if (video.ended) {
        endedSince ||= Date.now();
        if (!settings.nextCourse || !currentView) return;
        const key = courseKey(currentView.model.id, currentView.graphId);
        const receipt = completion.get(key);
        if (!receipt || receipt.source !== source || !receipt.success) {
          const rejected = receipt?.source === source && receipt.result === "rejected";
          const overdue = Date.now() - endedSince > 15000;
          const message = rejected ? `课程完成记录保存失败${receipt.message ? `：${receipt.message}` : ""}` : overdue ? "课程完成回执尚未确认，请检查网络或网站记录" : "视频已结束，等待网站的课程完成回执";
          publish(rejected || overdue ? "需要人工处理" : "等待网站确认", message);
          const notice = key + (rejected ? "rejected" : overdue ? "overdue" : "pending");
          if (completionNotice !== notice) { completionNotice = notice; log(message, "warning"); }
          return;
        }
        completedCourses.add(String(currentView.model.id));
        if (Date.now() - receipt.at < Math.max(2000, options.delay())) return;
        const canNavigate = () => !disposed && !suspended && enabled() && !blocked() && options.settings().nextCourse && isCourse() &&
          findView() === currentView && courseKey(currentView.model.id, currentView.graphId) === key && sourceOf(video) === source && video.ended &&
          !Array.from(doc.querySelectorAll(".ant-modal-content")).some(visible);
        if (navigation) {
          if (Date.now() - navigation.at > 15000 && !navigation.warned) { navigation.warned = true; log("下一视频未加载，请检查课程权限或页面提示", "warning"); }
          return;
        }
        const nodes = flatten(currentView.treeData);
        const index = nodes.findIndex(({ node }) => String(node.key) === String(currentView.model.id));
        if (index < 0) return;
        const next = nodes.slice(index + 1).find(({ node }) => String(node.label) === "1" && !node.disabled && !completedCourses.has(String(node.key)));
        if (!next) {
          navigation = { at: Date.now(), warned: true };
          log("已到课程目录末尾，本轮播放结束", "success");
          return;
        }
        for (const parent of next.path) {
          if (!canNavigate()) return;
          const element = treeElement(parent);
          const item = element?.parentElement;
          const switcher = item?.querySelector(":scope > .ant-tree-switcher_close");
          if (switcher && visible(switcher)) { switcher.click(); await wait(150); }
        }
        const element = treeElement(next.node);
        if (!canNavigate()) return;
        if (!available(element)) { log("无法唯一定位下一视频，请手动展开课程目录", "warning"); navigation = { at: Date.now(), warned: true }; return; }
        navigation = { at: Date.now(), warned: false };
        element.click();
        log("网站已确认课程完成，正在进入下一视频", "success");
        return;
      }
      endedSince = 0;
      if (video.readyState < 3 && source && (settings.play || !video.paused)) {
        bufferSince ||= Date.now();
        publish("缓冲中", Date.now() - bufferSince > 30000 ? "视频缓冲超过30秒，请检查网络" : "等待视频缓冲");
        if (Date.now() - bufferSince > 30000 && !bufferWarned) { bufferWarned = true; log("视频缓冲超过30秒，请检查网络", "warning"); }
      } else { bufferSince = 0; bufferWarned = false; publish(video.paused ? "需要人工处理" : "播放中", video.paused ? "等待播放器开始播放" : "视频正常播放"); }
      if (video.error) { publish("需要人工处理", "视频加载失败，请检查播放器和网络"); return; }
      const canAdjustSpeed = () => !disposed && !suspended && enabled() && !blocked() && isCourse() && video.isConnected &&
        sourceOf(video) === source && !Array.from(doc.querySelectorAll(".ant-modal-content")).some(visible);
      await speedController.tick(video, canAdjustSpeed);
      if (!canAdjustSpeed()) return;
      if (!settings.play || !source || !video.paused || video.readyState < 2) return;
      if (playBlocked === source) { publish("需要人工处理", "请手动点击一次视频播放按钮"); return; }
      video.muted = !!settings.muted;
      try { await video.play(); }
      catch { playBlocked = source; publish("需要人工处理", "请手动点击一次视频播放按钮"); log("浏览器未允许自动播放，请在播放器中手动点击一次播放", "warning"); }
    }

    async function tick() {
      if (disposed || suspended) return;
      const settings = options.settings();
      const location = pageWindow.location.href;
      if (lastLocation !== location) {
        cancelQuestion("页面已切换，已取消旧请求");
        lastLocation = location;
        view = null;
        videoSource = "";
        navigation = null;
      }
      if (!enabled() || !settings.answer) cancelQuestion("自动答题已关闭", true);
      if (!enabled()) { if (wasEnabled) pauseVideo(); wasEnabled = false; publish("已暂停", "助手和视频已暂停"); return; }
      if (!wasEnabled) { wasEnabled = true; playBlocked = ""; }
      if (cacheModel !== options.modelIdentity()) { cache.clear(); cacheModel = options.modelIdentity(); }
      if (blocked()) {
        cancelQuestion("页面需要人工验证", true);
        if (!verificationShown) log("检测到验证码或登录验证，请手动完成后继续", "warning");
        verificationShown = true;
        publish("需要人工处理", "请手动完成验证码或登录验证");
        return;
      }
      verificationShown = false;
      if (active && !current(active)) cancelQuestion("题目或配置已改变，已取消旧请求");
      if (isExam() && examFlow.updateStatus()) return;
      if (busy || !isCourse() && !isPractice() && !isExam()) return;
      busy = true;
      try {
        const parsed = findQuestion();
        if (parsed) {
          parseNotice = false;
          if (settings.answer) await processQuestion(parsed);
          else publish("需要人工处理", "自动答题已关闭，可手动作答");
        } else {
          if (active) cancelQuestion("题框已关闭");
          const incomplete = Array.from(doc.querySelectorAll(".ant-modal-content")).some((root) => visible(root) && /^(视频习题|开始练习)$/.test(text(root.querySelector(".ant-modal-title"))));
          if (incomplete && !parseNotice) log("题目尚未完整加载或题型暂不支持，等待页面加载或人工处理", "warning");
          if (incomplete) publish("需要人工处理", "等待题目加载或人工处理");
          parseNotice = incomplete;
          if (isExam()) publish("需要人工处理", findView()?.showModal ? "等待试题加载或人工处理" : "请选择要开始的正式或模拟考试");
          await processVideo();
        }
      } catch (error) {
        publish("需要人工处理", error.message);
        log(`助手已暂停本次操作：${error.message}`, "warning");
      } finally { busy = false; }
    }

    function pauseVideo() {
      const video = findView()?.$refs?.videoPlayer || doc.querySelector(".right video");
      video?.pause();
    }
    function pause() {
      manualPaused = true;
      options.setEnabled?.(false);
      wasEnabled = false;
      cancelQuestion("助手已暂停", true);
      pauseVideo();
      publish("已暂停", "助手和视频已暂停");
    }
    function resume() {
      manualPaused = false;
      options.setEnabled?.(true);
      playBlocked = "";
      publish("需要人工处理", "正在恢复当前流程");
    }
    function retryCurrent() {
      if (!active || active.phase !== "blocked" || !enabled() || suspended || blocked() || requestPacer.remaining() > 0) return false;
      if (active.cacheKey) cache.delete(active.cacheKey);
      cancelQuestion("重新查询当前题");
      publish("查询答案", "等待重新查询");
      return true;
    }
    function suspend() {
      suspended = true;
      cancelQuestion("页面已挂起", true);
      publish("已暂停", "页面已挂起，返回后恢复");
    }
    function restore() { if (!disposed) { suspended = false; playBlocked = ""; } }
    function clearCache() { cache.clear(); publish(status.label, status.detail, status.canRetry); }
    function dispose() {
      disposed = true;
      speedController.dispose();
      cancelQuestion("助手已停止");
      if (prototype.open === observedOpen) prototype.open = originalOpen;
      if (prototype.send === observedSend) prototype.send = originalSend;
    }
    return { tick, dispose, pause, resume, retryCurrent, suspend, restore, clearCache, setVideoSpeed: (rate) => speedController.setRate(rate), getStatus: () => ({...status, cacheSize: cache.size, speedText: speedController.getStatus(), speedRates: speedController.getRates(), selectedSpeed: speedController.getSelectedRate(), speedEnabled: options.settings().speed === true}) };
  }
  // END JCEDUTEC ADAPTER
