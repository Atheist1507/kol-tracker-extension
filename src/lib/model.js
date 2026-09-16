/**
 * Dựng "database" trong bộ nhớ từ 2 bảng CSV và tra cứu trên đó.
 * Không có tầng DB thật — vài trăm dòng thì quét tuyến tính là đủ nhanh,
 * đổi lại không phải sync gì cả (xem mục 3 của spec).
 */
(function (root) {
  "use strict";
  const KT = (root.KT = root.KT || {});

  function firstNonEmpty() {
    for (let i = 0; i < arguments.length; i++) {
      const v = arguments[i];
      if (v != null && String(v).trim() !== "") return String(v).trim();
    }
    return "";
  }

  /**
   * kolRows + callRows (đã parse từ CSV) → db tra cứu được.
   * Call của handle CHƯA có hồ sơ trong tab KOLs vẫn được giữ, dưới dạng
   * "hồ sơ tạm" (ghost) — mất dấu một người vì quên điền tab KOLs thì
   * đúng lúc cần nhất lại không tra ra.
   */
  function buildDb(kolRows, callRows, opts) {
    const options = opts || {};
    const kols = [];
    const byKey = Object.create(null);
    const byAvatar = Object.create(null);
    const byToken = Object.create(null);

    function addKeys(kol, raw) {
      const key = KT.handleKey(raw);
      if (!key) return;
      if (!kol.keys.includes(key)) kol.keys.push(key);
      if (!byKey[key]) byKey[key] = kol;
    }

    for (const row of kolRows || []) {
      const handle = KT.displayHandle(firstNonEmpty(row.handle, row.extra && row.extra.Handle));
      const key = KT.handleKey(handle);
      if (!key) continue;

      let kol = byKey[key];
      if (!kol) {
        kol = {
          key,
          handle: handle,
          keys: [],
          aliases: [],
          avatar: "",
          tier: "",
          tierLetter: "",
          description: "",
          source: "",
          redFlags: "",
          addedBy: "",
          updatedAt: "",
          extra: {},
          calls: [],
          ghost: false,
          row: row._row || null,
        };
        kols.push(kol);
        byKey[key] = kol;
      }

      kol.aliases = KT.splitList(row.aliases);
      kol.avatar = firstNonEmpty(row.avatar_url);
      kol.tier = firstNonEmpty(row.tier);
      kol.tierLetter = KT.tierLetter(kol.tier);
      kol.description = firstNonEmpty(row.description);
      kol.source = firstNonEmpty(row.source_found);
      kol.redFlags = firstNonEmpty(row.red_flags);
      kol.addedBy = firstNonEmpty(row.added_by);
      kol.updatedAt = firstNonEmpty(row.updated_at);
      kol.extra = row.extra || {};

      addKeys(kol, handle);
      for (const alias of kol.aliases) addKeys(kol, alias);

      const avatarKey = KT.avatarKey(kol.avatar);
      if (avatarKey && !byAvatar[avatarKey]) byAvatar[avatarKey] = kol;
    }

    for (const row of callRows || []) {
      const rawHandle = firstNonEmpty(row.handle);
      const key = KT.handleKey(rawHandle);
      if (!key) continue;

      let kol = byKey[key];
      if (!kol) {
        kol = {
          key,
          handle: KT.displayHandle(rawHandle),
          keys: [key],
          aliases: [],
          avatar: "",
          tier: "",
          tierLetter: "",
          description: "",
          source: "",
          redFlags: "",
          addedBy: "",
          updatedAt: "",
          extra: {},
          calls: [],
          ghost: true, // chỉ xuất hiện ở tab Calls, chưa có hồ sơ
          row: null,
        };
        kols.push(kol);
        byKey[key] = kol;
      }

      const call = {
        token: firstNonEmpty(row.token),
        tokenKey: KT.tokenKey(row.token),
        calledAt: firstNonEmpty(row.called_at),
        calledAtTs: KT.parseDateLoose(row.called_at),
        price: firstNonEmpty(row.price_at_call),
        position: KT.parsePosition(row.chart_position),
        positionRaw: firstNonEmpty(row.chart_position),
        result: firstNonEmpty(row.result),
        addedBy: firstNonEmpty(row.added_by),
        extra: row.extra || {},
        row: row._row || null,
      };
      kol.calls.push(call);

      if (call.tokenKey) {
        (byToken[call.tokenKey] = byToken[call.tokenKey] || []).push({ key: kol.key, call });
      }
    }

    for (const kol of kols) {
      // Mới nhất lên đầu; call chưa ghi ngày xuống cuối (đừng đoán hộ)
      kol.calls.sort((a, b) => {
        if (a.calledAtTs == null && b.calledAtTs == null) return 0;
        if (a.calledAtTs == null) return 1;
        if (b.calledAtTs == null) return -1;
        return b.calledAtTs - a.calledAtTs;
      });
      kol.stats = KT.calcStats(kol.calls, options);
      kol.searchText = KT.stripAccents(
        [kol.handle, kol.aliases.join(" "), kol.description, kol.source].join(" ")
      ).toLowerCase();
    }

    kols.sort((a, b) => KT.tierRank(a.tier) - KT.tierRank(b.tier) || a.handle.localeCompare(b.handle));

    return {
      kols,
      byKey,
      byAvatar,
      byToken,
      counts: { kols: kols.filter((k) => !k.ghost).length, calls: (callRows || []).length },
    };
  }

  /** Tra chính xác theo handle/alias/URL profile. Trả kol hoặc null. */
  function lookup(db, raw) {
    if (!db) return null;
    const key = KT.handleKey(raw);
    return (key && db.byKey[key]) || null;
  }

  /** Tra theo URL ảnh đại diện (dùng cho overlay trên chart). */
  function lookupByAvatar(db, url) {
    if (!db) return null;
    const key = KT.avatarKey(url);
    return (key && db.byAvatar[key]) || null;
  }

  /**
   * Tìm mờ. Điểm số theo độ "chắc chắn" của phép khớp chứ không phải theo
   * thứ tự trong Sheet — gõ 3 ký tự phải ra đúng người trước tiên.
   */
  function search(db, query, limit) {
    if (!db || !db.kols.length) return [];
    const raw = String(query == null ? "" : query).trim();
    if (!raw) return [];

    const key = KT.handleKey(raw);
    const plain = KT.stripAccents(raw).toLowerCase();
    const tokenQ = KT.tokenKey(raw);
    const max = limit || 8;
    const out = [];

    for (const kol of db.kols) {
      let score = 0;
      let reason = "";

      for (const k of kol.keys) {
        if (!key) break;
        if (k === key) {
          score = Math.max(score, 120);
          reason = "handle";
        } else if (k.startsWith(key)) {
          score = Math.max(score, 90);
          reason = reason || "handle";
        } else if (k.includes(key)) {
          score = Math.max(score, 70);
          reason = reason || "handle";
        }
      }

      if (score < 70 && plain.length >= 2 && kol.searchText.includes(plain)) {
        score = Math.max(score, 40);
        reason = reason || "khớp mô tả";
      }

      if (tokenQ.length >= 2 && kol.calls.some((c) => c.tokenKey === tokenQ)) {
        score = Math.max(score, 60);
        reason = reason || "đã call token này";
      }

      if (score > 0) out.push({ kol, score, reason });
    }

    out.sort(
      (a, b) =>
        b.score - a.score ||
        KT.tierRank(a.kol.tier) - KT.tierRank(b.kol.tier) ||
        b.kol.calls.length - a.kol.calls.length ||
        a.kol.handle.localeCompare(b.kol.handle)
    );
    return out.slice(0, max);
  }

  /** Mọi call của một token, mới nhất trước — "ai đã call con này?". */
  function callsForToken(db, query) {
    if (!db) return [];
    const tokenQ = KT.tokenKey(query);
    if (!tokenQ || tokenQ.length < 2) return [];
    const hits = db.byToken[tokenQ] || [];
    return hits
      .map((h) => ({ kol: db.byKey[h.key], call: h.call }))
      .filter((h) => h.kol)
      .sort((a, b) => {
        const at = a.call.calledAtTs;
        const bt = b.call.calledAtTs;
        if (at == null && bt == null) return 0;
        if (at == null) return 1;
        if (bt == null) return -1;
        return at - bt; // ai call SỚM nhất đứng đầu — đó là câu hỏi thật sự
      });
  }

  KT.buildDb = buildDb;
  KT.lookup = lookup;
  KT.lookupByAvatar = lookupByAvatar;
  KT.search = search;
  KT.callsForToken = callsForToken;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { buildDb, lookup, lookupByAvatar, search, callsForToken };
  }
})(typeof globalThis !== "undefined" ? globalThis : self);
