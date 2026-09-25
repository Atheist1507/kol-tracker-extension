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
  // Biên quanh khung chart. Thẻ tooltip mọc TRÀN ra ngoài mép chart (đo trên
  // ảnh thật: chart hết ở x=1515, thẻ bắt đầu ở x=1550) nên biên hẹp là vứt
  // nhầm. 120px vẫn còn cách bảng X Tracker rất xa (cách hơn 240px).
  const CHART_PAD_PX = 120;

  function createOverlay(api) {
    // Frame con ở đây LÀ chart (TradingView). Trong đó không có bảng X Tracker
    // hay danh sách nào khác để lẫn, nên thẻ nào mọc ra cũng là nói về mốc
    // đang hover — khỏi đo khoảng cách, y như luật dành cho chart ở frame cha.
    const inChartFrame = window.top !== window;
    const { host, shadow, wrap: layer } = KT.dom.shadowHost({
      id: "kol-tracker-overlay",
      hostStyle: "position:fixed;top:0;left:0;width:0;height:0;z-index:2147482999;",
      css: KT.PANEL_CSS + KT.OVERLAY_CSS,
      wrapClass: "kt-layer",
    });

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
    /**
     * Thẻ này có đang THẬT SỰ hiện trên màn hình không?
     *
     * GMGN không xoá thẻ cũ đi — nó giữ lại trong trang và giấu đi. Thẻ cũ vẫn
     * `isConnected`, vẫn có kích thước, `getBoundingClientRect()` vẫn trả số
     * đẹp. Đọc lại nó thì ra đúng cái tên nó đang giữ, chỉ có điều đó là người
     * đã hover từ trước. Đây là lý do hộp ghi chú mở ra tên người khác trong
     * khi tooltip trên màn hình là người đang hover.
     */
    function isReallyVisible(el) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return false;
      if (r.bottom <= 0 || r.right <= 0 || r.top >= window.innerHeight || r.left >= window.innerWidth) return false;

      for (let n = el, i = 0; n && n.nodeType === 1 && i < 12; n = n.parentElement, i++) {
        const st = getComputedStyle(n);
        if (st.display === "none" || st.visibility === "hidden" || Number(st.opacity) === 0) return false;
      }

      // Bị thứ khác phủ lên (thẻ mới đè lên thẻ cũ) cũng là không hiện.
      const cx = Math.min(Math.max(r.left + r.width / 2, 1), window.innerWidth - 1);
      const cy = Math.min(Math.max(r.top + r.height / 2, 1), window.innerHeight - 1);
      const top = document.elementFromPoint(cx, cy);
      if (!top) return false;
      if (top === el || el.contains(top) || top.contains(el)) return true;

      // ⚠ `contains` KHÔNG đi xuyên ranh giới shadow DOM. Phần tử nằm trong
      // shadow root thì elementFromPoint trả về THẺ CHỦ của shadow đó, và so
      // thẳng hai cái là luôn ra "không hiện" — tức là mọi thẻ trong shadow
      // root đều bị loại oan.
      const root = el.getRootNode && el.getRootNode();
      const shadowHost = root && root.host ? root.host : null;
      if (!shadowHost) return false;
      return top === shadowHost || shadowHost.contains(top) || top.contains(shadowHost);
    }

    /**
     * Khung thẻ khi ĐÃ biết chắc vị trí (đang ở vùng chart).
     *
     * ⚠ Không đòi phải có thẻ <img>. Đòi ảnh là cách phân biệt thẻ-giới-thiệu-
     * người với một cục SPA vừa vẽ lại — cần thiết ở giữa trang, nhưng ở vùng
     * chart thì VỊ TRÍ đã làm xong việc đó rồi. Mà avatar trong thẻ chart rất
     * có thể là background-image chứ không phải <img>, nên đòi ảnh ở đây là
     * vứt đúng cái mình đang tìm.
     */
    /**
     * Mọi "gốc" quét được: document, cộng các shadow root MỞ trên trang.
     *
     * ⚠ Nội dung trong shadow root thì `document.querySelectorAll` KHÔNG trả về,
     * và MutationObserver gắn ở documentElement cũng KHÔNG thấy gì bên trong.
     * Nếu GMGN dựng thẻ tooltip của chart trong một shadow root thì mọi cách
     * nới lỏng điều kiện đều vô ích — mình chưa bao giờ nhìn thấy nó.
     * Shadow root ĐÓNG thì chịu, không có đường vào.
     */
    /** Phần tử này có phải của extension mình không? */
    function isOurs(el) {
      for (let n = el, i = 0; n && i < 4; n = n.parentElement, i++) {
        if (n.id && String(n.id).indexOf("kol-tracker") === 0) return true;
      }
      return false;
    }

    function scanRoots() {
      const roots = [document];
      const queue = [document];
      let seen = 0;
      while (queue.length && roots.length < 40 && seen < 4000) {
        const root = queue.shift();
        for (const el of root.querySelectorAll("*")) {
          if (++seen > 4000) break;
          if (!el.shadowRoot) continue;
          // ⚠ Bỏ qua shadow root của CHÍNH MÌNH. Panel KOL Tracker cũng là một
          // thẻ có avatar và @handle, và nó nằm đè lên chart — quét vào đó là
          // đọc ra dòng đầu trong danh sách của chính mình rồi tưởng đó là
          // người đang hover. Đã xảy ra thật: hover Shea1121, hộp mở Roxx_Sol.
          if (isOurs(el)) continue;
          roots.push(el.shadowRoot);
          queue.push(el.shadowRoot);
        }
      }
      return roots;
    }

    function looseContainer(el) {
      let node = el;
      for (let i = 0; i < 5 && node && node.nodeType === 1; i++, node = node.parentElement) {
        const r = node.getBoundingClientRect();
        if (r.width >= 120 && r.width <= MAX_TOOLTIP_W && r.height && r.height <= MAX_TOOLTIP_H) return node;
      }
      return null;
    }

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

    /**
     * Thẻ này có giấu ID SỐ của tài khoản X ở đâu không?
     *
     * Username đổi được, id thì không — mà id không nằm trong chữ hiển thị.
     * Nếu có thì nó nằm ở link (`x.com/i/user/<id>`), ở `data-*`, hoặc ở URL
     * ảnh đại diện. Ghi lại nguyên văn để soi, CHƯA dùng làm khoá vội: đoán
     * sai chỗ lấy id là mọi dòng trong Sheet gắn nhầm người.
     */
    function idTracesIn(el) {
      const out = [];
      try {
        const nodes = [el].concat(Array.from(el.querySelectorAll("a,img,[data-id],[data-uid],[data-user-id]")));
        for (const n of nodes.slice(0, 40)) {
          if (out.length >= 8) break;
          const href = n.getAttribute && n.getAttribute("href");
          if (href) out.push("href=" + href.slice(0, 120));
          const src = n.getAttribute && n.getAttribute("src");
          if (src && /twitter|x\.com|external-res|profile_images/i.test(src)) out.push("src=" + src.slice(0, 120));
          if (n.attributes) {
            for (const a of n.attributes) {
              if (a.name.indexOf("data-") !== 0) continue;
              if (!/^[0-9]{5,25}$/.test(String(a.value).trim())) continue;
              out.push(a.name + "=" + String(a.value).slice(0, 40));
            }
          }
        }
      } catch (e) {
        /* thẻ của người khác — hỏng thì im */
      }
      return out.slice(0, 8);
    }

    /**
     * @param allowUnknown Cho phép trả về NGƯỜI LẠ (chưa có trong Sheet, cũng
     *   không có trong bảng X Tracker). Chỉ đường phím N mới bật cờ này —
     *   viền màu và thẻ tóm tắt vẫn CHỈ dành cho người quen mặt, bật cho cả
     *   người lạ là cả trang GMGN mọc viền.
     */
    function matchHandleIn(node, quiet, allowUnknown) {
      const chunks = textChunks(node);
      if (!chunks.length || chunks.length > MAX_CARD_CHUNKS) return null;

      const el = node.nodeType === 1 ? node : node.parentElement;
      const { standalone, at, plain } = KT.candidateHandles(chunks);

      for (const name of standalone.concat(at, plain)) {
        if (KT.handleKey(name).length < 2) continue;
        const hit = api.identify({ username: name });
        if (hit) {
          if (!quiet) rememberTooltip(el, chunks, name, true);
          return hit;
        }
      }
      // Đọc ra tên mà tra không thấy ai. Trước đây tới đây là bỏ cuộc — và đó
      // chính là chỗ chết của đám avatar trên chart: chúng KHÔNG nằm trong
      // bảng X Tracker, nên identify() không bao giờ trả về gì. Nhưng tên thì
      // đã đọc được rồi, mà "người mình chưa có hồ sơ" lại đúng là người đáng
      // ghi chú nhất.
      //
      // Chỉ nhận mẩu `standalone` (ô handle thật sự của thẻ), KHÔNG nhận
      // `plain` — "Thesis", "13h", "Best Callout" cũng nằm trong đó.
      if (allowUnknown && standalone.length) {
        const name = standalone[0];
        if (KT.handleKey(name).length >= 2) {
          if (!quiet) rememberTooltip(el, chunks, name, true);
          // Giữ lại THỜI ĐIỂM CALL và nội dung post: đó là thứ duy nhất trên
          // thẻ chart sống qua được phép đổi tên, và cũng đúng là thứ khiến
          // người ta soi chart thay vì soi bảng dưới.
          const facts = KT.cardFacts(chunks);
          return {
            caller: {
              username: name,
              postText: facts.postText,
              postedTs: facts.postedTs,
              saiSoMs: facts.saiSoMs,
              tuChart: true,
            },
            person: KT.personFromCaller({ username: name }),
            known: false,
            renamedFrom: "",
          };
        }
      }
      if (standalone.length && !quiet) rememberTooltip(el, chunks, standalone[0], false);
      return null;
    }

    /* ---------- thẻ tóm tắt ---------- */

    function cardHtml(hit) {
      const person = hit.person;
      const caller = hit.caller;
      const bits = [];
      // Ghi chú GẦN NHẤT, in thẳng ra thẻ.
      //
      // Bản trước chỉ ghi "có 1 ghi chú" rồi bắt người dùng đi mở chỗ khác để
      // đọc — trong khi nội dung đã nằm sẵn trong bộ nhớ. Mà đây đúng là câu
      // hỏi lúc hover: "thằng này mình từng nghĩ gì về nó?".
      const note = (person.notes && person.notes[0]) || null;
      // Chỉ còn đếm khi có NHIỀU hơn một: đã in nội dung ra rồi thì dòng
      // "1 ghi chú" chẳng thêm gì.
      if (person.noteCount > 1) bits.push(`${person.noteCount} ghi chú`);
      else if (person.noteCount && !(note && note.note)) bits.push(`${person.noteCount} ghi chú`);
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
        ${KT.render.noteLine(note)}
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
    let recentCards = []; // vài thẻ tooltip gần đây, để chọn cái ĐANG HIỆN
    let poolRoot = null; // chỗ GMGN chứa đám thẻ tooltip — để quét lại lúc bấm N
    let lastHit = null; // vì sao lần hỏi gần nhất ra (hoặc không ra) ai
    let lastScan = null; // lần quét vùng chart gần nhất: bao nhiêu gốc, thấy gì
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
        // Sổ vài thẻ gần nhất: GMGN giữ lại thẻ cũ trong trang nên "thẻ gần
        // nhất mình thấy" chưa chắc là "thẻ đang hiện". Lúc bấm N thì chọn
        // theo cái ĐANG HIỆN, không theo cái mới nhất.
        if (!fromPointer) {
          recentCards = recentCards.filter((c) => c.el !== anchorNode);
          recentCards.unshift({ hit: hit, el: anchorNode, at: Date.now() });
          recentCards = recentCards.slice(0, 6);
        }
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
     * Quét tìm thẻ giới thiệu người ĐANG HIỆN trên màn hình.
     *
     * ⚠ Sổ `recentCards` chỉ chứa thẻ mình BẮT ĐƯỢC LÚC NÓ MỌC RA. Nhưng GMGN
     * dựng sẵn thẻ cho từng mốc rồi chỉ bỏ giấu khi hover — không thêm node,
     * không đổi chữ, nên MutationObserver không thấy gì và thẻ đó không bao
     * giờ vào sổ. Triệu chứng: hover người thứ hai thì N im, chẩn đoán báo
     * "thẻ đã bị xoá N giây trước" trong khi tooltip đang hiện rành rành.
     *
     * Chỉ chạy lúc bấm N nên quét được, và quét trong đúng cái khung chứa đám
     * thẻ đó chứ không phải cả trang.
     */
    /**
     * Quét tìm thẻ giới thiệu người ĐANG HIỆN trên màn hình.
     *
     * ⚠ Sổ `recentCards` chỉ chứa thẻ mình BẮT ĐƯỢC LÚC NÓ MỌC RA. GMGN dựng
     * sẵn thẻ cho từng mốc rồi chỉ bỏ giấu khi hover — không thêm node, không
     * đổi chữ — nên MutationObserver không thấy gì và thẻ đó không vào sổ.
     *
     * ⚠⚠ `nearChart` là bắt buộc khi con trỏ đang trên chart. Bảng "X Tracker"
     * bên phải trang có hàng người TRÔNG HỆT thẻ tooltip: avatar, @handle, x
     * mấy, mấy ngày, nội dung post. Không lọc theo vị trí thì quét trúng ngay
     * một hàng trong đó và trả lời một người chẳng liên quan gì tới chart —
     * đúng cái đã xảy ra suốt: chưa lần nào bắt được thẻ trên chart cả.
     *
     * Duyệt theo ẢNH (vài chục) chứ không theo div (vài nghìn): thẻ giới thiệu
     * người nào cũng có ảnh, mà đo kích thước từng div thì chậm.
     */
    function scanVisibleCard(nearChart, allowUnknown) {
      const chart = nearChart ? chartRect() : null;
      if (nearChart && !chart) return null;

      // Ở vùng chart thì duyệt theo DIV: thẻ chart có thể không chứa thẻ <img>
      // nào (avatar là background-image), nên đi từ ảnh là không bao giờ tới.
      // Vị trí đã lọc gắt rồi nên không sợ vơ nhầm.
      if (chart) {
        const roots = scanRoots();
        lastScan = { goc: roots.length, xet: 0, ungVien: [] };
        let best = null;
        for (const root of roots) {
          for (const el of root.querySelectorAll("div")) {
            if (++lastScan.xet > 8000) break;
            const r = el.getBoundingClientRect();
            if (r.width < 120 || r.width > MAX_TOOLTIP_W) continue;
            if (!r.height || r.height > MAX_TOOLTIP_H) continue;
            if (!overlaps(r, chart, CHART_PAD_PX)) continue;
            if (isOurs(el) || isOurs(el.getRootNode().host || el)) continue;
            if (!isReallyVisible(el)) continue;
            const hit = matchHandleIn(el, true, allowUnknown);
            // ⚠ Chỉ ghi ứng viên CÓ DẤU @ — tức là trông như thẻ nói về một
            // người. Bản trước ghi bừa 5 cái đầu theo thứ tự DOM nên chỗ ghi
            // bị mấy thanh công cụ của GMGN chiếm sạch ("Ví | Theo dõi |
            // Callout"), và thẻ người thật nếu có cũng không bao giờ lọt vào.
            if (!hit && lastScan.ungVien.length < 6) {
              const chunks = textChunks(el);
              const co = chunks.some((c) => c.indexOf("@") >= 0);
              if (co && chunks.length <= MAX_CARD_CHUNKS) {
                const ten = KT.candidateHandles(chunks);
                lastScan.ungVien.push(
                  (chunks.join(" | ").slice(0, 120) || "?") +
                    "  →đọc ra: " +
                    (ten.standalone.concat(ten.at).slice(0, 3).join(", ") || "không ra tên nào")
                );
              }
            }
            if (hit) {
              // ⚠ ĐỪNG lấy cái đầu tiên theo thứ tự DOM. Trong vùng chart còn
              // có thẻ nằm lì (kiểu "Best Callout"), nó đứng trước trong cây
              // nên lần nào cũng thắng — và đó đúng là con bug "bấm N ai cũng
              // ra một người" của mấy bản đầu, chỉ đổi chỗ chứ chưa chết.
              // Lấy thẻ GẦN CON TRỎ nhất; hoà thì lấy thẻ NHỎ hơn (khung trong
              // cùng mới là thẻ thật, mấy khung cha chỉ bọc quanh).
              const d = pointerFresh() ? KT.distToRect(pointer.x, pointer.y, r) : 0;
              const area = r.width * r.height;
              if (!best || d < best.d - 0.5 || (Math.abs(d - best.d) <= 0.5 && area < best.area)) {
                best = { hit: hit, el: el, at: Date.now(), d: d, area: area };
              }
            }
          }
        }
        if (best) {
          lastScan.datId = idTracesIn(best.el);
          lastScan.chon =
            (best.hit.person.username || "?") +
            " (cách con trỏ " + Math.round(best.d) + "px, " + (best.hit.known ? "đã có hồ sơ" : "người lạ") + ")";
        }
        return best;
      }

      for (const img of document.querySelectorAll("img")) {
        const ir = img.getBoundingClientRect();
        if (ir.width < MIN_AVATAR_PX || ir.width > 96) continue;

        // Leo từ ảnh lên cho tới khi gặp khung CÓ @handle. Dừng ở tầng đầu
        // tiên chứa ảnh là dừng ở cụm avatar+tên, chưa với tới chỗ có handle.
        let node = img.parentElement;
        for (let i = 0; i < 6 && node && node.nodeType === 1; i++, node = node.parentElement) {
          const r = node.getBoundingClientRect();
          if (!r.width || !r.height) continue;
          if (r.width > MAX_TOOLTIP_W || r.height > MAX_TOOLTIP_H) break;
          if (chart && !overlaps(r, chart, CHART_PAD_PX)) continue;
          if (!isReallyVisible(node)) continue;
          const hit = matchHandleIn(node, true, allowUnknown);
          if (hit) return { hit: hit, el: node, at: Date.now() };
        }
      }
      return null;
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
      // Chọn thẻ ĐANG HIỆN, không phải thẻ mới nhất mình thấy: GMGN giữ lại
      // thẻ cũ trong trang và chỉ giấu đi, nên "mới nhất" hay trỏ vào người
      // đã hover từ trước.
      const onChart = inChartFrame || overIframe();
      const chart = onChart && !inChartFrame ? chartRect() : null;
      const live = recentCards.filter(
        (c) =>
          c.el &&
          c.el.isConnected &&
          isReallyVisible(c.el) &&
          (!chart || overlaps(c.el.getBoundingClientRect(), chart, CHART_PAD_PX))
      );
      // Không có cái nào trong sổ đang hiện thì QUÉT LẠI màn hình: thẻ đang
      // hiện có thể là thẻ GMGN dựng sẵn rồi bỏ giấu, chưa từng vào sổ.
      // Người lạ chỉ được nhận khi con trỏ đang ở TRÊN CHART: dưới chart là
      // bảng X Tracker, ở đó ai cũng đã nằm trong state.callers rồi, nhận
      // thêm người lạ chỉ có thể là vơ nhầm.
      const found = live[0] || scanVisibleCard(onChart && !inChartFrame, onChart);
      const src = found || (lastPerson && !lastPerson.fromPointer ? lastPerson : null);
      if (!src) return say("chưa đọc được tooltip nào");
      const tuoi = Date.now() - src.at;

      if (found) {
        const r = src.el.getBoundingClientRect();
        // Đọc lại nội dung: tooltip có khi được dùng đi dùng lại cho người khác.
        const use = matchHandleIn(src.el, true, onChart) || src.hit;
        if (onChart) return say("thẻ đang hiện trên chart", Object.assign({}, use, { rect: r }));
        if (nearPointer(r)) return say("thẻ đang hiện (ở cạnh con trỏ)", Object.assign({}, use, { rect: r }));
        return say("thẻ đang hiện nhưng cách con trỏ " + Math.round(KT.distToRect(pointer.x, pointer.y, r)) + "px");
      }

      // Phần tử đã bị GMGN vứt đi. NGƯỜI thì vẫn còn: GMGN chỉ hiện một
      // tooltip tại một thời điểm, nên người đọc được vài giây trước vẫn là
      // người đang nằm dưới con trỏ — rê sang ai khác thì đã có thẻ mới rồi.
      // Cửa sổ này CỐ TÌNH ngắn hơn PERSON_TTL_MS: không đọc lại được nữa thì
      // càng để lâu càng dễ ghi chú vào nhầm hồ sơ.
      if (!onChart) return say("thẻ đã bị xoá, mà con trỏ không ở trên chart");
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
    /** Khung của chart: iframe to nhất trên trang. */
    function chartRect() {
      let best = null;
      for (const f of document.querySelectorAll("iframe")) {
        const r = f.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        if (!best || r.width * r.height > best.width * best.height) best = r;
      }
      return best;
    }

    function overlaps(a, b, pad) {
      return !(a.right < b.left - pad || a.left > b.right + pad || a.bottom < b.top - pad || a.top > b.bottom + pad);
    }

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

      let shown = false;
      for (const node of nodes) {
        if (!node.isConnected) continue;
        const hit = matchHandleIn(node);
        if (!hit) continue;

        const el = node.nodeType === 1 ? node : node.parentElement;
        if (!el) { why("không có phần tử"); continue; }

        // Node vừa đổi có thể chỉ là một mẩu chữ bên trong thẻ. Leo lên tìm
        // KHUNG thẻ thật — có ảnh người (thẻ giới thiệu người của GMGN luôn
        // kèm ảnh, một cục SPA vừa vẽ lại thì không), kích thước còn hợp lý.
        // Bám vào mẩu chữ thì GMGN vẽ lại một nhịp là mất dấu.
        const onChartNow = inChartFrame || overIframe();
        let card = cardContainer(el);
        if (!card && onChartNow) card = looseContainer(el);
        if (!card) { why("không tìm ra khung thẻ có ảnh người"); continue; }

        // GHI SỔ TRƯỚC, quyết định hiện thẻ sau. Hai tooltip có thể mọc trong
        // cùng một nhịp; dừng ở cái đầu tiên là cái thứ hai không bao giờ vào
        // sổ, và lúc bấm N thì "chọn thẻ đang hiện" không có gì để chọn.
        recentCards = recentCards.filter((c) => c.el !== card);
        recentCards.unshift({ hit: hit, el: card, at: Date.now() });
        recentCards = recentCards.slice(0, 6);
        if (card.parentElement) poolRoot = card.parentElement;
        if (shown) continue;

        if (!pointerFresh()) { why("chưa biết con trỏ ở đâu"); continue; }

        // Tooltip vừa mọc ra là NÓI VỀ thứ con trỏ đang chỉ vào. Dưới con trỏ
        // có avatar thì neo thẳng vào avatar đó, kể cả tooltip mọc ở tận đâu.
        const anchorImg = imgUnderPointer();
        if (anchorImg) {
          why("neo vào avatar dưới con trỏ");
          showCard(hit, anchorImg.getBoundingClientRect(), anchorImg, true);
          shown = true;
          continue;
        }
        // Trên chart thì đo khoảng cách là vô nghĩa: GMGN thả tooltip theo chỗ
        // trống của nó, mà avatar dưới con trỏ lại là nét vẽ trên canvas.
        if (inChartFrame) {
          why("trong khung chart");
          showCard(hit, card.getBoundingClientRect(), card, false);
          shown = true;
          continue;
        }
        if (overIframe()) {
          // Bảng X Tracker cũng đầy hàng trông hệt thẻ tooltip. Con trỏ đang
          // trên chart thì thẻ phải nằm ở vùng chart, không thì đó là hàng
          // trong bảng bên cạnh.
          const chart = chartRect();
          const cr = card.getBoundingClientRect();
          if (chart && !overlaps(cr, chart, CHART_PAD_PX)) {
            // Ghi luôn TOẠ ĐỘ hai bên. Nếu thẻ này thật ra là thẻ của chart mà
            // bị loại, thì so hai dãy số là thấy ngay khung chart đo sai chỗ.
            why(
              "thẻ ngoài vùng chart — thẻ [" +
                [cr.left, cr.top, cr.right, cr.bottom].map(Math.round).join(",") +
                "] vs chart [" +
                [chart.left, chart.top, chart.right, chart.bottom].map(Math.round).join(",") +
                "]"
            );
            continue;
          }
          why("con trỏ đang trên chart");
          showCard(hit, cr, card, false);
          shown = true;
          continue;
        }
        // Không hover avatar nào, cũng không ở trên chart (rê trên một cái tên
        // trong danh sách chẳng hạn) thì mới quay về luật cũ: phải ở cạnh.
        const rect = card.getBoundingClientRect();
        if (!nearPointer(rect)) {
          why("tooltip cách con trỏ " + Math.round(KT.distToRect(pointer.x, pointer.y, rect)) + "px");
          continue;
        }
        why("tooltip ở cạnh con trỏ");
        showCard(hit, rect, card, false);
        shown = true;
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
        inChartFrame,
        lastTooltip,
        lastHit,
        lastScan,
        chartArea: (function () {
          const r = chartRect();
          return r ? [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)] : null;
        })(),
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
