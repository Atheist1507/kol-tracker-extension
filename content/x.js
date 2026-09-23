/**
 * KOL Tracker trên X (twitter.com / x.com).
 *
 * Trên GMGN mình đi tìm người giữa một cái chart vẽ bằng canvas. Ở đây ngược
 * lại: trang hồ sơ NÓI THẲNG đang là ai — tay cầm nằm ngay trong URL. Nên
 * phần khó không phải "người này là ai" mà là "gắn cái nút vào đâu cho nó
 * không rụng khi X đổi giao diện".
 *
 * Hai thứ mọc thêm vào trang:
 *   - nút "Ghi chú" cạnh nút Theo dõi
 *   - một dải ngay dưới phần bio: hạng + ghi chú gần nhất của mình về nó
 *
 * ⚠ Luật khi chạm DOM của người khác (giống main-world.js): CHỈ THÊM, không
 * sửa, không xoá gì của X. Mình hỏng thì mình im.
 */
(function () {
  "use strict";
  const KT = globalThis.KT;

  if (globalThis.__KOL_TRACKER_X__) return;
  globalThis.__KOL_TRACKER_X__ = true;

  const BTN_ID = "kol-tracker-x-btn";
  const STRIP_ID = "kol-tracker-x-strip";

  const state = { cfg: KT.withDefaults(null), data: null, db: null, handle: null };
  let noteBox = null;
  let lastAnchors = { nut: null, dai: null };

  /* ---------- dữ liệu ---------- */

  function alive() {
    try {
      return !!(chrome.runtime && chrome.runtime.id);
    } catch (e) {
      return false;
    }
  }

  async function load() {
    const [cfg, data] = await Promise.all([KT.getConfig(), KT.getData()]);
    state.cfg = cfg;
    state.data = data;
    state.db = data ? KT.buildDb(data.overview, data.detail) : null;
  }

  /** Người này đã có hồ sơ chưa? Trên X chỉ có tay cầm để tra. */
  function personFor(handle) {
    if (!state.db || !handle) return null;
    return KT.findPerson(state.db, { username: handle });
  }

  /* ---------- tìm chỗ gắn ---------- */

  /**
   * ⚠ KHÔNG bám vào một selector duy nhất.
   *
   * X đổi giao diện liên tục và class thì sinh tự động, không đọc được. Mỗi
   * chỗ gắn là một THANG: thử lần lượt, dùng cái nào bắt được trước. Và ghi
   * lại bắt bằng nấc nào — hỏng thì biết ngay nấc nào vừa mất, thay vì chỉ
   * thấy "nút không hiện".
   */
  const NEO_NUT = [
    ['[data-testid="placementTracking"]', "khung nút Theo dõi"],
    ['[data-testid="userActions"]', "nút ... trên hồ sơ"],
    ['[data-testid="UserName"]', "khối tên"],
  ];

  const NEO_DAI = [
    ['a[href$="/followers_you_follow"]', "dòng Được theo dõi bởi"],
    ['[data-testid="UserProfileHeader_Items"]', "dòng link/ngày tham gia"],
    ['[data-testid="UserDescription"]', "bio"],
    ['[data-testid="UserName"]', "khối tên"],
  ];

  function timNeo(thang) {
    for (const [sel, ten] of thang) {
      const el = document.querySelector(sel);
      if (el && el.isConnected) return { el, ten, sel };
    }
    return null;
  }

  /* ---------- vẽ ---------- */

  function khungRieng(id) {
    const host = document.createElement("div");
    host.id = id;
    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = KT.X_CSS;
    shadow.appendChild(style);
    const wrap = document.createElement("div");
    wrap.className = "kt-x";
    shadow.appendChild(wrap);
    return { host, wrap };
  }

  function veNut(person) {
    document.getElementById(BTN_ID)?.remove();
    const neo = timNeo(NEO_NUT);
    lastAnchors.nut = neo ? neo.ten : null;
    if (!neo) return;

    const { host, wrap } = khungRieng(BTN_ID);
    host.style.cssText = "display:inline-flex;align-items:center;margin-right:8px;vertical-align:middle;";
    const soGhiChu = person ? person.noteCount || 0 : 0;
    wrap.innerHTML =
      `<button class="kt-x-btn${person ? " co" : ""}" type="button">` +
      (person ? `${KT.esc(person.tierLetter || "•")} · ${soGhiChu} ghi chú` : "+ Ghi chú") +
      `</button>`;
    wrap.querySelector("button").addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      moHop(ev.currentTarget.getBoundingClientRect());
    });
    // Đứng TRƯỚC nút Theo dõi: chèn vào sau thì nó bị đẩy xuống dòng khi
    // cửa sổ hẹp, và nút Theo dõi vốn nằm sát mép phải.
    neo.el.parentElement ? neo.el.parentElement.insertBefore(host, neo.el) : neo.el.appendChild(host);
  }

  function veDai(person) {
    document.getElementById(STRIP_ID)?.remove();
    if (!person) return; // chưa có hồ sơ thì không mọc dải rỗng ra làm gì
    const neo = timNeo(NEO_DAI);
    lastAnchors.dai = neo ? neo.ten : null;
    if (!neo) return;

    const note = (person.notes && person.notes[0]) || null;
    const { host, wrap } = khungRieng(STRIP_ID);
    host.style.cssText = "display:block;margin:8px 0;";
    const mau = KT.tierColor(person.tier);
    wrap.innerHTML =
      `<div class="kt-x-strip" style="border-color:${KT.esc(mau)}">` +
      `<div class="kt-x-head"><b style="color:${KT.esc(mau)}">${KT.esc(person.tierLetter || "chưa xếp hạng")}</b>` +
      (person.noteCount ? ` · ${person.noteCount} ghi chú` : "") +
      (person.redFlags ? ` · <span class="kt-x-flag">⚑ ${KT.esc(person.redFlags)}</span>` : "") +
      `</div>` +
      (person.summary ? `<div class="kt-x-sum">${KT.esc(person.summary)}</div>` : "") +
      (note && note.note
        ? `<div class="kt-x-note">${KT.esc(note.note)}</div>` +
          `<div class="kt-x-meta">${KT.esc(
            [KT.fmtDateTime(note.notedTs || note.notedAt), note.token ? "$" + note.token : "", note.addedBy]
              .filter(Boolean)
              .join(" · ")
          )}</div>`
        : "") +
      `</div>`;

    // Dải nằm DƯỚI chỗ neo. Với "Được theo dõi bởi" thì phải trèo lên khối
    // cha một nấc, vì cái neo là thẻ <a> nằm lọt trong một dòng chữ.
    const sau = neo.sel.indexOf("followers_you_follow") >= 0 ? neo.el.parentElement || neo.el : neo.el;
    sau.parentElement ? sau.parentElement.insertBefore(host, sau.nextSibling) : sau.appendChild(host);
  }

  /* ---------- hộp ghi chú ---------- */

  const api = {
    getState: () => state,
    saveNote: (payload) =>
      alive()
        ? chrome.runtime.sendMessage({ type: KT.MSG.SAVE_NOTE, payload })
        : Promise.resolve({ ok: false, error: "Extension vừa cập nhật — bấm F5 lại trang này." }),
    onSaved: async (res) => {
      if (!res || !res.ok) return;
      await load();
      ve();
    },
  };

  function moHop(rect) {
    const handle = state.handle;
    if (!handle || !noteBox) return;
    const person = personFor(handle);
    noteBox.open({
      // Không có ví, không có token: đây là ghi chú về NGƯỜI, không gắn với
      // một cú call nào. note-box tự ẩn phần "call ở đoạn nào của sóng".
      caller: { username: handle, displayName: tenHienThi(), avatar: anhDaiDien(), twitterUrl: "https://x.com/" + handle },
      person: person || KT.personFromCaller({ username: handle }),
      renamedFrom: "",
      token: "",
      tokenAddress: "",
      chain: "",
      rect,
    });
  }

  function tenHienThi() {
    const el = document.querySelector('[data-testid="UserName"]');
    const chunk = el ? String(el.textContent || "").split("@")[0].trim() : "";
    return chunk.slice(0, 60);
  }

  function anhDaiDien() {
    const img = document.querySelector('a[href$="/photo"] img, [data-testid^="UserAvatar"] img');
    return img ? KT.safeUrl(img.currentSrc || img.src) : "";
  }

  /* ---------- vòng đời ---------- */

  function ve() {
    const handle = KT.xPage.handleFromPath(location.pathname);
    state.handle = handle;
    if (!handle) {
      document.getElementById(BTN_ID)?.remove();
      document.getElementById(STRIP_ID)?.remove();
      return;
    }
    const person = personFor(handle);
    veNut(person);
    veDai(person);
  }

  /**
   * X là SPA: bấm sang hồ sơ khác thì KHÔNG tải lại trang, và khối tên bị vẽ
   * lại lúc nào không biết. Nên vừa nghe đổi URL, vừa nghe DOM đổi.
   *
   * ⚠ MutationObserver phải tự chặn vòng lặp: chính mình chèn node vào DOM,
   * nên callback sẽ gọi lại mình. Chỉ vẽ lại khi nút THẬT SỰ không còn trên
   * trang, và hãm bằng một nhịp chờ.
   */
  function theoDoiTrang() {
    let timer = null;
    const hen = () => {
      clearTimeout(timer);
      timer = setTimeout(ve, 250);
    };

    let urlCu = location.href;
    const doiUrl = () => {
      if (location.href === urlCu) return;
      urlCu = location.href;
      hen();
    };
    for (const ten of ["pushState", "replaceState"]) {
      const goc = history[ten];
      history[ten] = function () {
        const r = goc.apply(this, arguments);
        doiUrl();
        return r;
      };
    }
    window.addEventListener("popstate", doiUrl);

    new MutationObserver(() => {
      doiUrl();
      if (!state.handle) return;
      if (!document.getElementById(BTN_ID)) hen();
    }).observe(document.body, { childList: true, subtree: true });
  }

  (async function init() {
    await load();
    noteBox = KT.createNoteBox(api);
    noteBox.mount();
    ve();
    theoDoiTrang();

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && changes[KT.STORAGE.DATA]) load().then(ve);
    });

    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (!msg || msg.type !== KT.MSG.DIAGNOSE) return;
      sendResponse({
        trang: "x.com",
        url: location.href.slice(0, 120),
        version: (chrome.runtime.getManifest && chrome.runtime.getManifest().version) || "?",
        handle: state.handle,
        coHoSo: !!personFor(state.handle),
        sheetPeople: state.db ? state.db.counts.people : 0,
        neoNut: lastAnchors.nut,
        neoDai: lastAnchors.dai,
        nutDangCo: !!document.getElementById(BTN_ID),
      });
    });
  })();
})();
