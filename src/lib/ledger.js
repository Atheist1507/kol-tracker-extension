/**
 * SỔ CÁI CÚ CALL — logic thuần.
 *
 * Extension tự ghi lại MỌI cú call nó nhìn thấy (feed thesis trên chart GMGN,
 * bảng X Tracker, tweet có CA trên X), không đợi người dùng bấm N. Phần lưu
 * trữ (IndexedDB) nằm ở service worker; file này chỉ lo phần dễ sai: một cú
 * call có được TÍNH ĐIỂM không, gộp hai lần nhìn thấy làm một thế nào, và
 * tóm một người thành mấy con số.
 *
 * ⚠⚠ Phần này quyết định UY TÍN của một người. Nguyên tắc chung cho mọi hàm:
 *   - Không biết thì nói "không biết", KHÔNG quy về 0 hay về "tốt".
 *   - Khi phải chọn giữa hai cách sai, chọn cách sai làm kẻ gian trông TỆ
 *     HƠN chứ đừng làm nó trông tốt hơn.
 *   - Mọi ngưỡng khai ở một chỗ (LEDGER), có lý do đi kèm.
 */
(function (root) {
  "use strict";
  const KT = (root.KT = root.KT || {});

  const MIN = 60 * 1000;
  const HOUR = 60 * MIN;
  const DAY = 24 * HOUR;

  const LEDGER = {
    /**
     * "Ghi trước" = mình nhìn thấy cú call TRƯỚC khi biết kết quả.
     *
     * Vì sao cần: người ta mở chart của coin ĐÃ PUMP, lướt thấy bài của kèo
     * ĐANG HOT. Chấm điểm bằng những gì nhìn thấy như thế thì ai trên chart
     * cũng giỏi — và thằng spam-rồi-xoá thì còn giỏi hơn, vì bài thua của nó
     * đã biến mất trước khi mình kịp thấy.
     *
     * Luật phân loại dựa trên THỜI ĐIỂM MÌNH THẤY, không dựa trên kết quả —
     * dựa trên kết quả là tự đưa bias vào lại.
     */
    WINDOW_KNOWN_MS: 2 * HOUR, // biết hệ số x lúc thấy: tối đa 2 giờ sau call
    MAX_MULTIPLE: 1.5, // ...và lúc thấy kèo chưa chạy quá 1.5x
    WINDOW_UNKNOWN_MS: 30 * MIN, // không biết hệ số x: chỉ tin 30 phút đầu
    CLOCK_SKEW_MS: 5 * MIN, // thấy TRƯỚC giờ call hơn ngần này = dữ liệu giờ hỏng

    RETAIN_MS: 90 * DAY, // dữ liệu thô giữ 90 ngày (người đã có hồ sơ: giữ mãi)

    // Kiểm tra bài bị xoá (chỉ tweet trên X — có tweet ID)
    CHECK_MIN_AGE_MS: DAY, // đợi 1 ngày: bài thua thường bị xoá sau khi kèo sập
    CHECK_MAX_AGE_MS: 30 * DAY,
    CHECK_EVERY_MS: DAY,
    CONFIRM_SPAN_MS: 20 * HOUR, // mất ở HAI lần kiểm cách nhau ≥20h mới tính

    SPEED_MIN_SAMPLE: 3, // dưới ngần này kèo có mốc thì không nói "thường call…"
    SPEED_NEGATIVE_OK_MS: 2 * MIN, // call trước mốc tạo token tối đa 2 phút = lệch đồng hồ
  };

  /** Ngưỡng các ô tốc độ (từ lúc token ra đời tới lúc call). */
  const SPEED_BUCKETS = [
    { max: 1 * MIN, label: "1 phút" },
    { max: 5 * MIN, label: "5 phút" },
    { max: 15 * MIN, label: "15 phút" },
    { max: 1 * HOUR, label: "1 giờ" },
    { max: 6 * HOUR, label: "6 giờ" },
    { max: 1 * DAY, label: "1 ngày" },
    { max: 7 * DAY, label: "7 ngày" },
    { max: Infinity, label: "hơn 7 ngày" },
  ];

  function text(v) {
    return v == null ? "" : String(v).trim();
  }

  function numOrNull(v) {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  /**
   * Mốc thời gian kiểu gì cũng về mili giây epoch. Số < 1e12 là GIÂY.
   * Không đọc được → null (KHÔNG phải 0: 0 là năm 1970, trông như một mốc thật).
   */
  function toTs(v) {
    if (v === null || v === undefined || v === "") return null;
    if (typeof v === "number" || /^\d{9,16}$/.test(String(v).trim())) {
      const n = Number(v);
      if (!Number.isFinite(n) || n <= 0) return null;
      return n < 1e12 ? n * 1000 : n;
    }
    const t = Date.parse(String(v));
    return Number.isFinite(t) ? t : null;
  }

  /**
   * Khoá một NGƯỜI trong sổ cái.
   *
   * Chặt hơn `KT.handleKey`: chỉ nhận tay cầm X HỢP LỆ (≤15 ký tự, chữ/số/_),
   * không nhận tên hiển thị kiểu "Crypto Ape". Dấu `_` là một phần của tên —
   * `foo_bar` và `foobar` là hai tài khoản khác nhau (trước v0.15.1 chính
   * `handleKey` từng gộp chúng làm một).
   * Tay cầm X không phân biệt hoa thường nhưng dấu `_` là một phần của tên.
   */
  const X_HANDLE_RE = /^[a-z0-9_]{1,15}$/;
  function personKeyOf(ref) {
    const r = ref || {};
    const h = text(r.handle || r.username)
      .replace(/^@+/, "")
      .toLowerCase();
    if (X_HANDLE_RE.test(h)) return "x:" + h;
    const w = text(r.wallet).toLowerCase();
    if (w) return "w:" + w;
    return "";
  }

  function tokenKeyOf(address) {
    return text(address).toLowerCase();
  }

  /* ---------- đọc CA trong một tweet ---------- */

  const EVM_RE = /(?<![0-9A-Za-z/])0x[0-9a-fA-F]{40}(?![0-9A-Za-z])/g;
  const SOL_RE = /(?<![0-9A-Za-z/.])[1-9A-HJ-NP-Za-km-z]{32,44}(?![1-9A-HJ-NP-Za-km-z])/g;
  const CASHTAG_RE = /(?:^|[^A-Za-z0-9_$])\$([A-Za-z][A-Za-z0-9_]{0,14})(?![A-Za-z0-9_])/g;
  const CA_WORD_RE = /(?:^|[^a-z])(ca|contract)(?:[^a-z]|$)/i;

  /** $PEPE, $wif → ["PEPE","WIF"] (không trùng, giữ thứ tự). */
  function cashtags(s) {
    const out = [];
    const src = String(s || "");
    let m;
    CASHTAG_RE.lastIndex = 0;
    while ((m = CASHTAG_RE.exec(src))) {
      const t = m[1].toUpperCase();
      if (out.indexOf(t) === -1) out.push(t);
    }
    return out;
  }

  /**
   * Địa chỉ token trong chữ của một tweet.
   *
   * ⚠ Một chuỗi base58 dài KHÔNG chắc là token — người ta cũng đăng địa chỉ
   * VÍ ("copy ví tao"). Ghi nhầm ví thành cú call là thổi phồng số kèo của họ
   * lên, tức là làm một người bình thường trông giống kẻ spam. Nên chỉ nhận
   * là cú call khi tweet có dấu hiệu gọi kèo: một cashtag, chữ "CA"/"contract",
   * hoặc địa chỉ Solana đuôi "pump" (đuôi của launchpad, ví không có).
   *
   * ⚠ Địa chỉ nằm SAU dấu "/" là một phần của link (dexscreener.com/solana/
   * <địa chỉ PAIR>, không phải địa chỉ token) — bỏ qua. Thà sót còn hơn ghi sai
   * token.
   *
   * Solana: đòi có cả CHỮ lẫn SỐ, để một từ dài bất kỳ không bị nhận nhầm.
   *
   * ⚠ Quét EVM TRƯỚC rồi XOÁ chúng khỏi chuỗi mới quét Solana: phần hex sau
   * một chữ "0" của địa chỉ EVM tự nó là một chuỗi base58 hợp lệ ≥32 ký tự —
   * không xoá là một tweet thành HAI cú call, một cái là token ma (có test).
   */
  function extractContracts(s) {
    const src = String(s || "");
    const hasSignal = cashtags(src).length > 0 || CA_WORD_RE.test(src);
    const out = [];
    const seen = Object.create(null);
    function push(chain, address) {
      const key = tokenKeyOf(address);
      if (seen[key]) return;
      seen[key] = true;
      out.push({ chain, address, tokenKey: key });
    }
    let m;
    EVM_RE.lastIndex = 0;
    while ((m = EVM_RE.exec(src))) {
      if (hasSignal) push("evm", m[0]);
    }
    const rest = src.replace(EVM_RE, " ");
    SOL_RE.lastIndex = 0;
    while ((m = SOL_RE.exec(rest))) {
      const a = m[0];
      if (!/[0-9]/.test(a) || !/[A-Za-z]/.test(a)) continue;
      if (hasSignal || /pump$/.test(a)) push("sol", a);
    }
    return out;
  }

  /* ---------- một cú call ---------- */

  /**
   * Dựng một bản ghi. Thiếu người, thiếu token hoặc thiếu id → null (không
   * ghi). `seenAt` = lúc MÌNH nhìn thấy — do nơi nhìn thấy gửi lên, không lấy
   * giờ lúc service worker kịp ghi.
   */
  function makeCall(input, now) {
    const i = input || {};
    const personKey = personKeyOf(i);
    const tokenKey = tokenKeyOf(i.tokenKey || i.tokenAddress);
    const id = text(i.id);
    if (!personKey || !tokenKey || !id) return null;
    const seenAt = toTs(i.seenAt) || now || Date.now();
    return {
      id,
      source: text(i.source),
      personKey,
      handle: text(i.handle || i.username).replace(/^@+/, ""),
      wallet: text(i.wallet).toLowerCase(),
      authorId: text(i.authorId),
      tokenKey,
      chain: text(i.chain),
      tokenSymbol: text(i.tokenSymbol),
      calledAt: toTs(i.calledAt),
      firstSeenAt: seenAt,
      lastSeenAt: seenAt,
      multipleAtFirstSeen: numOrNull(i.multiple),
      tweetId: /^\d{5,25}$/.test(text(i.tweetId)) ? text(i.tweetId) : "",
      textHead: text(i.text).slice(0, 140),
      check: null,
    };
  }

  /**
   * Gộp lần thấy mới vào bản ghi cũ.
   *
   * ⚠ Lần thấy ĐẦU TIÊN là thứ quyết định "ghi trước" hay "ghi muộn", nên
   * `firstSeenAt` + `multipleAtFirstSeen` chỉ được đổi khi lần mới SỚM HƠN.
   * Để lần thấy sau ghi đè lên là một cú call ghi muộn tự biến thành ghi
   * trước (hoặc ngược lại) chỉ vì mình mở lại chart.
   */
  function mergeCall(old, inc) {
    if (!old) return inc;
    if (!inc) return old;
    const out = Object.assign({}, old);
    if (inc.firstSeenAt < old.firstSeenAt) {
      out.firstSeenAt = inc.firstSeenAt;
      out.multipleAtFirstSeen = inc.multipleAtFirstSeen;
    }
    out.lastSeenAt = Math.max(old.lastSeenAt || 0, inc.lastSeenAt || 0);
    for (const k of ["calledAt", "handle", "wallet", "authorId", "chain", "tokenSymbol", "tweetId", "textHead"]) {
      if ((out[k] === null || out[k] === "" || out[k] === undefined) && inc[k]) out[k] = inc[k];
    }
    return out;
  }

  /**
   * "truoc" (ghi trước — được tính điểm) / "muon" (ghi muộn — lưu, không tính)
   * / "khong_ro" (thiếu giờ call, hoặc giờ vô lý).
   *
   * ⚠ Có hệ số x và kèo đã chạy ≥1.5x lúc mình thấy → "muon" dù mới 5 phút.
   * Luật này làm cú call trúng NHANH bị loại nhiều hơn cú call thua — tức là
   * nó thiên về phía NGHI NGỜ người call, cố ý: sai theo hướng này thì chỉ
   * làm một người giỏi trông bớt giỏi; sai theo hướng kia là thổi phồng kẻ
   * gian.
   */
  function observationClass(call) {
    if (!call || call.calledAt == null || call.firstSeenAt == null) return "khong_ro";
    const lag = call.firstSeenAt - call.calledAt;
    if (lag < -LEDGER.CLOCK_SKEW_MS) return "khong_ro";
    const lagOk = Math.max(0, lag);
    const m = call.multipleAtFirstSeen;
    if (m != null) {
      return lagOk <= LEDGER.WINDOW_KNOWN_MS && m < LEDGER.MAX_MULTIPLE ? "truoc" : "muon";
    }
    return lagOk <= LEDGER.WINDOW_UNKNOWN_MS ? "truoc" : "muon";
  }

  /* ---------- mốc token ra đời ---------- */

  /**
   * Tên cột có thể mang mốc TẠO token, theo thứ tự tin cậy.
   *
   * ⚠ CỐ Ý KHÔNG có `open_timestamp`: đó là lúc mở POOL, với token pump.fun
   * là lúc tốt nghiệp lên Raydium — có khi vài ngày sau khi token ra đời. Lấy
   * nó làm mốc thì một thằng call ngay phút đầu trông như call sau cả tuần,
   * tức là spam-bot trông y hệt người research chậm rãi.
   * Chưa đo được GMGN dùng tên nào — Chẩn đoán in ra các cột có dạng thời
   * gian để kiểm trên trang thật.
   */
  const CREATED_KEYS = [
    "creation_timestamp",
    "created_timestamp",
    "token_create_time",
    "create_timestamp",
    "creation_time",
    "created_time",
    "create_time",
    "launch_timestamp",
    "launch_time",
    "created_at",
  ];

  const MIN_SANE_TS = Date.UTC(2015, 0, 1);

  function tokenCreatedAt(obj, now) {
    if (!obj || typeof obj !== "object") return null;
    const limit = (now || Date.now()) + DAY;
    for (const key of CREATED_KEYS) {
      if (!(key in obj)) continue;
      const ts = toTs(obj[key]);
      if (ts != null && ts >= MIN_SANE_TS && ts <= limit) return { ts, key, rank: CREATED_KEYS.indexOf(key) };
    }
    return null;
  }

  /** Tên các cột trông như thời gian — CHỈ tên, cho Chẩn đoán. */
  function timeLikeKeys(obj) {
    if (!obj || typeof obj !== "object") return [];
    return Object.keys(obj)
      .filter((k) => /time|_at$|date|stamp|created|launch|open/i.test(k))
      .slice(0, 20);
  }

  /* ---------- kiểm tra bài bị xoá ---------- */

  /**
   * Kết quả oEmbed của X → "alive" / "missing" / "unknown".
   *
   * ⚠ CHỈ 404 mới là "mất". 429 (bị hãm), 403 (tài khoản khoá), 5xx, mất
   * mạng… đều là "không biết" — coi chúng là "đã xoá" là gán tội cho người
   * ta vì mạng nhà mình chập chờn.
   */
  function classifyCheck(status, hasHtml) {
    if (status === 200 && hasHtml) return "alive";
    if (status === 404) return "missing";
    return "unknown";
  }

  function applyCheck(call, result, now) {
    const c = Object.assign({}, call);
    const ck = Object.assign({ lastCheckAt: 0, aliveAt: 0, missCount: 0, firstMissAt: 0, lastMissAt: 0 }, c.check || {});
    ck.lastCheckAt = now;
    if (result === "alive") {
      ck.aliveAt = now;
      // Lần trước không thấy, giờ lại thấy = lần trước là trục trặc tạm thời.
      ck.missCount = 0;
      ck.firstMissAt = 0;
      ck.lastMissAt = 0;
    } else if (result === "missing") {
      ck.missCount += 1;
      if (!ck.firstMissAt) ck.firstMissAt = now;
      ck.lastMissAt = now;
    }
    c.check = ck;
    return c;
  }

  /** Mất ở ít nhất hai lần kiểm, cách nhau đủ xa. */
  function confirmedMissing(call) {
    const ck = call && call.check;
    return !!(ck && ck.missCount >= 2 && ck.lastMissAt - ck.firstMissAt >= LEDGER.CONFIRM_SPAN_MS);
  }

  /** Những tweet đến lượt kiểm, cũ nhất-chưa-kiểm trước. */
  function pickForCheck(calls, now, limit) {
    const out = [];
    for (const c of calls || []) {
      if (!c || c.source !== "x" || !c.tweetId || c.calledAt == null) continue;
      const age = now - c.calledAt;
      if (age < LEDGER.CHECK_MIN_AGE_MS || age > LEDGER.CHECK_MAX_AGE_MS) continue;
      if (confirmedMissing(c)) continue;
      const last = (c.check && c.check.lastCheckAt) || 0;
      if (now - last < LEDGER.CHECK_EVERY_MS) continue;
      out.push(c);
    }
    out.sort((a, b) => ((a.check && a.check.lastCheckAt) || 0) - ((b.check && b.check.lastCheckAt) || 0));
    return out.slice(0, limit || 20);
  }

  /* ---------- dọn dữ liệu cũ ---------- */

  function pruneIds(calls, now, keepPersonKeys) {
    const keep = keepPersonKeys || new Set();
    const out = [];
    for (const c of calls || []) {
      const t = c.calledAt != null ? c.calledAt : c.firstSeenAt;
      if (t != null && now - t > LEDGER.RETAIN_MS && !keep.has(c.personKey)) out.push(c.id);
    }
    return out;
  }

  /* ---------- tóm một người ---------- */

  function dayKey(ts) {
    const d = new Date(ts);
    return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
  }

  function bucketIndex(ms) {
    for (let i = 0; i < SPEED_BUCKETS.length; i++) if (ms <= SPEED_BUCKETS[i].max) return i;
    return SPEED_BUCKETS.length - 1;
  }

  /**
   * Mọi bản ghi của MỘT người → mấy con số.
   *
   * `tokens`: tokenKey → { createdAt } (mốc token ra đời, nếu biết).
   *
   * Đơn vị đếm là **(người, token)**, không phải bản ghi: cùng một kèo thấy
   * ở cả X lẫn feed GMGN, hay hô đi hô lại năm lần, vẫn là MỘT cú call — đếm
   * theo bản ghi là thằng hô nhiều lần trông như call nhiều kèo.
   */
  function summarize(calls, tokens, now) {
    const tk = tokens || {};
    const byToken = new Map();
    for (const c of calls || []) {
      if (!c || !c.tokenKey) continue;
      const list = byToken.get(c.tokenKey) || [];
      list.push(c);
      byToken.set(c.tokenKey, list);
    }

    const out = {
      calls: byToken.size,
      truoc: 0,
      muon: 0,
      khongRo: 0,
      activeDays: 0,
      maxPerDay: 0,
      speed: { n: 0, invalid: 0, buckets: SPEED_BUCKETS.map(() => 0), medianLabel: "" },
      deleted: 0,
      unreachable: 0,
      tweetsChecked: 0,
      sources: {},
    };

    const perDay = new Map();
    for (const [tokenKey, list] of byToken) {
      // Lớp: có BẤT KỲ lần thấy nào là "ghi trước" thì cú call này đã được
      // ghi trước khi biết kết quả.
      const classes = list.map(observationClass);
      if (classes.indexOf("truoc") !== -1) out.truoc++;
      else if (classes.indexOf("muon") !== -1) out.muon++;
      else out.khongRo++;

      let first = null;
      for (const c of list) {
        out.sources[c.source] = (out.sources[c.source] || 0) + 1;
        if (c.calledAt != null && (first == null || c.calledAt < first)) first = c.calledAt;
      }
      if (first != null) {
        const k = dayKey(first);
        perDay.set(k, (perDay.get(k) || 0) + 1);
      }

      const created = tk[tokenKey] && tk[tokenKey].createdAt;
      if (first != null && created != null) {
        const lag = first - created;
        if (lag < -LEDGER.SPEED_NEGATIVE_OK_MS) {
          // Call TRƯỚC khi token tồn tại: mốc sai (cột nhầm) chứ không phải
          // một người tiên tri — loại khỏi phép đo, đếm riêng để còn thấy.
          out.speed.invalid++;
        } else {
          out.speed.n++;
          out.speed.buckets[bucketIndex(Math.max(0, lag))]++;
        }
      }
    }

    out.activeDays = perDay.size;
    for (const v of perDay.values()) if (v > out.maxPerDay) out.maxPerDay = v;

    if (out.speed.n >= LEDGER.SPEED_MIN_SAMPLE) {
      const half = Math.ceil(out.speed.n / 2);
      let acc = 0;
      for (let i = 0; i < SPEED_BUCKETS.length; i++) {
        acc += out.speed.buckets[i];
        if (acc >= half) {
          out.speed.medianLabel = SPEED_BUCKETS[i].label;
          break;
        }
      }
    }

    // Xoá bài: CHỈ tính là "xoá" khi CÙNG lúc đó còn bài khác của chính
    // người này vẫn sống. Tất cả cùng mất = tài khoản bị khoá/xoá/đổi riêng
    // tư — chuyện khác hẳn "xoá chọn lọc cú thua", đừng gộp.
    const xCalls = (calls || []).filter((c) => c && c.source === "x" && c.tweetId);
    const seenTweet = new Set();
    for (const c of xCalls) {
      if (seenTweet.has(c.tweetId)) continue;
      seenTweet.add(c.tweetId);
      if (c.check && c.check.lastCheckAt) out.tweetsChecked++;
      if (!confirmedMissing(c)) continue;
      const aliveSibling = xCalls.some(
        (d) => d.tweetId !== c.tweetId && d.check && d.check.aliveAt && d.check.aliveAt >= c.check.firstMissAt
      );
      if (aliveSibling) out.deleted++;
      else out.unreachable++;
    }
    void now;
    return out;
  }

  /**
   * Tóm tắt → mấy mẩu chữ cho người đọc. Mẩu nào không có số thật thì bỏ,
   * không bịa "0".
   */
  function summaryParts(s) {
    if (!s || !s.calls) return [];
    const parts = [];
    parts.push(s.calls + " kèo (" + s.truoc + " ghi trước)");
    if (s.maxPerDay >= 2) parts.push("có ngày ≥" + s.maxPerDay + " kèo");
    if (s.speed.medianLabel) {
      parts.push("thường call trong vòng " + s.speed.medianLabel + " sau khi token ra đời (" + s.speed.n + " kèo có mốc)");
    } else if (s.speed.n > 0) {
      parts.push("tốc độ: chưa đủ mốc (" + s.speed.n + " kèo)");
    }
    if (s.deleted) parts.push(s.deleted + " bài call đã bị xoá");
    if (s.unreachable) parts.push(s.unreachable + " bài không còn truy cập được (tài khoản khoá/xoá?)");
    return parts;
  }

  KT.LEDGER = LEDGER;
  KT.ledger = {
    LEDGER,
    SPEED_BUCKETS,
    CREATED_KEYS,
    toTs,
    personKeyOf,
    tokenKeyOf,
    cashtags,
    extractContracts,
    makeCall,
    mergeCall,
    observationClass,
    tokenCreatedAt,
    timeLikeKeys,
    classifyCheck,
    applyCheck,
    confirmedMissing,
    pickForCheck,
    pruneIds,
    summarize,
    summaryParts,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = KT.ledger;
  }
})(typeof globalThis !== "undefined" ? globalThis : self);
