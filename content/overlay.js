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

  // Tooltip của GMGN mọc CẠNH avatar chứ không đè lên, nên "thứ người ta đang
  // trỏ vào" phải nới ra quanh con trỏ chứ không chỉ là ô dưới mũi tên.
  const NEAR_POINTER_PX = 240;
  // Con trỏ đứng yên quá lâu thì thôi coi như không còn hover gì: chuột rời
  // khỏi cửa sổ không phải lúc nào cũng bắn pointerout mình nghe được.
  const POINTER_TTL_MS = 15000;
  // Người đọc được từ tooltip sống lâu hơn cái THẺ vẽ ra: ẩn thẻ là chuyện
  // hiển thị, không phải chuyện quên mất đang nói về ai.
  const PERSON_TTL_MS = 20000;
  // Khi phần tử đã bị xoá thì không đọc lại được nữa — cửa sổ tin cậy ngắn hơn.
  const ORPHAN_TTL_MS = 6000;

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
    let pointer = null; // { x, y, t } — vị trí chuột thật, cập nhật mỗi pointermove

    /* ---------- viền quanh avatar ---------- */

    function ringFor(hit) {
      const person = hit.person;
      const ring = document.createElement("div");
      ring.className = "kt-ring" + (person.redFlags || (hit.caller && hit.caller.isHoldingRedFlag) ? " kt-flag" : "");
      ring.style.setProperty("--c", KT.tierColor(person.tier));
      ring.dataset.tier = person.tierLetter || "?";
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
        // CHỈ khoanh người đã có hồ sơ trong Sheet. Khoanh cả người lạ thì
        // trên một chart mà ai cũng có viền, cái viền không còn nói gì —
        // đúng ý ô chọn trong Options: "quanh avatar QUEN MẶT".
        if (!hit.known) continue;
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

    /** Ghi lại vì sao thẻ vừa nhận ra người lại (không) được hiện. */
    function why(reason) {
      if (lastTooltip) {
        lastTooltip.ketQua = reason;
        lastTooltip.conTro = pointer ? Math.round(pointer.x) + "," + Math.round(pointer.y) : "chưa biết";
        lastTooltip.conTroTuoi = pointer ? Date.now() - pointer.t + "ms" : "-";
      }
    }

    /**
     * Từ một node vừa đổi, leo lên tìm khung thẻ giới thiệu người.
     *
     * Thẻ của GMGN luôn kèm ảnh của chính người đó — đó là dấu hiệu phân biệt
     * nó với một cục SPA vừa vẽ lại có nhắc tên ai đó.
     */
    function cardContainer(el) {
      let node = el;
      for (let i = 0; i < 5 && node && node.nodeType === 1; i++) {
        if (node.querySelector && node.querySelector("img")) {
          const r = node.getBoundingClientRect();
          if (r.width && r.height && r.width <= MAX_TOOLTIP_W && r.height <= MAX_TOOLTIP_H) return node;
        }
        node = node.parentElement;
      }
      return null;
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
    let cardHit = null;
    let cardFromPointer = false; // thẻ mọc từ chính avatar dưới con trỏ, hay từ tooltip cạnh nó
    let lastPerson = null; // { hit, el, at } — sống qua cả lúc thẻ bị ẩn
    let lastHit = null; // vì sao lần hỏi gần nhất ra (hoặc không ra) ai
    let cardWatch = null;

    function pointerFresh() {
      return !!pointer && Date.now() - pointer.t < POINTER_TTL_MS;
    }

    /** Ô này có nằm trong tầm với của con trỏ ngay lúc này không? */
    function nearPointer(rect) {
      return pointerFresh() && KT.nearRect(pointer.x, pointer.y, rect, NEAR_POINTER_PX);
    }

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

    function showCard(hit, anchorRect, anchorNode, fromPointer) {
      const { cfg } = api.getState();
      // Thẻ này chú thích cho thứ con trỏ đang chỉ vào. Nhớ lại để phím N có
      // đường dự phòng khi avatar dưới con trỏ không phải <img> so khớp được
      // — nhưng KHÔNG ghi đè state toàn cục nào nữa: trước đây mọi node SPA
      // vừa đổi mà có @handle quen mặt đều tự xưng là "người đang hover", nên
      // N mở mãi một người bất kể chuột ở đâu.
      cardHit = hit;
      cardFromPointer = !!fromPointer;
      if (anchorNode) {
        lastPerson = { hit: hit, el: anchorNode, at: Date.now(), fromPointer: !!fromPointer };
      }
      if (!cfg || !cfg.overlayHover) {
        cardAnchor = anchorNode || null;
        watchAnchor();
        return;
      }

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
      cardHit = null;
      cardFromPointer = false;
      hideTimer = setTimeout(() => {
        card.style.display = "none";
      }, delay == null ? 120 : delay);
    }

    /**
     * Đặt vị trí chuột từ BÊN NGOÀI.
     *
     * Chuột đi vào iframe là frame cha ngừng nhận pointermove hoàn toàn — nó
     * vẫn giữ toạ độ cũ và tưởng là mới. Chart GMGN nằm trong iframe, nên mọi
     * phép "cái này có ở cạnh con trỏ không" ở frame cha đều đo từ một điểm
     * sai. Frame chart phải tự báo ra.
     */
    function setPointer(x, y) {
      pointer = { x: x, y: y, t: Date.now() };
    }

    function onPointerMove(ev) {
      pointer = { x: ev.clientX, y: ev.clientY, t: Date.now() };
      // Tooltip của GMGN tự biến mất không báo; thẻ của mình thì phải tự biết
      // rời đi khi con trỏ đã đi khỏi thứ nó đang chú thích.
      if (cardAnchor && cardAnchor.isConnected && !nearPointer(cardAnchor.getBoundingClientRect())) {
        hideCard(0);
      }
    }

    /**
     * Ai đang nằm dưới con trỏ NGAY LÚC NÀY.
     *
     * Phím N hỏi hàm này chứ không đọc một biến "người đang hover" nhớ sẵn:
     * biến nhớ sẵn thì ai ghi vào cũng được, mà trên một SPA thì "ai" là bất
     * kỳ mutation nào.
     */
    /**
     * Ai đang nằm dưới con trỏ NGAY LÚC NÀY.
     *
     * Phím N hỏi hàm này chứ không đọc một biến "người đang hover" nhớ sẵn:
     * biến nhớ sẵn thì ai ghi vào cũng được, mà trên một SPA thì "ai" là bất
     * kỳ mutation nào.
     *
     * Ghi lý do vào `lastHit` ở MỌI đường ra. Hàm này đã vá bốn lần và mỗi lần
     * hỏng lại là một vòng đoán mò — giờ nó tự khai.
     */
    function hitAtPointer() {
      const say = (reason, value) => {
        lastHit = { luc: new Date().toISOString(), lyDo: reason, ra: value ? value.person.username || value.person.wallet : null };
        return value || null;
      };

      if (!pointerFresh()) return say("chưa biết con trỏ ở đâu");
      const els = elementsUnderPointer();

      // 1. Ảnh dưới con trỏ khớp thẳng được một người.
      for (const el of els) {
        if (!el || el.tagName !== "IMG") continue;
        const hit = api.identifyByAvatar(el.currentSrc || el.src);
        if (hit) return say("khớp avatar dưới con trỏ", Object.assign({}, hit, { rect: el.getBoundingClientRect() }));
      }

      // 2. Thẻ mọc từ chính một avatar: chỉ còn đúng khi con trỏ VẪN ở trên
      // đúng avatar đó. Rê sang avatar bên cạnh mà vẫn trả lời người cũ là ghi
      // chú vào nhầm hồ sơ — hỏng im lặng, kiểu tệ nhất.
      if (cardHit && cardFromPointer && cardAnchor && cardAnchor.isConnected) {
        const r = cardAnchor.getBoundingClientRect();
        if (els.indexOf(cardAnchor) >= 0 && r.width && r.height) {
          return say("thẻ neo vào avatar dưới con trỏ", Object.assign({}, cardHit, { rect: r }));
        }
      }

      // 3. Thẻ đọc từ tooltip GMGN. Dùng `lastPerson` chứ không dùng cardHit:
      // thẻ có thể đã bị ẩn đi (GMGN dựng lại tooltip, watchAnchor dọn mất)
      // trong khi phần tử tooltip vẫn còn nguyên trên trang và vẫn đang nói về
      // người mình cần. Ẩn thẻ là chuyện HIỂN THỊ, không phải chuyện quên người.
      // CHỈ thẻ đọc từ tooltip mới đi đường này. Thẻ neo vào một avatar đã bị
      // bước 2 loại rồi — con trỏ không còn ở trên avatar đó nữa, mà nó thì
      // vẫn nằm trong bán kính của avatar bên cạnh, nên rơi xuống đây là trả
      // lời người cũ cho avatar mới.
      const src = lastPerson && !lastPerson.fromPointer ? lastPerson : null;
      if (!src) return say("chưa đọc được tooltip nào");
      const tuoi = Date.now() - src.at;

      // Phần tử còn trên trang thì ĐỌC LẠI nó: tooltip của GMGN có khi được
      // dùng đi dùng lại, rê sang người khác là đổi nội dung chứ không dựng
      // lại, nên cái mình nhớ có thể đã nói về người khác.
      if (src.el && src.el.isConnected) {
        const r = src.el.getBoundingClientRect();
        if (r.width && r.height) {
          if (tuoi > PERSON_TTL_MS) return say("thẻ cũ quá (" + Math.round(tuoi / 1000) + "s)");
          const use = matchHandleIn(src.el) || src.hit;
          if (overIframe()) return say("đọc lại tooltip (con trỏ trên chart)", Object.assign({}, use, { rect: r }));
          if (nearPointer(r)) return say("đọc lại tooltip (ở cạnh con trỏ)", Object.assign({}, use, { rect: r }));
          return say("tooltip cách con trỏ " + Math.round(KT.distToRect(pointer.x, pointer.y, r)) + "px");
        }
      }

      // Phần tử đã bị GMGN vứt đi. NGƯỜI thì vẫn còn: GMGN chỉ hiện một
      // tooltip tại một thời điểm, nên người đọc được vài giây trước vẫn là
      // người đang nằm dưới con trỏ — rê sang ai khác thì đã có thẻ mới rồi.
      // Cửa sổ này CỐ TÌNH ngắn hơn PERSON_TTL_MS: không đọc lại được nữa thì
      // càng để lâu càng dễ ghi chú vào nhầm hồ sơ.
      if (!overIframe()) return say("thẻ đã bị xoá, mà con trỏ không ở trên chart");
      if (tuoi > ORPHAN_TTL_MS) return say("thẻ đã bị xoá " + Math.round(tuoi / 1000) + "s trước");
      return say("thẻ đã bị xoá, dùng người đọc gần nhất", Object.assign({}, src.hit, { rect: null }));
    }

    function elementsUnderPointer() {
      if (!pointerFresh()) return [];
      try {
        return document.elementsFromPoint(pointer.x, pointer.y) || [];
      } catch (e) {
        return [];
      }
    }

    /**
     * Con trỏ đang nằm trên một iframe — tức là trên CHART.
     *
     * Ở đó không có phần tử nào để bám: avatar là nét vẽ trên canvas. Nên thẻ
     * giới thiệu người nào vừa mọc ra trong lúc con trỏ ở trên chart thì chắc
     * chắn nói về cái đang nằm dưới con trỏ, mọc ở đâu cũng kệ. Đo khoảng cách
     * ở đây là vô nghĩa: GMGN thả tooltip theo chỗ trống của nó, không theo
     * con trỏ.
     */
    function overIframe() {
      for (const el of elementsUnderPointer()) {
        if (el && el.tagName === "IFRAME") return true;
      }
      return false;
    }

    /** Ảnh cỡ avatar đang nằm ngay dưới con trỏ (khớp được hay không, kệ). */
    function imgUnderPointer() {
      for (const el of elementsUnderPointer()) {
        if (!el || el.tagName !== "IMG") continue;
        const r = el.getBoundingClientRect();
        if (r.width < MIN_AVATAR_PX || r.width > 96) continue;
        if (Math.abs(r.width - r.height) > 8) continue; // avatar thì vuông
        return el;
      }
      return null;
    }

    function onPointerOver(ev) {
      const target = ev.target;
      if (!target || target.nodeType !== 1) return;
      if (target.tagName !== "IMG") return;

      const hit = api.identifyByAvatar(target.currentSrc || target.src);
      if (hit) showCard(hit, target.getBoundingClientRect(), target, true);
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
        if (!el) { why("không có phần tử"); continue; }
        const rect = el.getBoundingClientRect();
        if (!rect.width || !rect.height) { why("thẻ không có kích thước"); continue; }
        if (rect.width > MAX_TOOLTIP_W || rect.height > MAX_TOOLTIP_H) {
          why("thẻ quá to: " + Math.round(rect.width) + "x" + Math.round(rect.height));
          continue;
        }

        // Tooltip vừa mọc ra là NÓI VỀ thứ con trỏ đang chỉ vào. Nếu dưới con
        // trỏ có một avatar thì neo thẳng vào avatar đó — kể cả tooltip mọc ở
        // tận đâu. Đo khoảng cách tới tooltip là sai: tooltip của chart GMGN
        // mọc xa hẳn avatar, nên luật bán kính làm phím N chết hẳn trên chart
        // đúng lúc nó vừa được sửa cho hết mở nhầm người.
        // Nhưng phải chắc CÁI VỪA MỌC RA đúng là thẻ giới thiệu một người, chứ
        // không phải một cục SPA vừa vẽ lại có nhắc tên ai đó. Dấu hiệu: thẻ
        // của GMGN luôn kèm ẢNH của chính người đó. Thiếu bước này thì đang
        // hover một avatar lạ mà ở góc màn hình có chữ "@ai-đó" là N mở nhầm
        // sang người kia — đúng con bug vừa sửa xong.
        // Node vừa đổi có thể chỉ là một mẩu chữ bên trong thẻ. Leo lên tìm
        // KHUNG thẻ thật (có ảnh người, kích thước còn hợp lý) — bám vào mẩu
        // chữ thì GMGN vẽ lại một nhịp là mất dấu.
        const card = cardContainer(el);
        if (!card) { why("không tìm ra khung thẻ có ảnh người"); continue; }
        if (!pointerFresh()) { why("chưa biết con trỏ ở đâu"); continue; }

        const anchorImg = imgUnderPointer();
        if (anchorImg) {
          why("neo vào avatar dưới con trỏ");
          showCard(hit, anchorImg.getBoundingClientRect(), anchorImg, true);
          return;
        }
        if (overIframe()) {
          why("con trỏ đang trên chart");
          showCard(hit, card.getBoundingClientRect(), card, false);
          return;
        }
        // Không hover avatar nào (rê trên một cái tên trong danh sách chẳng
        // hạn) thì mới quay về luật cũ: tooltip phải ở cạnh con trỏ.
        if (!nearPointer(rect)) {
          why("tooltip cách con trỏ " + Math.round(KT.distToRect(pointer.x, pointer.y, rect)) + "px");
          continue;
        }
        why("tooltip ở cạnh con trỏ");
        showCard(hit, card.getBoundingClientRect(), card, false);
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
      // Ảnh cỡ avatar nào khớp được với một người trên chart, ảnh nào không.
      // Đây là câu hỏi quyết định: GMGN phục vụ avatar qua proxy nội bộ
      // (/external-res/<hash>_v2.webp) — hash nội dung, không gỡ ngược ra URL
      // gốc được. Nếu API trả URL pbs.twimg.com còn thẻ <img> dùng URL proxy
      // thì hai bên KHÔNG BAO GIỜ khớp, và không có triệu chứng nào khác ngoài
      // "hover không ra gì".
      // Lấy mẫu mà không lọc thì sáu chỗ mẫu bị icon giao diện chiếm sạch —
      // chúng đứng đầu cây DOM, còn avatar thật thì nằm sâu bên dưới.
      const isChrome = (u) => /\/_next\/|\/static\/|\.svg($|\?)/i.test(u);
      const buckets = { twitterPath: 0, externalRes: 0, giaoDien: 0, khac: 0 };
      const unmatched = [];
      let matched = 0;
      for (const img of small) {
        const src = img.currentSrc || img.src;
        if (/\/defi\/images\/twitter\//i.test(src)) buckets.twitterPath++;
        else if (/\/external-res\//i.test(src)) buckets.externalRes++;
        else if (isChrome(src)) buckets.giaoDien++;
        else buckets.khac++;

        if (api.identifyByAvatar(src)) matched++;
        else if (!isChrome(src) && unmatched.length < 8) unmatched.push(src.slice(0, 120));
      }
      const state = api.getState();
      const callerAvatars = (state.callers || []).slice(0, 4).map((c) => String(c.avatar || "").slice(0, 120));

      return {
        url: location.href,
        canvases: canvases.length,
        version: (chrome.runtime.getManifest && chrome.runtime.getManifest().version) || "?",
        avatarMatched: matched,
        avatarBuckets: buckets,
        avatarUnmatchedSamples: unmatched,
        callerAvatarSamples: callerAvatars,
        canvasDetail: canvases.slice(0, 4),
        images: imgs.length,
        avatarLike: small.length,
        avatarSamples: small.slice(0, 8).map((i) => (i.currentSrc || i.src).slice(0, 140)),
        ringsActive: tracked.size,
        iframes: Array.from(document.querySelectorAll("iframe")).map((f) =>
          (f.src || "(same-origin)").slice(0, 80)
        ),
        lastTooltip,
        lastHit,
      };
    }

    /* ---------- vòng đời ---------- */

    return {
      host,
      diagnose,
      hitAtPointer,
      setPointer,
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
        document.addEventListener("pointermove", onPointerMove, { capture: true, passive: true });
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
        document.removeEventListener("pointermove", onPointerMove, true);
        pointer = null;
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
