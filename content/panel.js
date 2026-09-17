/**
 * Panel nổi trên trang GMGN: ai đang trên chart này, mình đã biết gì về họ.
 *
 * Panel sống trong shadow DOM riêng — CSS của GMGN (một SPA trading đổi liên
 * tục) không với vào được, và CSS của mình cũng không rơi ra ngoài.
 */
(function (root) {
  "use strict";
  const KT = (root.KT = root.KT || {});

  const MARGIN = 12;

  function createPanel(api) {
    const host = document.createElement("div");
    host.id = "kol-tracker-panel";
    host.style.cssText = "position:fixed;z-index:2147483000;right:16px;bottom:16px;display:none;";
    const shadow = host.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent = KT.PANEL_CSS;
    shadow.appendChild(style);

    const wrap = document.createElement("div");
    wrap.className = "kt-root";
    wrap.innerHTML = `
      <div class="kt-panel">
        <div class="kt-head">
          <span class="kt-dot" data-el="dot"></span>
          <span class="kt-title">KOL Tracker</span>
          <span class="kt-spacer"></span>
          <button class="kt-icon" data-act="refresh" title="Tải lại từ Sheet">⟳</button>
          <button class="kt-icon" data-act="collapse" title="Thu gọn">–</button>
          <button class="kt-icon" data-act="close" title="Đóng (Alt+K để mở lại)">×</button>
        </div>
        <div class="kt-body" data-el="body">
          <input class="kt-input" data-el="input" placeholder="Tên, ví, hoặc chữ trong ghi chú…"
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
    let detailRef = null; // { wallet, username } — đang mở chi tiết của ai
    let activeIndex = -1;

    /* ---------- vị trí ---------- */

    function applyPos(pos) {
      if (!pos || typeof pos.left !== "number") return;
      const w = 340;
      const h = el.panel.offsetHeight || 320;
      host.style.left = Math.min(Math.max(MARGIN, pos.left), window.innerWidth - w - MARGIN) + "px";
      host.style.top =
        Math.min(Math.max(MARGIN, pos.top), window.innerHeight - Math.min(h, 200) - MARGIN) + "px";
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

    let flashTimer = null;
    function flash(msg) {
      el.foot.textContent = msg;
      clearTimeout(flashTimer);
      flashTimer = setTimeout(renderFoot, 2400);
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
      const counts = db ? `${db.counts.people} người · ${db.counts.notes} ghi chú` : "trống";
      el.foot.textContent = `${counts} · ${when}`;
      el.dot.className = "kt-dot ok";
    }

    /** Khối "ai đang trên chart này" — phần đáng giá nhất của panel. */
    function callersHtml() {
      const { callers, token } = api.getState();
      if (!callers.length) return "";

      let known = 0;
      let flagged = 0;
      const rowsHtml = callers
        .map((caller) => {
          const hit = api.identify(caller);
          const person = hit && hit.known ? hit.person : null;
          if (person) known++;
          // Một người có cả cờ đỏ trong Sheet lẫn "đã xả sạch" vẫn chỉ là MỘT
          // người đáng ngờ — cộng hai lần thì con số to hơn cả danh sách.
          if ((person && person.redFlags) || caller.isHoldingRedFlag) flagged++;
          return KT.render.callerRow(caller, person);
        })
        .join("");

      const label = token && token.symbol ? "$" + token.symbol : "token này";
      const bits = [`${callers.length} người đã post về ${label}`];
      if (known) bits.push(`${known} đã có hồ sơ`);
      if (flagged) bits.push(`${flagged} cờ đỏ`);

      return `<div class="kt-sec-title">${KT.esc(bits.join(" · "))}</div>${rowsHtml}`;
    }

    function renderHome() {
      const { db, callers } = api.getState();
      const callersBlock = callersHtml();

      if (!db || !db.people.length) {
        el.content.innerHTML =
          callersBlock ||
          `<div class="kt-empty">
            <b>Chưa nối Sheet.</b><br>Mở Options để dán URL Apps Script.
            <div class="kt-btns" style="justify-content:center">
              <button class="kt-btn kt-primary" data-act="options">Mở Options</button>
            </div>
          </div>`;
        if (callersBlock && (!db || !db.people.length)) {
          el.content.innerHTML += `<div class="kt-hint">Chưa nối Sheet nên chưa biết ai là ai. Options → Kết nối Sheet.</div>`;
        }
        KT.render.hydrateAvatars(el.content);
        return;
      }

      const top = db.people.filter((p) => !p.ghost).slice(0, 6);
      el.content.innerHTML =
        callersBlock +
        `<div class="kt-sec-title">Hạng cao nhất</div>` +
        top.map((p) => KT.render.personRow(p)).join("") +
        `<div class="kt-hint">Alt+K bật/tắt panel · hover một người trên chart rồi bấm N để ghi chú${
          callers.length ? "" : " (chưa thấy ai — mở một chart có người post)"
        }</div>`;
      KT.render.hydrateAvatars(el.content);
    }

    function renderSearch(query) {
      const { db } = api.getState();
      if (!db) return renderHome();

      const hits = KT.search(db, query, 10);
      if (!hits.length) {
        el.content.innerHTML = `<div class="kt-empty">Không có ai khớp <b>${KT.esc(query)}</b>.</div>`;
        return;
      }
      el.content.innerHTML = `<div class="kt-sec-title">Kết quả</div>` + KT.render.resultsHtml(hits);
      KT.render.hydrateAvatars(el.content);
      setActive(0);
    }

    function renderDetail(ref) {
      const hit = api.identify(ref);
      if (!hit) {
        detailRef = null;
        return renderHome();
      }
      detailRef = { wallet: hit.person.wallet, username: hit.person.username };
      el.content.innerHTML = KT.render.personDetail(hit.person, {
        caller: hit.caller,
        renamedFrom: hit.renamedFrom,
        noteLimit: 8,
      });
      KT.render.hydrateAvatars(el.content);
      el.body.scrollTop = 0;
    }

    function rerender() {
      const q = el.input.value.trim();
      if (detailRef && !q) renderDetail(detailRef);
      else if (q) {
        detailRef = null;
        renderSearch(q);
      } else renderHome();
      renderFoot();
    }

    /* ---------- tương tác ---------- */

    async function copy(textValue) {
      try {
        await navigator.clipboard.writeText(textValue);
      } catch (e) {
        const ta = document.createElement("textarea");
        ta.value = textValue;
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
      flash("Đã copy: " + textValue);
    }

    async function doRefresh() {
      el.dot.className = "kt-dot load";
      const res = await api.refresh();
      if (res && res.error) flash(res.error);
      else flash("Đã tải lại từ Sheet");
    }

    wrap.addEventListener("click", (ev) => {
      const actEl = ev.target.closest("[data-act]");
      if (actEl) {
        const act = actEl.dataset.act;
        if (act === "close") return hide();
        if (act === "collapse") return setCollapsed(!collapsed);
        if (act === "refresh") return doRefresh();
        if (act === "options") return api.openOptions();
        if (act === "copy") return copy(actEl.dataset.value || "");
        if (act === "open-x") {
          const url = KT.safeUrl(actEl.dataset.value);
          if (url) window.open(url, "_blank", "noopener");
          return;
        }
        if (act === "back") {
          detailRef = null;
          el.input.value = "";
          return rerender();
        }
        if (act === "note") {
          const hit = api.identify(detailRef);
          if (hit) api.openNote(hit, host.getBoundingClientRect());
          return;
        }
      }

      const callerRow = ev.target.closest("[data-caller]");
      if (callerRow) {
        const key = callerRow.dataset.caller;
        const caller = api
          .getState()
          .callers.find((c) => (c.postId || c.wallet) === key);
        if (caller) renderDetail(caller);
        return;
      }

      const row = ev.target.closest(".kt-row[data-key]");
      if (row) {
        const key = row.dataset.key;
        renderDetail(key.startsWith("0x") ? { wallet: key } : { username: key });
      }
    });

    el.input.addEventListener("input", () => {
      detailRef = null;
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
        if (target) {
          ev.preventDefault();
          target.click();
        }
      } else if (ev.key === "Escape") {
        ev.preventDefault();
        if (detailRef || el.input.value) {
          detailRef = null;
          el.input.value = "";
          rerender();
        } else hide();
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
        detailRef = null;
      }
      rerender();
      el.input.focus();
      el.input.select();
    }

    function hide() {
      open = false;
      host.style.display = "none";
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
      isOpen: () => open,
      update: rerender,
      flash,
    };
  }

  KT.createPanel = createPanel;
})(typeof globalThis !== "undefined" ? globalThis : self);
