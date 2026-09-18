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
  };

  const state = { cfg: KT.withDefaults(null), data: null, db: null, detailRef: null };

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

  function render() {
    const q = el.q.value.trim();
    const db = state.db;

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

    if (!q) {
      const top = db.people.filter((p) => !p.ghost).slice(0, 8);
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
        return renderFoot("Ghi chú thì làm trên trang GMGN: hover một người rồi bấm N.");
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
      const text = JSON.stringify(Object.assign({}, res, { framesWithScript: frames }), null, 2);
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
  el.q.focus();
})();
