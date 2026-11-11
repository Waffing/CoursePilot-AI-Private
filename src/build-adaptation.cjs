const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
let source = fs.readFileSync(path.join(__dirname, 'original.user.js'), 'utf8');
function replaceOnce(needle, replacement) {
  const begin = source.indexOf(needle);
  if (begin < 0 || source.indexOf(needle, begin + needle.length) >= 0) throw new Error('Ambiguous patch: ' + needle.slice(0, 100));
  source = source.slice(0, begin) + replacement + source.slice(begin + needle.length);
}
replaceOnce('// @version      0.2.8.2', '// @version      0.2.9.6');
replaceOnce('// @description  支持多家大模型、自动获取模型列表和联网搜索，保留原版超星与智慧树的题目填写、视频、章节切换和提交机制。', '// @description  多平台网课小助手：视频学习、随堂和题库练习、大模型与图片答题，支持可选倍速、个性化界面、请求间隔与失败冷却、暂停恢复、单题重试和本页答案缓存。');
replaceOnce("(function (vue, pinia, rxjs, md5, ElementPlus) {\n  'use strict';".replace(/\n/g, '\r\n'), "(function (vue, pinia, rxjs, md5, ElementPlus) {\n  'use strict';\n  const helperPage = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;\n  if (helperPage.location.hostname === 'bbgu.jcedutec.cn' && helperPage.top === helperPage.self) {\n    if (helperPage.__courseHelperMount291) return;\n    helperPage.__courseHelperMount291 = true;\n  }");
replaceOnce('// @match        *://*.zhihuishu.com/*', '// @match        *://*.zhihuishu.com/*\n// @match        *://bbgu.jcedutec.cn/*');
replaceOnce('        platformParams: {', `        helperPreferences: { theme: "system", density: "comfortable", fontSize: 13, panelWidth: 360, opacity: 100, requestInterval: 5, actionDelay: 3 },
        platformParams: {`);
replaceOnce('          unknown: {', `          jcedutec: {
            name: "网课小助手",
            parts: [{ name: "视频与练习设置", params: [
              { name: "启用助手", value: true, type: "boolean" },
              { name: "视频自动播放和续播", value: true, type: "boolean" },
              { name: "静音播放", value: true, type: "boolean" },
              { name: "视频自动倍速", value: true, type: "boolean" },
              { name: "视频倍速档位（0为自动）", value: 0, type: "number", min: 0, max: 16, step: 0.5 },
              { name: "视频弹题和题库练习自动答题", value: true, type: "boolean" },
              { name: "核对选项后自动提交", value: true, type: "boolean" },
              { name: "课程完成后自动下一视频", value: true, type: "boolean" },
              { name: "题库练习自动下一题", value: true, type: "boolean" }
            ] }]
          },
          unknown: {`);
replaceOnce('    return { url: getModelEndpoint(settings.url, protocol, "answer", settings.model), headers: getModelHeaders(settings), method: "POST", data: JSON.stringify(body) };', `    const images = Array.isArray(question.imageAssets) ? question.imageAssets : [];
    if (images.length) {
      const content = messages[1].content;
      if (protocol === "gemini") {
        body.contents[0].parts.push(...images.map((image) => ({ inlineData: { mimeType: image.mimeType, data: image.data } })));
      } else if (protocol === "anthropic") {
        body.messages[0].content = [{ type: "text", text: content }, ...images.map((image) => ({ type: "image", source: { type: "base64", media_type: image.mimeType, data: image.data } }))];
      } else if (protocol === "responses") {
        body.input[1].content = [{ type: "input_text", text: content }, ...images.map((image) => ({ type: "input_image", image_url: \`data:\${image.mimeType};base64,\${image.data}\` }))];
      } else {
        body.messages[1].content = [{ type: "text", text: content }, ...images.map((image) => ({ type: "image_url", image_url: { url: \`data:\${image.mimeType};base64,\${image.data}\` } }))];
      }
    }
    return { url: getModelEndpoint(settings.url, protocol, "answer", settings.model), headers: getModelHeaders(settings), method: "POST", data: JSON.stringify(body) };`);
