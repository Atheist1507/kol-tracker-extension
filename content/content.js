/**
 * Điều phối phía trang web.
 *
 * Luồng dữ liệu:
 *   GMGN gọi API  →  main-world.js bọc fetch, postMessage sang đây
 *                 →  KT.gmgn.parseMessages  →  state.callers (người đang trên chart)
 *   Apps Script   →  service worker fetch   →  storage.local  →  state.db (hồ sơ trong Sheet)
 *
 * Ghép hai cái đó lại bằng VÍ là ra "ai trên chart này mình đã biết".
 */
(function () {
  "use strict";
  const KT = globalThis.KT;

  // Panel chỉ ở frame trên cùng; overlay thì frame nào cũng chạy.
  const isTop = window.top === window;

  if (globalThis.__KOL_TRACKER__) return;
  globalThis.__KOL_TRACKER__ = true;

  const state = {
    cfg: KT.withDefaults(null),
    data: null,
    db: null,
    callers: [], // người đang hiện trên chart (từ API GMGN)
    token: null, // { symbol, address, chain }
    // KHÔNG giữ "người đang hover" ở đây nữa: state toàn cục thì mutation nào
    // của GMGN cũng ghi vào được, và phím N mở mãi một người. Overlay hỏi
    // thẳng con trỏ — xem overlay.hitAtPointer().
    ui: {},
  };

  let panel = null;
  let overlay = null;
  let noteBox = null;

  /* ---------- ghép hồ sơ Sheet với người trên chart ---------- */

  function identify(ref) {
    if (!ref) return null;
    const key = KT.handleKey(ref.username);
    const wallet = KT.walletKey(ref.wallet);
    const caller =
      state.callers.find((c) => (wallet && c.wallet === wallet) || (key && KT.handleKey(c.username) === key)) ||
      null;
    const merged = caller || ref;
    const person = KT.findPerson(state.db, merged);
    if (!caller && !person) return null;
    return {
      caller,
      person: person || KT.personFromCaller(merged),
      known: !!person,
      renamedFrom: person ? KT.renamedFrom(person, merged) : "",
    };
  }

  function identifyByAvatar(url) {
    const key = KT.avatarKey(url);
    if (!key) return null;
    const caller = state.callers.find((c) => KT.avatarKey(c.avatar) === key);
    if (caller) return identify(caller);
    // Ảnh lưu trong Sheet (người nhập tay, không có trên chart lúc này)
    const person = state.db && state.db.people.find((p) => p.avatar && KT.avatarKey(p.avatar) === key);
    return person ? { caller: null, person, known: true, renamedFrom: "" } : null;
  }

  const api = {
    getState: () => state,
    refresh: () => chrome.runtime.sendMessage({ type: KT.MSG.REFRESH }).catch((e) => ({ error: String(e) })),
    openOptions: () => chrome.runtime.sendMessage({ type: "kt:openOptions" }).catch(() => {}),
    identify,
    identifyByAvatar,
    savePos: (pos) => {
      state.ui = Object.assign({}, state.ui, pos);
      chrome.storage.local.set({ [KT.STORAGE.UI]: state.ui });
    },

    openNote: (hit, rect) => {
      if (!noteBox || !hit) return;
      noteBox.open({
        caller: hit.caller,
        person: hit.person,
        renamedFrom: hit.renamedFrom,
        token: (state.token && state.token.symbol) || "",
        tokenAddress: (state.token && state.token.address) || "",
        chain: (state.token && state.token.chain) || "",
        rect: rect || (hit.rect || null),
      });
    },

    saveNote: (payload) =>
      chrome.runtime
        .sendMessage({ type: KT.MSG.SAVE_NOTE, payload })
        .catch((e) => ({ ok: false, error: String(e) })),

    onSaved: () => {
      // Sheet đã nhận; kéo lại dữ liệu để panel hiện ngay ghi chú vừa lưu
      api.refresh();
      if (!panel) return;
      // Ghi chú xong là xong một người — chỗ muốn tới tiếp theo luôn là DANH
      // SÁCH để chọn người kế, không phải đứng lại ở màn chi tiết của người
      // vừa ghi. Panel đang đóng (ghi chú bằng phím N từ chart) thì mở ra,
      // vì đó cũng là cách nhìn thấy ghi chú vừa lưu đã vào Sheet thật.
      if (!panel.isOpen()) {
        panel.show();
        api.savePos({ open: true });
      }
      panel.home();
      panel.flash("Đã lưu vào Sheet");
    },
  };

  /* ---------- dữ liệu ---------- */

  function rebuildDb() {
    const d = state.data;
    state.db = d ? KT.buildDb(d.overview, d.detail) : null;
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

  /* ---------- cầu nối với main world ---------- */

  function onWindowMessage(event) {
    // Chỉ nhận tin của CHÍNH trang này, do main-world.js của mình gửi
    if (event.source !== window) return;
    const msg = event.data;
    if (!msg || msg.source !== "kol-tracker") return;

    try {
      if (msg.kind === "messages") {
        const callers = KT.gmgn.parseMessages(msg.payload);
        if (!callers.length) return;
        state.callers = callers;
        const where = KT.gmgn.parseEndpoint(msg.url);
        if (where) {
          state.token = Object.assign({}, state.token, {
            chain: where.chain,
            address: where.tokenAddress,
          });
        }
        if (panel) panel.update();
        if (overlay) overlay.reset();
      } else if (msg.kind === "token") {
        const list = (msg.payload && msg.payload.data) || [];
        const first = Array.isArray(list) ? list[0] : list;
        if (first && first.symbol) {
          state.token = Object.assign({}, state.token, {
            symbol: first.symbol,
            name: first.name,
            address: KT.walletKey(first.address),
          });
          if (panel) panel.update();
        }
      }
    } catch (e) {
      /* dữ liệu GMGN đổi hình dạng — im lặng, đừng làm hỏng trang */
    }
  }

  /* ---------- phím tắt ---------- */

  function selectedText() {
    try {
      const s = String(window.getSelection() || "").trim();
      return s && s.length <= 60 ? s : "";
    } catch (e) {
      return "";
    }
  }

  function onHotkey(ev) {
    if (ev.ctrlKey || ev.metaKey) return;
    if (noteBox && noteBox.isOpen()) return; // đang gõ trong hộp note
    const key = (ev.key || "").toLowerCase();

    if (ev.altKey && key === "k") {
      ev.preventDefault();
      return togglePanel();
    }

    // N: ghi chú người đang hover. Không dùng Alt để gõ cho nhanh, nên phải
    // né mọi ô nhập của GMGN — bằng không gõ chữ "n" trong ô tìm kiếm của họ
    // là bật hộp note.
    if (key === "n" && !ev.altKey && !ev.shiftKey && !isTyping(ev.target)) {
      const hit = overlay && overlay.hitAtPointer();
      if (!hit) return;
      ev.preventDefault();
      api.openNote(hit, hit.rect);
    }
  }

  function isTyping(el) {
    if (!el || el.nodeType !== 1) return false;
    const tag = el.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
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

  function applyOverlay() {
    if (!overlay) return;
    const want = state.cfg.overlayRings || state.cfg.overlayHover;
    if (want && !overlay.isRunning()) overlay.start();
    else if (!want && overlay.isRunning()) overlay.stop();
    else if (want) overlay.reset();
  }

  function refreshIfStale() {
    if (!isTop) return;
    const stale = (state.cfg.staleMinutes || 10) * 60000;
    const syncedAt = (state.data && state.data.syncedAt) || 0;
    if (!state.cfg.sheetApiUrl && !state.cfg.kolsCsvUrl) return;
    if (Date.now() - syncedAt > stale) api.refresh();
  }

  /* ---------- sự kiện ---------- */

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[KT.STORAGE.DATA]) {
      state.data = changes[KT.STORAGE.DATA].newValue;
      rebuildDb();
      if (panel) panel.update();
      applyOverlay();
    }
    if (area === "sync" && changes[KT.STORAGE.CONFIG]) {
      state.cfg = KT.withDefaults(changes[KT.STORAGE.CONFIG].newValue);
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
      if (!isTop) return;
      const base = overlay ? overlay.diagnose() : { error: "overlay chưa chạy" };
      const under = overlay && overlay.hitAtPointer();
      sendResponse(
        Object.assign(base, {
          underPointer: under ? under.person.username || under.person.wallet : null,
          callers: state.callers.length,
          token: state.token,
          sheetPeople: state.db ? state.db.counts.people : 0,
        })
      );
      return;
    }
  });

  (async function init() {
    await load();

    window.addEventListener("message", onWindowMessage, false);

    if (isTop) {
      panel = KT.createPanel(api);
      panel.mount(state.ui);
      noteBox = KT.createNoteBox(api);
      noteBox.mount();
      if (state.cfg.panelEnabled && state.ui.open !== false) panel.show();
    }
    overlay = KT.createOverlay(api);
    applyOverlay();

    window.addEventListener("keydown", onHotkey, true);
    refreshIfStale();

    globalThis.__KT = {
      state,
      diagnose: () => overlay.diagnose(),
      identify,
      panel,
    };
  })();
})();
