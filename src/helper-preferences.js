  const HELPER_PREFERENCE_FIELDS = [
    { key: "theme", label: "界面主题", type: "select", default: "system", choices: [["system", "跟随系统"], ["light", "浅色"], ["dark", "深色"]], help: "默认跟随系统，仅影响助手窗口" },
    { key: "density", label: "布局密度", type: "select", default: "comfortable", choices: [["comfortable", "舒适"], ["compact", "紧凑"]], help: "默认舒适，紧凑模式减少留白" },
    { key: "fontSize", label: "文字大小", type: "number", default: 13, min: 12, max: 18, step: 1, unit: "px", help: "默认 13 px，调整窗口正文和控件文字" },
    { key: "panelWidth", label: "面板宽度", type: "number", default: 360, min: 300, max: 560, step: 10, unit: "px", help: "默认 360 px，答题页适度加宽，小窗口自动收拢" },
    { key: "opacity", label: "窗口不透明度", type: "number", default: 100, min: 80, max: 100, step: 5, unit: "%", help: "默认 100%，降低后可看到窗口后方内容" },
    { key: "requestInterval", label: "请求最小间隔", type: "number", default: 5, min: 2, max: 120, step: 1, unit: "秒", help: "默认 5 秒，限制自动模型、搜索和图片请求；站点限流时仍需冷却" },
    { key: "actionDelay", label: "操作等待时间", type: "number", default: 3, min: 1, max: 120, step: 1, unit: "秒", help: "默认 3 秒，用于题库／试卷；视频弹题和完成后切课无额外等待" }
  ];

  function getHelperPreferences(raw = {}) {
    return Object.fromEntries(HELPER_PREFERENCE_FIELDS.map((field) => {
      const value = raw?.[field.key];
      const normalized = field.type === "select" ? (field.choices.some(([key]) => key === value) ? value : field.default) :
        typeof value === "number" && Number.isFinite(value) ? Math.min(field.max, Math.max(field.min, value)) : field.default;
      return [field.key, normalized];
    }));
  }