replaceOnce('    const mergedConfig = mergeByLatestFields(defaultConfig, storedConfig);', `    const previousPlatform = storedConfig?.platformParams?.jcedutec;
    for (const part of previousPlatform?.parts || []) {
      const old = part.params?.find((param) => param.name === "启用北部湾助手");
      if (old && !part.params.some((param) => param.name === "启用助手")) old.name = "启用助手";
    }
    const mergedConfig = mergeByLatestFields(defaultConfig, storedConfig);
    if (!Object.prototype.hasOwnProperty.call(storedConfig?.helperPreferences || {}, "actionDelay")) {
      const previousDelay = storedConfig?.otherParams?.params?.[0]?.value;
      if (typeof previousDelay === "number" && Number.isFinite(previousDelay)) mergedConfig.helperPreferences.actionDelay = Math.max(1, Math.min(120, previousDelay));
    }
    if (mergedConfig.platformParams.jcedutec) mergedConfig.platformParams.jcedutec.name = "网课小助手";`);
replaceOnce('  const requestModelJson = (options, context = {}, timeout = 120000) => new Promise((resolve) => {', `  const requestModelJson = async (options, context = {}, timeout = 120000) => {
    if (context.beforeRequest && !await context.beforeRequest()) return apiError("请求已取消");
    return new Promise((resolve) => {`);
replaceOnce('  });\r\n  const fetchModelList', '  });\n  };\n  const fetchModelList');
replaceOnce('            return finish(parseModelResponse(null, response.status, {}));', `            return finish({ ...parseModelResponse(null, response.status, {}), retryAfterSeconds: (() => {
              const value = response.responseHeaders?.match(/^retry-after:\\s*(.+)$/im)?.[1]?.trim();
              const seconds = Number(value);
              return value && Number.isFinite(seconds) ? Math.max(0, seconds) : Math.max(0, (Date.parse(value) - Date.now()) / 1000) || 0;
            })() });`);
replaceOnce('  const DEFAULT_CARD_WIDTH = "310px";', fs.readFileSync(path.join(__dirname, 'helper-preferences.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'request-pacer.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'video-speed.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'exam-flow.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'jcedutec-adapter.js'), 'utf8') + '\n' + 'const HELPER_PANEL_STYLE = ' + JSON.stringify(fs.readFileSync(path.join(__dirname, 'helper-panel.css'), 'utf8')) + ';\n' + fs.readFileSync(path.join(__dirname, 'helper-panel.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'jcedutec-runtime.js'), 'utf8') + '\n  const DEFAULT_CARD_WIDTH = "310px";');
replaceOnce('vue.createVNode(ModelSearchSources, { info: scope.row.searchInfo }, null, 8, ["info"])', 'vue.createVNode(ModelSearchSources, { info: scope.row.searchInfo }, null, 8, ["info"]),\n                      scope.row.submissionStatus ? vue.h("div", { class: "helper-submission" }, scope.row.submissionStatus) : null');
replaceOnce('        { keyword: "/stuExamWeb.html", logic: useZhsAnswerLogic }', '        { keyword: "/stuExamWeb.html", logic: useZhsAnswerLogic },\n        { keyword: "bbgu.jcedutec.cn", logic: useJcedutecLogic }');
replaceOnce('        { keyword: "zhihuishu", platformName: "zhs" }', '        { keyword: "zhihuishu", platformName: "zhs" },\n        { keyword: "bbgu.jcedutec.cn", platformName: "jcedutec" }');
fs.writeFileSync(path.join(root, 'course-helper.user.js'), source, 'utf8');
console.log('Built adaptation, bytes:', Buffer.byteLength(source));
