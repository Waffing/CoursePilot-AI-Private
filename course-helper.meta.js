// ==UserScript==
// @name         超星学习通｜知到智慧树--网课小助手【大模型版】
// @namespace    noshuang
// @version      0.2.9.14
// @downloadURL  https://raw.githubusercontent.com/Waffing/CoursePilot-AI-Private/main/course-helper.user.js
// @updateURL    https://raw.githubusercontent.com/Waffing/CoursePilot-AI-Private/main/course-helper.meta.js
// @homepageURL  https://github.com/Waffing/CoursePilot-AI-Private
// @supportURL   https://github.com/Waffing/CoursePilot-AI-Private/issues
// @author       Waffing
// @description  多平台网课小助手：视频学习、随堂和题库练习、大模型与图片答题，支持可选倍速、个性化界面、请求间隔与失败冷却、暂停恢复、单题重试和本页答案缓存。
// @license      MIT
// @icon         data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext x='50' y='54' text-anchor='middle' dominant-baseline='central' font-size='82' font-family='Apple Color Emoji,Segoe UI Emoji,Noto Color Emoji,sans-serif'%3E%F0%9F%92%AF%3C/text%3E%3C/svg%3E
// @match        *://*.chaoxing.com/*
// @match        *://*.edu.cn/*
// @match        *://*.nbdlib.cn/*
// @match         *://*.hnsyu.net/*
// @match        *://*.gdhkmooc.com/*
// @match        *://*.zhihuishu.com/*
// @match        *://bbgu.jcedutec.cn/*
// @require      https://lib.baomitu.com/vue/3.4.31/vue.global.prod.js
// @require      https://lib.baomitu.com/vue-demi/0.14.7/index.iife.js
// @require      data:application/javascript,window.Vue%3DVue%3B
// @require      https://lib.baomitu.com/element-plus/2.7.2/index.full.min.js
// @require      https://lib.baomitu.com/pinia/2.3.1/pinia.iife.min.js
// @require      https://lib.baomitu.com/rxjs/7.8.2/rxjs.umd.min.js
// @require      https://lib.baomitu.com/blueimp-md5/2.19.0/js/md5.min.js
// @resource     ElementPlus       https://lib.baomitu.com/element-plus/2.7.2/index.css
// @resource     ElementPlusStyle  https://lib.baomitu.com/element-plus/2.8.2/index.min.css
// @resource     ttf               https://www.forestpolice.org/ttf/2.0/table.json
// @connect      *
// @connect      api.tikuhai.com
// @grant        GM_addStyle
// @grant        GM_getResourceText
// @grant        GM_getValue
// @grant        GM_info
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @run-at       document-start
// @antifeature  payment  用户配置的模型服务可能按用量计费
// ==/UserScript==
