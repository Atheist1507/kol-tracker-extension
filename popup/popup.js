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

  const state = { cfg: KT.withDefaults(null), data: null, db: null, detailKey: null };

  async function load() {
    const [cfg, data] = await Promise.all([KT.getConfig(), KT.getData()]);
    state.cfg = cfg;
    state.data = data;
    state.db = KT.buildDb(data.kols, data.calls, cfg);
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
    el.foot.textContent = db ? `${db.counts.kols} KOL · ${when}` : "chưa có dữ liệu";
    el.dot.className = "kt-dot ok";
  }

  function render() {
    const q = el.q.value.trim();
    const db = state.db;

    if (state.detailKey && db && db.byKey[state.detailKey]) {
      el.content.innerHTML = KT.render.detailHtml(db.byKey[state.detailKey], {
        sheetUrl: state.cfg.sheetUrl,
        callLimit: 8,
      });
      KT.render.hydrateAvatars(el.content);
      renderFoot();
      return;
    }

    if (!db || !db.kols.length) {
      el.content.innerHTML = `<div class="kt-empty">
        <b>Chưa có dữ liệu.</b><br>Dán link CSV của Google Sheet trong Options.
        <div class="kt-btns" style="justify-content:center">
          <button class="kt-btn kt-primary" data-act="options">Mở Options</button>
        </div></div>`;
      renderFoot();
      return;
    }

    if (!q) {
      const top = db.kols.filter((k) => !k.ghost).slice(0, 8);
      el.content.innerHTML =
        `<div class="kt-sec-title">Hạng cao nhất</div>` + top.map((k) => KT.render.rowHtml(k)).join("");
      KT.render.hydrateAvatars(el.content);
      renderFoot();
      return;
    }

    const hits = KT.search(db, q, 10);
    const tokenHits = KT.callsForToken(db, q);
    const listed = tokenHits.length ? hits.filter((h) => h.reason !== "đã call token này") : hits;

    let html = "";
    if (listed.length) html += `<div class="kt-sec-title">Kết quả</div>` + KT.render.resultsHtml(listed);
    if (tokenHits.length) html += KT.render.tokenHtml(KT.tokenKey(q), tokenHits);
    if (!html) {
      html = `<div class="kt-empty"><b>${KT.esc(KT.displayHandle(q))}</b> chưa có trong database.
        <div class="kt-btns" style="justify-content:center">
          <button class="kt-btn" data-act="copy" data-value="${KT.esc(KT.displayHandle(q))}">Copy handle</button>
          ${state.cfg.sheetUrl ? `<button class="kt-btn kt-primary" data-act="open-sheet">Thêm vào Sheet</button>` : ""}
        </div></div>`;
    }
    el.content.innerHTML = html;
    KT.render.hydrateAvatars(el.content);
    renderFoot();
  }

  el.q.addEventListener("input", () => {
    state.detailKey = null;
    render();
  });

  el.content.addEventListener("click", async (ev) => {
    const actEl = ev.target.closest("[data-act]");
    if (actEl) {
      const act = actEl.dataset.act;
      if (act === "back") {
        state.detailKey = null;
        return render();
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
    const row = ev.target.closest(".kt-row");
    if (row && row.dataset.key) {
      state.detailKey = row.dataset.key;
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
      const res = await chrome.tabs.sendMessage(tab.id, { type: KT.MSG.DIAGNOSE });
      const text = JSON.stringify(res, null, 2);
      await navigator.clipboard.writeText(text);
      el.content.innerHTML = `<div class="kt-sec-title">Chẩn đoán (đã copy vào clipboard)</div>
        <div class="kt-hint" style="white-space:pre-wrap;font-family:ui-monospace,monospace">${KT.esc(text)}</div>`;
      state.detailKey = null;
    } catch (e) {
      renderFoot("Tab này chưa chạy content script.");
    }
  });

  await load();
  render();
  el.q.focus();
})();
