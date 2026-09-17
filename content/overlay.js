/**
 * Lớp phủ trên chart: viền màu quanh avatar quen mặt + thẻ tóm tắt khi hover.
 *
 * Nguồn danh tính là API `community/messages` (xem content.js) chứ không phải
 * chữ trên màn hình — nên so khớp avatar giờ là so URL ảnh mà chính GMGN đưa
 * ra, chính xác tuyệt đối. Phần đọc chữ trong tooltip vẫn giữ làm ĐƯỜNG DỰ
 * PHÒNG cho lúc API đổi hình dạng hoặc chưa kịp về.
 *
 * ⚠ TUYỆT ĐỐI không sửa DOM của trang chủ nhà. GMGN là SPA — chèn node vào
 * giữa cây của nó là React ghi đè lại (nhẹ) hoặc vỡ render (nặng). Mọi thứ
 * mình vẽ nằm trong shadow root riêng, `position: fixed`, `pointer-events: none`.
 */
(function (root) {
  "use strict";
  const KT = (root.KT = root.KT || {});

  const MAX_RINGS = 60;
  const MIN_AVATAR_PX = 12;
  const SCAN_DEBOUNCE_MS = 250;
  const TOOLTIP_DEBOUNCE_MS = 80;

  // Giới hạn khi soi một node vừa xuất hiện: nó có thể là cái tooltip bé tí,
  // mà cũng có thể là cả nửa trang vừa render lại.
  const MAX_TEXT_NODES = 60;
  const MAX_CARD_CHUNKS = 24;
  const MAX_TOOLTIP_W = 700;
  const MAX_TOOLTIP_H = 600;

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

    /** img đang theo dõi → { hit, ring } */
    const tracked = new Map();
    let lastTooltip = null;
    let scanTimer = null;
    let tooltipTimer = null;
    let pendingNodes = new Set();
    let rafId = null;
    let running = false;
    let observer = null;

    /* ---------- viền quanh avatar ---------- */

    function ringFor(hit) {
      const person = hit.person;
      const ring = document.createElement("div");
      ring.className = "kt-ring" + (person.redFlags || (hit.caller && hit.caller.isHoldingRedFlag) ? " kt-flag" : "");
      ring.style.setProperty("--c", hit.known ? KT.tierColor(person.tier) : "#6E7A88");
      ring.dataset.tier = hit.known ? person.tierLetter || "?" : "•";
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
      const { cfg } = api.getState();
      if (!cfg || !cfg.overlayRings) return;

      const imgs = (scope || document).querySelectorAll("img[src]");
      for (const img of imgs) {
        if (tracked.has(img) || tracked.size >= MAX_RINGS) continue;
        const hit = api.identifyByAvatar(img.currentSrc || img.src);
        if (!hit) continue;
        tracked.set(img, { hit, ring: ringFor(hit) });
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

    /* ---------- đường dự phòng: đọc chữ trong tooltip ---------- */

    /**
     * ⚠ KHÔNG dùng `node.textContent`: nó nối mọi chữ lại KHÔNG có dấu cách,
     * làm regex @handle nuốt sang chữ bên cạnh. Đi theo từng text node.
     */
    function textChunks(node) {
      if (!node) return [];
      if (node.nodeType === 3) {
        const t = (node.nodeValue || "").trim();
        return t ? [t] : [];
      }
      if (node.nodeType !== 1) return [];

      const out = [];
      const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = walker.nextNode()) && out.length < MAX_TEXT_NODES) {
        const t = (n.nodeValue || "").trim();
        if (t) out.push(t);
      }
      return out;
    }

    function rememberTooltip(el, chunks, matchedAs, found) {
      lastTooltip = {
        tag: el && el.tagName ? el.tagName.toLowerCase() : "?",
        cls: el ? String(el.className || "").slice(0, 120) : "",
        chunks: chunks.slice(0, 10),
        matchedAs: matchedAs || null,
        found: !!found,
        at: new Date().toISOString(),
      };
    }

    function matchHandleIn(node) {
      const chunks = textChunks(node);
      if (!chunks.length || chunks.length > MAX_CARD_CHUNKS) return null;

      const el = node.nodeType === 1 ? node : node.parentElement;
      const { standalone, at, plain } = KT.candidateHandles(chunks);

      for (const name of standalone.concat(at, plain)) {
        if (KT.handleKey(name).length < 2) continue;
        const hit = api.identify({ username: name });
        if (hit) {
          rememberTooltip(el, chunks, name, true);
          return hit;
        }
      }
      if (standalone.length) rememberTooltip(el, chunks, standalone[0], false);
      return null;
    }

    /* ---------- thẻ tóm tắt ---------- */

    function cardHtml(hit) {
      const person = hit.person;
      const caller = hit.caller;
      const bits = [];
      if (person.noteCount) bits.push(`${person.noteCount} ghi chú`);
      if (caller && caller.multiple != null) bits.push("hiện " + KT.fmtMultiple(caller.multiple));
      if (caller && caller.followers != null) bits.push(caller.followers + " follower");

      const color = hit.known ? KT.tierColor(person.tier) : "#6E7A88";
      const avatar = KT.safeUrl(person.avatar || (caller && caller.avatar));

      return `<div class="kt-root">
        <div class="kt-card-head">
          <span class="kt-av" style="border-color:${color}">${
            avatar
              ? `<img src="${KT.esc(avatar)}" alt="" data-ini="${KT.esc(KT.initials(person.username))}">`
              : KT.esc(KT.initials(person.username || person.wallet))
          }</span>
          <span class="kt-card-name">${KT.esc(person.username || KT.shortWallet(person.wallet))}</span>
          <span class="kt-tier" style="color:${color}">${KT.esc(
            hit.known ? person.tierLetter || "?" : "mới"
          )}</span>
        </div>
        ${person.summary ? `<div class="kt-card-desc">${KT.esc(person.summary)}</div>` : ""}
        ${
          caller && caller.holdingLabel
            ? `<div class="kt-card-stat" style="color:${
                caller.isHoldingRedFlag ? "#F85149" : "#9BA6B2"
              }">${KT.esc(caller.holdingLabel)}</div>`
            : ""
        }
        ${bits.length ? `<div class="kt-card-stat">${KT.esc(bits.join(" · "))}</div>` : ""}
        ${person.redFlags ? `<div class="kt-card-flag">⚑ ${KT.esc(person.redFlags)}</div>` : ""}
        <div class="kt-card-stat" style="color:#6E7A88">N để ghi chú</div>
      </div>`;
    }

    let hideTimer = null;
    let cardAnchor = null;
    let cardWatch = null;

    /**
     * Tooltip của GMGN biến mất mà không bắn sự kiện nào mình nghe được.
     * Không canh thì thẻ của mình ở lại giữa màn hình sau khi cái nó chú
     * thích đã đi mất.
     */
    function watchAnchor() {
      clearInterval(cardWatch);
      if (!cardAnchor) return;
      cardWatch = setInterval(() => {
        if (!cardAnchor || !cardAnchor.isConnected) return hideCard(0);
        const r = cardAnchor.getBoundingClientRect();
        if (!r.width || !r.height) hideCard(0);
      }, 300);
    }

    function showCard(hit, anchorRect, anchorNode) {
      const { cfg } = api.getState();
      api.setHovered(hit, anchorRect);
      if (!cfg || !cfg.overlayHover) return;

      clearTimeout(hideTimer);
      cardAnchor = anchorNode || null;
      watchAnchor();

      card.innerHTML = cardHtml(hit);
      KT.render.hydrateAvatars(card);
      card.style.display = "block";

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
      clearInterval(cardWatch);
      cardAnchor = null;
      hideTimer = setTimeout(() => {
        card.style.display = "none";
      }, delay == null ? 120 : delay);
    }

    function onPointerOver(ev) {
      const target = ev.target;
      if (!target || target.nodeType !== 1) return;
      if (target.tagName !== "IMG") return;

      const hit = api.identifyByAvatar(target.currentSrc || target.src);
      if (hit) showCard(hit, target.getBoundingClientRect(), target);
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

    function queueTooltip(node) {
      if (!node || shadow.contains(node)) return;
      pendingNodes.add(node);
      if (tooltipTimer == null) tooltipTimer = setTimeout(processTooltipQueue, TOOLTIP_DEBOUNCE_MS);
    }

    function processTooltipQueue() {
      tooltipTimer = null;
      const nodes = Array.from(pendingNodes).slice(0, 30);
      pendingNodes.clear();

      for (const node of nodes) {
        if (!node.isConnected) continue;
        const hit = matchHandleIn(node);
        if (!hit) continue;

        const el = node.nodeType === 1 ? node : node.parentElement;
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (!rect.width || !rect.height) continue;
        if (rect.width > MAX_TOOLTIP_W || rect.height > MAX_TOOLTIP_H) continue;

        showCard(hit, rect, el);
        return;
      }
    }

    function onMutation(records) {
      let needScan = false;
      for (const rec of records) {
        if (rec.type === "characterData") {
          // ⚠ KHÔNG queue thẳng parentElement: một text node con trực tiếp của
          // <body> đổi chữ (SPA đổi giá liên tục) sẽ đẩy cả <body> vào hàng đợi.
          const parent = rec.target.parentElement;
          if (parent && parent !== document.body && parent !== document.documentElement) {
            queueTooltip(parent);
          }
          continue;
        }
        for (const node of rec.addedNodes) {
          if (node.nodeType !== 1 && node.nodeType !== 3) continue;
          if (shadow.contains(node) || host.contains(node)) continue;
          needScan = true;
          queueTooltip(node);
        }
        if (rec.removedNodes && rec.removedNodes.length) needScan = true;
      }
      if (needScan) queueScan();
    }

    /* ---------- chẩn đoán ---------- */

    function diagnose() {
      const canvases = Array.from(document.querySelectorAll("canvas")).map((c) => ({
        w: c.width,
        h: c.height,
        css: `${Math.round(c.clientWidth)}x${Math.round(c.clientHeight)}`,
      }));
      const imgs = Array.from(document.querySelectorAll("img[src]"));
      const small = imgs.filter((i) => {
        const r = i.getBoundingClientRect();
        return r.width >= MIN_AVATAR_PX && r.width <= 72 && Math.abs(r.width - r.height) <= 6;
      });
      return {
        url: location.href,
        canvases: canvases.length,
        canvasDetail: canvases.slice(0, 4),
        images: imgs.length,
        avatarLike: small.length,
        avatarSamples: small.slice(0, 8).map((i) => (i.currentSrc || i.src).slice(0, 140)),
        ringsActive: tracked.size,
        iframes: Array.from(document.querySelectorAll("iframe")).map((f) =>
          (f.src || "(same-origin)").slice(0, 80)
        ),
        lastTooltip,
      };
    }

    /* ---------- vòng đời ---------- */

    return {
      host,
      diagnose,
      isRunning: () => running,
      start() {
        if (running) return;
        running = true;
        document.documentElement.appendChild(host);
        observer = new MutationObserver(onMutation);
        observer.observe(document.documentElement, {
          childList: true,
          subtree: true,
          characterData: true,
        });
        document.addEventListener("pointerover", onPointerOver, true);
        window.addEventListener("scroll", schedule, true);
        window.addEventListener("resize", schedule);
        queueScan();
      },
      stop() {
        running = false;
        clearTimeout(tooltipTimer);
        tooltipTimer = null;
        pendingNodes.clear();
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
    };
  }

  KT.createOverlay = createOverlay;
})(typeof globalThis !== "undefined" ? globalThis : self);
