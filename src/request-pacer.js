  function createHelperRequestPacer(options) {
    let lastStart = null;
    let cooldownUntil = 0;
    let failures = 0;
    const remaining = () => Math.max(0, cooldownUntil - Date.now());
    async function beforeRequest(context) {
      const current = () => !context.signal?.aborted && context.isCurrent();
      while (current()) {
        const until = Math.max(lastStart === null ? 0 : lastStart + options.interval(), cooldownUntil);
        const ms = until - Date.now();
        if (ms <= 0) { lastStart = Date.now(); return true; }
        options.onWait?.(Math.ceil(ms / 1000), remaining() > 0);
        await new Promise((resolve) => {
          const finish = () => { clearTimeout(timer); context.signal?.removeEventListener("abort", finish); resolve(); };
          const timer = setTimeout(finish, Math.min(ms, 250));
          context.signal?.addEventListener("abort", finish, {once: true});
          if (context.signal?.aborted) finish();
        });
      }
      return false;
    }
    function record(result) {
      if (result?.success) { failures = 0; return; }
      const code = result?.error?.code || "";
      if (!/^HTTP_(429|5\d\d)$/.test(code) && !/请求超时|请求失败|网络/.test(result?.error?.message || "")) return;
      failures = Math.min(failures + 1, 6);
      const seconds = Math.max(Math.min(300, 15 * 2 ** (failures - 1)), Number(result.retryAfterSeconds) || 0);
      cooldownUntil = Math.max(cooldownUntil, Date.now() + seconds * 1000);
    }
    return {beforeRequest, record, remaining};
  }
