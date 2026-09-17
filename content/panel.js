/**
 * Mức 1 của spec: panel nổi trên trang GMGN — gõ/paste handle là ra tier +
 * note, không phải rời trang.
 *
 * Panel sống trong shadow DOM riêng: CSS của GMGN (một SPA trading đổi liên
 * tục) không với vào được, và CSS của mình cũng không rơi ra ngoài làm hỏng
 * trang của người ta.
 */
(function (root) {
  "use strict";
  const KT = (root.KT = root.KT || {});

  const MARGIN = 12;

  function createPanel(api) {
    const host = document.createElement("div");
    host.id = "kol-tracker-panel";
    host.style.cssText =
      "position:fixed;z-index:2147483000;right:16px;bottom:16px;display:none;";
    const shadow = host.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent = KT.PANEL_CSS;
    shadow.appendChild(style);

    const wrap = document.createElement("div");
    wrap.className = "kt-root";
    wrap.innerHTML = `
      <div class="kt-panel" part="panel">
        <div class="kt-head">
          <span class="kt-dot" data-el="dot"></span>
          <span class="kt-title">KOL Tracker</span>
          <span class="kt-spacer"></span>
          <button class="kt-icon" data-act="refresh" title="Tải lại từ Sheet">⟳</button>
          <button class="kt-icon" data-act="collapse" title="Thu gọn">–</button>
          <button class="kt-icon" data-act="close" title="Đóng (Alt+K để mở lại)">×</button>
        </div>
        <div class="kt-body" data-el="body">
          <input class="kt-input" data-el="input" placeholder="Handle, tên, hoặc token…"
                 spellcheck="false" autocomplete="off" autocapitalize="none" autocorrect="off">
          <div data-el="content"></div>
        </div>
        <div class="kt-foot"><span data-el="foot"></span></div>
      </div>`;
    shadow.appendChild(wrap);

    const el = {
      panel: wrap.querySelector(".kt-panel"),
      head: wrap.querySelector(".kt-head"),
      dot: wrap.querySelector('[data-el="dot"]'),
      body: wrap.querySelector('[data-el="body"]'),
      input: wrap.querySelector('[data-el="input"]'),
      content: wrap.querySelector('[data-el="content"]'),
      foot: wrap.querySelector('[data-el="foot"]'),
    };

    let open = false;
    let collapsed = false;
    let detailKey = null; // đang mở chi tiết của ai
    let activeIndex = -1; // dòng đang chọn bằng bàn phím

    /* ---------- vị trí ---------- */

    function applyPos(pos) {
      if (!pos || typeof pos.left !== "number") return;
      const w = 340;
      const h = el.panel.offsetHeight || 320;
      const left = Math.min(Math.max(MARGIN, pos.left), window.innerWidth - w - MARGIN);
      const top = Math.min(Math.max(MARGIN, pos.top), window.innerHeight - Math.min(h, 200) - MARGIN);
      host.style.left = left + "px";
      host.style.top = top + "px";
      host.style.right = "auto";
      host.style.bottom = "auto";
    }

    function startDrag(ev) {
      if (ev.target.closest(".kt-icon")) return;
      const rect = host.getBoundingClientRect();
      const dx = ev.clientX - rect.left;
      const dy = ev.clientY - rect.top;
      el.head.classList.add("kt-dragging");

      function move(e) {
        applyPos({ left: e.clientX - dx, top: e.clientY - dy });
      }
      function up() {
        el.head.classList.remove("kt-dragging");
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        const r = host.getBoundingClientRect();
        api.savePos({ left: r.left, top: r.top, collapsed });
      }
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      ev.preventDefault();
    }

    /* ---------- vẽ ---------- */

    function rows() {
      return Array.from(el.content.querySelectorAll(".kt-row"));
    }

    function setActive(i) {
      const list = rows();
      if (!list.length) {
        activeIndex = -1;
        return;
      }
      activeIndex = (i + list.length) % list.length;
      list.forEach((r, idx) => r.classList.toggle("kt-active", idx === activeIndex));
      list[activeIndex].scrollIntoView({ block: "nearest" });
    }

    function renderFoot() {
      const { data, db } = api.getState();
      if (!data) return;
      if (data.error) {
        el.foot.innerHTML = `<span class="kt-err">${KT.esc(data.error)}</span>`;
        el.dot.className = "kt-dot err";
        return;
      }
      const when = data.syncedAt ? KT.timeAgo(data.syncedAt) : "chưa tải";
      const counts = db ? `${db.counts.kols} KOL · ${db.counts.calls} call` : "trống";
      el.foot.textContent = `${counts} · cập nhật ${when}`;
      el.dot.className = "kt-dot ok";
    }

    /**
     * Dòng dán thẳng vào tab KOLs của Sheet. Ngăn bằng TAB chứ không phải dấu
     * phẩy: dán chuỗi có tab vào Google Sheets là nó tự rải ra từng cột, dán
     * chuỗi có dấu phẩy thì nằm gọn trong một ô.
     * Thứ tự cột: handle · aliases · avatar_url · tier · description ·
     * source_found · red_flags · added_by · updated_at
     */
    function sheetRow(handle, avatar) {
      const today = new Date().toISOString().slice(0, 10);
      return [handle, "", avatar || "", "", "", "GMGN chart", "", "", today].join("\t");
    }

    function seenHtml() {
      const seen = api.getSeen ? api.getSeen() : [];
      if (!seen.length) return "";
      const rows = seen
        .map(
          (u) => `<div class="kt-row" data-act="copy-row"
              data-handle="${KT.esc(u.handle)}" data-avatar="${KT.esc(u.avatar || "")}">
            <span class="kt-av">${KT.esc(KT.initials(u.handle))}</span>
            <span class="kt-grow kt-trunc">
              <span class="kt-name">@${KT.esc(u.handle)}</span>
              <span class="kt-sub kt-trunc" style="display:block">bấm để copy dòng dán vào Sheet${
                u.avatar ? " (kèm avatar)" : ""
              }</span>
            </span>
          </div>`
        )
        .join("");
      return `<div class="kt-sec-title">Vừa thấy trên chart · chưa có trong DB</div>${rows}`;
    }

    function renderEmptyQuery() {
      const { db, cfg } = api.getState();
      if (!db || !db.kols.length) {
        el.content.innerHTML = `<div class="kt-empty">
          <b>Chưa có dữ liệu.</b><br>Dán link CSV của Google Sheet trong Options rồi bấm ⟳.
          <div class="kt-btns" style="justify-content:center"><button class="kt-btn kt-primary" data-act="options">Mở Options</button></div>
        </div>`;
        return;
      }
      const top = db.kols.filter((k) => !k.ghost).slice(0, 6);
      el.content.innerHTML =
        seenHtml() +
        `<div class="kt-sec-title">Hạng cao nhất</div>` +
        top.map((k) => KT.render.rowHtml(k)).join("") +
        `<div class="kt-hint">Alt+K để bật/tắt panel. Bôi đen một cái tên trên trang rồi Alt+K là tra luôn cái đó.</div>` +
        (cfg && cfg.sheetUrl
          ? `<div class="kt-btns"><button class="kt-btn" data-act="open-sheet">Mở Sheet để thêm người</button></div>`
          : "");
      KT.render.hydrateAvatars(el.content);
    }

    function renderSearch(query) {
      const { db, cfg } = api.getState();
      if (!db) return renderEmptyQuery();

      const hits = KT.search(db, query, 8);
      const tokenHits = KT.callsForToken(db, query);
      const exact = KT.lookup(db, query);

      // Gõ đúng khớp một người → vào thẳng chi tiết, khỏi bấm thêm một nhịp
      if (exact && hits.length && hits[0].kol === exact && hits[0].score >= 120) {
        return renderDetail(exact.key, { keepQuery: true });
      }

      // Có mục "$TOKEN — ai đã call" rồi thì đừng kể lại cùng những người đó
      // ở mục Kết quả: cùng một thông tin, hai lần, trong một panel 340px.
      const listed = tokenHits.length
        ? hits.filter((h) => h.reason !== "đã call token này")
        : hits;

      let html = "";
      if (listed.length) html += `<div class="kt-sec-title">Kết quả</div>` + KT.render.resultsHtml(listed);
      if (tokenHits.length) html += KT.render.tokenHtml(KT.tokenKey(query), tokenHits);

      if (!html) {
        const handle = KT.displayHandle(query);
        html = `<div class="kt-empty">
            <b>${KT.esc(handle)}</b> chưa có trong database.
            <div class="kt-btns" style="justify-content:center">
              <button class="kt-btn" data-act="copy" data-value="${KT.esc(handle)}">Copy handle</button>
              ${cfg && cfg.sheetUrl ? `<button class="kt-btn kt-primary" data-act="open-sheet">Thêm vào Sheet</button>` : ""}
            </div>
          </div>`;
      }
      el.content.innerHTML = html;
      KT.render.hydrateAvatars(el.content);
      setActive(0);
    }

    function renderDetail(key, opts) {
      const { db, cfg } = api.getState();
      const kol = db && db.byKey[key];
      if (!kol) return renderEmptyQuery();
      detailKey = key;
      el.content.innerHTML = KT.render.detailHtml(kol, {
        sheetUrl: cfg && cfg.sheetUrl,
        callLimit: 10,
      });
      KT.render.hydrateAvatars(el.content);
      if (!opts || !opts.keepQuery) el.input.value = kol.handle;
      el.body.scrollTop = 0;
    }

    function rerender() {
      const q = el.input.value.trim();
      if (detailKey && !q) detailKey = null;
      if (detailKey) renderDetail(detailKey, { keepQuery: true });
      else if (q) renderSearch(q);
      else renderEmptyQuery();
      renderFoot();
    }

    /* ---------- tương tác ---------- */

    async function copy(text) {
      try {
        await navigator.clipboard.writeText(text);
      } catch (e) {
        // clipboard API cần document focus — panel trong shadow DOM không phải lúc nào cũng có
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.cssText = "position:fixed;opacity:0";
        document.body.appendChild(ta);
        ta.select();
        try {
          document.execCommand("copy");
        } catch (e2) {
          /* chịu */
        }
        ta.remove();
      }
      flashFoot("Đã copy: " + text);
    }

    let flashTimer = null;
    function flashFoot(msg) {
      el.foot.textContent = msg;
      clearTimeout(flashTimer);
      flashTimer = setTimeout(renderFoot, 2200);
    }

    async function doRefresh() {
      el.dot.className = "kt-dot load";
      const res = await api.refresh();
      if (res && res.error) flashFoot(res.error);
      else flashFoot("Đã tải lại từ Sheet");
    }

    wrap.addEventListener("click", (ev) => {
      const actEl = ev.target.closest("[data-act]");
      if (actEl) {
        const act = actEl.dataset.act;
        if (act === "close") return hide();
        if (act === "collapse") return setCollapsed(!collapsed);
        if (act === "refresh") return doRefresh();
        if (act === "back") {
          detailKey = null;
          el.input.value = "";
          el.input.focus();
          return rerender();
        }
        if (act === "copy") return copy(actEl.dataset.value || "");
        if (act === "copy-row") {
          copy(sheetRow(actEl.dataset.handle, actEl.dataset.avatar));
          return flashFoot("Đã copy — dán vào ô cột A của tab KOLs");
        }
        if (act === "open-sheet") {
          const { cfg } = api.getState();
          const url = KT.safeUrl(cfg && cfg.sheetUrl);
          if (url) window.open(url, "_blank", "noopener");
          return;
        }
        if (act === "options") return api.openOptions();
      }
      const row = ev.target.closest(".kt-row");
      if (row && row.dataset.key) renderDetail(row.dataset.key);
    });

    el.input.addEventListener("input", () => {
      detailKey = null;
      rerender();
    });

    el.input.addEventListener("keydown", (ev) => {
      if (ev.key === "ArrowDown") {
        ev.preventDefault();
        setActive(activeIndex + 1);
      } else if (ev.key === "ArrowUp") {
        ev.preventDefault();
        setActive(activeIndex - 1);
      } else if (ev.key === "Enter") {
        const list = rows();
        const target = list[activeIndex] || list[0];
        if (target && target.dataset.key) {
          ev.preventDefault();
          renderDetail(target.dataset.key);
        }
      } else if (ev.key === "Escape") {
        ev.preventDefault();
        if (detailKey) {
          detailKey = null;
          el.input.value = "";
          rerender();
        } else {
          hide();
        }
      }
      ev.stopPropagation(); // đừng để phím tắt của GMGN cướp mất
    });

    el.head.addEventListener("pointerdown", startDrag);
    window.addEventListener("resize", () => {
      const r = host.getBoundingClientRect();
      if (host.style.left) applyPos({ left: r.left, top: r.top });
    });

    /* ---------- vòng đời ---------- */

    function setCollapsed(next) {
      collapsed = next;
      el.panel.classList.toggle("kt-collapsed", collapsed);
      const btn = wrap.querySelector('[data-act="collapse"]');
      if (btn) btn.textContent = collapsed ? "+" : "–";
      const r = host.getBoundingClientRect();
      api.savePos({ left: host.style.left ? r.left : null, top: host.style.left ? r.top : null, collapsed });
    }

    function show(query) {
      open = true;
      host.style.display = "block";
      if (query != null) {
        el.input.value = query;
        detailKey = null;
      }
      rerender();
      el.input.focus();
      el.input.select();
    }

    function hide() {
      open = false;
      host.style.display = "none";
    }

    function toggle(query) {
      if (open && !query) hide();
      else show(query);
    }

    return {
      host,
      mount(pos) {
        document.documentElement.appendChild(host);
        if (pos) {
          applyPos(pos);
          if (pos.collapsed) setCollapsed(true);
        }
      },
      show,
      hide,
      toggle,
      isOpen: () => open,
      update: rerender,
      setLoading(on) {
        el.dot.className = on ? "kt-dot load" : "kt-dot ok";
      },
    };
  }

  KT.createPanel = createPanel;
})(typeof globalThis !== "undefined" ? globalThis : self);
