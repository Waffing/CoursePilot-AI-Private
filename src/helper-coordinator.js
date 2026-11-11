  function createHelperCoordinator(pageWindow, onChange) {
    const ownerKey = "noshuang.helper.owner.v1";
    const receiptKey = "noshuang.helper.receipts.v1";
    const id = pageWindow.crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    let settled = false;
    let active = true;
    let disposed = false;
    let timer = null;
    let storageError = false;
    const read = (key) => {
      try { return JSON.parse(pageWindow.localStorage.getItem(key) || "null"); }
      catch { storageError = true; return null; }
    };
    const write = (key, value) => {
      try { pageWindow.localStorage.setItem(key, JSON.stringify(value)); return true; }
      catch { storageError = true; return false; }
    };
    const isOwner = () => !disposed && active && settled && !storageError && read(ownerKey)?.id === id;
    function claim(force = false) {
      if (disposed || !active) return;
      storageError = false;
      clearTimeout(timer);
      const previous = read(ownerKey);
      if (!force && previous && previous.id !== id) { settled = false; onChange?.(); return; }
      settled = false;
      if (!write(ownerKey, {id})) { onChange?.(); return; }
      onChange?.();
      // No action is allowed until simultaneous startup claims have settled.
      timer = setTimeout(() => { settled = true; onChange?.(); }, 150);
    }
    function release() {
      settled = false;
      clearTimeout(timer);
      try { if (read(ownerKey)?.id === id) pageWindow.localStorage.removeItem(ownerKey); }
      catch { storageError = true; }
    }
    const onStorage = (event) => {
      if (disposed || !active || event.key !== ownerKey && event.key !== null) return;
      if (!read(ownerKey)) claim(); else onChange?.();
    };
    pageWindow.addEventListener("storage", onStorage);
    claim();
    return {
      isOwner,
      hasStorageError: () => storageError,
      takeover: () => claim(true),
      suspend() { active = false; release(); },
      restore() { active = true; claim(); },
      getReceipt(key) { return read(receiptKey)?.[key] || null; },
      reserve(key) {
        if (!isOwner()) return false;
        const receipts = read(receiptKey) || {};
        if (receipts[key]) return false;
        receipts[key] = {status: "pending", at: Date.now()};
        return write(receiptKey, receipts) && isOwner();
      },
      record(key, status) {
        const receipts = read(receiptKey) || {};
        if (!receipts[key]) return;
        receipts[key].status = status;
        write(receiptKey, receipts);
      },
      dispose() { disposed = true; release(); pageWindow.removeEventListener("storage", onStorage); }
    };
  }

  let sharedHelperPacer = null;
  let helperTabCoordinator = null;
  function getSharedHelperPacer() {
    if (!sharedHelperPacer) sharedHelperPacer = createHelperRequestPacer({
      interval: () => getHelperPreferences(useConfigStore().helperPreferences).requestInterval * 1000,
      storage: window.localStorage,
      onWait: (seconds, cooling) => helperNetworkStatus?.(seconds, cooling)
    });
    return sharedHelperPacer;
  }
  let helperNetworkStatus = null;
