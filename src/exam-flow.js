  function createExamFlow(pageWindow, options) {
    const runs = new Map();
    const visible = (element) => element?.isConnected && element.getClientRects().length && pageWindow.getComputedStyle(element).visibility !== "hidden";
    const text = (element) => (element?.textContent || "").replace(/\s+/g, "").trim();
    const currentRun = () => {
      const view = options.getView();
      if (!view?.recordId) return null;
      if (!runs.has(String(view.recordId))) {
        const saved = options.sharedReceipts?.get("exam:" + view.recordId);
        runs.set(String(view.recordId), {id: String(view.recordId), answers: new Map(), phase: saved ? "sent" : "answering", receipt: saved?.status || "pending", at: saved?.at || 0});
      }
      return runs.get(String(view.recordId));
    };
    const values = (value) => (Array.isArray(value) ? value : value == null ? [] : [value]).map(String).sort();
    const matches = (left, right) => JSON.stringify(values(left)) === JSON.stringify(values(right));
    const allSaved = (run, view) => view.records.length > 0 && view.records.every((record) => {
      const answer = run.answers.get(String(record.id));
      return answer && matches(view.param[record.id], answer.values);
    });
    function hasSubmitted() {
      const run = currentRun();
      return run?.phase === "sent";
    }
    function updateStatus() {
      const run = currentRun();
      if (!run || run.phase !== "sent") return false;
      const rejected = run.receipt === "rejected";
      const overdue = run.receipt !== "accepted" && Date.now() - run.at > 15000;
      options.publish(rejected || overdue ? "需要人工处理" : "等待网站确认",
        run.receipt === "accepted" ? "网站已接受交卷" : rejected ? `网站拒绝交卷${run.message ? `：${run.message}` : ""}` : overdue ? "交卷尚未确认，请检查页面；不会重复提交" : "已交卷，等待网站回执");
      return true;
    }
    function observe(xhr, url) {
      const id = decodeURIComponent(url.pathname.split("/").pop());
      const run = runs.get(id);
      if (!run) return;
      run.phase = "sent";
      run.at = Date.now();
      run.receipt = "pending";
      for (const answer of run.answers.values()) answer.question.submissionStatus = "等待交卷回执";
      options.onSubmit();
      xhr.addEventListener("loadend", () => {
        let payload;
        try { payload = xhr.responseType === "json" ? xhr.response : JSON.parse(xhr.responseText); } catch {}
        run.receipt = xhr.status >= 200 && xhr.status < 300 && payload?.success === true ? "accepted" : payload?.success === false ? "rejected" : "unknown";
        options.sharedReceipts?.record("exam:" + id, run.receipt);
        run.message = typeof payload?.message === "string" ? payload.message.slice(0, 200) : "";
        const label = run.receipt === "accepted" ? "网站已接受交卷" : run.receipt === "rejected" ? "网站拒绝交卷" : "交卷尚未确认";
        for (const answer of run.answers.values()) answer.question.submissionStatus = label;
        options.log(label + (run.message ? `：${run.message}` : ""), run.receipt === "accepted" ? "success" : "warning");
        if (options.allowed()) updateStatus();
      }, {once: true});
    }
    async function process(state) {
      const view = options.getView();
      const run = currentRun();
      if (!run || !view.showModal || !options.isCurrent(state)) return;
      if (run.phase === "sent") { updateStatus(); return; }
      const expected = state.targets.map((index) => state.parsed.choices[index].value);
      if (!matches(view.param[view.model.id], expected)) {
        state.phase = "blocked";
        state.question.answer = ["页面未保存当前题目的选中状态，请重试当前题"];
        options.publish("需要人工处理", state.question.answer[0], true);
        return;
      }
      for (const [id, saved] of run.answers) if (!matches(view.param[id], saved.values)) run.answers.delete(id);
      run.answers.set(String(view.model.id), {values: [...expected], question: state.question});
      if (!options.settings().submit || Date.now() - state.at < options.delay()) return;
      if (state.phase === "filled") {
        const targetIndex = view.records.findIndex((record) => !run.answers.has(String(record.id)));
        if (targetIndex >= 0) {
          const next = targetIndex === view.index + 1 ? options.button(state.parsed.root, "下一题") : state.parsed.root.querySelectorAll(".grid-con .index-num")[targetIndex];
          if (!next || !visible(next) || !options.isCurrent(state)) return;
          state.phase = "exam-advanced";
          state.at = Date.now();
          state.question.submissionStatus = "已填选并保存";
          next.click();
          options.log("本题已填选并保存，进入下一道未完成题目");
          return;
        }
        if (!allSaved(run, view)) return;
        const submit = options.button(state.parsed.root, "提交");
        if (!submit || !options.isCurrent(state)) return;
        state.phase = "exam-confirming";
        run.phase = "confirming";
        state.at = Date.now();
        submit.click();
        options.publish("等待提交", "全部题目已核对，等待原生交卷确认框");
      } else if (state.phase === "exam-confirming") {
        if (run.phase !== "confirming" || !allSaved(run, view) || !options.isCurrent(state)) return;
        const dialogs = Array.from(pageWindow.document.querySelectorAll(".ant-modal-confirm .ant-modal-content")).filter((dialog) => visible(dialog) &&
          text(dialog.querySelector(".ant-modal-confirm-title")) === "是否提交" && /确认提交试卷[?？]?$/.test(text(dialog.querySelector(".ant-modal-confirm-content"))));
        if (dialogs.length !== 1) return;
        const confirm = Array.from(dialogs[0].querySelectorAll(".ant-modal-confirm-btns button")).find((button) => visible(button) && !button.disabled && /^(确定|OK)$/i.test(text(button)));
        if (!confirm || !options.isCurrent(state)) return;
        if (options.sharedReceipts?.reserve("exam:" + run.id) === false) {
          run.phase = "sent"; run.at = Date.now(); run.receipt = "unknown";
          updateStatus(); return;
        }
        state.phase = "exam-sent";
        run.phase = "sent";
        run.at = Date.now();
        confirm.click();
        options.publish("等待网站确认", "已点击原生交卷确认，等待网站回执");
      } else if (state.phase === "exam-advanced" && Date.now() - state.at > 15000) {
        options.publish("需要人工处理", "下一题尚未加载，请检查网站提示");
      }
    }
    return {process, observe, hasSubmitted, updateStatus};
  }
