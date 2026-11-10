  function createVideoSpeedController(pageWindow, options) {
    const fallbackRates = [1, 1.5, 2];
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const visible = (element) => element?.isConnected && element.getClientRects().length > 0 &&
      pageWindow.getComputedStyle(element).display !== "none" && pageWindow.getComputedStyle(element).visibility !== "hidden";
    const usable = (element) => visible(element) && !element.disabled && element.getAttribute("aria-disabled") !== "true";
    const text = (element) => (element.textContent || "").replace(/\s+/g, " ").trim();
    const parseRate = (element) => {
      if (/^(正常|正常速度|normal|normal speed)$/i.test(text(element))) return 1;
      const raw = element.getAttribute("data-playback-rate") || element.getAttribute("data-speed") || element.getAttribute("value");
      const match = text(element).match(/^(\d+(?:\.\d+)?)\s*(?:[x×]|倍(?:速)?)$/i);
      const rate = raw && /^\d+(?:\.\d+)?$/.test(raw.trim()) ? Number(raw) : match ? Number(match[1]) : 0;
      return Number.isFinite(rate) && rate > 0 && rate <= 16 ? rate : 0;
    };
    const preference = () => {
      const rate = Number(options.initialRate?.() ?? 0);
      return Number.isFinite(rate) && rate >= 0 && rate <= 16 ? rate : 0;
    };
    let preferredRate = preference();
    let storedPreference = preferredRate;
    let selectedByUser = false;
    let selectionRevision = 0;
    let state = null;
    let disposed = false;
    function getRates() { return state ? [...state.rates] : [...fallbackRates]; }
    function getSelectedRate() { return state?.manual ? Number(state.video.playbackRate) || 1 : preferredRate; }
    function getStatus() {
      if (!state) return "";
      const actual = Number(state.video.playbackRate) || 1;
      const note = !options.isEnabled() ? "（自动倍速已关闭）" : state.note ? "（" + state.note + "）" : state.manual ? "（手动调整）" : "";
      return "倍速：" + actual + "×" + note;
    }
    function setRate(value) {
      const rate = Number(value);
      if (disposed || !options.isEnabled() || !Number.isFinite(rate) || rate < 0 || rate > 16) return false;
      if (rate !== 0 && !getRates().includes(rate)) return false;
      preferredRate = rate;
      selectedByUser = true;
      selectionRevision++;
      options.saveRate?.(rate);
      storedPreference = preference();
      if (state) {state.manual = false; state.attempted = false; state.note = "";}
      options.onStatus?.();
      return true;
    }
    async function tick(video, isCurrent) {
      if (disposed || !video) return;
      const source = video.getAttribute("src") || video.currentSrc || "";
      if (!state || state.video !== video || state.source !== source) {
        const actual = Number(video.playbackRate) || 1;
        state = {video, source, rates: [...fallbackRates], attempted: false, discovered: false,
          manual: !selectedByUser && Math.abs(actual - 1) > 0.001, disabled: false, applying: false, note: ""};
      }
      const stored = preference();
      if (options.initialRate && stored !== storedPreference) {
        storedPreference = stored;
        preferredRate = stored;
        state.manual = false;
        state.attempted = false;
      }
      if (!options.isEnabled()) {state.disabled = true; return;}
      if (state.disabled) {state.disabled = false; state.attempted = false; state.manual = false;}
      const attempt = state;
      const revision = selectionRevision;
      const current = () => !disposed && options.isEnabled() && isCurrent() && state === attempt && selectionRevision === revision &&
        (video.getAttribute("src") || video.currentSrc || "") === source;
      if (!source || video.readyState < 1 || video.ended || video.error || state.attempted || !current()) return;
      state.attempted = true;
      const wrapper = video.closest(".video-js, .plyr, .dplayer, [data-player]");
      const scope = wrapper || video.parentElement;
      if (!scope) return;
      const select = Array.from(scope.querySelectorAll("select")).find((element) => usable(element) &&
        /倍速|播放速度|playback\s*rate|speed/i.test((element.getAttribute("aria-label") || "") + " " + element.title + " " + element.className));
      const items = () => Array.from(scope.querySelectorAll('[data-playback-rate], [data-speed], [data-plyr="speed"], .vjs-playback-rate .vjs-menu-item, .dplayer-setting-speed-item'))
        .filter(usable).map((element) => ({element, rate: parseRate(element)})).filter((choice) => choice.rate > 0);
      const opener = Array.from(scope.querySelectorAll('button, [role="button"]')).find((element) => usable(element) &&
        (/^(倍速|播放速度|playback speed|speed)(?:\s*[:：]?\s*\d+(?:\.\d+)?\s*[x×倍]?)?$/i.test((element.getAttribute("aria-label") || text(element)).trim()) ||
          element.matches(".vjs-playback-rate > button, .vjs-playback-rate > [role='button'], .dplayer-setting-speed")));
      let choices = select ? Array.from(select.options).filter((option) => !option.disabled).map((element) => ({element, rate: parseRate(element)})).filter((choice) => choice.rate > 0) : items();
      let opened = false;
      if (!choices.length && opener && current()) {
        opener.click();
        opened = true;
        await wait(160);
        if (!current()) {attempt.attempted = false; return;}
        choices = items();
      }
      attempt.rates = choices.length ? [...new Set(choices.map((choice) => choice.rate))].sort((a, b) => a - b) : [...fallbackRates];
      attempt.discovered = choices.length > 0;
      options.onStatus?.();
      if (attempt.manual) {
        if (opened && current() && items().length) opener.click();
        return;
      }
      const target = preferredRate === 0 ? Math.max(...attempt.rates) : preferredRate;
      if (!attempt.rates.includes(target)) {
        attempt.note = "当前播放器不支持所选倍速，请重新选择";
        options.onStatus?.();
        return;
      }
      if (!current()) {attempt.attempted = false; return;}
      attempt.applying = true;
      let mode = "播放器菜单";
      try {
        const choice = choices.find((item) => item.rate === target);
        if (choice && select) {
          if (Math.abs(video.playbackRate - target) > 0.001) {
            select.value = choice.element.value;
            select.dispatchEvent(new pageWindow.Event("change", {bubbles: true}));
          }
        } else if (choice) {
          if (Math.abs(video.playbackRate - target) > 0.001) choice.element.click();
          else if (opened && current() && items().length) opener.click();
        } else if (!wrapper && !opener && video.controls && !video.controlsList?.contains("noplaybackrate")) {
          mode = "原生播放器";
          video.playbackRate = target;
        } else {
          attempt.note = "未提供倍速选项";
          options.log("未找到播放器可用的倍速选项，保留当前速度", "warning");
          return;
        }
        await wait(100);
        if (!current()) {attempt.attempted = false; return;}
        if (Math.abs(video.playbackRate - target) < 0.001) {
          attempt.note = "";
          options.log("已通过" + mode + "设为 " + target + " 倍速", "success");
        } else {
          attempt.note = "播放器未接受倍速";
          options.log("播放器未接受所选倍速，保留当前速度", "warning");
        }
      } catch {
        attempt.note = "播放器未接受倍速";
        options.log("播放器未接受所选倍速，保留当前速度", "warning");
      } finally {attempt.applying = false; options.onStatus?.();}
    }
    function onRateChange(event) {
      if (disposed || !state || state.video !== event.target || state.applying || !state.attempted || !options.isEnabled()) return;
      state.manual = true;
      state.note = "";
      options.onStatus?.();
    }
    pageWindow.document.addEventListener("ratechange", onRateChange, true);
    return {tick, getStatus, getRates, getSelectedRate, setRate, dispose() {
      disposed = true;
      state = null;
      pageWindow.document.removeEventListener("ratechange", onRateChange, true);
    }};
  }
