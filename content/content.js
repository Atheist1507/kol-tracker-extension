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
  const STALE_MSG = "Extension vừa cập nhật — bấm F5 lại trang này.";

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

  /**
   * Bản content script đang chạy còn nối được với extension không?
   *
   * Bấm ⟳ ở chrome://extensions là bản cũ trong mọi tab đang mở bị CẮT khỏi
   * extension ngay lập tức: `chrome.runtime.id` biến mất, mọi lời gọi ném lỗi
   * "Extension context invalidated", và tab đó không trả lời ai nữa cho tới
   * khi F5. Không nói ra thì nó trông y hệt "extension hỏng".
   */
  function alive() {
    try {
      return !!(chrome.runtime && chrome.runtime.id);
    } catch (e) {
      return false;
    }
  }

  const api = {
    getState: () => state,
    refresh: () =>
      alive()
        ? chrome.runtime.sendMessage({ type: KT.MSG.REFRESH }).catch(() => ({ error: STALE_MSG }))
        : Promise.resolve({ error: STALE_MSG }),
    openOptions: () => chrome.runtime.sendMessage({ type: "kt:openOptions" }).catch(() => {}),
    identify,
    identifyByAvatar,
    savePos: (pos) => {
      state.ui = Object.assign({}, state.ui, pos);
      chrome.storage.local.set({ [KT.STORAGE.UI]: state.ui });
    },

    openNote: (hit, rect) => {
      if (!hit) return;
      // Hộp ghi chú chỉ dựng ở frame TRÊN CÙNG (một trang một hộp). Bấm N khi
      // đang hover avatar trên chart là bấm trong iframe của TradingView —
      // nhờ frame trên cùng mở hộ, và gửi ĐỊNH DANH chứ không gửi cả object:
      // frame trên cùng có dữ liệu Sheet mới hơn, để nó tự tra lại.
      if (!noteBox) {
        chrome.runtime
          .sendMessage({
            type: KT.MSG.NOTE_FOR,
            ref: { wallet: hit.person && hit.person.wallet, username: hit.person && hit.person.username },
          })
          .catch(() => {});
        return;
      }
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
        shareCallers();
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

  /**
   * main-world.js chỉ chạy ở frame trên cùng (all_frames: false — nó vá fetch
   * của GMGN, vá ở mọi frame là vá nhầm chỗ). Nên chỉ frame đó thấy danh sách
   * người trên chart; iframe của TradingView thì mù tịt, và avatar nằm trong
   * đó thì hover không ra ai, bấm N không ra gì.
   *
   * Đẩy qua service worker để mọi frame trong tab cùng thấy.
   */
  /**
   * Khai báo mình tồn tại. Không có cái này thì "chart nằm trong iframe mà
   * content script không vào được" trông y hệt "vào được nhưng không khớp được
   * avatar nào" — hai bệnh, hai cách chữa.
   *
   * Gọi lại mỗi khi có dữ liệu mới: lúc frame vừa dựng thì trang chưa vẽ ảnh
   * nào, `images: 0` ở đó không nói lên điều gì.
   */
  function sayHello() {
    const diag = overlay ? overlay.diagnose() : {};
    chrome.runtime
      .sendMessage({
        type: KT.MSG.FRAME_HELLO,
        url: location.href.slice(0, 120),
        isTop,
        images: document.querySelectorAll("img[src]").length,
        canvases: document.querySelectorAll("canvas").length,
        avatarLike: diag.avatarLike,
        avatarMatched: diag.avatarMatched,
        ringsActive: diag.ringsActive,
        callers: state.callers.length,
      })
      .catch(() => {});
  }

  function shareCallers() {
    if (!isTop) return;
    chrome.runtime
      .sendMessage({ type: KT.MSG.CALLERS, callers: state.callers, token: state.token })
      .catch(() => {});
  }

  /**
   * Frame con báo toạ độ chuột cho frame trên cùng.
   *
   * Chuột vào iframe là frame cha NGỪNG nhận pointermove — nó giữ nguyên toạ
   * độ cũ và không biết mình đang cầm số liệu chết. Chart nằm trong iframe nên
   * cả overlay lẫn phím N ở frame cha đều đo từ một điểm sai.
   *
   * Hãm lại 80ms/lần: đây là tin đi vòng qua service worker, bắn theo nhịp
   * pointermove là vài trăm tin mỗi giây.
   */
  let lastPointerSent = 0;
  function reportPointer(ev) {
    const now = Date.now();
    if (now - lastPointerSent < 80 || !alive()) return;
    lastPointerSent = now;
    chrome.runtime
      .sendMessage({ type: KT.MSG.POINTER, x: ev.clientX, y: ev.clientY, url: location.href })
      .catch(() => {});
  }

  /** Iframe nào đang gửi tin, và nó nằm ở đâu trong trang. */
  function frameOffset(url) {
    const frames = document.querySelectorAll("iframe");
    for (const f of frames) {
      if (f.src === url) return f.getBoundingClientRect();
    }
    return frames.length === 1 ? frames[0].getBoundingClientRect() : null;
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
      if (!hit && isTop) return;
      ev.preventDefault();
      if (hit) api.openNote(hit, hit.rect);
      else api.openNote({ person: {} }, null); // nhờ frame trên cùng tự quyết
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
    if (msg.type === KT.MSG.CALLERS) {
      if (isTop) return; // chính mình vừa gửi đi
      state.callers = msg.callers || [];
      state.token = msg.token || state.token;
      if (overlay) overlay.reset();
      setTimeout(sayHello, 1200); // chờ quét xong rồi hãy khai lại số liệu
      return;
    }
    if (msg.type === KT.MSG.POINTER) {
      if (!isTop || !overlay) return;
      const box = frameOffset(msg.url);
      if (box) overlay.setPointer(box.left + msg.x, box.top + msg.y);
      return;
    }
    if (msg.type === KT.MSG.NOTE_FOR) {
      if (!isTop) return;
      // Không kèm định danh = frame con không tự nhận ra ai (avatar trên chart
      // là nét vẽ trên canvas, không phải thẻ <img>). Frame trên cùng tự quyết:
      // nó có thẻ tooltip của GMGN và giờ có cả toạ độ chuột đúng.
      const hit = msg.ref && (msg.ref.wallet || msg.ref.username) ? identify(msg.ref) : overlay && overlay.hitAtPointer();
      if (hit) api.openNote(hit, null);
      return;
    }
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

    if (!isTop) {
      document.addEventListener("pointermove", reportPointer, { capture: true, passive: true });
    }

    window.addEventListener("keydown", onHotkey, true);
    refreshIfStale();
    shareCallers();

    sayHello();

    globalThis.__KT = {
      state,
      diagnose: () => overlay.diagnose(),
      identify,
      panel,
    };
  })();
})();
