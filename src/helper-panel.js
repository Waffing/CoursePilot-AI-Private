  function mountJcedutecPanel(panel, config, controller) {
    const body = panel.querySelector(".el-card__body");
    const root = panel.getRootNode();
    const style = document.createElement("style");
    style.textContent = HELPER_PANEL_STYLE;
    root.append(style);
    panel.dataset.helperUi = "true";
    panel.setAttribute("role", "region");
    panel.setAttribute("aria-label", "网课小助手");
    const toolbar = document.createElement("section");
    toolbar.className = "helper-toolbar";
    toolbar.setAttribute("aria-label", "学习助手运行状态");
    const statusCard = document.createElement("div");
    statusCard.className = "helper-status-card";
    const label = document.createElement("div");
    label.className = "helper-status";
    label.setAttribute("aria-live", "polite");
    const detail = document.createElement("div");
    detail.className = "helper-detail";
    const speed = document.createElement("div");
    speed.className = "helper-detail helper-speed";
    speed.setAttribute("aria-live", "polite");
    statusCard.append(label, detail, speed);
    const speedLabel = document.createElement("label");
    speedLabel.className = "helper-speed-choice";
    speedLabel.append(document.createTextNode("视频倍速"));
    const speedSelect = document.createElement("select");
    speedSelect.setAttribute("aria-label", "视频倍速");
    speedSelect.addEventListener("change", () => { controller.setVideoSpeed(Number(speedSelect.value)); void controller.tick(); });
    speedLabel.append(speedSelect);
    const actions = document.createElement("div");
    actions.className = "helper-actions";
    const makeButton = (caption, action) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = caption;
      button.addEventListener("click", action);
      actions.append(button);
      return button;
    };
    const toggle = makeButton("暂停", () => {
      if (controller.getStatus().paused) controller.resume(); else controller.pause();
      void controller.tick();
    });
    const retry = makeButton("重试当前题", () => { if (controller.retryCurrent()) void controller.tick(); });
    const clear = makeButton("清空缓存", () => controller.clearCache());
    const preferences = document.createElement("details");
    preferences.className = "helper-preferences";
    const summary = document.createElement("summary");
    summary.textContent = "个性化设置";
    const preferenceList = document.createElement("div");
    preferenceList.className = "helper-preference-list";
    const controls = new Map();
    for (const field of HELPER_PREFERENCE_FIELDS) {
      const row = document.createElement("label");
      row.className = "helper-preference";
      const caption = document.createElement("span");
      caption.textContent = field.label + (field.unit ? "（" + field.unit + "）" : "");
      const input = document.createElement(field.type === "select" ? "select" : "input");
      input.setAttribute("aria-label", field.label);
      input.dataset.preference = field.key;
      if (field.type === "select") {
        for (const [value, text] of field.choices) {
          const entry = document.createElement("option");
          entry.value = value; entry.textContent = text; input.append(entry);
        }
      } else {
        input.type = "number";
        input.min = field.min; input.max = field.max; input.step = field.step;
      }
      input.addEventListener("change", () => {
        const previous = getHelperPreferences(config.helperPreferences);
        const raw = field.type === "select" ? input.value : input.value.trim() === "" ? previous[field.key] : Number(input.value);
        const normalized = getHelperPreferences({...previous, [field.key]: raw});
        config.helperPreferences[field.key] = normalized[field.key];
        input.value = String(normalized[field.key]);
      });
      const help = document.createElement("small");
      help.textContent = field.help;
      row.append(caption, input, help); preferenceList.append(row);
      controls.set(field.key, input);
    }
    preferences.append(summary, preferenceList);
    toolbar.append(statusCard, speedLabel, actions, preferences);
    body.insertBefore(toolbar, body.firstChild);
    const version = document.createElement("span");
    version.className = "helper-version";
    version.textContent = "0.2.9.5";
    panel.querySelector(".title")?.append(version);
    const zoomIcons = Array.from(panel.querySelectorAll(".zoom-icon"));
    const onZoomKey = (event) => {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.currentTarget.click(); }
    };
    zoomIcons.forEach((icon, index) => {
      icon.setAttribute("role", "button"); icon.tabIndex = 0;
      icon.setAttribute("aria-label", index === 0 ? "最小化窗口" : "恢复窗口");
      icon.addEventListener("keydown", onZoomKey);
    });
    function update(state) {
      label.textContent = state.label;
      detail.textContent = state.detail;
      toolbar.dataset.state = state.paused ? "paused" : /人工|冷却|缓冲/.test(state.label) ? "warning" : /查询|等待/.test(state.label) ? "busy" : "active";
      speed.textContent = state.speedText || "";
      speed.hidden = !state.speedText;
      const rates = state.speedRates?.length ? state.speedRates : [1, 1.5, 2];
      const selected = state.selectedSpeed ?? 0;
      const signature = JSON.stringify([rates, rates.includes(selected) || selected === 0 ? null : selected]);
      if (speedSelect.dataset.rates !== signature) {
        const automatic = document.createElement("option"); automatic.value = "0"; automatic.textContent = "自动（最高）";
        const entries = rates.map((rate) => { const option = document.createElement("option"); option.value = String(rate); option.textContent = Number.isInteger(rate) ? rate.toFixed(1) + "×" : rate + "×"; return option; });
        if (selected !== 0 && !rates.includes(selected)) { const current = document.createElement("option"); current.value = String(selected); current.textContent = "当前 " + selected + "×"; current.disabled = true; entries.push(current); }
        speedSelect.replaceChildren(automatic, ...entries);
        speedSelect.dataset.rates = signature;
      }
      speedSelect.disabled = !state.speedEnabled || state.paused;
      speedSelect.value = String(selected);
      toggle.textContent = state.paused ? "恢复" : "暂停";
      toggle.setAttribute("aria-label", state.paused ? "恢复助手" : "暂停助手和视频");
      retry.disabled = !state.canRetry || state.paused;
      clear.disabled = state.cacheSize === 0;
      clear.textContent = `清空缓存（${state.cacheSize}）`;
    }
    let frame = 0;
    function clamp() {
      const rect = panel.getBoundingClientRect();
      const left = Math.max(11, Math.min(rect.left, window.innerWidth - rect.width - 11));
      const top = Math.max(11, Math.min(rect.top, window.innerHeight - rect.height - 11));
      if (Math.abs(rect.left - left) > 0.5) panel.style.left = `${left}px`;
      if (Math.abs(rect.top - top) > 0.5) panel.style.top = `${top}px`;
      if (config.position.x !== `${left}px`) config.position.x = `${left}px`;
      if (config.position.y !== `${top}px`) config.position.y = `${top}px`;
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(() => { frame = 0; clamp(); });
    };
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    function applyPreferences() {
      const values = getHelperPreferences(config.helperPreferences);
      panel.dataset.helperTheme = values.theme === "system" ? media.matches ? "dark" : "light" : values.theme;
      panel.dataset.helperDensity = values.density;
      panel.dataset.helperMinimized = String(config.isMinus === true);
      panel.style.setProperty("--helper-font-size", values.fontSize + "px");
      panel.style.setProperty("--helper-panel-width", (config.menuIndex === "1" ? Math.min(900, values.panelWidth * 1.8) : values.panelWidth) + "px");
      panel.style.setProperty("--helper-opacity", String(values.opacity / 100));
      panel.style.setProperty("--helper-space", values.density === "compact" ? "10px" : "16px");
      toolbar.hidden = config.isMinus === true;
      for (const [key, input] of controls) if (root.activeElement !== input) input.value = String(values[key]);
      schedule();
    }
    const stopPreferences = vue.watch(() => [getHelperPreferences(config.helperPreferences), config.menuIndex, config.isMinus], applyPreferences, {deep: true, immediate: true});
    media.addEventListener("change", applyPreferences);
    const resize = new ResizeObserver(schedule);
    resize.observe(panel);
    const mutation = new MutationObserver(schedule);
    mutation.observe(panel, {attributes: true, attributeFilter: ["style"]});
    window.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("resize", schedule);
    document.addEventListener("mouseup", schedule);
    update(controller.getStatus());
    return { update, clamp: schedule, dispose() {
      stopPreferences(); media.removeEventListener("change", applyPreferences);
      zoomIcons.forEach((icon) => icon.removeEventListener("keydown", onZoomKey));
      resize.disconnect(); mutation.disconnect(); cancelAnimationFrame(frame);
      window.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
      document.removeEventListener("mouseup", schedule);
      toolbar.remove(); version.remove(); style.remove(); delete panel.dataset.helperUi;
    } };
  }
