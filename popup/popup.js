/**
 * Popup — bản rút gọn của panel, cho lúc KHÔNG ở trên trang GMGN
 * (đang đọc Twitter, đang xem Telegram…) mà vẫn cần tra nhanh một cái tên.
 * Dùng chung KT.render với panel nên hai chỗ không bao giờ hiện khác nhau.
 */
(async function () {
  "use strict";
  const KT = globalThis.KT;

  document.getElementById("kt-shared").textContent = KT.PANEL_CSS;

  const el = {
    dot: document.getElementById("dot"),
    q: document.getElementById("q"),
    content: document.getElementById("content"),
    foot: document.getElementById("foot"),
    refresh: document.getElementById("refresh"),
    opts: document.getElementById("opts-btn"),
    panelBtn: document.getElementById("panel-btn"),
    diagBtn: document.getElementById("diag-btn"),
    tabs: document.getElementById("tabs"),
  };

  // Tab nhớ theo máy (localStorage của trang popup) — mở lại popup là về đúng
  // chỗ đang làm dở.
  let tabNho = "nguoi";
  try {
    tabNho = localStorage.getItem("kt-tab") === "duan" ? "duan" : "nguoi";
  } catch (e) {
    /* không có storage thì mặc định tab Người */
  }
  const state = { cfg: KT.withDefaults(null), data: null, db: null, detailRef: null, tab: tabNho, caMoi: {} };

  async function load() {
    const [cfg, data] = await Promise.all([KT.getConfig(), KT.getData()]);
    state.cfg = cfg;
    state.data = data;
    state.db = KT.buildDb(data.overview, data.detail);
  }

  function renderFoot(msg) {
    if (msg) {
      el.foot.textContent = msg;
      return;
    }
    if (state.data && state.data.error) {
      el.foot.innerHTML = `<span class="kt-err">${KT.esc(state.data.error)}</span>`;
      el.dot.className = "kt-dot err";
      return;
    }
    const db = state.db;
    const when = state.data && state.data.syncedAt ? KT.timeAgo(state.data.syncedAt) : "chưa tải";
    el.foot.textContent = db ? `${db.counts.people} người · ${when}` : "chưa có dữ liệu";
    el.dot.className = "kt-dot ok";
  }

  /**
   * Tab Dự án: mọi hồ sơ là dự án. Xếp: vừa TỰ ĐĂNG CA (30 ngày) lên đầu —
   * đó là lúc cần hành động; rồi tới dự án lâu chưa kiểm lại; rồi theo điểm.
   */
  function duAnRow(p) {
    const P = KT.project;
    const pj = p.project;
    const ca = state.caMoi[(p.username || "").toLowerCase()];
    const bits = [pj.category, P.scoreLabel(pj)];
    bits.push(pj.checkedTs ? "kiểm " + KT.timeAgo(pj.checkedTs) : "chưa rõ ngày kiểm");
    return `<div class="kt-row" data-key="${KT.esc(p.wallet || p.usernameKey)}" role="option" tabindex="-1">
      <span class="kt-grow kt-trunc">
        <span class="kt-name kt-proj">◆ ${KT.esc(p.username || p.displayName || "?")}</span>
        <span class="kt-sub" style="display:block">${KT.esc(bits.filter(Boolean).join(" · "))}${
          P.isStale(pj) ? ' · <span style="color:#E3B341">cần kiểm lại</span>' : ""
        }</span>
        ${
          ca
            ? `<span class="kt-sub" style="display:block;color:#58A6FF">Đã tự đăng CA${
                ca.tokenSymbol ? " $" + KT.esc(ca.tokenSymbol) : ""
              } · ${KT.esc(KT.timeAgo(ca.calledAt))}</span>`
            : ""
        }
      </span>
    </div>`;
  }

  function renderDuAn(q) {
    const db = state.db;
    let list = db.people.filter((p) => p.project);
    if (q) {
      const k = KT.looseHandleKey(q);
      list = list.filter((p) => KT.looseHandleKey(p.username).includes(k) || (p.project.category || "").toLowerCase().includes(q.toLowerCase()));
    }
    const now = Date.now();
    const caOf = (p) => state.caMoi[(p.username || "").toLowerCase()];
    list.sort((a, b) => {
      const ca = caOf(a) ? caOf(a).calledAt : 0;
      const cb = caOf(b) ? caOf(b).calledAt : 0;
      if (ca !== cb) return cb - ca;
      const sa = KT.project.isStale(a.project, now) ? 1 : 0;
      const sb = KT.project.isStale(b.project, now) ? 1 : 0;
      if (sa !== sb) return sb - sa;
      return b.project.yes - a.project.yes;
    });
    el.content.innerHTML = list.length
      ? `<div class="kt-sec-title">Dự án đang theo dõi (${list.length})</div>` + list.map(duAnRow).join("")
      : `<div class="kt-empty">Chưa theo dõi dự án nào.<br>Trên X, bấm <b>Ghi chú</b> ở trang hồ sơ của dự án → chọn <b>Dự án</b> → chấm 5 câu.</div>`;
    renderFoot();
  }

  /** Hỏi sổ: dự án nào vừa tự tweet CA (30 ngày qua). */
  async function loadCaMoi() {
    const handles = state.db ? state.db.people.filter((p) => p.project && p.username).map((p) => p.username) : [];
    if (!handles.length) return;
    try {
      state.caMoi = (await chrome.runtime.sendMessage({ type: KT.MSG.LEDGER_LATEST, handles })) || {};
    } catch (e) {
      state.caMoi = {};
    }
  }

  function syncTabs() {
    el.tabs.querySelectorAll("[data-tab]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.tab === state.tab)));
    el.q.placeholder = state.tab === "duan" ? "Lọc dự án theo tên hoặc loại…" : "Handle, tên, hoặc token…";
  }

  function render() {
    const q = el.q.value.trim();
    const db = state.db;
    syncTabs();

    if (state.detailRef && db) {
      const person = KT.findPerson(db, state.detailRef);
      if (person) {
        el.content.innerHTML = KT.render.personDetail(person, { noteLimit: 6 });
        KT.render.hydrateAvatars(el.content);
        renderFoot();
        return;
      }
      state.detailRef = null;
    }

    if (!db || !db.people.length) {
      el.content.innerHTML = `<div class="kt-empty">
        <b>Chưa có dữ liệu.</b><br>Mở Options để nối Sheet qua Apps Script.
        <div class="kt-btns" style="justify-content:center">
          <button class="kt-btn kt-primary" data-act="options">Mở Options</button>
        </div></div>`;
      renderFoot();
      return;
    }

    if (state.tab === "duan") return renderDuAn(q);

    if (!q) {
      // Tab Người: dự án không lẫn vào danh sách người call.
      const top = db.people.filter((p) => !p.ghost && !p.project).slice(0, 8);
      el.content.innerHTML =
        `<div class="kt-sec-title">Hạng cao nhất</div>` + top.map((p) => KT.render.personRow(p)).join("");
      KT.render.hydrateAvatars(el.content);
      renderFoot();
      return;
    }

    const hits = KT.search(db, q, 10);
    el.content.innerHTML = hits.length
      ? `<div class="kt-sec-title">Kết quả</div>` + KT.render.resultsHtml(hits)
      : `<div class="kt-empty">Không có ai khớp <b>${KT.esc(q)}</b>.</div>`;
    KT.render.hydrateAvatars(el.content);
    renderFoot();
  }

  el.tabs.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-tab]");
    if (!b) return;
    state.tab = b.dataset.tab;
    state.detailRef = null;
    try {
      localStorage.setItem("kt-tab", state.tab);
    } catch (e) {
      /* không nhớ được thì thôi */
    }
    render();
  });

  el.q.addEventListener("input", () => {
    state.detailRef = null;
    render();
  });

  el.content.addEventListener("click", async (ev) => {
    const actEl = ev.target.closest("[data-act]");
    if (actEl) {
      const act = actEl.dataset.act;
      if (act === "back") {
        state.detailRef = null;
        return render();
      }
      if (act === "open-x") {
        const url = KT.safeUrl(actEl.dataset.value);
        if (url) chrome.tabs.create({ url });
        return;
      }
      if (act === "note") {
        return renderFoot("Ghi chú: trên GMGN hover một người rồi bấm N; trên X bấm nút Ghi chú ở trang hồ sơ.");
      }
      if (act === "copy") {
        await navigator.clipboard.writeText(actEl.dataset.value || "");
        return renderFoot("Đã copy.");
      }
      if (act === "open-sheet") {
        const url = KT.safeUrl(state.cfg.sheetUrl);
        if (url) chrome.tabs.create({ url });
        return;
      }
      if (act === "options") return chrome.runtime.openOptionsPage();
    }
    const row = ev.target.closest(".kt-row[data-key]");
    if (row) {
      const key = row.dataset.key;
      state.detailRef = key.startsWith("0x") ? { wallet: key } : { username: key };
      render();
    }
  });

  el.refresh.addEventListener("click", async () => {
    el.dot.className = "kt-dot load";
    renderFoot("Đang tải…");
    const res = await chrome.runtime.sendMessage({ type: KT.MSG.REFRESH });
    await load();
    render();
    if (res && res.error) renderFoot(res.error);
  });

  el.opts.addEventListener("click", () => chrome.runtime.openOptionsPage());

  el.panelBtn.addEventListener("click", async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) return;
    try {
      await chrome.tabs.sendMessage(tab.id, { type: KT.MSG.TOGGLE_PANEL, query: el.q.value.trim() });
    } catch (e) {
      // Tab chưa có content script (không phải GMGN) — chèn tay bằng activeTab
      try {
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: KT.CONTENT_FILES });
        await chrome.tabs.sendMessage(tab.id, { type: KT.MSG.TOGGLE_PANEL, query: el.q.value.trim() });
      } catch (e2) {
        return renderFoot("Không chèn được panel vào tab này.");
      }
    }
    window.close();
  });

  el.diagBtn.addEventListener("click", async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) return;
    try {
      const res = await chrome.tabs.sendMessage(tab.id, { type: KT.MSG.DIAGNOSE }, { frameId: 0 });
      // Chart của GMGN nằm trong iframe riêng. Không liệt kê được frame nào có
      // content script thì "iframe không vào được" trông y hệt "vào được nhưng
      // không khớp avatar nào".
      let frames = [];
      try {
        const r = await chrome.runtime.sendMessage({ type: KT.MSG.FRAMES, tabId: tab.id });
        frames = (r && r.frames) || [];
      } catch (e) {
        /* SW vừa ngủ dậy, chưa có sổ */
      }
      // Sổ tự ghi nằm ở service worker, không ở trang — hỏi riêng.
      let soTuGhi = null;
      try {
        soTuGhi = await chrome.runtime.sendMessage({ type: KT.MSG.LEDGER_STATS });
      } catch (e) {
        /* sổ là dữ liệu phụ */
      }
      const text = JSON.stringify(Object.assign({}, res, { framesWithScript: frames, soTuGhi }), null, 2);
      await navigator.clipboard.writeText(text);
      el.content.innerHTML = `<div class="kt-sec-title">Chẩn đoán (đã copy vào clipboard)</div>
        <div class="kt-hint" style="white-space:pre-wrap;font-family:ui-monospace,monospace">${KT.esc(text)}</div>`;
      state.detailRef = null;
    } catch (e) {
      // Ba nguyên nhân khác hẳn nhau, trước đây gộp chung một câu nên người
      // dùng không biết phải làm gì. Cái hay gặp nhất là cái đầu: bấm ⟳ ở
      // chrome://extensions thì bản cũ trong tab đang mở bị cắt khỏi extension
      // và không trả lời ai nữa — tab phải F5 mới nạp bản mới.
      const why = String((e && e.message) || e);
      if (/context invalidated|Receiving end does not exist|Could not establish/i.test(why)) {
        renderFoot("Extension vừa cập nhật — bấm F5 lại trang GMGN rồi thử lại.");
      } else if (!/^https:\/\/(www\.)?gmgn\.(ai|cc)\//i.test(tab.url || "")) {
        renderFoot("Tab này không phải trang GMGN.");
      } else {
        renderFoot("Không hỏi được trang: " + why.slice(0, 80));
      }
    }
  });

  await load();
  render();
  // Tra "dự án nào vừa đăng CA" chạy SAU lần vẽ đầu — popup phải mở ngay.
  loadCaMoi().then(() => {
    if (state.tab === "duan" && !state.detailRef) render();
  });
  el.q.focus();
})();
