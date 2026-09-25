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

  const state = { cfg: KT.withDefaults(null), data: null, db: null, handle: null };
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
    const [cfg, data] = await Promise.all([KT.getConfig(), KT.getData()]);
    state.cfg = cfg;
    state.data = data;
    state.db = data ? KT.buildDb(data.overview, data.detail) : null;
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

  /**
   * Dòng số liệu của sổ tự ghi trên trang hồ sơ.
   *
   * ⚠ Có CACHE 60s: `ve()` chạy lại mỗi lần DOM của X đổi (vài lần một giây
   * lúc trang đang tải), không có cache là mỗi lần đó một lời hỏi service
   * worker.
   */
  const soCache = new Map(); // handle → { parts, at }
  const soDangHoi = new Set();

  function soCuaNguoi(handle) {
    if (!state.cfg.ledgerEnabled || !state.cfg.showLedgerOnX || !handle) return null;
    const key = handle.toLowerCase();
    const hit = soCache.get(key);
    if (hit && Date.now() - hit.at < 60000) return hit.parts;
    if (!soDangHoi.has(key) && alive()) {
      soDangHoi.add(key);
      chrome.runtime
        .sendMessage({ type: KT.MSG.LEDGER_PERSON, handle })
        .then((res) => {
          soCache.set(key, { parts: (res && res.parts) || [], at: Date.now() });
          // Về muộn: chỉ vẽ nếu vẫn đang ở ĐÚNG hồ sơ đó.
          if (state.handle && state.handle.toLowerCase() === key) veDai(personFor(state.handle));
        })
        .catch(() => {})
        .finally(() => soDangHoi.delete(key));
    }
    return hit ? hit.parts : null;
  }

  function soHtml(parts) {
    if (!parts || !parts.length) return "";
    return (
      `<div class="kt-x-ledger" title="Extension tự ghi mọi cú call nó thấy. 'Ghi trước' = thấy khi kèo chưa chạy. Mới là số liệu, chưa phải kết luận.">` +
      `<b>Sổ tự ghi:</b> ${KT.esc(parts.join(" · "))}</div>`
    );
  }

  function veDai(person) {
    document.getElementById(STRIP_ID)?.remove();
    const so = soCuaNguoi(state.handle);
    // Chưa có hồ sơ VÀ sổ chưa thấy gì thì không mọc dải rỗng ra làm gì.
    if (!person && !(so && so.length)) return;
    const neo = timNeo(NEO_DAI);
    lastAnchors.dai = neo ? neo.ten : null;
    if (!neo) return;

    const { host, wrap } = khungRieng(STRIP_ID);
    host.style.cssText = "display:block;margin:8px 0;";
    if (!person) {
      // Người lạ mà sổ đã thấy call: chỉ dòng số liệu, không giả vờ có hạng.
      wrap.innerHTML = `<div class="kt-x-strip">${soHtml(so)}</div>`;
    } else {
      const note = (person.notes && person.notes[0]) || null;
      const mau = KT.tierColor(person.tier);
      wrap.innerHTML =
        `<div class="kt-x-strip" style="border-color:${KT.esc(mau)}">` +
        `<div class="kt-x-head"><b style="color:${KT.esc(mau)}">${KT.esc(person.tierLetter || "chưa xếp hạng")}</b>` +
        (person.noteCount ? ` · ${person.noteCount} ghi chú` : "") +
        (person.redFlags ? ` · <span class="kt-x-flag">⚑ ${KT.esc(person.redFlags)}</span>` : "") +
        `</div>` +
        (person.summary ? `<div class="kt-x-sum">${KT.esc(person.summary)}</div>` : "") +
        (note && note.note
          ? `<div class="kt-x-note">${KT.esc(note.note)}</div>` +
            `<div class="kt-x-meta">${KT.esc(
              [KT.fmtDateTime(note.notedTs || note.notedAt), note.token ? "$" + note.token : "", note.addedBy]
                .filter(Boolean)
                .join(" · ")
            )}</div>`
          : "") +
        soHtml(so) +
        `</div>`;
    }

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
   * Vùng BÀI ĐƯỢC TRÍCH DẪN (quote tweet) bên trong một bài.
   *
   * ⚠⚠ Quote tweet có HAI khối tên, HAI mốc giờ, HAI khối chữ. Đọc
   * `querySelector('[data-testid="tweetText"]')` trần trên một bài quote
   * không có chữ là lấy nhầm chữ của bài BỊ trích — tức là ghi cú call của
   * người khác vào sổ của người đang quote. Sai kiểu đó làm sai uy tín của
   * CẢ HAI người mà không để lại dấu vết.
   *
   * Cách tìm: mỗi khối tên thứ 2 trở đi, leo lên tới tầng cao nhất vẫn CHƯA
   * chứa khối tên đầu tiên — đó là khung của bài bị trích.
   */
  function vungTrich(article) {
    const names = article.querySelectorAll('[data-testid="User-Name"]');
    const out = [];
    for (let i = 1; i < names.length; i++) {
      let node = names[i];
      while (node.parentElement && node.parentElement !== article && !node.parentElement.contains(names[0])) {
        node = node.parentElement;
      }
      out.push(node);
    }
    return out;
  }

  /**
   * Đọc MỘT bài: ai viết, id, lúc nào, chữ — bỏ phần bài được trích dẫn.
   * Thiếu id hoặc giờ thì trả null: cú call không có mốc thời gian thì không
   * chấm điểm được, mà không có id thì không kiểm xoá bài được.
   */
  function readTweet(article) {
    const handle = handleOfTweet(article);
    if (!handle) return null;
    const trich = vungTrich(article);
    const ngoai = (el) => !trich.some((r) => r.contains(el));

    let tweetId = "";
    let calledAt = null;
    for (const t of article.querySelectorAll("a[href*='/status/'] time")) {
      if (!ngoai(t)) continue;
      const a = t.closest("a");
      const m = String((a && a.getAttribute("href")) || "").match(/^\/([A-Za-z0-9_]{1,15})\/status\/(\d{5,25})/);
      // Link bài phải mang ĐÚNG tay cầm của người viết — lệch là cấu trúc lạ
      // (bài bị trích lọt qua), thà bỏ còn hơn gán nhầm chủ.
      if (!m || m[1].toLowerCase() !== handle.toLowerCase()) continue;
      tweetId = m[2];
      calledAt = Date.parse(t.getAttribute("datetime") || "");
      break;
    }
    if (!tweetId || !Number.isFinite(calledAt)) return null;

    const text = Array.from(article.querySelectorAll('[data-testid="tweetText"]'))
      .filter(ngoai)
      .map((el) => el.innerText || el.textContent || "")
      .join("\n");
    return { handle, tweetId, calledAt, text };
  }

  /* ---------- sổ tự ghi ---------- */

  const daGhi = new Set(); // tweetId đã gửi sang sổ trong lượt mở trang này
  let hangCho = [];
  let henGui = null;

  function ghiSo(tw, contracts) {
    if (!state.cfg.ledgerEnabled || !alive() || daGhi.has(tw.tweetId)) return;
    daGhi.add(tw.tweetId);
    const tags = KT.ledger.cashtags(tw.text);
    const seenAt = Date.now();
    for (const c of contracts) {
      hangCho.push({
        id: "x:" + tw.tweetId + ":" + c.tokenKey,
        source: "x",
        handle: tw.handle,
        tokenKey: c.tokenKey,
        chain: c.chain,
        // Một cashtag thì mới dám gắn nó với CA; nhiều cashtag thì không biết
        // cái nào đi với cái nào — để trống còn hơn gắn nhầm tên.
        tokenSymbol: tags.length === 1 ? tags[0] : "",
        calledAt: tw.calledAt,
        multiple: null,
        tweetId: tw.tweetId,
        text: tw.text,
        seenAt,
      });
    }
    clearTimeout(henGui);
    henGui = setTimeout(() => {
      const lo = hangCho;
      hangCho = [];
      if (lo.length) chrome.runtime.sendMessage({ type: KT.MSG.LEDGER_ADD, calls: lo }).catch(() => {});
    }, 800);
  }

  const SEARCH_SVG =
    '<svg width="11" height="11" viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.6" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M10.5 10.5 14 14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';

  /**
   * Mở tìm kiếm "người này có nói về chuyện này trước khi token ra đời không".
   * Hỏi sổ xem có mốc token ra đời không (chỉ có khi token đó từng được mở
   * trên GMGN); không có thì cắt ở ngày của cú call.
   */
  async function timNarrative(tw, contracts) {
    const tags = KT.ledger.cashtags(tw.text);
    let createdAt = null;
    try {
      if (alive() && contracts[0]) {
        const t = await chrome.runtime.sendMessage({ type: KT.MSG.LEDGER_TOKEN_GET, tokenKey: contracts[0].tokenKey });
        if (t && t.createdAt) createdAt = t.createdAt;
      }
    } catch (e) {
      /* không có mốc token thì dùng mốc cú call */
    }
    const url = KT.xPage.narrativeSearchUrl({
      handle: tw.handle,
      keyword: tags[0] || "",
      createdAt,
      calledAt: tw.calledAt,
    });
    if (url) window.open(url, "_blank", "noopener");
  }

  function veTrongFeed(article) {
    const handle = handleOfTweet(article);
    if (!handle) return;
    const tw = readTweet(article);
    const contracts = tw ? KT.ledger.extractContracts(tw.text) : [];
    if (tw && contracts.length) ghiSo(tw, contracts);

    const coNutTim = !!(tw && contracts.length && state.cfg.xNarrativeBtn);
    // Khoá vẽ gồm cả id bài: X tái dùng node khi cuộn, và nút tìm kiếm gắn
    // với MỘT bài cụ thể — cùng người mà khác bài thì phải vẽ lại.
    const khoaVe = handle + "|" + (coNutTim ? tw.tweetId : "");
    const daGan = article.dataset[PILL_ID_ATTR];
    if (daGan === khoaVe && article.querySelector("." + PILL_CLASS)) return;

    article.querySelector("." + PILL_CLASS)?.remove();
    const khoi = article.querySelector('[data-testid="User-Name"]');
    if (!khoi) return;

    const person = personFor(handle);
    const { host, wrap } = khungRieng(null);
    host.className = PILL_CLASS;
    host.style.cssText = "display:inline-flex;align-items:center;margin-left:6px;vertical-align:middle;";
    const mau = person ? KT.tierColor(person.tier) : "#6E7A88";
    wrap.innerHTML =
      `<button class="kt-x-pill${person ? " co" : ""}" type="button" style="color:${KT.esc(mau)}" ` +
      `title="${KT.esc(person ? "Xem ghi chú · bấm để ghi thêm" : "Ghi chú người này")}">` +
      KT.esc(person ? (person.tierLetter || "•") + (person.noteCount ? " " + person.noteCount : "") : "+") +
      `</button>`;

    const btn = wrap.querySelector("button");
    btn.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      moHopCho(handle, ev.currentTarget.getBoundingClientRect());
    });
    btn.addEventListener("pointerenter", () => moThe(handle, btn.getBoundingClientRect()));
    btn.addEventListener("pointerleave", dongThe);

    if (coNutTim) {
      const tim = document.createElement("button");
      tim.type = "button";
      tim.className = "kt-x-search";
      tim.title = "Người này có nói về chuyện này TRƯỚC khi token ra đời không? (mở tìm kiếm X)";
      tim.setAttribute("aria-label", tim.title);
      tim.innerHTML = SEARCH_SVG;
      tim.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        // Đọc LẠI bài lúc bấm: node có thể đã đổi sang bài khác khi cuộn.
        const now = readTweet(article);
        const ca = now ? KT.ledger.extractContracts(now.text) : [];
        if (now && ca.length) timNarrative(now, ca);
      });
      wrap.appendChild(tim);
    }

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

    article.dataset[PILL_ID_ATTR] = khoaVe;
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
    if (!person) return; // chưa có hồ sơ thì không có gì để khoe
    clearTimeout(theTimer);
    if (!theHost) {
      const k = khungRieng("kol-tracker-x-card");
      theHost = k.host;
      theHost.__wrap = k.wrap;
      theHost.style.cssText = "position:fixed;z-index:2147483000;display:none;";
      document.body.appendChild(theHost);
    }
    const note = (person.notes && person.notes[0]) || null;
    const mau = KT.tierColor(person.tier);
    theHost.__wrap.innerHTML =
      `<div class="kt-x-card">` +
      `<div class="kt-x-head"><b style="color:${KT.esc(mau)}">${KT.esc(person.tierLetter || "chưa xếp hạng")}</b>` +
      (person.noteCount ? ` · ${person.noteCount} ghi chú` : "") +
      (person.redFlags ? ` · <span class="kt-x-flag">⚑ ${KT.esc(person.redFlags)}</span>` : "") +
      `</div>` +
      (person.summary ? `<div class="kt-x-sum">${KT.esc(person.summary)}</div>` : "") +
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

  function moHopCho(handle, rect) {
    if (!noteBox) return;
    const person = personFor(handle);
    dongThe();
    noteBox.open({
      caller: { username: handle, twitterUrl: "https://x.com/" + handle },
      person: person || KT.personFromCaller({ username: handle }),
      renamedFrom: "",
      token: "",
      tokenAddress: "",
      chain: "",
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
      caller: { username: handle, displayName: tenHienThi(), avatar: anhDaiDien(), twitterUrl: "https://x.com/" + handle },
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
      if (area === "local" && changes[KT.STORAGE.DATA]) load().then(veTatCa);
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
        // Sổ tự ghi: bao nhiêu tweet có CA đã gửi sang sổ trong lượt mở trang này
        soTweetDaGhi: daGhi.size,
      });
    });
  })();
})();
