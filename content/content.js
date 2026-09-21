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
    callers: [], // bảng X Tracker dưới chart (API community/messages)
    chartPeople: [], // người trên CHART, của token đang mở (feed fomo/thesis)
    thesisAll: [], // cả feed thesis, gồm token khác — làm sổ nhận mặt
    // Người nhặt được từ các API KHÁC của GMGN (xem noteApi). Bảng X Tracker
    // và đám avatar trên cây nến là HAI đám khác nhau — cái sau không có danh
    // sách nào dưới trang để tóm, nên phải nghe API mới biết chúng là ai.
    extra: new Map(), // handleKey → { username, displayName, avatar, wallet, tuDau }
    mauMessage: null, // các cột THẬT của một message GMGN (xem rememberShape)
    ulidProbe: null, // ulid có ổn định không (xem probeUlid)
    apiLog: [], // { path, lan, nguoi, ten[] } — để Chẩn đoán chỉ ra endpoint nào có người
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
    // Đám CHART đứng trước: đó là đám đáng điều tra, và hồ sơ của nó đầy đủ
    // hơn (có author_id, có mốc call chính xác).
    const caller =
      state.chartPeople.find((c) => key && KT.handleKey(c.username) === key) ||
      state.callers.find((c) => (wallet && c.wallet === wallet) || (key && KT.handleKey(c.username) === key)) ||
      findExtra(key, wallet) ||
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
    const caller =
      state.callers.find((c) => KT.avatarKey(c.avatar) === key) ||
      (function () {
        for (const p of state.extra.values()) if (p.avatar && KT.avatarKey(p.avatar) === key) return p;
        return null;
      })();
    if (caller) return identify(caller);
    // Ảnh lưu trong Sheet (người nhập tay, không có trên chart lúc này)
    const person = state.db && state.db.people.find((p) => p.avatar && KT.avatarKey(p.avatar) === key);
    return person ? { caller: null, person, known: true, renamedFrom: "" } : null;
  }

  /* ---------- người nhặt từ API lạ ---------- */

  const MAX_EXTRA = 400;

  function findExtra(key, wallet) {
    if (key && state.extra.has(key)) return state.extra.get(key);
    if (!wallet) return null;
    for (const p of state.extra.values()) if (p.wallet === wallet) return p;
    return null;
  }

  /**
   * Một response API bất kỳ của GMGN → ghi tên endpoint vào sổ, và nhặt người.
   *
   * Sổ endpoint ghi CẢ những cái không có ai: "có endpoint này mà rỗng" là một
   * câu trả lời, còn không biết endpoint đó tồn tại thì không.
   */
  function noteApi(url, payload) {
    const path = KT.gmgn.apiPath(url);
    let row = null;
    for (const r of state.apiLog) if (r.path === path) row = r;
    if (!row) {
      if (state.apiLog.length >= 40) return;
      row = { path, lan: 0, nguoi: 0, ten: [] };
      state.apiLog.push(row);
    }
    row.lan++;
    if (!payload) return;

    const people = KT.gmgn.scanPeople(payload);
    if (!people.length) {
      // Đọc được JSON mà không nhặt ra ai: ghi lại HÌNH DẠNG để biết mình
      // đang bỏ sót vì tên cột lạ, hay vì trong đó thật sự không có người.
      if (!row.hinhDang) row.hinhDang = KT.gmgn.shapeOf(payload);
      return;
    }
    row.nguoi = Math.max(row.nguoi, people.length);
    for (const p of people) {
      if (row.ten.length < 4 && row.ten.indexOf(p.username) < 0) row.ten.push(p.username);
    }
    if (addExtra(people, path) && alive()) shareExtra(people, path);
  }

  /** Một message thô của GMGN thật ra có những cột gì? */
  function rememberShape(payload) {
    try {
      const data = (payload && payload.data) || payload;
      const list = (data && (data.messages || data.list)) || (Array.isArray(data) ? data : null);
      const first = Array.isArray(list) ? list[0] : null;
      if (!first || typeof first !== "object") return;
      state.mauMessage = {
        cot: Object.keys(first).slice(0, 60),
        // Link X của họ là dạng nào? Có tên trong đó thì nó chết khi đổi tên;
        // có id thì cả bài toán này xong.
        twitterUrlMau: String(first.user_twitter_url || "").slice(0, 80),
        dangId: Object.keys(first)
          .filter((k) => /id$/i.test(k) || /_id/i.test(k))
          .slice(0, 12)
          .map((k) => k + "=" + String(first[k]).slice(0, 30)),
      };
    } catch (e) {
      /* hình dạng lạ — bỏ qua */
    }
  }

  /**
   * `ulid` của một bài post có ĐỔI giữa các lần gọi không?
   *
   * Câu này phải trả lời bằng ĐO, không bằng suy luận. `encrypted_user_id`
   * trông cũng như một cái khoá tử tế, mà đo ra thì nó đổi giá trị mỗi lần
   * gọi — lấy nó làm khoá là mỗi lần mở chart đẻ thêm một người trong Sheet.
   *
   * Nhận mặt bài post bằng thứ KHÔNG dính tới ulid: ví + giờ post. Rồi xem
   * ulid gắn với nó có giữ nguyên qua các lần gọi, qua cả lần F5 sau.
   */
  async function probeUlid(payload) {
    try {
      const data = (payload && payload.data) || payload;
      const list = (data && (data.messages || data.list)) || (Array.isArray(data) ? data : null);
      if (!Array.isArray(list) || !list.length) return;

      const box = (await chrome.storage.local.get(KT.STORAGE.ULID))[KT.STORAGE.ULID] || {
        map: {},
        kiem: 0,
        lech: 0,
        viDu: [],
      };

      for (const raw of list.slice(0, 30)) {
        if (!raw || typeof raw !== "object") continue;
        const ulid = String(raw.ulid || raw.id || "").trim();
        const key = String(raw.wallet_address || "").trim().toLowerCase() + "|" + String(raw.created_at || "");
        if (!ulid || key === "|") continue;

        const cu = box.map[key];
        if (cu === undefined) {
          if (Object.keys(box.map).length < 300) box.map[key] = ulid;
          continue;
        }
        box.kiem++;
        if (cu !== ulid) {
          box.lech++;
          if (box.viDu.length < 3) box.viDu.push(cu + " → " + ulid);
          box.map[key] = ulid;
        }
      }
      await chrome.storage.local.set({ [KT.STORAGE.ULID]: box });
      state.ulidProbe = { kiem: box.kiem, lech: box.lech, viDu: box.viDu, nho: Object.keys(box.map).length };
    } catch (e) {
      /* storage đầy hoặc hình dạng lạ — không phải việc sống còn */
    }
  }

  /**
   * Đám người trên CHART, từ feed thesis.
   *
   * ⚠ Feed này NHIỀU TOKEN — mỗi dòng mang `token_address` riêng. Lọc theo
   * token đang mở, nếu không panel liệt kê người của token khác.
   *
   * Giữ cả phần ngoài token này làm sổ nhận mặt: gặp lại một tay cầm ở chart
   * khác thì vẫn tra ra `author_id`, và `author_id` mới là thứ không đổi được.
   */
  function takeThesis(list) {
    if (!list || !list.length) return;
    state.thesisAll = list;
    for (const p of list) {
      const key = KT.handleKey(p.username);
      if (key && !state.extra.has(key)) state.extra.set(key, p);
    }
    applyThesis();
    if (isTop) chrome.runtime.sendMessage({ type: KT.MSG.THESIS, list }).catch(() => {});
  }

  function applyThesis() {
    const addr = KT.walletKey((state.token && state.token.address) || "");
    const here = addr ? state.thesisAll.filter((p) => p.tokenAddress === addr) : state.thesisAll;
    state.chartPeople = here;
    if (panel) panel.update();
    if (overlay) overlay.reset();
  }

  /** ID số của tài khoản X, nếu API nào đó của GMGN có nhắc tới người này. */
  function xIdFor(username) {
    const p = state.extra.get(KT.handleKey(username));
    return (p && p.xId) || "";
  }

  /** Hồ sơ trắng cho người mình chưa biết gì ngoài cái tên. */
  function ghostHit(ref) {
    if (!ref || !ref.username) return null;
    return {
      caller: ref.postText || ref.postedTs ? { username: ref.username, postText: ref.postText, postedTs: ref.postedTs, tuChart: true } : null,
      person: KT.personFromCaller({ username: ref.username, wallet: ref.wallet || "" }),
      known: false,
      renamedFrom: "",
    };
  }

  /** Gộp vào hồ chung. Trả về true nếu có ai đó MỚI. */
  function addExtra(people, path) {
    let added = false;
    for (const p of people) {
      const key = KT.handleKey(p.username);
      if (!key || state.extra.has(key)) continue;
      if (state.extra.size >= MAX_EXTRA) break;
      state.extra.set(key, Object.assign({}, p, { tuDau: path }));
      added = true;
    }
    if (added && panel) panel.update();
    return added;
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
    xIdFor,
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
            ref: {
              wallet: hit.person && hit.person.wallet,
              username: hit.person && hit.person.username,
              // Thẻ chart chỉ sống lúc đang hover, mà hover thì ở frame NÀY.
              // Không gửi kèm thì frame trên cùng phải đọc lại từ đầu — lúc
              // đó thẻ có thể đã biến mất, và mốc call mất theo.
              postText: hit.caller && hit.caller.postText,
              postedTs: hit.caller && hit.caller.postedTs,
            },
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
        // ⚠ normalizeMessage chỉ đọc vài field mình BIẾT TÊN rồi vứt phần còn
        // lại. Mười ba vòng qua chưa ai nhìn xem trong đó còn gì — mà câu hỏi
        // "GMGN có gửi id tài khoản X xuống không" nằm đúng ở đây.
        // Chỉ giữ TÊN cột và các giá trị dạng id; không giữ nội dung post.
        rememberShape(msg.payload);
        probeUlid(msg.payload);
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
      } else if (msg.kind === "thesis") {
        takeThesis(KT.gmgn.parseThesis(msg.payload));
      } else if (msg.kind === "api") {
        noteApi(msg.url, msg.payload);
      } else if (msg.kind === "token") {
        const list = (msg.payload && msg.payload.data) || [];
        const first = Array.isArray(list) ? list[0] : list;
        if (first && first.symbol) {
          state.token = Object.assign({}, state.token, {
            symbol: first.symbol,
            name: first.name,
            address: KT.walletKey(first.address),
          });
          // Feed thesis có thể về TRƯỚC khi biết token đang mở là cái nào —
          // lúc đó bộ lọc theo token chưa chạy được. Lọc lại.
          if (state.thesisAll.length) applyThesis();
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
        lastTooltip: diag.lastTooltip,
        lastHit: diag.lastHit,
      })
      .catch(() => {});
  }

  /**
   * main-world chạy ở mọi frame, nhưng hộp ghi chú và Chẩn đoán chỉ ở frame
   * trên cùng. Frame nào nghe được người thì chia cho cả tab.
   */
  function shareExtra(people, path) {
    chrome.runtime.sendMessage({ type: KT.MSG.API, people, path }).catch(() => {});
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
    if (Date.now() - syncedAt > stale) return void api.refresh();

    // Đang mang một lỗi cũ thì thử lại, kể cả khi dữ liệu còn tươi: bằng không
    // một sự cố thoáng qua nằm lại trên panel tới hàng chục phút và trông như
    // đang hỏng thật.
    const errorAt = (state.data && state.data.errorAt) || 0;
    if (state.data && state.data.error && Date.now() - errorAt > 60000) api.refresh();
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
    if (msg.type === KT.MSG.THESIS) {
      if (isTop) return; // chính mình vừa gửi đi
      state.thesisAll = msg.list || [];
      for (const p of state.thesisAll) {
        const key = KT.handleKey(p.username);
        if (key && !state.extra.has(key)) state.extra.set(key, p);
      }
      applyThesis();
      return;
    }
    if (msg.type === KT.MSG.API) {
      // Chỉ GỘP, không chia lại: tin này đã đi tới mọi frame rồi, chia tiếp là
      // vòng lặp. (addExtra trả false khi không có ai mới, nhưng đừng dựa vào
      // đó để chặn vòng — dựa vào chỗ này.)
      addExtra(msg.people || [], msg.path || "");
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
      const ref = msg.ref && (msg.ref.wallet || msg.ref.username) ? msg.ref : null;
      // ⚠ identify() trả null khi người đó chưa có trong Sheet lẫn trong bảng
      // X Tracker — đúng cảnh của đám trên chart. Frame con đã đọc được tên
      // rồi thì đừng vứt đi: dựng hồ sơ trắng cho người lạ, hộp ghi chú vẫn mở.
      const hit = ref ? identify(ref) || ghostHit(ref) : overlay && overlay.hitAtPointer();
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
          // Endpoint nào của GMGN có người trong đó. Đây là câu hỏi mở còn lại:
          // đám trên chart không nằm trong community/messages, nên phải tìm cho
          // ra endpoint nuôi chúng.
          apiLog: state.apiLog.slice(0, 40),
          nguoiNgoaiBang: state.extra.size,
          nguoiTrenChart: state.chartPeople.length,
          thesisTong: state.thesisAll.length,
          mauChart: state.chartPeople.slice(0, 3).map((p) => p.username + " id=" + (p.xId || "?") + " " + KT.fmtDateTime(p.postedTs)),
          mauMessage: state.mauMessage || null,
          ulidOnDinh: state.ulidProbe || null,
          // Người có trong API mà KHÔNG có trong bảng X Tracker — nếu đám trên
          // chart là một đám khác thật thì chúng phải hiện ra ở đây.
          tenNgoaiBang: (function () {
            const inBang = new Set(state.callers.map((c) => KT.handleKey(c.username)));
            const out = [];
            for (const [key, p] of state.extra) {
              if (inBang.has(key) || out.length >= 12) continue;
              out.push(p.username + " ←" + p.tuDau);
            }
            return out;
          })(),
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
      // Khai lại đều đặn: chẩn đoán chỉ đọc được frame TRÊN CÙNG, nên không có
      // cái này thì frame chart nghĩ gì mình không bao giờ biết. Bảy vòng vừa
      // rồi mò mẫm chính vì thiếu đúng chỗ này.
      setInterval(() => {
        if (document.visibilityState === "visible") sayHello();
      }, 3000);
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
