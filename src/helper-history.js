  const HelperHistoryPager = vue.defineComponent({
    props: ["page", "pages", "total"],
    emits: ["select"],
    setup(props, {emit}) {
      return () => vue.h("nav", {
        class: "helper-history-pages", "aria-label": "答题历史分页",
        hidden: helperPage.location.hostname !== "bbgu.jcedutec.cn" || props.pages <= 1
      }, [
        vue.h("button", {type: "button", disabled: props.page <= 1, onClick: () => emit("select", props.page - 1)}, "上一页"),
        vue.h("span", null, `第 ${props.page} / ${props.pages} 页 · 共 ${props.total} 题`),
        vue.h("button", {type: "button", disabled: props.page >= props.pages, onClick: () => emit("select", props.page + 1)}, "下一页"),
        vue.h("button", {type: "button", onClick: () => emit("select", 0)}, "最新")
      ]);
    }
  });
