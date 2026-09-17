/**
 * Điều phối phía trang web: nạp dữ liệu từ storage, dựng db, gắn panel +
 * overlay, nghe phím tắt và tin nhắn từ popup.
 *
 * Không fetch gì ở đây — mọi lượt lấy CSV đều nhờ service worker (xem
 * background/service-worker.js).
 */
(function () {
  "use strict";
  const KT = globalThis.KT;

  // File này có thể được chèn tay (popup → "Bật panel trên tab này") lên một
  // tab đã có sẵn content script. Chèn hai lần = hai panel chồng nhau.
  if (globalThis.__KOL_TRACKER__) return;
  globalThis.__KOL_TRACKER__ = true;

  // Content script chạy trong MỌI frame (chart của GMGN có thể nằm trong một
  // iframe blob:). Overlay thì frame nào cũng cần — nó vẽ đè lên đúng frame
  // chứa avatar. Panel thì KHÔNG: mỗi frame một panel là chồng lên nhau.
  const isTop = window.top === window;

  const state = { cfg: KT.withDefaults(null), data: null, db: null };
  let panel = null;
  let overlay = null;

  const api = {
    getState: () => state,
    refresh: () => chrome.runtime.sendMessage({ type: KT.MSG.REFRESH }).catch((e) => ({ error: String(e) })),
    openOptions: () => chrome.runtime.sendMessage({ type: "kt:openOptions" }).catch(() => {}),
    getSeen: () => (overlay ? overlay.getSeen() : []),
    onCapture: () => {
      if (panel && panel.isOpen()) panel.update();
    },
    savePos: (pos) => {
      const ui = Object.assign({}, state.ui, pos);
      state.ui = ui;
      chrome.storage.local.set({ [KT.STORAGE.UI]: ui });
    },
  };

  function rebuildDb() {
    const d = state.data;
    state.db = d ? KT.buildDb(d.kols, d.calls, state.cfg) : null;
  }

  async function load() {
    const [cfg, data, local] = await Promise.all([
      KT.getConfig(),
      KT.getData(),
      chrome.storage.local.get(KT.STORAGE.UI),
    ]);
    state.cfg = cfg;
    state.data = data;
    state.ui = local[KT.STORAGE.UI] || {};
    rebuildDb();
  }

  function applyOverlay() {
    if (!overlay) return;
    const want = state.cfg.overlayRings || state.cfg.overlayHover;
    if (want && !overlay.isRunning()) overlay.start();
    else if (!want && overlay.isRunning()) overlay.stop();
    else if (want) overlay.reset();
  }

  /** Dữ liệu cũ quá thì tự làm tươi — spec: fetch lại mỗi khi mở trang GMGN. */
  function refreshIfStale() {
    const stale = (state.cfg.staleMinutes || 10) * 60000;
    const syncedAt = (state.data && state.data.syncedAt) || 0;
    if (!isTop) return; // n frame = n lời gọi fetch cho cùng một bảng
    if (!state.cfg.kolsCsvUrl) return;
    if (Date.now() - syncedAt > stale) api.refresh();
  }

  function onHotkey(ev) {
    // Alt+K. Bắt luôn ở đây chứ không chỉ dựa vào chrome.commands: phím tắt
    // của extension có thể bị extension khác giành mất mà không báo gì.
    if (!ev.altKey || ev.ctrlKey || ev.metaKey) return;
    if ((ev.key || "").toLowerCase() !== "k") return;
    ev.preventDefault();
    togglePanel();
  }

  function selectedText() {
    try {
      const s = String(window.getSelection() || "").trim();
      return s && s.length <= 60 ? s : "";
    } catch (e) {
      return "";
    }
  }

  function togglePanel(query) {
    if (!panel) return;
    const q = query != null ? query : selectedText();
    if (panel.isOpen() && !q) {
      panel.hide();
      api.savePos({ open: false });
    } else {
      panel.show(q || null);
      api.savePos({ open: true });
    }
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[KT.STORAGE.DATA]) {
      state.data = changes[KT.STORAGE.DATA].newValue;
      rebuildDb();
      if (panel) panel.update();
      applyOverlay();
    }
    if (area === "sync" && changes[KT.STORAGE.CONFIG]) {
      state.cfg = KT.withDefaults(changes[KT.STORAGE.CONFIG].newValue);
      rebuildDb();
      if (panel) panel.update();
      applyOverlay();
    }
  });

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || !msg.type) return;
    if (msg.type === KT.MSG.TOGGLE_PANEL) {
      togglePanel(msg.query);
      sendResponse({ ok: true });
      return;
    }
    if (msg.type === KT.MSG.DIAGNOSE) {
      // Chỉ frame trên cùng trả lời: nhiều frame cùng sendResponse thì Chrome
      // chỉ lấy một cái, còn lại thành lỗi lạ trong console.
      if (!isTop) return;
      sendResponse(overlay ? overlay.diagnose() : { error: "overlay chưa chạy" });
      return;
    }
  });

  (async function init() {
    await load();

    if (isTop) {
      panel = KT.createPanel(api);
      panel.mount(state.ui);
      if (state.cfg.panelEnabled && state.ui.open !== false) panel.show();
    }
    overlay = KT.createOverlay(api);
    applyOverlay();

    window.addEventListener("keydown", onHotkey, true);
    refreshIfStale();

    // Cửa hậu để debug từ console của trang (isolated world):
    //   __KT.diagnose()  → chart này canvas hay DOM?
    globalThis.__KT = {
      state,
      diagnose: () => overlay.diagnose(),
      lookup: (q) => KT.lookup(state.db, q),
      panel,
    };
  })();
})();
