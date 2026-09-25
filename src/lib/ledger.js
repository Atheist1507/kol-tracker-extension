/**
 * Sổ trên chain — thứ nối GMGN với X.
 *
 * Feed `fomo/thesis` của GMGN nói ba điều mà X không bao giờ nói: người này
 * đã call những token nào, bỏ vào bao nhiêu tiền thật, và đang lãi lỗ bao
 * nhiêu. Nhưng nó chỉ sống trong đúng cái tab chart đang mở: sang X là mất
 * sạch. Nên phải ghi xuống.
 *
 * Giá trị của nó nằm ở một câu: "thằng viết luận điểm hay nhất mà bỏ đúng
 * $200" thì cái luận điểm đó nghĩa khác hẳn. Câu đó chỉ đọc được khi đang ở
 * trên X, đúng lúc đang đọc bài của nó.
 *
 * ⚠⚠ Đây là SỐ GMGN ĐƯA, không phải tao diễn giải. Không xếp hạng, không gắn
 * nhãn tốt/xấu, không tính "win rate". Đã trả giá một lần cho cái nhãn
 * "còn giữ" đúng với 200/200 người: một con số máy gán sai thì người ta vẫn
 * tin, vì nó trông như đã kiểm chứng.
 *
 * ⚠ Mốc thời gian nào cũng là "lúc tao XEM chart", không phải kết cục cuối
 * cùng của cú call. Lãi $1.1K hôm nay có thể là lỗ tuần sau. Chỗ gọi phải nói
 * rõ là "đã thấy", đừng viết thành "kết quả".
 */
