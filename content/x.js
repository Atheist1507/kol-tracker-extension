/**
 * KOL Tracker trên X (twitter.com / x.com).
 *
 * Trên GMGN mình đi tìm người giữa một cái chart vẽ bằng canvas. Ở đây ngược
 * lại: trang hồ sơ NÓI THẲNG đang là ai — tay cầm nằm ngay trong URL. Nên
 * phần khó không phải "người này là ai" mà là "gắn cái nút vào đâu cho nó
 * không rụng khi X đổi giao diện".
 *
 * Hai thứ mọc thêm vào trang:
 *   - nút "Ghi chú" cạnh nút Theo dõi
 *   - một dải ngay dưới phần bio: hạng + ghi chú gần nhất của mình về nó
 *
 * ⚠ Luật khi chạm DOM của người khác (giống main-world.js): CHỈ THÊM, không
 * sửa, không xoá gì của X. Mình hỏng thì mình im.
 */
(function () {
  "use strict";
  const KT = globalThis.KT;

  if (globalThis.__KOL_TRACKER_X__) return;
  globalThis.__KOL_TRACKER_X__ = true;

  const BTN_ID = "kol-tracker-x-btn";
  // ⚠ CLASS chứ không phải id: mỗi bài trong feed một cái, mà id thì phải
  // duy nhất trong cả trang. Dùng id là document.getElementById chỉ thấy cái
  // đầu tiên — sai âm thầm, đúng kiểu khó lần ra nhất.
  const PILL_CLASS = "kol-tracker-x-pill";
  const STRIP_ID = "kol-tracker-x-strip";

  const state = { cfg: KT.withDefaults(null), data: null, db: null, handle: null, so: null };
  let noteBox = null;
  let lastAnchors = { nut: null, dai: null };

  /* ---------- dữ liệu ---------- */

  function alive() {
    try {
      return !!(chrome.runtime && chrome.runtime.id);
    } catch (e) {
      return false;
    }
  }

  async function load() {
    const [cfg, data, so] = await Promise.all([KT.getConfig(), KT.getData(), docSo()]);
    state.cfg = cfg;
    state.data = data;
    state.db = data ? KT.buildDb(data.overview, data.detail) : null;
    state.so = so;
  }

  /**
   * Sổ trên chain — do trang GMGN ghi xuống `chrome.storage.local`.
   *
   * Đây là chỗ hai bên thành MỘT công cụ, và đúng chiều làm việc: đọc trên X,
   * muốn biết trên chain. Feed thesis của GMGN biết người này đã call token
   * nào và bỏ vào bao nhiêu tiền thật; X thì không bao giờ nói.
   */
  async function docSo() {
    // ⚠ KHÔNG chặn bằng alive(): đây là một lượt ĐỌC storage, hỏng thì catch
    // lo. Chặn ở đây là trang xem thử (dev/stub.js không có runtime.id) im
    // lặng không có sổ, mà triệu chứng thì giống y như "GMGN chưa ghi gì" —
    // không lần ra được.
    try {
      const got = await chrome.storage.local.get(KT.STORAGE.LEDGER);
      return got[KT.STORAGE.LEDGER] || null;
    } catch (e) {
      return null;
    }
  }

  function soCho(handle) {
    return KT.ledger.lookup(state.so, { username: handle });
  }

  /**
   * Dòng "đã thấy call 6 token · bỏ vào $8.1K · lãi $1.1K".
   *
   * ⚠ Chữ "đã thấy" là phần quan trọng nhất và KHÔNG được bỏ: đây là mấy cú
   * call tình cờ bắt được lúc mở chart, không phải toàn bộ sự nghiệp của nó.
   * Viết thành "đã call 6 token" là nói quá điều mình biết.
   *
   * ⚠ Và mọi con số ở đây là ảnh chụp LÚC XEM CHART, không phải kết cục. Lãi
   * hôm nay có thể là lỗ tuần sau.
   */
  function dongChain(entry) {
    const line = KT.ledger.line(entry);
    if (!line) return "";
    const toks = KT.ledger
      .recentTokens(entry, 3)
      .map((t) => (t.symbol ? "$" + t.symbol : ""))
      .filter(Boolean);
    return (
      `<div class="kt-x-chain">${KT.esc(line)}</div>` +
      (toks.length ? `<div class="kt-x-chain-tok">${KT.esc(toks.join(" · "))}</div>` : "")
    );
  }

  /** Người này đã có hồ sơ chưa? Trên X chỉ có tay cầm để tra. */
  function personFor(handle) {
    if (!state.db || !handle) return null;
    return KT.findPerson(state.db, { username: handle });
  }

  /* ---------- tìm chỗ gắn ---------- */

  /**
   * ⚠ KHÔNG bám vào một selector duy nhất.
   *
   * X đổi giao diện liên tục và class thì sinh tự động, không đọc được. Mỗi
   * chỗ gắn là một THANG: thử lần lượt, dùng cái nào bắt được trước. Và ghi
   * lại bắt bằng nấc nào — hỏng thì biết ngay nấc nào vừa mất, thay vì chỉ
   * thấy "nút không hiện".
   */
  const NEO_NUT = [
    ['[data-testid="placementTracking"]', "khung nút Theo dõi"],
    ['[data-testid="userActions"]', "nút ... trên hồ sơ"],
    ['[data-testid="UserName"]', "khối tên"],
  ];

  const NEO_DAI = [
    ['a[href$="/followers_you_follow"]', "dòng Được theo dõi bởi"],
    ['[data-testid="UserProfileHeader_Items"]', "dòng link/ngày tham gia"],
    ['[data-testid="UserDescription"]', "bio"],
    ['[data-testid="UserName"]', "khối tên"],
  ];

  function timNeo(thang) {
    for (const [sel, ten] of thang) {
      const el = document.querySelector(sel);
      if (el && el.isConnected) return { el, ten, sel };
    }
    return null;
  }

  /* ---------- vẽ ---------- */

  function khungRieng(id) {
    const host = document.createElement("div");
    if (id) host.id = id;
    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = KT.X_CSS;
    shadow.appendChild(style);
    const wrap = document.createElement("div");
    wrap.className = "kt-x";
    shadow.appendChild(wrap);
    return { host, wrap };
  }

  function veNut(person) {
    document.getElementById(BTN_ID)?.remove();
    const neo = timNeo(NEO_NUT);
    lastAnchors.nut = neo ? neo.ten : null;
    if (!neo) return;

    const { host, wrap } = khungRieng(BTN_ID);
    host.style.cssText = "display:inline-flex;align-items:center;margin-right:8px;vertical-align:middle;";
    const soGhiChu = person ? person.noteCount || 0 : 0;
    wrap.innerHTML =
      `<button class="kt-x-btn${person ? " co" : ""}" type="button">` +
      (person ? `${KT.esc(person.tierLetter || "•")} · ${soGhiChu} ghi chú` : "+ Ghi chú") +
      `</button>`;
    wrap.querySelector("button").addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      moHop(ev.currentTarget.getBoundingClientRect());
    });
    // Đứng TRƯỚC nút Theo dõi: chèn vào sau thì nó bị đẩy xuống dòng khi
    // cửa sổ hẹp, và nút Theo dõi vốn nằm sát mép phải.
    neo.el.parentElement ? neo.el.parentElement.insertBefore(host, neo.el) : neo.el.appendChild(host);
  }

  function veDai(person) {
    document.getElementById(STRIP_ID)?.remove();
    const so = soCho(state.handle);
    const chain = dongChain(so);
    // Chưa ghi chú gì NHƯNG đã thấy nó trên chain thì vẫn mọc dải: đó chính
    // là lúc thông tin có giá nhất — đang đọc một người lạ.
    if (!person && !chain) return;
    const neo = timNeo(NEO_DAI);
    lastAnchors.dai = neo ? neo.ten : null;
    if (!neo) return;

    const note = (person && person.notes && person.notes[0]) || null;
    const { host, wrap } = khungRieng(STRIP_ID);
    host.style.cssText = "display:block;margin:8px 0;";
    const mau = person ? KT.tierColor(person.tier) : "#6E7A88";
    wrap.innerHTML =
      `<div class="kt-x-strip" style="border-color:${KT.esc(mau)}">` +
      (person
        ? `<div class="kt-x-head"><b style="color:${KT.esc(mau)}">${KT.esc(person.tierLetter || "chưa xếp hạng")}</b>` +
          (person.noteCount ? ` · ${person.noteCount} ghi chú` : "") +
          (person.redFlags ? ` · <span class="kt-x-flag">⚑ ${KT.esc(person.redFlags)}</span>` : "") +
          `</div>`
        : "") +
      chain +
      (person && person.summary ? `<div class="kt-x-sum">${KT.esc(person.summary)}</div>` : "") +
      (note && note.note
        ? `<div class="kt-x-note">${KT.esc(note.note)}</div>` +
          `<div class="kt-x-meta">${KT.esc(
            [KT.fmtDateTime(note.notedTs || note.notedAt), note.token ? "$" + note.token : "", note.addedBy]
              .filter(Boolean)
              .join(" · ")
          )}</div>`
        : "") +
      `</div>`;

    // Dải nằm DƯỚI chỗ neo. Với "Được theo dõi bởi" thì phải trèo lên khối
    // cha một nấc, vì cái neo là thẻ <a> nằm lọt trong một dòng chữ.
    const sau = neo.sel.indexOf("followers_you_follow") >= 0 ? neo.el.parentElement || neo.el : neo.el;
    sau.parentElement ? sau.parentElement.insertBefore(host, sau.nextSibling) : sau.appendChild(host);
  }


  /* ---------- trong dòng thời gian ---------- */

  const PILL_ID_ATTR = "ktPill"; // dataset trên <article>: đã gắn cho tay cầm nào

  /**
   * ⚠⚠ X TÁI DÙNG LẠI node khi cuộn (virtualized list).
   *
   * Cùng một thẻ <article> lúc trước là bài của A, cuộn một đoạn thành bài của
   * B — mà node thì vẫn nguyên đó. Nên "đã gắn rồi thì bỏ qua" là SAI: nó để
   * lại hạng của A trên bài của B, và đó là kiểu sai tệ nhất ở đây, vì mày sẽ
   * đọc hạng S trên một bài của thằng hạng D mà không có dấu hiệu gì.
   *
   * Cách chữa: nhớ tay cầm ĐÃ GẮN ngay trên node, mỗi lượt quét đọc lại tay
   * cầm thật rồi so. Khác thì vẽ lại.
   */
  function handleOfTweet(article) {
    const khoi = article.querySelector('[data-testid="User-Name"]');
    if (!khoi) return null;
    for (const a of khoi.querySelectorAll('a[href^="/"]')) {
      const h = KT.xPage.handleFromPath(a.getAttribute("href") || "");
      if (h) return h;
    }
    return null;
  }

  /**
   * Gom mấy mẩu chữ của một bài.
   *
   * X không để nội dung bài trong một node: mỗi đoạn một `<span>`, emoji là
   * `<img alt="🔥">`, xuống dòng là `<br>`. `textContent` trần thì mất emoji
   * và dính liền hai dòng lại — mà bài call viết mỗi ý một dòng.
   */
  function chunksOf(el) {
    const out = [];
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    let n = walk.nextNode();
    while (n) {
      if (n.nodeType === 3) out.push(n.nodeValue);
      else if (n.tagName === "IMG") out.push(n.alt || "");
      else if (n.tagName === "BR") out.push("\n");
      else if (n.tagName === "DIV" && n.previousSibling) out.push("\n");
      n = walk.nextNode();
    }
    return out;
  }

  /**
   * Đọc một bài: id, nguyên văn, giờ đăng, link.
   *
   * ⚠ `a[href*="/status/"]` đầu tiên trong một `<article>` là permalink của
   * bài (thẻ bọc cái mốc giờ). Nhưng một bài TRÍCH DẪN bài khác cũng có link
   * dạng đó nằm bên trong — nên phải đi từ thẻ `<time>` ra, vì mỗi bài chỉ có
   * đúng một mốc giờ của CHÍNH nó ở ngoài cùng.
   */
  function docTweet(article) {
    const handle = handleOfTweet(article);
    const timeEl = article.querySelector("time[datetime]");
    const link = (timeEl && timeEl.closest('a[href*="/status/"]')) || article.querySelector('a[href*="/status/"]');
    const id = link ? KT.xPage.statusIdFromHref(link.getAttribute("href") || "") : "";
    const ts = timeEl ? Date.parse(timeEl.getAttribute("datetime") || "") : NaN;
    const textEl = article.querySelector('[data-testid="tweetText"]');
    const text = textEl ? KT.xPage.joinTweetText(chunksOf(textEl)) : "";
    return {
      id,
      handle,
      text,
      postedTs: Number.isFinite(ts) ? ts : null,
      // Link dựng từ tay cầm + id chứ không lấy href thô: href của X có khi
      // kèm `/photo/1`, `/analytics`, và ghi cái đó vào Sheet thì sáu tháng
      // sau bấm vào ra một trang ảnh.
      url: KT.xPage.statusUrl(handle, id),
    };
  }

  const CA_CLASS = "kol-tracker-x-ca";

  /**
   * Bài nào dán contract address thì mọc chip "mở trên GMGN" ngay dưới.
   *
   * Cắt đúng thao tác tay tốn nhất khi research: bôi đen địa chỉ → copy → đổi
   * tab → dán. Ba bước, mỗi ngày mấy chục lần.
   */
  function veCa(article, post) {
    article.querySelector("." + CA_CLASS)?.remove();
    if (!post.text) return;
    const found = KT.ca.findAddresses(post.text).slice(0, 3);
    if (!found.length) return;
    const textEl = article.querySelector('[data-testid="tweetText"]');
    if (!textEl || !textEl.parentElement) return;

    const { host, wrap } = khungRieng(null);
    host.className = CA_CLASS;
    host.style.cssText = "display:block;";
    wrap.innerHTML =
      `<div class="kt-x-ca">` +
      found
        .map((f) => {
          // ⚠ Với 0x thì chain là câu ĐOÁN (eth/base/bsc dùng chung dạng địa
          // chỉ, bài viết không nói chain nào). Nhãn phải nói ra chain nào để
          // người bấm biết là đang đoán — đoán sai thì GMGN mở trang trống,
          // chứ không dẫn sai sang một token khác.
          const nhan = f.chain === "evm" ? "GMGN (đoán: eth)" : "mở trên GMGN";
          return (
            `<a href="${KT.esc(KT.ca.gmgnUrl(f.addr, f.chain))}" target="_blank" rel="noopener noreferrer">` +
            `${KT.esc(nhan)} <code>${KT.esc(KT.ca.shortAddr(f.addr))}</code></a>`
          );
        })
        .join("") +
      `</div>`;
    textEl.parentElement.insertBefore(host, textEl.nextSibling);
  }

  function veTrongFeed(article) {
    const handle = handleOfTweet(article);
    if (!handle) return;
    const post = docTweet(article);
    // ⚠ Khoá nhớ phải gồm cả ID BÀI, không chỉ tay cầm: node tái dùng có thể
    // mang bài khác của CÙNG một người, và lúc đó cái chip contract còn lại là
    // của bài cũ — trỏ sang một token không liên quan gì.
    const dau = handle + "|" + post.id;
    if (article.dataset[PILL_ID_ATTR] === dau && article.querySelector("." + PILL_CLASS)) return;

    article.querySelector("." + PILL_CLASS)?.remove();
    veCa(article, post);
    const khoi = article.querySelector('[data-testid="User-Name"]');
    if (!khoi) return;

    const person = personFor(handle);
    const so = soCho(handle);
    const { host, wrap } = khungRieng(null);
    host.className = PILL_CLASS;
    host.style.cssText = "display:inline-flex;align-items:center;margin-left:6px;vertical-align:middle;";
    // Ba trạng thái, ba màu: đã ghi chú (màu hạng) · chưa ghi chú nhưng đã
    // thấy trên chain (lam) · chưa biết gì (xám). Cái ở giữa mới là cái đáng
    // có: nó nói "thằng này tao đã gặp trên chart" ngay trong dòng thời gian.
    const mau = person ? KT.tierColor(person.tier) : so ? "#58A6FF" : "#6E7A88";
    wrap.innerHTML =
      `<button class="kt-x-pill${person ? " co" : ""}" type="button" style="color:${KT.esc(mau)}" ` +
      `title="${KT.esc(
        (so ? KT.ledger.line(so) + " — " : "") + (post.id ? "ghi chú kèm nguyên văn bài này" : "ghi chú người này")
      )}">` +
      KT.esc(
        person
          ? (person.tierLetter || "•") + (person.noteCount ? " " + person.noteCount : "")
          : so
            ? "◆ " + KT.ledger.totals(so).tokens
            : "+"
      ) +
      `</button>`;

    const btn = wrap.querySelector("button");
    btn.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      // Gắn BÀI, không chỉ gắn người: đọc lại bài ở đây, vì node có thể đã
      // đổi chủ kể từ lúc gắn nút.
      moHopCho(handle, ev.currentTarget.getBoundingClientRect(), docTweet(article));
    });
    btn.addEventListener("pointerenter", () => moThe(handle, btn.getBoundingClientRect()));
    btn.addEventListener("pointerleave", dongThe);

    khoi.appendChild(host);

    // Rê chuột vào AVATAR cũng mở thẻ — đó mới là chỗ mắt người ta nhìn vào
    // đầu tiên trong dòng thời gian, cái pill chỉ là nút bấm.
    const ava = article.querySelector('[data-testid="Tweet-User-Avatar"]');
    if (ava && !ava.dataset.ktHover) {
      ava.dataset.ktHover = "1";
      ava.addEventListener("pointerenter", () => {
        const h = handleOfTweet(article); // đọc LẠI: node có thể đã đổi chủ
        if (h) moThe(h, ava.getBoundingClientRect());
      });
      ava.addEventListener("pointerleave", dongThe);
    }

    article.dataset[PILL_ID_ATTR] = dau;
  }

  function quetFeed() {
    const list = document.querySelectorAll('article[data-testid="tweet"]');
    // Chặn trần: một cú cuộn dài có thể để lại hàng trăm bài trong DOM, mà
    // mình chỉ cần mấy bài đang nhìn thấy.
    let n = 0;
    for (const a of list) {
      if (++n > 60) break;
      try {
        veTrongFeed(a);
      } catch (e) {
        /* một bài hỏng không được làm chết cả feed */
      }
    }
  }

  /* ---------- thẻ nổi khi rê chuột ---------- */

  let theHost = null;
  let theTimer = null;

  function dongThe() {
    clearTimeout(theTimer);
    if (theHost) theHost.style.display = "none";
  }

  function moThe(handle, rect) {
    const person = personFor(handle);
    const so = soCho(handle);
    const chain = dongChain(so);
    // Chưa ghi chú mà đã thấy trên chain thì VẪN mở: đúng lúc đang đọc một
    // người lạ là lúc "nó bỏ vào $200" có giá nhất.
    if (!person && !chain) return;
    clearTimeout(theTimer);
    if (!theHost) {
      const k = khungRieng("kol-tracker-x-card");
      theHost = k.host;
      theHost.__wrap = k.wrap;
      theHost.style.cssText = "position:fixed;z-index:2147483000;display:none;";
      document.body.appendChild(theHost);
    }
    const note = (person && person.notes && person.notes[0]) || null;
    const mau = person ? KT.tierColor(person.tier) : "#58A6FF";
    theHost.__wrap.innerHTML =
      `<div class="kt-x-card">` +
      `<div class="kt-x-head"><b style="color:${KT.esc(mau)}">${KT.esc(
        person ? person.tierLetter || "chưa xếp hạng" : "chưa ghi chú"
      )}</b>` +
      (person && person.noteCount ? ` · ${person.noteCount} ghi chú` : "") +
      (person && person.redFlags ? ` · <span class="kt-x-flag">⚑ ${KT.esc(person.redFlags)}</span>` : "") +
      `</div>` +
      chain +
      (person && person.summary ? `<div class="kt-x-sum">${KT.esc(person.summary)}</div>` : "") +
      (note && note.note
        ? `<div class="kt-x-note">${KT.esc(note.note)}</div>` +
          `<div class="kt-x-meta">${KT.esc(
            [KT.fmtDateTime(note.notedTs || note.notedAt), note.token ? "$" + note.token : "", note.addedBy]
              .filter(Boolean)
              .join(" · ")
          )}</div>`
        : `<div class="kt-x-meta">Chưa ghi chú gì — bấm để ghi.</div>`) +
      `</div>`;
    theHost.style.display = "block";
    // Đặt DƯỚI cái pill, kéo vào trong màn nếu tràn mép phải.
    const w = 260;
    let left = Math.min(rect.left, window.innerWidth - w - 8);
    theHost.style.left = Math.max(8, left) + "px";
    theHost.style.top = Math.min(rect.bottom + 6, window.innerHeight - 40) + "px";
  }

  function moHopCho(handle, rect, post) {
    if (!noteBox) return;
    const person = personFor(handle);
    const so = soCho(handle);
    dongThe();
    noteBox.open({
      caller: {
        username: handle,
        twitterUrl: "https://x.com/" + handle,
        // Có id số thì khoá trong Sheet dùng id, không dùng tên — tên đổi là
        // dòng cũ thành mồ côi, im lặng không triệu chứng.
        xId: (so && so.xId) || "",
      },
      person: person || KT.personFromCaller({ username: handle }),
      renamedFrom: "",
      token: "",
      tokenAddress: "",
      chain: "",
      post: post && (post.id || post.text) ? post : null,
      rect,
    });
  }

  /* ---------- hộp ghi chú ---------- */

  const api = {
    getState: () => state,
    saveNote: (payload) =>
      alive()
        ? chrome.runtime.sendMessage({ type: KT.MSG.SAVE_NOTE, payload })
        : Promise.resolve({ ok: false, error: "Extension vừa cập nhật — bấm F5 lại trang này." }),
    onSaved: async (res) => {
      if (!res || !res.ok) return;
      await load();
      veTatCa();
    },
  };

  function moHop(rect) {
    const handle = state.handle;
    if (!handle || !noteBox) return;
    const person = personFor(handle);
    noteBox.open({
      // Không có ví, không có token: đây là ghi chú về NGƯỜI, không gắn với
      // một cú call nào. note-box tự ẩn phần "call ở đoạn nào của sóng".
      caller: {
        username: handle,
        displayName: tenHienThi(),
        avatar: anhDaiDien(),
        twitterUrl: "https://x.com/" + handle,
        xId: (soCho(handle) && soCho(handle).xId) || "",
      },
      person: person || KT.personFromCaller({ username: handle }),
      renamedFrom: "",
      token: "",
      tokenAddress: "",
      chain: "",
      rect,
    });
  }

  function tenHienThi() {
    const el = document.querySelector('[data-testid="UserName"]');
    const chunk = el ? String(el.textContent || "").split("@")[0].trim() : "";
    return chunk.slice(0, 60);
  }

  function anhDaiDien() {
    const img = document.querySelector('a[href$="/photo"] img, [data-testid^="UserAvatar"] img');
    return img ? KT.safeUrl(img.currentSrc || img.src) : "";
  }

  /* ---------- vòng đời ---------- */

  function ve() {
    const handle = KT.xPage.handleFromPath(location.pathname);
    state.handle = handle;
    if (!handle) {
      document.getElementById(BTN_ID)?.remove();
      document.getElementById(STRIP_ID)?.remove();
      return; // vẫn quét feed: trang chủ không có hồ sơ nhưng đầy bài viết
    }
    const person = personFor(handle);
    veNut(person);
    veDai(person);
  }

  function veTatCa() {
    ve();
    quetFeed();
  }

  /**
   * X là SPA: bấm sang hồ sơ khác thì KHÔNG tải lại trang, và khối tên bị vẽ
   * lại lúc nào không biết. Nên vừa nghe đổi URL, vừa nghe DOM đổi.
   *
   * ⚠ MutationObserver phải tự chặn vòng lặp: chính mình chèn node vào DOM,
   * nên callback sẽ gọi lại mình. Chỉ vẽ lại khi nút THẬT SỰ không còn trên
   * trang, và hãm bằng một nhịp chờ.
   */
  function theoDoiTrang() {
    let timer = null;
    const hen = () => {
      clearTimeout(timer);
      timer = setTimeout(veTatCa, 250);
    };

    let urlCu = location.href;
    const doiUrl = () => {
      if (location.href === urlCu) return;
      urlCu = location.href;
      hen();
    };
    for (const ten of ["pushState", "replaceState"]) {
      const goc = history[ten];
      history[ten] = function () {
        const r = goc.apply(this, arguments);
        doiUrl();
        return r;
      };
    }
    window.addEventListener("popstate", doiUrl);

    new MutationObserver(() => {
      doiUrl();
      // Feed đổi liên tục lúc cuộn, nên lúc nào cũng phải hẹn quét lại;
      // `veTrongFeed` tự bỏ qua bài đã gắn đúng người nên không tốn gì.
      hen();
    }).observe(document.body, { childList: true, subtree: true });
  }

  (async function init() {
    await load();
    noteBox = KT.createNoteBox(api);
    noteBox.mount();
    veTatCa();
    theoDoiTrang();

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      // Sổ trên chain cũng nằm ở đây: mở chart GMGN ở tab khác là sổ dày lên,
      // và tab X đang mở phải thấy ngay chứ không đợi F5.
      if (changes[KT.STORAGE.DATA] || changes[KT.STORAGE.LEDGER]) load().then(veTatCa);
    });

    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (!msg || msg.type !== KT.MSG.DIAGNOSE) return;
      sendResponse({
        trang: "x.com",
        url: location.href.slice(0, 120),
        version: (chrome.runtime.getManifest && chrome.runtime.getManifest().version) || "?",
        handle: state.handle,
        coHoSo: !!personFor(state.handle),
        sheetPeople: state.db ? state.db.counts.people : 0,
        neoNut: lastAnchors.nut,
        neoDai: lastAnchors.dai,
        nutDangCo: !!document.getElementById(BTN_ID),
        baiTrongFeed: document.querySelectorAll('article[data-testid="tweet"]').length,
        baiDaGan: document.querySelectorAll("article[data-kt-pill]").length,
        chipContract: document.querySelectorAll("." + CA_CLASS).length,
        soTrenChain: state.so && state.so.people ? Object.keys(state.so.people).length : 0,
        coTrenChain: !!soCho(state.handle),
        baiDocDuoc: (function () {
          // Đọc thử bài đầu tiên: "gắn được bài" là thứ dễ hỏng câm nhất khi X
          // đổi giao diện — nút vẫn mọc, vẫn lưu được, chỉ là lưu rỗng.
          const a = document.querySelector('article[data-testid="tweet"]');
          if (!a) return null;
          const t = docTweet(a);
          return { id: t.id, chuChu: t.text.length, gio: !!t.postedTs, link: t.url.slice(0, 60) };
        })(),
      });
    });
  })();
})();
