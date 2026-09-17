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
  const TOOLTIP_DEBOUNCE_MS = 80;

  // Giới hạn khi soi một node vừa xuất hiện. Node đó có thể là cái tooltip
  // bé tí, mà cũng có thể là cả nửa trang vừa render lại — không chặn thì một
  // lần GMGN đổi route là quét cả nghìn text node.
  const MAX_TEXT_NODES = 60;
  // Một thẻ người chỉ có dăm mẩu chữ (tên, nhãn, @handle, thời gian, nội dung).
  // Nhiều hơn ngần này = mình đang cầm cả một khối trang, không phải tooltip.
  const MAX_CARD_CHUNKS = 24;
  const MAX_TOOLTIP_W = 700; // thẻ neo vào khối to hơn thế = neo nhầm vào cả trang
  const MAX_TOOLTIP_H = 600;
  const MAX_SEEN = 20;

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
    /** handle thấy trên chart mà chưa có trong Sheet → { handle, avatar, at } */
    const seenUnknown = new Map();
    let lastTooltip = null;
    let scanTimer = null;
    let tooltipTimer = null;
    let pendingNodes = new Set();
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

    /**
     * Gom chữ của một node thành từng MẨU theo text node.
     *
     * ⚠ KHÔNG dùng `node.textContent`: nó nối mọi chữ lại KHÔNG có dấu cách.
     * Tooltip của GMGN in tên hiển thị, nhãn, rồi @handle ở ba element liền
     * nhau, nên textContent ra "nolifeloserThesis@nolifeloser2dAhaa Only up…"
     * và regex @handle nuốt luôn phần đuôi thành "@nolifeloser2dAhaa" — tra
     * không bao giờ trúng, mà cũng chẳng có lỗi nào hiện ra.
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

    /** Ghi lại hình dạng tooltip gặp gần nhất — diagnose() in ra để còn chỉnh tiếp. */
    function rememberTooltip(el, chunks, matchedAs, found) {
      lastTooltip = {
        tag: el && el.tagName ? el.tagName.toLowerCase() : "?",
        cls: el ? String(el.className || "").slice(0, 120) : "",
        chunks: chunks.slice(0, 10),
        imgs: el && el.querySelectorAll
          ? Array.from(el.querySelectorAll("img[src]"))
              .slice(0, 3)
              .map((i) => (i.currentSrc || i.src).slice(0, 160))
          : [],
        matchedAs: matchedAs || null,
        foundInDb: !!found,
        at: new Date().toISOString(),
      };
    }

    /**
     * Thấy một handle LẠ trên chart thì nhớ lại (kèm URL avatar bắt được trong
     * chính tooltip đó). Đây là nửa còn lại của vòng làm việc: thấy người lạ →
     * panel có sẵn dòng dán thẳng vào Sheet, khỏi phải gõ tay lại cái tên vừa
     * nhìn thấy rồi đi mò ảnh đại diện.
     */
    function captureUnknown(handle, el) {
      const key = KT.handleKey(handle);
      if (!key || seenUnknown.has(key)) return;

      let avatar = "";
      if (el && el.querySelector) {
        const img = el.querySelector("img[src]");
        if (img) avatar = img.currentSrc || img.src;
      }
      if (/^data:/i.test(avatar)) avatar = ""; // ảnh nhúng thì copy sang Sheet vô nghĩa

      seenUnknown.set(key, { handle, avatar, at: Date.now() });
      while (seenUnknown.size > MAX_SEEN) seenUnknown.delete(seenUnknown.keys().next().value);
      if (api.onCapture) api.onCapture();
    }

    /** Tìm handle quen mặt trong chữ của một node vừa xuất hiện. */
    function matchHandleIn(node) {
      const chunks = textChunks(node);
      if (!chunks.length || chunks.length > MAX_CARD_CHUNKS) return null;

      const el = node.nodeType === 1 ? node : node.parentElement;
      const { db } = api.getState();
      const { standalone, at, plain } = KT.candidateHandles(chunks);

      for (const c of standalone.concat(at, plain)) {
        const key = KT.handleKey(c);
        if (key.length < 2) continue;
        const kol = db && db.byKey[key];
        if (kol) {
          rememberTooltip(el, chunks, c, true);
          return kol;
        }
      }

      if (standalone.length) {
        rememberTooltip(el, chunks, standalone[0], false);
        // Ghi vào danh sách "người lạ" CHỈ khi khối này còn có ảnh đại diện —
        // tức là một thẻ người, không phải một câu văn có nhắc tên ai đó.
        // Thiếu vế này thì mỗi bài post nhắc "@ai_đó" là một dòng rác.
        const hasAvatar = el && el.querySelector && el.querySelector("img[src]");
        if (hasAvatar && db && db.kols.length) captureUnknown(standalone[0], el);
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
    let cardAnchor = null;
    let cardWatch = null;

    /**
     * Tooltip của GMGN tự biến mất khi chuột rời đi, mà nó biến mất KHÔNG kèm
     * sự kiện nào mình nghe được. Không canh thì thẻ của mình ở lại giữa màn
     * hình sau khi cái nó chú thích đã đi mất.
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

    function showCard(kol, anchorRect, anchorNode) {
      const { cfg } = api.getState();
      if (!cfg || !cfg.overlayHover) return;
      clearTimeout(hideTimer);
      cardAnchor = anchorNode || null;
      watchAnchor();
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
      clearInterval(cardWatch);
      cardAnchor = null;
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
          showCard(kol, target.getBoundingClientRect(), target);
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

    function queueTooltip(node) {
      if (!node || shadow.contains(node)) return;
      pendingNodes.add(node);
      if (tooltipTimer == null) tooltipTimer = setTimeout(processTooltipQueue, TOOLTIP_DEBOUNCE_MS);
    }

    /**
     * Soi những node vừa xuất hiện/đổi chữ, tìm cái nào là tooltip của một
     * người mình biết. Gộp một nhịp rồi xử lý một lượt: mở một tooltip là
     * MutationObserver bắn ra cả chục record.
     */
    function processTooltipQueue() {
      tooltipTimer = null;
      const nodes = Array.from(pendingNodes).slice(0, 30);
      pendingNodes.clear();

      for (const node of nodes) {
        if (!node.isConnected) continue;
        const kol = matchHandleIn(node);
        if (!kol) continue;

        const el = node.nodeType === 1 ? node : node.parentElement;
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (!rect.width || !rect.height) continue;
        // Khối to hơn cỡ một cái tooltip = mình đang neo nhầm vào nguyên trang
        if (rect.width > MAX_TOOLTIP_W || rect.height > MAX_TOOLTIP_H) continue;

        showCard(kol, rect, el);
        return;
      }
    }

    function onMutation(records) {
      const { cfg } = api.getState();
      const watchText = !!(cfg && cfg.overlayHover);
      let needScan = false;

      for (const rec of records) {
        if (rec.type === "characterData") {
          // GMGN có thể DÙNG LẠI một node tooltip và chỉ thay chữ bên trong —
          // lúc đó không có addedNodes nào để bắt.
          // ⚠ KHÔNG queue thẳng parentElement: một text node con trực tiếp của
          // <body> đổi chữ (SPA đổi giá liên tục) sẽ đẩy cả <body> vào hàng
          // đợi, rồi mọi "@ai_đó" trên trang bị coi là một thẻ người.
          // MAX_CARD_CHUNKS chặn ca đó, đây là lớp chặn thứ hai cho rẻ.
          if (watchText) {
            const parent = rec.target.parentElement;
            if (parent && parent !== document.body && parent !== document.documentElement) {
              queueTooltip(parent);
            }
          }
          continue;
        }
        for (const node of rec.addedNodes) {
          if (node.nodeType !== 1 && node.nodeType !== 3) continue;
          if (shadow.contains(node) || host.contains(node)) continue;
          needScan = true;
          if (watchText) queueTooltip(node);
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
        lastTooltip, // hình dạng tooltip gặp gần nhất — cái quyết định Mức 2 làm được tới đâu
        unknownSeen: getSeen().map((u) => u.handle),
        verdict: canvases.length && !small.length
          ? "Chart nhiều khả năng vẽ bằng CANVAS — avatar không phải element riêng, phải đi đường tooltip."
          : small.length
          ? "Có element ảnh cỡ avatar — overlay viền màu bám thẳng vào được."
          : "Chưa thấy gì giống avatar. Hover vào avatar trên chart rồi chạy lại.",
      };
    }

    /* ---------- vòng đời ---------- */

    /** Người lạ gặp trên chart, mới nhất trước. */
    function getSeen() {
      return Array.from(seenUnknown.values()).sort((a, b) => b.at - a.at);
    }

    return {
      host,
      getSeen,
      clearSeen() {
        seenUnknown.clear();
      },
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
      diagnose,
      isRunning: () => running,
    };
  }

  KT.createOverlay = createOverlay;
})(typeof globalThis !== "undefined" ? globalThis : self);
