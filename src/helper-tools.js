  function createHelperSettingsBackup(config) {
    const model = config.queryApis?.[0] || {};
    const allowedModelFields = ["provider", "protocol", "model", "autoModels", "timeout", "maxTokens", "temperature", "temperatureEnabled"];
    const modelSettings = Object.fromEntries(allowedModelFields.filter((key) => model[key] !== undefined).map((key) => [key, model[key]]));
    if (model.url) {
      const url = new URL(model.url);
      if (!["http:", "https:"].includes(url.protocol)) throw new Error("模型地址必须为 HTTP 或 HTTPS");
      modelSettings.url = url.origin + url.pathname;
    }
    const params = config.platformParams?.jcedutec?.parts?.[0]?.params || [];
    const rawFallback = config.helperFallbackModel;
    const fallback = rawFallback ? {enabled: rawFallback.enabled, waitSeconds: rawFallback.waitSeconds, protocol: rawFallback.protocol, model: rawFallback.model,
      url: rawFallback.url ? new URL(rawFallback.url).origin + new URL(rawFallback.url).pathname : ""} : undefined;
    return {
      format: "course-helper-settings", version: 1,
      preferences: getHelperPreferences(config.helperPreferences),
      model: modelSettings, ...(fallback ? {fallback} : {}),
      platform: Object.fromEntries(params.map((param) => [param.name, param.value]))
    };
  }

  function prepareHelperSettingsImport(input, config) {
    if (typeof input !== "string" || input.length > 65536) throw new Error("请选择不超过 64 KB 的助手设置 JSON 文件");
    let saved;
    try { saved = JSON.parse(input); } catch { throw new Error("文件不是有效的 JSON"); }
    if (saved?.format !== "course-helper-settings" || saved.version !== 1 || !saved.preferences || !saved.model || !saved.platform)
      throw new Error("不是受支持的助手设置备份");
    const snapshot = createHelperSettingsBackup(config);
    const changes = [];
    const preferences = getHelperPreferences(saved.preferences);
    for (const field of HELPER_PREFERENCE_FIELDS) if (snapshot.preferences[field.key] !== preferences[field.key]) changes.push(field.label);
    const model = {};
    const currentModel = config.queryApis[0];
    if (currentModel.token && (saved.model.provider && saved.model.provider !== currentModel.provider ||
        saved.model.url && new URL(saved.model.url).origin !== new URL(currentModel.url).origin))
      throw new Error("备份使用不同的模型服务，请先手动配置对应接口和 Key，再导入；现有密钥不会迁移到其他服务");
    for (const key of ["provider", "protocol", "model", "url", "autoModels", "timeout", "maxTokens", "temperature", "temperatureEnabled"]) {
      if (!Object.prototype.hasOwnProperty.call(saved.model, key)) continue;
      const value = saved.model[key];
      if (["provider", "protocol", "model", "url"].includes(key)) {
        if (typeof value !== "string" || value.length > 2048) throw new Error("模型配置格式不正确");
        if (key === "url" && value) {
          const url = new URL(value);
          if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error("备份中的模型地址不能包含凭据或查询参数");
        }
        if (key === "protocol" && !["chat", "responses", "anthropic", "gemini"].includes(value)) throw new Error("模型协议不受支持");
      } else if (["autoModels", "temperatureEnabled"].includes(key)) {
        if (typeof value !== "boolean") throw new Error("模型开关格式不正确");
      } else if (typeof value !== "number" || !Number.isFinite(value) || key === "timeout" && (value < 10 || value > 300) || key === "maxTokens" && (value < 0 || value > 1000000) || key === "temperature" && (value < 0 || value > 2)) throw new Error("模型参数超出支持范围");
      model[key] = value;
      if (snapshot.model[key] !== value) changes.push("模型：" + ({provider:"服务商",protocol:"协议",model:"模型名称",url:"接口地址",autoModels:"自动读取模型",timeout:"超时",maxTokens:"输出长度",temperature:"温度",temperatureEnabled:"启用温度"}[key]));
    }
    const platform = [];
    for (const param of config.platformParams.jcedutec.parts[0].params) {
      if (!Object.prototype.hasOwnProperty.call(saved.platform, param.name)) continue;
      const value = saved.platform[param.name];
      if (typeof value !== typeof param.value || typeof value === "number" && (!Number.isFinite(value) || value < 0 || value > 16)) throw new Error("平台设置格式不正确");
      if (param.value !== value) changes.push(param.name);
      platform.push([param, value]);
    }
    let fallback = null;
    if (saved.fallback && config.helperFallbackModel) {
      const entry = saved.fallback, previous = config.helperFallbackModel;
      if (typeof entry.enabled !== "boolean" || !Number.isFinite(entry.waitSeconds) || entry.waitSeconds < 5 || entry.waitSeconds > 120 ||
          !["chat", "responses", "anthropic", "gemini"].includes(entry.protocol) || typeof entry.model !== "string" || entry.model.length > 2048 ||
          typeof entry.url !== "string" || entry.url.length > 2048) throw new Error("备用接口配置格式不正确");
      if (entry.url) {
        const address = new URL(entry.url);
        if (!["http:", "https:"].includes(address.protocol) || address.username || address.password || address.search || address.hash) throw new Error("备用接口地址不能包含凭据或查询参数");
        if (previous.token && previous.url && address.origin !== new URL(previous.url).origin) throw new Error("备用接口域名不同，请先手动核对对应 Key");
      }
      fallback = Object.fromEntries(["enabled", "waitSeconds", "protocol", "url", "model"].map((key) => [key, entry[key]]));
      for (const [key, value] of Object.entries(fallback)) if (previous[key] !== value) changes.push("备用接口：" + key);
    }
    return {changes, apply() {
      Object.assign(config.helperPreferences, preferences);
      Object.assign(config.queryApis[0], model);
      if (fallback) Object.assign(config.helperFallbackModel, fallback);
      for (const [param, value] of platform) param.value = value;
    }};
  }

  function createHelperDiagnostic(config, state, logs, location) {
    const secrets = [];
    const collect = (value) => {
      if (!value || typeof value !== "object") return;
      for (const [key, entry] of Object.entries(value)) {
        if (/token|key|password|secret/i.test(key) && typeof entry === "string" && entry) secrets.push(entry);
        else if (entry && typeof entry === "object") collect(entry);
      }
    };
    collect({queryApis: config.queryApis, modelSearch: config.modelSearch, helperFallbackModel: config.helperFallbackModel});
    const redact = (value) => {
      let result = String(value || "").replace(/<[^>]*>/g, "");
      for (const secret of secrets.sort((a, b) => b.length - a.length)) {
        const encoded = secret.replace(/[&<>"']/g, (char) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
        result = result.split(encoded).join("[已隐藏]").split(secret).join("[已隐藏]");
      }
      return result.replace(/Bearer\s+[^\s,;"']+/gi, "Bearer [已隐藏]")
        .replace(/\b(?:sk-|ghp_|github_pat_)[A-Za-z0-9_-]+/g, "[已隐藏]")
        .replace(/https?:\/\/[^\s<>"']+/g, (value) => { try { const url = new URL(value); return url.origin + url.pathname; } catch { return "[地址已隐藏]"; } })
        .replace(/\b\d{10,}\b/g, "[编号已隐藏]").slice(0, 500);
    };
    return JSON.stringify({
      version: "0.2.9.11", page: location.origin + location.pathname,
      state: {label: redact(state.label), detail: redact(state.detail)},
      preferences: getHelperPreferences(config.helperPreferences),
      logs: logs.slice(-20).map((item) => ({time: redact(item.time), type: item.type, message: redact(item.message)}))
    }, null, 2);
  }
