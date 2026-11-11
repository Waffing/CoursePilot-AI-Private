  async function queryHelperAnswer(question, context, options) {
    const seconds = Math.max(5, Math.min(120, Number(options.waitSeconds) || 15));
    const current = () => !context.signal?.aborted && (context.isCurrent?.() ?? true);
    for (let attempt = 0; attempt < 2 && current(); attempt++) {
      const settings = attempt === 0 ? options.primary : options.fallback || options.primary;
      const controller = new AbortController();
      let timer = null;
      let countdown = null;
      let deadline = 0;
      let finished = false;
      let started = false;
      let expire;
      const limit = new Promise((resolve) => { expire = resolve; });
      const cancel = () => { controller.abort(); expire({success: false, error: {code: "CANCELLED", message: "请求已取消"}}); };
      context.signal?.addEventListener("abort", cancel, {once: true});
      const stopTimer = () => { clearTimeout(timer); clearInterval(countdown); };
      const armTimer = () => {
        stopTimer();
        deadline = Date.now() + seconds * 1000;
        const report = () => context.onQueryStatus?.(`第 ${attempt + 1}/2 次查询 · ${settings.model || "当前模型"} · 最多等待 ${Math.max(0, Math.ceil((deadline - Date.now()) / 1000))} 秒`);
        report(); countdown = setInterval(report, 1000);
        timer = setTimeout(() => {
          finished = true;
          expire({success: false, error: {code: "HELPER_QUERY_TIMEOUT", message: `等待答案超过 ${seconds} 秒`}});
          controller.abort();
        }, seconds * 1000);
      };
      const child = {...context, settings, signal: controller.signal,
        isCurrent: () => !finished && current(),
        beforeRequest: async () => {
          if (!started) stopTimer();
          const allowed = context.beforeRequest ? await context.beforeRequest(child) : true;
          if (!allowed || !current() || controller.signal.aborted) return false;
          if (!started) armTimer();
          return true;
        },
        onRequestStart: () => { started = true; }
      };
      let result;
      try {
        armTimer();
        if (!current()) cancel();
        result = await Promise.race([Promise.resolve().then(() => options.resolve(question, child)), limit]);
      } finally {
        finished = true; stopTimer();
        context.signal?.removeEventListener("abort", cancel);
      }
      if (!current()) return {success: false, error: {code: "CANCELLED", message: "请求已取消"}};
      const timedOut = result?.error?.code === "HELPER_QUERY_TIMEOUT" || /请求超时/.test(result?.error?.message || "");
      if (!timedOut || attempt === 1 || options.enabled === false) return result;
      context.onQueryStatus?.(options.fallback ? "等待超时，已取消旧请求，改用备用模型" : "等待超时；未配置备用接口，重试当前模型一次");
      options.log?.(options.fallback ? "答案等待超时，切换到下一模型接口重试" : "答案等待超时，未配置备用接口，原模型仅重试一次", "warning");
    }
    return {success: false, error: {code: "CANCELLED", message: "请求已取消"}};
  }

  function getHelperFallback(config) {
    const saved = config.helperFallbackModel;
    if (saved?.url?.trim() && saved?.model?.trim()) return {...saved, provider: "custom"};
    const primary = config.queryApis[0];
    const profiles = _GM_getValue(MODEL_PROFILES_STORAGE_KEY, {});
    return Object.values(profiles || {}).find((entry) => entry?.url?.trim() && entry?.model?.trim() &&
      JSON.stringify([entry.url, entry.protocol, entry.model]) !== JSON.stringify([primary.url, primary.protocol, primary.model])) || null;
  }
