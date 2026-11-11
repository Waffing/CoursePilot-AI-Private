  function createWisdomMoocController(pageWindow, options) {
    const doc = pageWindow.document;
    const visible = (node) => node?.isConnected && node.getClientRects().length > 0 && pageWindow.getComputedStyle(node).visibility !== "hidden" && pageWindow.getComputedStyle(node).display !== "none";
    const text = (node) => (node?.textContent || "").replace(/\s+/g, " ").trim();
    const escape = (value) => String(value).replace(/[&<>"']/g, (char) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
    const log = (message, type = "primary") => options.log(escape(message), type);
    const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    const sourceOf = (video) => video?.getAttribute("src") || video?.currentSrc || "";
    const video = () => Array.from(doc.querySelectorAll("#container video, .video-play video")).find(visible);
    let disposed = false, suspended = false, paused = false, busy = false, active = null;
    let currentVideo = null, currentSource = "", playAttempt = null, playBlocked = false, endedAt = 0, advanced = false;
    let bufferAt = 0, bufferWarned = false, receipt = null, verificationWarned = false;
    let modelIdentity = options.modelIdentity();
    const records = new Map(), cache = new Map();
    const formal = () => pageWindow.location.hostname === "onlineexamh5new.zhihuishu.com";
    let formalView = null, saveReceipt = null;
    let status = {label:"需要人工处理",detail:"请进入智慧慕课视频或练习页面",paused:false,canRetry:false,cacheSize:0};
    const owned = () => options.canRun?.() ?? true;
    const enabled = () => !disposed && !suspended && !paused && owned() && options.settings().enabled;
    const speed = createVideoSpeedController(pageWindow, {isEnabled: () => enabled() && options.settings().speed, maxRate: 1.8,
      initialRate: options.initialSpeed, saveRate: options.saveSpeed, onStatus: () => publish(status.label,status.detail,status.canRetry), log});
    function publish(label, detail = "", canRetry = false) {
      status = {label,detail,canRetry,paused:!enabled(),standby:!owned(),cacheSize:cache.size,
        speedText:speed.getStatus(),speedRates:speed.getRates(),selectedSpeed:speed.getSelectedRate(),speedEnabled:options.settings().speed};
      options.onStatus?.({...status});
    }
    function verification() {
      return Array.from(doc.querySelectorAll(".yidun_popup, .yidun_panel, .yidun_modal, .geetest_panel, .geetest_holder, [class*='captcha'], .face-id-mask, .faceid-wrapper, .exam_verity-wrap, .dialog-wrapper, .el-dialog")).some(node => visible(node) &&
        (node.matches(".yidun_popup, .yidun_panel, .yidun_modal, .geetest_panel, .geetest_holder, [class*='captcha'], .face-id-mask, .faceid-wrapper, .exam_verity-wrap") || /人脸|身份验证|安全验证|滑动验证|验证码|重新登录|异常学习|诚信学习|承诺书/.test(text(node))));
    }
    const allowed = () => enabled() && !verification();
    function readContent(node, images) {
      if (!node) return "";
      const copy = node.cloneNode(true);
      copy.querySelectorAll("script, style, input, .option-index").forEach(item => item.remove());
      copy.querySelectorAll("img").forEach(image => {
        const address = image.getAttribute("src");
        if (!address) return image.replaceWith(doc.createTextNode("[图片未加载]"));
        const url = new URL(address,pageWindow.location.href).href;
        if (!images.includes(url)) images.push(url);
        image.replaceWith(doc.createTextNode(`[图片${images.indexOf(url)+1}]`));
      });
      return text(copy);
    }
    function findFormalView() {
      if (formalView && !formalView._isDestroyed && doc.contains(formalView.$el)) return formalView;
      const queue = [doc.querySelector("#app")?.__vue__].filter(Boolean), seen = new Set();
      for(let index=0;index<queue.length&&index<400;index++){
        const candidate=queue[index];if(!candidate||seen.has(candidate))continue;seen.add(candidate);
        if(Array.isArray(candidate.allQuestionIdArray)&&candidate.examinationArr?.problemNum){formalView=candidate;return candidate;}
        queue.push(...(candidate.$children||[]));
      }
      return null;
    }
    function parseQuestions() {
      const popup = Array.from(doc.querySelectorAll(".ai-class-exercise-dialog")).find(visible);
      const kind = popup ? "popup" : formal() && /\/webExamList\/(?:dohomework|doexamination)\//.test(pageWindow.location.hash) ? "formal" : pageWindow.location.pathname === "/exam" ? "practice" : "";
      const roots = popup ? Array.from(popup.querySelectorAll(".ques-list > .item")) : kind === "formal" ? Array.from(doc.querySelectorAll(".examPaper_subject")).filter(node=>visible(node)&&!node.querySelector(".examPaper_subject")) : kind ? Array.from(doc.querySelectorAll(".exam .exam-item")).filter(visible) : [];
      const parsed = [];
      for (const root of roots) {
        if (!visible(root)) continue;
        const images = [];
        const heading = root.querySelector(popup ? ".question-info" : kind === "formal" ? ".smallStem_describe, .subject_describe" : ".quest-title .option-name");
        const stem = readContent(heading,images);
        const typeText = text(root.querySelector(popup ? ".row .type" : kind === "formal" ? ".subject_type" : ".quest-type"));
        const choices = Array.from(root.querySelectorAll(popup ? ":scope > .option" : kind === "formal" ? ".label" : "label.el-radio, label.el-checkbox")).map((element,index) => ({
          element, input:element.querySelector("input"), value:element.querySelector("input")?.value || String(index),
          text:readContent(element.querySelector(popup ? ".answer" : kind === "formal" ? ".node_detail" : ".preStyle"),images)
        }));
        if (!stem || /[\uE000-\uF8FF]/.test(stem + choices.map(choice=>choice.text).join("")) || choices.length < 2 || choices.length > 12 || choices.some(choice => !choice.text || choice.input?.disabled || choice.element.classList.contains("is-disabled"))) continue;
        const type = /多选/.test(typeText) || choices.some(choice => choice.input?.type === "checkbox") ? "1" : /判断|judge/i.test(typeText+" "+root.querySelector(".quest-type")?.className) ? "3" : "0";
        const key = JSON.stringify([pageWindow.location.href,kind,kind==="formal"?findFormalView()?.currentQuestionIndex:kind==="practice"?Array.from(doc.querySelectorAll(".exam .exam-item")).indexOf(root):null,stem,type,choices.map(choice=>[choice.value,choice.text]),images]);
        parsed.push({root,popup,kind,stem,type,choices,images,key,cacheKey:images.length?null:JSON.stringify([stem,type,choices.map(choice=>choice.text)]),
          question:{title:escape(stem),type,optionsText:choices.map((choice,index)=>`${String.fromCharCode(65+index)}. ${choice.text}`),searchText:{stem,options:choices.map(choice=>choice.text)},answer:[],answerStatus:"searching"}});
      }
      return {popup,kind,questions:parsed,hasUnsupported:roots.filter(visible).length!==parsed.length};
    }
    const checked = (choice) => choice.input ? choice.input.checked : !!choice.element.querySelector(".class-question-select.isSelect");
    const selected = (state) => state.parsed.choices.every((choice,index)=>checked(choice)===state.targets.includes(index));
    const current = (state) => {
      if (!allowed() || !options.settings().answer || active!==state || state.controller.signal.aborted || state.model!==options.modelIdentity()) return false;
      const batch=parseQuestions();
      return !batch.hasUnsupported && batch.questions.some(question=>question.root===state.parsed.root && question.key===state.parsed.key);
    };
    function cancel(message) {
      if (!active) return;
      active.controller.abort();
      if (active.phase === "resolving") records.delete(active.parsed.key);
      delete active.question.imageAssets;
      if (active.phase === "resolving") {active.question.answerStatus="error";active.question.answer=[message];}
      active=null;
    }
    function targetIndices(answers, parsed) {
      const judgement = value => /^(正确|对|是|true|√)$/i.test(String(value).trim()) ? "true" : /^(错误|错|否|false|×)$/i.test(String(value).trim()) ? "false" : "";
      return answers.map(answer => {
        const matches = parsed.choices.flatMap((choice,index) => (parsed.type==="3" ? judgement(choice.text) && judgement(choice.text)===judgement(answer) : parsed.question.optionsText[index]===String(answer)) ? [index] : []);
        return matches.length===1?matches[0]:-1;
      });
    }
    async function solve(parsed) {
      let state=records.get(parsed.key);
      if (state?.phase === "submitted") return;
      if (active && active.parsed.key!==parsed.key) cancel("题目已切换");
      if (!state) {
        const question=options.addQuestion({...parsed.question});
        state={parsed,question,controller:new AbortController(),model:options.modelIdentity(),phase:"resolving",targets:[]};
        active=state; records.set(parsed.key,state);
        publish("查询答案","正在读取当前智慧树题目");
        try {
          const context={signal:state.controller.signal,isCurrent:()=>current(state),skipDelay:true,onQueryStatus:detail=>publish("查询答案",detail)};
          context.beforeRequest=(candidate=context)=>options.requestPacer.beforeRequest(candidate);
          if (parsed.images.length) {publish("查询答案","正在读取题目图片");question.imageAssets=await options.loadImages(parsed.images,context);}
          const saved=parsed.cacheKey&&cache.get(parsed.cacheKey);
          const result=saved?{success:true,data:{items:[{answer:{values:[...saved]}}]}}:await options.resolve(question,context);
          if (!current(state)) return;
          const answers=result?.success?result.data?.items?.[0]?.answer?.values:null;
          if (!answers?.length) throw new Error(result?.error?.message||"模型没有返回可用答案");
          const targets=targetIndices(answers,parsed);
          if (targets.includes(-1)||new Set(targets).size!==targets.length||parsed.type!=="1"&&targets.length!==1) throw new Error("答案不能唯一对应当前选项，请人工核对");
          state.targets=targets;
          for (const [index,choice] of parsed.choices.entries()) {
            if (!current(state)) return;
            const expected=targets.includes(index);
            if (checked(choice)!==expected&&(parsed.type==="1"||expected)) {choice.element.click();await wait(40);}
          }
          if (!current(state)) return;
          if (!selected(state)) throw new Error("页面选中状态未通过核对，已停止提交");
          state.phase="filled";state.at=Date.now();question.answer=[...answers];question.answerStatus="success";question.submissionStatus="已填选";
          if (parsed.cacheKey) {cache.delete(parsed.cacheKey);cache.set(parsed.cacheKey,[...answers]);if(cache.size>100)cache.delete(cache.keys().next().value);}
          publish("等待提交",saved?"已复用答案并核对选中状态":"已填选并核对选中状态");
        } catch(error) {
          if (!current(state)) return;
          state.phase="blocked";question.answerStatus="error";question.answer=[error.message];
          publish("需要人工处理",error.message,options.requestPacer.remaining()===0);log(error.message,"warning");
        } finally {delete question.imageAssets;}
      } else {active=state;state.parsed=parsed;if(state.controller.signal.aborted)state.controller=new AbortController();}
      if (!current(state)) return;
      if (state.phase==="blocked") {const remaining=Math.ceil(options.requestPacer.remaining()/1000);publish(remaining?"请求冷却":"需要人工处理",state.question.answer.join("；")+(remaining?`；${remaining} 秒后可重试`:""),!remaining);return;}
      if (state.phase!=="filled" || !options.settings().submit) return;
      if (!selected(state)) {state.phase="blocked";state.question.answer=["答案被手动修改，已停止提交"];publish("需要人工处理",state.question.answer[0],true);return;}
      if (parsed.kind==="formal" && Date.now()-state.at>=options.delay() && options.settings().nextQuestion && !state.savePending) {
        const button=Array.from(doc.querySelectorAll(".switch-btn-box button")).find(node=>visible(node)&&!node.disabled&&/^(下一题|保存)$/.test(text(node)));
        if(button){state.savePending=true;state.question.submissionStatus="等待网站保存";saveReceipt={state,at:Date.now(),status:"pending"};button.click();}
      }
      if (parsed.kind==="practice" && Date.now()-state.at>=options.delay() && options.settings().nextQuestion) {
        const next=doc.querySelector(".exam .footer .next-btn");
        if (visible(next)&&!next.classList.contains("disabled")) {state.question.submissionStatus="已填选并保存";next.click();options.onWake?.();}
      }
    }
    function submitPopup(batch) {
      if (!batch.popup || !batch.questions.length || !options.settings().submit || !allowed() || parseQuestions().hasUnsupported) return;
      const states=batch.questions.map(question=>records.get(question.key));
      if (!states.every((state,index)=>state?.phase==="filled"&&state.parsed.root===batch.questions[index].root&&selected(state))) return;
      const button=Array.from(batch.popup.querySelectorAll(".dialog-footer button")).find(element=>visible(element)&&!element.disabled&&!element.classList.contains("is-finish"));
      if (!button) return;
      const key=JSON.stringify(["wisdom-popup",batch.questions.map(question=>question.key)]);
      if (options.sharedReceipts.get(key)) {publish("需要人工处理","已有提交记录，请核对网站结果；不会重复提交");return;}
      if (!options.sharedReceipts.reserve(key)) return;
      for (const state of states) {state.phase="submitted";state.question.submissionStatus="等待网站确认";}
      receipt={kind:"popup",key,states,at:Date.now(),status:"pending"};
      publish("等待网站确认","已填选全部弹题，等待网站提交回执");button.click();
    }
    function submitPractice(batch) {
      if (batch.kind!=="practice" || !allowed() || !options.settings().submit || !options.settings().nextQuestion) return;
      const cards=Array.from(doc.querySelectorAll(".exam .answer-card .list .item"));
      if (!cards.length||cards.some(card=>!card.classList.contains("violet"))) return;
      const states=[...records.values()].filter(state=>state.parsed.kind==="practice"&&state.phase==="filled");
      if (states.length<cards.length||states.some(state=>Date.now()-state.at<options.delay())) return;
      const key=JSON.stringify(["wisdom-practice",pageWindow.location.href]);
      if (options.sharedReceipts.get(key)) {publish("需要人工处理","本轮已有提交记录，请核对网站结果");return;}
      const button=doc.querySelector(".exam .header .submit");
      if (!visible(button)||!options.sharedReceipts.reserve(key)) return;
      for(const state of states){state.phase="submitted";state.question.submissionStatus="等待网站确认";}
      receipt={kind:"practice",key,states,at:Date.now(),status:"pending"};
      publish("等待网站确认","已核对本轮全部练习，等待网站提交回执");button.click();
    }
    function processFormal() {
      if(!formal()||!allowed()||!options.settings().submit||!options.settings().nextQuestion)return;
      const view=findFormalView();
      if(!view)return;
      const states=[...records.values()].filter(state=>state.parsed.kind==="formal"&&state.question.submissionStatus==="已填选并保存");
      const all=(view.allQuestionIdArray||[]).flatMap(part=>part.questionDtos||[]);
      if(!all.length||all.length!==Number(view.examinationArr.problemNum)||all.some(question=>Number(question.flag)!==2)||states.length<all.length)return;
      if(receipt?.kind==="formal"&&receipt.phase==="confirming"){
        const dialog=Array.from(doc.querySelectorAll(".el-message-box")).find(node=>visible(node)&&/是否确认提交/.test(text(node))&&!/未作答|验证|承诺|协议|诚信/.test(text(node)));
        const confirm=Array.from(dialog?.querySelectorAll("button")||[]).find(node=>visible(node)&&!node.disabled&&/^确定$/.test(text(node)));
        if(confirm&&allowed()){
          if(!options.sharedReceipts.reserve(receipt.key)){publish("需要人工处理","本试卷已有提交记录，请在网站核对结果");return;}
          receipt.phase="sent";receipt.at=Date.now();
          for(const state of states){state.phase="submitted";state.question.submissionStatus="等待网站确认";}
          confirm.click();publish("等待网站确认","已点击原生交卷确认，等待网站回执");
        }
        return;
      }
      if(receipt)return;
      const key=JSON.stringify(["wisdom-formal",pageWindow.location.href]);
      if(options.sharedReceipts.get(key)){publish("需要人工处理","本试卷已有提交记录，请在网站核对结果；不会重复提交");return;}
      const submit=Array.from(doc.querySelectorAll(".operateBtn_box button, .tit_operate_box button")).find(node=>visible(node)&&!node.disabled&&/^(提交考试|提交作业|提交)$/.test(text(node)));
      if(!submit)return;
      receipt={kind:"formal",phase:"confirming",key,states,at:Date.now(),status:"pending"};
      submit.click();publish("等待提交","全部题目已保存，等待网站交卷确认；出现验证请手动处理");
    }
    const xhr=pageWindow.XMLHttpRequest.prototype,oldOpen=xhr.open,oldSend=xhr.send;
    const watched=new WeakMap();
    function observedOpen(method,address,...rest) {
      let url;try{url=new URL(String(address),pageWindow.location.href);}catch{}
      if(url&&/(^|\.)zhihuishu\.com$/i.test(url.hostname)&&/\/(batchSaveLessonPopupExamSaveAnswer|saveDatabaseIntervalTimeV2|exam\/submit|answer\/(?:submit|saveStudentAnswer|savaAnswerData|temporarySave))$/.test(url.pathname))watched.set(this,url);else watched.delete(this);
      return oldOpen.call(this,method,address,...rest);
    }
    function observedSend(...args) {
      const url=watched.get(this),pending=receipt,saving=saveReceipt,media=video(),source=sourceOf(media),position=media?.currentTime||0;
      if(url)this.addEventListener("loadend",()=>{
        if(disposed)return;
        let payload;try{payload=this.responseType==="json"?this.response:JSON.parse(this.responseText);}catch{}
        const accepted=this.status>=200&&this.status<300&&(formal()?payload?.status===200&&payload?.code!==401&&payload?.code!==-12&&payload?.code!==20001&&(/\/answer\/(saveStudentAnswer|savaAnswerData|temporarySave)$/.test(url.pathname)?payload?.rt?.statu===1:[0,1].includes(payload?.rt?.statu)):(payload?.code===0||payload?.code===200)&&payload?.data!==false);
        if(url.pathname.endsWith("saveDatabaseIntervalTimeV2")) {
          if(accepted&&media===currentVideo&&source===currentSource&&media.duration>0&&position>=media.duration-.75) currentVideo.__courseHelperSavedSource=source;
        } else if(/\/answer\/(saveStudentAnswer|savaAnswerData|temporarySave)$/.test(url.pathname)&&saving&&saveReceipt===saving) {
          saving.status=accepted?"accepted":payload?"rejected":"unknown";
          saving.state.question.submissionStatus=accepted?"已填选并保存":"保存尚未确认";
          if(!accepted)publish("需要人工处理","网站未确认保存当前题，请人工检查；不会重复发送保存");
        } else if(pending&&receipt===pending&&
          (pending.kind==="popup"&&url.pathname.endsWith("batchSaveLessonPopupExamSaveAnswer")||
           pending.kind==="practice"&&url.pathname.endsWith("/exam/submit")||
           pending.kind==="formal"&&url.pathname.endsWith("/answer/submit"))) {
          pending.status=accepted?"accepted":payload&&payload.code!==undefined?"rejected":"unknown";
          pending.message=String(payload?.message||payload?.msg||"").slice(0,160);
          options.sharedReceipts.record(pending.key,pending.status);
          for(const state of pending.states)state.question.submissionStatus=accepted?"网站已接受提交":pending.status==="rejected"?"网站拒绝提交":"提交尚未确认";
        }
        options.onWake?.();
      },{once:true});
      return oldSend.apply(this,args);
    }
    xhr.open=observedOpen;xhr.send=observedSend;
    async function processVideo() {
      const media=video();if(!media)return;
      const source=sourceOf(media);
      if(media!==currentVideo||source!==currentSource){currentVideo=media;currentSource=source;playAttempt=null;playBlocked=false;endedAt=0;advanced=false;bufferAt=0;bufferWarned=false;}
      if(media.ended) {
        endedAt ||= Date.now();
        if(media.__courseHelperSavedSource!==source){publish(Date.now()-endedAt>15000?"需要人工处理":"等待网站确认","视频已自然结束，等待网站保存学习记录");return;}
        const next=doc.querySelector("#container .nextButton");
        if(options.settings().nextCourse&&!advanced&&visible(next)){advanced=true;publish("切换视频","网站已确认保存，正在进入下一视频");next.click();}
        else if(!advanced)publish("播放完成","本节视频已完成，可从目录选择下一节");
        return;
      }
      if(media.error){publish("需要人工处理","视频加载失败，请检查网站和网络");return;}
      if(media.readyState<3){bufferAt ||= Date.now();publish("缓冲中",Date.now()-bufferAt>30000?"视频缓冲超过30秒，请检查网络":"等待网站播放器缓冲");if(Date.now()-bufferAt>30000&&!bufferWarned){bufferWarned=true;log("视频缓冲超过30秒，请检查网络","warning");}}
      else {bufferAt=0;bufferWarned=false;publish(media.paused?"需要人工处理":"播放中",playBlocked?"请手动点击一次视频播放按钮":"使用网站原播放器，倍速不超过 1.8×");}
      if(options.settings().play&&source&&media.paused&&media.readyState>=1&&!playBlocked&&!playAttempt&&allowed()) {
        const attempt=playAttempt={media,source};media.muted=!!options.settings().muted;
        try{Promise.resolve(media.play()).then(()=>{if(playAttempt===attempt)playAttempt=null;},()=>{if(playAttempt===attempt){playAttempt=null;playBlocked=true;publish("需要人工处理","请手动点击一次视频播放按钮");}});}catch{playAttempt=null;playBlocked=true;}
      }
      await speed.tick(media,()=>allowed()&&media===video()&&sourceOf(media)===source&&!parseQuestions().popup);
    }
    async function tick() {
      if(disposed||suspended)return;
      if(!enabled()){cancel("助手已暂停或被其他页面接管");video()?.pause();publish(owned()?"已暂停":"另一标签页运行中",owned()?"助手和视频已暂停":"点击“在此页接管”后继续");return;}
      if(verification()){cancel("页面需要人工验证");video()?.pause();publish("需要人工处理","请手动完成验证码、身份或登录验证");if(!verificationWarned)log("页面出现人工验证，助手已停止操作","warning");verificationWarned=true;return;}
      verificationWarned=false;
      if(modelIdentity!==options.modelIdentity()){cancel("模型配置已改变");cache.clear();for(const[key,state]of records)if(state.phase!=="submitted")records.delete(key);modelIdentity=options.modelIdentity();}
      if(active&&!current(active)){const prior=active;if(prior.phase==="resolving"||prior.phase==="blocked")records.delete(prior.parsed.key);cancel("题目已切换");}
      if(busy)return;
      busy=true;
      try {
        const batch=parseQuestions();
        for(const question of batch.questions)if(question.root.querySelector(".class-question-select.isError"))cache.delete(question.cacheKey);
        if(!receipt&&batch.popup&&batch.questions.length&&options.sharedReceipts.get(JSON.stringify(["wisdom-popup",batch.questions.map(question=>question.key)]))){publish("需要人工处理","当前弹题已有提交记录，请在网站核对结果；不会重复查询或提交");return;}
        if(receipt?.kind==="formal"&&receipt.phase==="confirming"){processFormal();if(Date.now()-receipt.at>15000)publish("需要人工处理","交卷确认尚未完成，请检查网站验证或确认框");return;}
        if(saveReceipt&&saveReceipt.status!=="accepted"){publish(Date.now()-saveReceipt.at>15000||saveReceipt.status!=="pending"?"需要人工处理":"等待网站确认","等待网站保存当前题；不会重复发送保存");return;}
        if(receipt){const overdue=Date.now()-receipt.at>15000;publish(receipt.status==="rejected"||overdue&&receipt.status!=="accepted"?"需要人工处理":"等待网站确认",receipt.status==="accepted"?"网站已接受提交":receipt.status==="rejected"?"网站拒绝提交："+receipt.message:overdue?"提交尚未确认，请检查网站结果；不会重复提交":"等待网站提交回执");if(receipt.status!=="accepted"||batch.popup)return;receipt=null;}
        if(batch.hasUnsupported){publish("需要人工处理","当前题目未完整加载或包含未支持题型，请人工处理；不会提交部分题目");return;}
        if(batch.questions.length&&options.settings().answer){for(const question of batch.questions){if(!allowed())return;await solve(question);if(records.get(question.key)?.phase==="blocked")return;}submitPopup(batch);submitPractice(batch);processFormal();}
        else if(batch.popup)publish("需要人工处理",options.settings().answer?"等待题目完整加载，或当前题型需人工处理":"自动答题已关闭");
        else if(formal())publish("需要人工处理","请手动打开已开始的作业或考试；当前题型、加密文字或验证页面需人工处理");
        else await processVideo();
      } catch(error){publish("需要人工处理",error.message);log(error.message,"warning");}finally{busy=false;}
    }
    function pause(){paused=true;options.setEnabled(false);cancel("助手已暂停");playAttempt=null;video()?.pause();publish("已暂停","助手和视频已暂停");}
    function resume(){paused=false;options.setEnabled(true);playAttempt=null;playBlocked=false;publish("需要人工处理","正在恢复当前流程");options.onWake?.();}
    return {tick,pause,resume,getStatus:()=>({...status,cacheSize:cache.size}),setVideoSpeed:rate=>speed.setRate(rate),clearCache(){cache.clear();publish(status.label,status.detail,status.canRetry);},
      retryCurrent(){if(!active||active.phase!=="blocked"||!allowed()||options.requestPacer.remaining()>0)return false;cache.delete(active.parsed.cacheKey);records.delete(active.parsed.key);cancel("重新查询当前题");return true;},
      suspend(){suspended=true;cancel("页面已挂起");playAttempt=null;},restore(){suspended=false;playBlocked=false;options.onWake?.();},
      dispose(){disposed=true;cancel("助手已停止");speed.dispose();if(xhr.open===observedOpen)xhr.open=oldOpen;if(xhr.send===observedSend)xhr.send=oldSend;}
    };
  }