(function (root) {
  "use strict";
  const KT = (root.KT = root.KT || {});

  /**
   * Trần để sổ không phình ra vô hạn trong `chrome.storage.local`. Vượt trần
   * thì bỏ người LÂU KHÔNG GẶP nhất — người mới gặp mới là người đang research.
   */
  const MAX_PEOPLE = 300;
  const MAX_TOKENS = 20;

  function empty() {
    return { people: {}, byHandle: {}, updatedAt: 0 };
  }

  /**
   * Khoá một người trong sổ.
   *
   * ID SỐ trước, tên sau — và đó là cả điểm mấu chốt: tên đổi lúc nào cũng
   * được, đổi xong là cả phần lịch sử cũ thành mồ côi mà không có triệu chứng
   * nào. `author_id` của GMGN thì chưa chứng minh được là bất biến qua một lần
   * đổi tên (đo được: ổn định giữa các lần gọi, 80/80 không lệch), nên nó là
   * khoá TỐT HƠN tên, không phải khoá hoàn hảo.
   */
  function keyFor(p) {
    const xId = String((p && (p.xId || p.authorId)) || "").trim();
    if (xId) return "x:" + xId;
    const h = KT.handleKey((p && p.username) || (p && p.handle) || "");
    return h ? "h:" + h : "";
  }

  function num(v) {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  /** Bỏ token cũ nhất khi một người vượt trần. */
  function trimTokens(tokens) {
    const keys = Object.keys(tokens);
    if (keys.length <= MAX_TOKENS) return tokens;
    keys.sort((a, b) => (tokens[b].ts || 0) - (tokens[a].ts || 0));
    const out = {};
    for (const k of keys.slice(0, MAX_TOKENS)) out[k] = tokens[k];
    return out;
  }

  function trimPeople(people) {
    const keys = Object.keys(people);
    if (keys.length <= MAX_PEOPLE) return people;
    keys.sort((a, b) => (people[b].seenAt || 0) - (people[a].seenAt || 0));
    const out = {};
    for (const k of keys.slice(0, MAX_PEOPLE)) out[k] = people[k];
    return out;
  }

  /**
   * Nhập một lượt feed thesis vào sổ.
   *
   * ⚠ Phải CỘNG ĐƯỢC NHIỀU LẦN mà không nhân đôi: mỗi lần mở lại đúng cái
   * chart đó là feed về lại y nguyên. Nên sổ lưu THEO TỪNG TOKEN rồi ghi đè
   * dòng của token đó, chứ không cộng dồn vào một con số tổng. Cộng dồn thì
   * F5 ba lần là "bỏ vào" gấp ba, và không ai nhìn ra được.
   */
  function mergeThesis(ledger, list, now) {
    const base = ledger && ledger.people ? ledger : empty();
    if (!Array.isArray(list) || !list.length) return base;
    const at = now || Date.now();

    const people = Object.assign({}, base.people);

    for (const p of list) {
      if (!p) continue;
      const key = keyFor(p);
      if (!key) continue;
      const addr = String(p.tokenAddress || "").trim();

      let entry = people[key];

      // Lần trước chỉ biết tên, lần này biết id → gộp phần cũ vào khoá mới
      // rồi bỏ khoá cũ. Không gộp thì một người thành hai dòng, mỗi dòng kể
      // một nửa câu chuyện.
      if (key.indexOf("x:") === 0) {
        const hKey = KT.handleKey(p.username || "");
        const old = hKey ? people["h:" + hKey] : null;
        if (old) {
          entry = Object.assign({}, old, entry || {});
          entry.tokens = Object.assign({}, old.tokens || {}, (entry && entry.tokens) || {});
          delete people["h:" + hKey];
        }
      }

      entry = entry
        ? Object.assign({}, entry, { tokens: Object.assign({}, entry.tokens || {}) })
        : { tokens: {} };

      entry.key = key;
      entry.xId = String(p.xId || entry.xId || "");
      entry.authorId = String(p.authorId || entry.authorId || "");
      // Tên HIỆN TẠI theo GMGN. Ghi đè chứ không giữ tên cũ: cái mình cần ở
      // đây là "bây giờ nó tên gì", còn lịch sử đổi tên đã có `findRenames`.
      if (p.username) entry.handle = p.username;
      if (p.displayName) entry.displayName = p.displayName;
      if (p.avatar) entry.avatar = p.avatar;
      entry.seenAt = at;

      if (addr) {
        entry.tokens[addr] = {
          symbol: String(p.tokenSymbol || "").trim(),
          chain: String(p.chain || "").trim(),
          tradeUsd: num(p.tradeUsd),
          pnlUsd: num(p.pnlUsd),
          holdingUsd: num(p.holdingUsd),
          // Mốc CALL, không phải mốc mình xem — cái sau nằm ở `seenAt`.
          ts: p.postedTs || 0,
          postId: String(p.postId || ""),
        };
        entry.tokens = trimTokens(entry.tokens);
      }

      people[key] = entry;
    }

    const kept = trimPeople(people);

    // Chỉ mục tên → khoá, dựng lại từ đầu mỗi lượt: tên đổi thì chỉ mục cũ
    // phải chết theo, chứ đừng để hai tên cùng trỏ vào một người.
    const byHandle = {};
    for (const k of Object.keys(kept)) {
      const h = KT.handleKey(kept[k].handle || "");
      if (h) byHandle[h] = k;
    }

    return { people: kept, byHandle: byHandle, updatedAt: at };
  }

  /** Tra một người từ phía X: có id thì tra id, không thì tra tên. */
  function lookup(ledger, ref) {
    if (!ledger || !ledger.people || !ref) return null;
    const xId = String(ref.xId || "").trim();
    if (xId && ledger.people["x:" + xId]) return ledger.people["x:" + xId];
    const h = KT.handleKey(ref.username || ref.handle || "");
    if (!h) return null;
    const key = (ledger.byHandle || {})[h];
    if (key && ledger.people[key]) return ledger.people[key];
    return ledger.people["h:" + h] || null;
  }

  /**
   * Gộp mấy con số của một người thành thứ đọc được.
   *
   * `tradeUsd`/`pnlUsd` có thể null ở từng token (GMGN không trả). Cộng thì
   * phải đếm xem có token nào CÓ số hay không: cộng một đống null ra 0, mà 0
   * ở đây nghĩa là "bỏ vào 0 đồng" — sai hẳn nghĩa.
   */
  function totals(entry) {
    const tokens = (entry && entry.tokens) || {};
    const keys = Object.keys(tokens);
    let trade = 0;
    let pnl = 0;
    let coTrade = false;
    let coPnl = false;
    let lastTs = 0;
    for (const k of keys) {
      const t = tokens[k] || {};
      if (t.tradeUsd != null) {
        trade += t.tradeUsd;
        coTrade = true;
      }
      if (t.pnlUsd != null) {
        pnl += t.pnlUsd;
        coPnl = true;
      }
      if (t.ts && t.ts > lastTs) lastTs = t.ts;
    }
    return {
      tokens: keys.length,
      tradeUsd: coTrade ? trade : null,
      pnlUsd: coPnl ? pnl : null,
      lastTs: lastTs,
      seenAt: (entry && entry.seenAt) || 0,
    };
  }

  /**
   * "đã thấy call 6 token · bỏ vào $8.1K · lãi $1.1K"
   *
   * "ĐÃ THẤY" là phần quan trọng nhất của câu: đây là những cú call mình tình
   * cờ mở chart lúc nó còn trên feed, không phải toàn bộ sự nghiệp của nó.
   */
  function line(entry) {
    const t = totals(entry);
    if (!t.tokens) return "";
    const usd = KT.fmtUsd || ((v) => "$" + v);
    const bits = ["đã thấy call " + t.tokens + " token"];
    if (t.tradeUsd != null) bits.push("bỏ vào " + usd(t.tradeUsd));
    if (t.pnlUsd != null) bits.push((t.pnlUsd < 0 ? "lỗ " : "lãi ") + usd(Math.abs(t.pnlUsd)));
    return bits.join(" · ");
  }

  /** Token gần nhất, để chỗ gọi khoe được một cái tên cụ thể. */
  function recentTokens(entry, limit) {
    const tokens = (entry && entry.tokens) || {};
    return Object.keys(tokens)
      .map((addr) => Object.assign({ addr: addr }, tokens[addr]))
      .sort((a, b) => (b.ts || 0) - (a.ts || 0))
      .slice(0, limit || 3);
  }

  KT.ledger = { empty, keyFor, mergeThesis, lookup, totals, line, recentTokens, MAX_PEOPLE, MAX_TOKENS };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = KT.ledger;
  }
})(typeof globalThis !== "undefined" ? globalThis : self);
