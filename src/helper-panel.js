  function mountJcedutecPanel(panel, config, controller, tools = {}) {
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
    const makeButton = (caption, action, container = actions) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = caption;
      button.addEventListener("click", action);
      container.append(button);
      return button;
    };
    const toggle = makeButton("暂停", () => {
      if (controller.getStatus().paused) controller.resume(); else controller.pause();
      void controller.tick();
    });
    const retry = makeButton("重试当前题", () => { if (controller.retryCurrent()) void controller.tick(); });
    const clear = makeButton("清空缓存", () => controller.clearCache());
    const recovery = makeButton("检查模型配置", () => {
      const state = controller.getStatus();
      if (state.standby) return tools.takeover?.();
      if (/播放/.test(recovery.textContent)) {
        const video = document.querySelector("video");
        if (!video || state.paused) return;
        try { Promise.resolve(video.play()).then(() => controller.tick(), () => { message.textContent = "播放仍被阻止，请使用网站播放器的播放按钮"; }); } catch { message.textContent = "请使用网站播放器的播放按钮"; }
      } else {
        config.menuIndex = "1"; config.isMinus = false;
        requestAnimationFrame(() => panel.querySelector(".model-settings")?.scrollIntoView({block: "nearest"}));
      }
    }, statusCard);
    recovery.className = "helper-recovery";
    const message = document.createElement("div");
    message.className = "helper-message";
    message.setAttribute("aria-live", "polite");
    const mini = document.createElement("div");
    mini.className = "helper-mini";
    mini.setAttribute("aria-label", "迷你控制条");
    const miniStatus = document.createElement("span");
    miniStatus.className = "helper-mini-status";
    const miniSpeed = document.createElement("span");
    miniSpeed.className = "helper-mini-speed";
    const miniToggle = makeButton("暂停", () => {
      if (controller.getStatus().standby) tools.takeover?.();
      else { if (controller.getStatus().paused) controller.resume(); else controller.pause(); void controller.tick(); }
    }, mini);
    const miniRestore = makeButton("展开", () => { config.isMinus = false; }, mini);
    miniRestore.setAttribute("aria-label", "展开助手窗口");
    mini.prepend(miniStatus, miniSpeed);
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
    const fallbackSection = document.createElement("details");
    fallbackSection.className = "helper-fallback";
    const fallbackHeading = document.createElement("summary");
    fallbackHeading.textContent = "答案等待与备用接口";
    const fallbackHelp = document.createElement("small");
    fallbackHelp.textContent = "默认等待 15 秒，超时取消旧请求，第二次使用备用接口。留空则尝试已保存的其他服务商；没有可用备用时，原接口仅重试一次。";
    const fallbackFields = [
      ["enabled", "超时后重试一次", "checkbox"],
      ["waitSeconds", "等待答案上限（秒）", "number"],
      ["protocol", "备用接口协议", "select"],
      ["url", "备用接口地址", "url"],
      ["model", "备用模型名称", "text"],
      ["token", "备用 API Key", "password"]
    ];
    const fallbackControls = new Map();
    for (const [key, caption, type] of fallbackFields) {
      const row = document.createElement("label"); row.className = "helper-fallback-field";
      const text = document.createElement("span"); text.textContent = caption;
      const input = document.createElement(type === "select" ? "select" : "input");
      input.setAttribute("aria-label", caption); input.dataset.fallback = key;
      if (type === "select") for (const [value, title] of [["chat","OpenAI Chat"],["responses","OpenAI Responses"],["anthropic","Anthropic"],["gemini","Gemini"]]) {
        const option = document.createElement("option"); option.value = value; option.textContent = title; input.append(option);
      } else {
        input.type = type;
        if (type === "number") { input.min = "5"; input.max = "120"; input.step = "1"; }
        if (key === "token") { input.autocomplete = "off"; input.spellcheck = false; }
        if (key === "url") input.placeholder = "https://your-provider.example/v1";
      }
      input.addEventListener("change", () => {
        const saved = config.helperFallbackModel;
        if (key === "enabled") saved.enabled = input.checked;
        else if (key === "waitSeconds") {
          const value = Number(input.value);
          saved.waitSeconds = Number.isFinite(value) ? Math.max(5, Math.min(120, value)) : 15;
          input.value = saved.waitSeconds;
        } else if (key === "url" && input.value.trim()) {
          try {
            const address = new URL(input.value.trim());
            if (!["http:", "https:"].includes(address.protocol) || address.username || address.password || address.search || address.hash) throw new Error();
            saved.url = input.value.trim();
          } catch { message.textContent = "备用接口请填写不含凭据或查询参数的 HTTP(S) 地址，Key 填入独立输入框"; input.value = saved.url; }
        } else saved[key] = input.value.trim();
      });
      row.append(text, input); fallbackSection.append(row); fallbackControls.set(key, input);
    }
    fallbackSection.prepend(fallbackHeading, fallbackHelp);
    const settingsTools = document.createElement("div");
    settingsTools.className = "helper-settings-tools helper-actions";
    const importInput = document.createElement("input");
    importInput.type = "file"; importInput.accept = ".json,application/json"; importInput.hidden = true;
    const importPreview = document.createElement("div");
    importPreview.className = "helper-import-preview"; importPreview.hidden = true;
    const previewText = document.createElement("pre");
    let pendingImport = null;
    makeButton("导出设置", () => {
      try {
        const content = JSON.stringify(createHelperSettingsBackup(config), null, 2);
        const address = URL.createObjectURL(new Blob([content], {type: "application/json"}));
        const anchor = document.createElement("a");
        anchor.href = address; anchor.download = "course-helper-settings.json"; anchor.click();
        setTimeout(() => URL.revokeObjectURL(address), 1000);
        message.textContent = "已导出设置，不含 API Key、搜索密钥和登录信息";
      } catch (error) { message.textContent = error.message; }
    }, settingsTools);
    makeButton("导入设置", () => importInput.click(), settingsTools);
    makeButton("复制诊断", async () => {
      const content = tools.diagnostic?.();
      if (!content) return;
      diagnosticText.value = content; diagnosticText.hidden = false; diagnosticText.select();
      try {
        if (document.execCommand("copy")) { diagnosticText.hidden = true; message.textContent = "已复制最近 20 条脱敏诊断，请在发送前检查内容"; }
        else message.textContent = "诊断已生成，请在下方文本框按 Ctrl+C 复制";
      } catch { message.textContent = "诊断已生成，请在下方文本框按 Ctrl+C 复制"; }
    }, settingsTools);
    const diagnosticText = document.createElement("textarea");
    diagnosticText.className = "helper-diagnostic"; diagnosticText.readOnly = true; diagnosticText.hidden = true;
    diagnosticText.setAttribute("aria-label", "脱敏诊断内容");
    const applyImport = makeButton("确认导入并暂停", () => {
      if (!pendingImport) return;
      controller.pause(); pendingImport.apply(); controller.pause();
      pendingImport = null; importPreview.hidden = true;
      message.textContent = "设置已导入，助手保持暂停；核对模型配置后点击恢复";
    }, importPreview);
    makeButton("取消", () => { pendingImport = null; importPreview.hidden = true; }, importPreview);
    importPreview.prepend(previewText);
    importInput.addEventListener("change", async () => {
      const file = importInput.files?.[0];
      importInput.value = "";
      pendingImport = null; importPreview.hidden = true;
      if (!file) return;
      try {
        if (file.size > 65536) throw new Error("设置文件不能超过 64 KB");
        pendingImport = prepareHelperSettingsImport(await file.text(), config);
        previewText.textContent = pendingImport.changes.length ? "将修改以下设置：\n" + pendingImport.changes.join("\n") + "\n导入后助手保持暂停，密钥不从文件导入。" : "配置相同，无需导入。";
        applyImport.disabled = pendingImport.changes.length === 0;
        importPreview.hidden = false;
      } catch (error) { message.textContent = error.message; }
    });
    preferences.append(summary, preferenceList, fallbackSection, settingsTools, importInput, importPreview, diagnosticText);
    toolbar.append(statusCard, speedLabel, actions, preferences, message);
    body.insertBefore(toolbar, body.firstChild);
    body.insertBefore(mini, toolbar);
    const version = document.createElement("span");
    version.className = "helper-version";
    version.textContent = "0.2.9.8 · Waffing";
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
    let renderedStatus = "";
    function update(state) {
      const statusSignature = JSON.stringify(state);
      if (statusSignature === renderedStatus) return;
      renderedStatus = statusSignature;
      label.textContent = state.label;
      detail.textContent = state.detail;
      toolbar.dataset.state = state.paused ? "paused" : /人工|冷却|缓冲/.test(state.label) ? "warning" : /查询|等待/.test(state.label) ? "busy" : "active";
      miniStatus.textContent = state.label;
      miniStatus.title = state.detail;
      miniSpeed.textContent = state.speedText?.match(/[\d.]+\s*×/)?.[0] || (state.selectedSpeed ? state.selectedSpeed + "×" : "自动倍速");
      mini.dataset.state = toolbar.dataset.state;
      miniToggle.textContent = state.standby ? "接管" : state.paused ? "恢复" : "暂停";
      recovery.hidden = !(state.standby || !state.paused && /人工|冷却/.test(state.label) && /模型|接口|HTTP.?40[13]|权限|配置|手动.*播放|播放.*阻止/.test(state.detail));
      recovery.textContent = state.standby ? "在此页接管" : /播放/.test(state.detail) ? "点此播放" : "检查模型配置";
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
      toggle.disabled = state.standby === true;
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
      version.textContent = config.isMinus === true ? "Waffing" : "0.2.9.8 · Waffing";
      panel.style.setProperty("--helper-font-size", values.fontSize + "px");
      panel.style.setProperty("--helper-panel-width", (config.menuIndex === "1" ? Math.min(900, values.panelWidth * 1.8) : values.panelWidth) + "px");
      panel.style.setProperty("--helper-opacity", String(values.opacity / 100));
      panel.style.setProperty("--helper-space", values.density === "compact" ? "10px" : "16px");
      toolbar.hidden = config.isMinus === true;
      mini.hidden = config.isMinus !== true;
      for (const [key, input] of controls) if (root.activeElement !== input) input.value = String(values[key]);
      for (const [key, input] of fallbackControls) if (root.activeElement !== input) {
        if (key === "enabled") input.checked = config.helperFallbackModel.enabled;
        else input.value = String(config.helperFallbackModel[key] ?? "");
      }
      schedule();
    }
    const stopPreferences = vue.watch(() => [getHelperPreferences(config.helperPreferences), config.helperFallbackModel, config.menuIndex, config.isMinus], applyPreferences, {deep: true, immediate: true});
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
      toolbar.remove(); mini.remove(); version.remove(); style.remove(); delete panel.dataset.helperUi;
    } };
  }
