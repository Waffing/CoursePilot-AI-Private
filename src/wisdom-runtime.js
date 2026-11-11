  function isWisdomMoocPage() {
    return typeof location !== "undefined" && ["wisdom-mooc.zhihuishu.com", "onlineexamh5new.zhihuishu.com"].includes(location.hostname);
  }
  const useWisdomMoocLogic = () => {
    if (!isWisdomMoocPage() || _unsafeWindow.top !== _unsafeWindow.self || _unsafeWindow.__courseHelperWisdomSession) return;
    const config = useConfigStore(), logs = useLogStore(), questions = useQuestionStore();
    const labels = {enabled:"启用助手",play:"视频自动播放和续播",muted:"静音播放",speed:"视频自动倍速",answer:"视频弹题和练习自动答题",submit:"核对选项后自动提交",nextCourse:"课程完成后自动下一视频",nextQuestion:"练习自动下一题"};
    const params = config.platformParams.wisdom.parts[0].params;
    const preferences = () => getHelperPreferences(config.helperPreferences);
    let panelUI = null, disposed = false, suspended = false, scheduled = false;
    const schedule = () => {
      if (disposed || suspended || scheduled) return;
      scheduled = true;
      queueMicrotask(() => {scheduled=false;if(!disposed&&!suspended)void controller.tick();});
    };
    const coordinator = helperTabCoordinator = createHelperCoordinator(_unsafeWindow,schedule);
    const pacer = getSharedHelperPacer();
    helperNetworkStatus = (seconds,cooling) => {
      if(coordinator.isOwner())panelUI?.update({...controller.getStatus(),label:cooling?"请求冷却":"等待请求",detail:`请求队列等待，${seconds} 秒后可继续`});
    };
    const controller = createWisdomMoocController(_unsafeWindow,{
      canRun:()=>coordinator.isOwner(),
      settings:()=>Object.fromEntries(Object.entries(labels).map(([key,label])=>[key,params.find(param=>param.name===label)?.value===true])),
      modelIdentity:()=>JSON.stringify([config.queryApis[0],config.modelSearch,config.helperFallbackModel]),
      setEnabled:value=>{params.find(param=>param.name===labels.enabled).value=value;},
      initialSpeed:()=>params.find(param=>param.name==="视频倍速档位（0为自动）").value,
      saveSpeed:rate=>{params.find(param=>param.name==="视频倍速档位（0为自动）").value=rate;},
      delay:()=>preferences().actionDelay*1000,requestPacer:pacer,
      sharedReceipts:{get:key=>coordinator.getReceipt(md5(key)),reserve:key=>coordinator.reserve(md5(key)),record:(key,result)=>coordinator.record(md5(key),result)},
      resolve:(question,context)=>queryHelperAnswer(question,context,{primary:cloneLatestValue(config.queryApis[0]),fallback:getHelperFallback(config),waitSeconds:config.helperFallbackModel.waitSeconds,enabled:config.helperFallbackModel.enabled,resolve:getAnswer,log:(message,type)=>logs.addLog(message,type)}),
      loadImages:(sources,context)=>loadJcedutecImages(sources,context,/(^|\.)zhihuishu\.com$/i),
      addQuestion:parsed=>{const question=vue.reactive(parsed);questions.addQuestion(question);return question;},
      onStatus:state=>panelUI?.update(state),onWake:schedule,log:(message,type)=>logs.addLog(message,type)
    });
    const instance=vue.getCurrentInstance();
    const mediaEvents=["loadedmetadata","loadeddata","canplay","playing","waiting","ended","pause","emptied","error","ratechange"];
    const onMedia=event=>{if(event.target?.tagName==="VIDEO")schedule();};
    const relevant="video, source, .ai-class-exercise-dialog, .exam, .examPaper_box, .el-message-box, .yidun_popup, .yidun_panel, .yidun_modal, .geetest_panel, .geetest_holder, [class*='captcha'], .dialog-wrapper, .el-overlay-dialog";
    const observer=new MutationObserver(records=>{
      if(records.some(record=>{
        const node=record.target.nodeType===1?record.target:record.target.parentElement;
        return node?.matches(relevant)||node?.closest(relevant)||Array.from(record.addedNodes).concat(Array.from(record.removedNodes)).some(item=>item.nodeType===1&&(item.matches(relevant)||item.querySelector(relevant)));
      }))schedule();
    });
    observer.observe(_unsafeWindow.document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:["class","style","src","disabled","aria-hidden"]});
    for(const event of mediaEvents)_unsafeWindow.document.addEventListener(event,onMedia,true);
    _unsafeWindow.addEventListener("popstate",schedule);_unsafeWindow.addEventListener("hashchange",schedule);
    const stopConfig=vue.watch(()=>[config.platformParams.wisdom,config.queryApis,config.modelSearch,config.helperFallbackModel,config.helperPreferences],schedule,{deep:true});
    let heartbeat=setInterval(schedule,1000);
    function dispose(){
      if(disposed)return;disposed=true;clearInterval(heartbeat);observer.disconnect();stopConfig();controller.dispose();coordinator.dispose();panelUI?.dispose();
      for(const event of mediaEvents)_unsafeWindow.document.removeEventListener(event,onMedia,true);
      _unsafeWindow.removeEventListener("popstate",schedule);_unsafeWindow.removeEventListener("hashchange",schedule);_unsafeWindow.removeEventListener("pagehide",onHide);_unsafeWindow.removeEventListener("pageshow",onShow);
      helperTabCoordinator=null;helperNetworkStatus=null;delete _unsafeWindow.__courseHelperWisdomSession;
    }
    const onHide=event=>{suspended=true;if(event.persisted){clearInterval(heartbeat);coordinator.suspend();controller.suspend();}else dispose();};
    const onShow=event=>{if(event.persisted&&!disposed){suspended=false;coordinator.restore();controller.restore();heartbeat=setInterval(schedule,1000);schedule();panelUI?.clamp();}};
    _unsafeWindow.addEventListener("pagehide",onHide);_unsafeWindow.addEventListener("pageshow",onShow);
    _unsafeWindow.__courseHelperWisdomSession={controller};
    vue.onMounted(()=>{const panel=instance.proxy.$el.closest(".main-page");if(panel)panelUI=mountJcedutecPanel(panel,config,controller,{takeover:()=>coordinator.takeover(),diagnostic:()=>createHelperDiagnostic(config,controller.getStatus(),logs.logList,_unsafeWindow.location)});});
    vue.onBeforeUnmount(dispose);
    logs.addLog("智慧树助手已启动：进入视频、随堂题或练习后继续；人工验证时暂停操作","success");
    schedule();
  };
