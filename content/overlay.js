/**
 * Mức 2 của spec: gắn thông tin thẳng lên chart, không phải gõ gì.
 *
 * Spec để ngỏ "canvas hay DOM?" nên ở đây làm CẢ HAI đường, cùng một lớp
 * overlay, và cái nào bắt được thì cái đó chạy:
 *
 *  (a) Avatar là <img> thật → so khớp URL ảnh với cột avatar_url, vẽ VIỀN
 *      MÀU theo tier quanh nó.
 *  (b) Chart vẽ bằng canvas (giống TradingView, khả năng cao) → không có
 *      element nào để bám. Đường vòng: rình cái tooltip mà GMGN tự hiện khi
 *      hover vào avatar, đọc handle trong đó, rồi dán thẻ tóm tắt cạnh bên.
 *
 * ⚠ TUYỆT ĐỐI không sửa DOM của trang chủ nhà. GMGN là SPA — chèn node vào
 * giữa cây của nó là React ghi đè lại (nhẹ) hoặc vỡ render (nặng), mà mình
 * thì không debug được app của người khác. Mọi thứ mình vẽ đều nằm trong
 * shadow root riêng, `position: fixed`, `pointer-events: none`.
 */
(function (root) {
  "use strict";
  const KT = (root.KT = root.KT || {});

  const MAX_RINGS = 60; // chart dày đặc thì vẽ hết là giật, cắt ở đây
  const MIN_AVATAR_PX = 12;
  const SCAN_DEBOUNCE_MS = 250;
  const HANDLE_RE = /@([A-Za-z0-9_]{2,20})/g;

  function createOverlay(api) {
    const host = document.createElement("div");
    host.id = "kol-tracker-overlay";
    host.style.cssText = "position:fixed;top:0;left:0;width:0;height:0;z-index:2147482999;";
    const shadow = host.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent = KT.PANEL_CSS + KT.OVERLAY_CSS;
    shadow.appendChild(style);

    const layer = document.createElement("div");
    layer.className = "kt-layer";
    shadow.appendChild(layer);

    const card = document.createElement("div");
    card.className = "kt-card";
    card.style.display = "none";
    layer.appendChild(card);

    /** img đang được theo dõi → { kol, ring } */
    const tracked = new Map();
    let scanTimer = null;
    let rafId = null;
    let running = false;
    let observer = null;

    /* ---------- (a) avatar là <img> thật ---------- */

    function ringFor(kol) {
      const ring = document.createElement("div");
      ring.className = "kt-ring" + (kol.redFlags ? " kt-flag" : "");
      ring.style.setProperty("--c", KT.tierColor(kol.tier));
      ring.dataset.tier = kol.tierLetter || "?";
      layer.appendChild(ring);
      return ring;
    }

    function untrack(img) {
      const entry = tracked.get(img);
      if (entry) {
        entry.ring.remove();
        tracked.delete(img);
      }
    }

    function scanImages(scope) {
      const { db, cfg } = api.getState();
      if (!db || !cfg || !cfg.overlayRings) return;

      const imgs = (scope || document).querySelectorAll("img[src]");
      for (const img of imgs) {
        if (tracked.has(img) || tracked.size >= MAX_RINGS) continue;
        const kol = KT.lookupByAvatar(db, img.currentSrc || img.src);
        if (!kol) continue;
        tracked.set(img, { kol, ring: ringFor(kol) });
      }
    }

    function syncRings() {
      rafId = null;
      if (!running) return;

      for (const [img, entry] of tracked) {
        if (!img.isConnected) {
          untrack(img);
          continue;
        }
        const r = img.getBoundingClientRect();
        const tooSmall = r.width < MIN_AVATAR_PX || r.height < MIN_AVATAR_PX;
        const offscreen =
          r.bottom < 0 || r.right < 0 || r.top > window.innerHeight || r.left > window.innerWidth;
        if (tooSmall || offscreen) {
          entry.ring.style.display = "none";
          continue;
        }
        entry.ring.style.display = "block";
        entry.ring.style.left = r.left - 2 + "px";
        entry.ring.style.top = r.top - 2 + "px";
        entry.ring.style.width = r.width + 4 + "px";
        entry.ring.style.height = r.height + 4 + "px";
      }
      if (tracked.size) schedule();
    }

    function schedule() {
      if (rafId == null && running) rafId = requestAnimationFrame(syncRings);
    }

    /* ---------- (b) đường vòng cho chart canvas: đọc tooltip ---------- */

    /** Tìm handle quen mặt trong chữ của một node vừa xuất hiện. */
    function matchHandleIn(node) {
      const { db } = api.getState();
      if (!db) return null;
      const text = (node.textContent || "").slice(0, 400);
      if (!text) return null;

      HANDLE_RE.lastIndex = 0;
      let m;
      while ((m = HANDLE_RE.exec(text))) {
        const kol = KT.lookup(db, m[1]);
        if (kol) return kol;
      }
      // Không có dấu @ thì thử vài từ đầu — tooltip GMGN hay in tên trần
      const words = text.split(/[\s|·,]+/).slice(0, 6);
      for (const w of words) {
        if (w.length < 3) continue;
        const kol = KT.lookup(db, w);
        if (kol) return kol;
      }
      return null;
    }

    function cardHtml(kol) {
      const s = kol.stats || {};
      const bits = [];
      if (s.total) bits.push(`${s.total} call`);
      if (s.winRate != null) bits.push(`win ${Math.round(s.winRate * 100)}%`);
      if (s.bestMultiple != null) bits.push(`cao nhất ${KT.fmtMultiple(s.bestMultiple)}`);
      if (s.position && s.position.late) bits.push(`${s.position.late} lần đu đỉnh`);
      return `<div class="kt-root">
        <div class="kt-card-head">
          <span class="kt-av" style="border-color:${KT.tierColor(kol.tier)}">${
            KT.safeUrl(kol.avatar)
              ? `<img src="${KT.esc(KT.safeUrl(kol.avatar))}" alt="" data-ini="${KT.esc(KT.initials(kol.handle))}">`
              : KT.esc(KT.initials(kol.handle))
          }</span>
          <span class="kt-card-name">${KT.esc(kol.handle)}</span>
          <span class="kt-tier" style="color:${KT.tierColor(kol.tier)}">${KT.esc(kol.tierLetter || "?")}</span>
        </div>
        ${kol.description ? `<div class="kt-card-desc">${KT.esc(kol.description)}</div>` : ""}
        ${bits.length ? `<div class="kt-card-stat">${KT.esc(bits.join(" · "))}</div>` : ""}
        ${kol.redFlags ? `<div class="kt-card-flag">⚑ ${KT.esc(kol.redFlags)}</div>` : ""}
      </div>`;
    }

    let hideTimer = null;
    function showCard(kol, anchorRect) {
      const { cfg } = api.getState();
      if (!cfg || !cfg.overlayHover) return;
      clearTimeout(hideTimer);
      card.innerHTML = cardHtml(kol);
      KT.render.hydrateAvatars(card);
      card.style.display = "block";

      // Đặt bên phải mỏm neo, lật sang trái / lên trên nếu tràn màn hình
      const w = 250;
      const h = card.offsetHeight || 120;
      let left = anchorRect.right + 10;
      let top = anchorRect.top;
      if (left + w > window.innerWidth - 8) left = anchorRect.left - w - 10;
      if (left < 8) left = 8;
      if (top + h > window.innerHeight - 8) top = window.innerHeight - h - 8;
      if (top < 8) top = 8;
      card.style.left = left + "px";
      card.style.top = top + "px";
    }

    function hideCard(delay) {
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => {
        card.style.display = "none";
      }, delay == null ? 120 : delay);
    }

    function onPointerOver(ev) {
      const { db, cfg } = api.getState();
      if (!db || !cfg || !cfg.overlayHover) return;
      const target = ev.target;
      if (!target || target.nodeType !== 1) return;

      if (target.tagName === "IMG") {
        const kol = KT.lookupByAvatar(db, target.currentSrc || target.src);
        if (kol) {
          showCard(kol, target.getBoundingClientRect());
          return;
        }
      }
      hideCard();
    }

    /* ---------- quét ---------- */

    function scanAll() {
      scanTimer = null;
      scanImages(document);
      schedule();
    }

    function queueScan() {
      if (scanTimer == null) scanTimer = setTimeout(scanAll, SCAN_DEBOUNCE_MS);
    }

    function onMutation(records) {
      const { db, cfg } = api.getState();
      if (!db) return;
      let needScan = false;

      for (const rec of records) {
        for (const node of rec.addedNodes) {
          if (node.nodeType !== 1) continue;
          if (host.contains(node)) continue;
          needScan = true;

          // Node nhỏ vừa xuất hiện = ứng viên tooltip. Chỉ đọc CHỮ, không sửa gì.
          if (cfg && cfg.overlayHover && node.childElementCount <= 12) {
            const kol = matchHandleIn(node);
            if (kol) {
              const rect = node.getBoundingClientRect();
              if (rect.width && rect.height) showCard(kol, rect);
            }
          }
        }
        if (rec.removedNodes && rec.removedNodes.length) needScan = true;
      }
      if (needScan) queueScan();
    }

    /* ---------- chẩn đoán (bước 3 trong roadmap của spec) ---------- */

    function diagnose() {
      const { db } = api.getState();
      const canvases = Array.from(document.querySelectorAll("canvas")).map((c) => ({
        w: c.width,
        h: c.height,
        css: `${Math.round(c.clientWidth)}x${Math.round(c.clientHeight)}`,
        cls: (c.className || "").toString().slice(0, 60),
      }));
      const imgs = Array.from(document.querySelectorAll("img[src]"));
      const small = imgs.filter((i) => {
        const r = i.getBoundingClientRect();
        return r.width >= MIN_AVATAR_PX && r.width <= 64 && Math.abs(r.width - r.height) <= 4;
      });
      const matched = db ? small.filter((i) => KT.lookupByAvatar(db, i.currentSrc || i.src)) : [];
      return {
        url: location.href,
        canvases: canvases.length,
        canvasDetail: canvases.slice(0, 6),
        images: imgs.length,
        avatarLike: small.length,
        avatarSamples: small.slice(0, 12).map((i) => (i.currentSrc || i.src).slice(0, 140)),
        matchedInDb: matched.length,
        ringsActive: tracked.size,
        verdict: canvases.length && !small.length
          ? "Chart nhiều khả năng vẽ bằng CANVAS — avatar không phải element riêng, phải đi đường tooltip."
          : small.length
          ? "Có element ảnh cỡ avatar — overlay viền màu bám thẳng vào được."
          : "Chưa thấy gì giống avatar. Hover vào avatar trên chart rồi chạy lại.",
      };
    }

    /* ---------- vòng đời ---------- */

    return {
      host,
      start() {
        if (running) return;
        running = true;
        document.documentElement.appendChild(host);
        observer = new MutationObserver(onMutation);
        observer.observe(document.documentElement, { childList: true, subtree: true });
        document.addEventListener("pointerover", onPointerOver, true);
        window.addEventListener("scroll", schedule, true);
        window.addEventListener("resize", schedule);
        queueScan();
      },
      stop() {
        running = false;
        if (observer) observer.disconnect();
        document.removeEventListener("pointerover", onPointerOver, true);
        window.removeEventListener("scroll", schedule, true);
        window.removeEventListener("resize", schedule);
        for (const img of Array.from(tracked.keys())) untrack(img);
        hideCard(0);
        host.remove();
      },
      /** Dữ liệu vừa đổi → vứt ring cũ, quét lại từ đầu. */
      reset() {
        for (const img of Array.from(tracked.keys())) untrack(img);
        if (running) queueScan();
      },
      diagnose,
      isRunning: () => running,
    };
  }

  KT.createOverlay = createOverlay;
})(typeof globalThis !== "undefined" ? globalThis : self);
