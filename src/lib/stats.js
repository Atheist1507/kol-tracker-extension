/**
 * Đọc cột `result` / `chart_position` / `called_at` của tab Calls và quy ra
 * track record. Đây là phần dễ sai nhất của cả extension: dữ liệu là chữ
 * người gõ tay ("x5", "đu đỉnh", "sai bét", "+300%"), nên luật quy đổi phải
 * rõ ràng và có test — con số win rate mà lệch thì cả hệ thống vô nghĩa.
 */
(function (root) {
  "use strict";
  const KT = (root.KT = root.KT || {});

  // ⚠ Khớp trên chuỗi ĐÃ BỎ DẤU: \b của JS chỉ hiểu chữ ASCII, để nguyên
  // "lỗ"/"đúng" thì ranh giới từ chạy sai và từ khoá trượt im lặng.
  const LOSS_WORDS = /\b(sai|thua|lo|loss|lose|rug|scam|dump|fail|xit|toang|die|dead|mat|te|flop)\b/;
  const WIN_WORDS = /\b(dung|win|thang|an|lai|profit|pump|hit|ngon|ok|good|ngot)\b/;

  /**
   * "x5" / "5x" / "x1.8" / "+300%" / "-70%" → hệ số nhân (5, 5, 1.8, 4, 0.3).
   * Không đọc được → null.
   */
  function parseMultiple(raw) {
    const s = KT.stripAccents(raw).toLowerCase().replace(/,/g, ".");
    if (!s) return null;

    let m = s.match(/x\s*(\d+(?:\.\d+)?)/);
    if (m) return parseFloat(m[1]);
    m = s.match(/(\d+(?:\.\d+)?)\s*x/);
    if (m) return parseFloat(m[1]);
    m = s.match(/([+-]?\d+(?:\.\d+)?)\s*%/);
    if (m) {
      const pct = parseFloat(m[1]);
      const mult = 1 + pct / 100;
      return mult < 0 ? 0 : mult;
    }
    return null;
  }

  /**
   * Một ô `result` → { outcome, multiple }.
   * Luật: CÓ hệ số nhân thì hệ số quyết định (đó là dữ liệu cứng), không có
   * thì mới đọc từ khoá. Ngưỡng thắng mặc định x2 — chỉnh được trong Options.
   */
  function parseResult(raw, winMultiple) {
    const text = String(raw == null ? "" : raw).trim();
    const threshold = typeof winMultiple === "number" && winMultiple > 0 ? winMultiple : 2;
    if (!text) return { outcome: "unknown", multiple: null, text: "" };

    const multiple = parseMultiple(text);
    if (multiple != null) {
      let outcome = "neutral";
      if (multiple >= threshold) outcome = "win";
      else if (multiple < 1) outcome = "loss";
      return { outcome, multiple, text };
    }
    const norm = KT.stripAccents(text).toLowerCase();
    if (LOSS_WORDS.test(norm)) return { outcome: "loss", multiple: null, text };
    if (WIN_WORDS.test(norm)) return { outcome: "win", multiple: null, text };
    return { outcome: "unknown", multiple: null, text };
  }

  const POSITION_LABELS = { early: "Vào sớm", mid: "Giữa sóng", late: "Đu đỉnh", "": "Chưa rõ" };

  /** "đầu sóng" / "giữa" / "đu đỉnh" → early / mid / late. */
  function parsePosition(raw) {
    const s = KT.stripAccents(raw).toLowerCase();
    if (!s) return "";
    if (/(dinh|top|late|muon|tre|cuoi|fomo)/.test(s)) return "late";
    if (/(giua|mid|middle|than)/.test(s)) return "mid";
    if (/(dau|som|early|bottom|day|sniper|presale)/.test(s)) return "early";
    return "";
  }

  /**
   * Ngày kiểu gì cũng nhận: ISO, dd/mm/yyyy, dd-mm-yyyy. Trả timestamp hoặc null.
   * ⚠ dd/mm trước mm/dd — Sheet của người Việt mặc định ngày trước tháng.
   */
  function parseDateLoose(raw) {
    const s = String(raw == null ? "" : raw).trim();
    if (!s) return null;

    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3]);

    m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
    if (m) {
      let [, d, mo, y] = m;
      let year = +y;
      if (year < 100) year += 2000;
      // Ô nào rõ ràng là mm/dd (ngày > 12) thì đảo lại
      if (+d > 12 && +mo <= 12) return Date.UTC(year, +mo - 1, +d);
      return Date.UTC(year, +mo - 1, +d);
    }

    const t = Date.parse(s);
    return Number.isNaN(t) ? null : t;
  }

  /** Số ngày tối thiểu để win rate có nghĩa (spec: 5–10 case). */
  const MIN_SAMPLE = 5;

  /**
   * Gộp các call của MỘT người thành track record.
   * `winRate` chỉ tính trên case đã phân loại được (win + loss) — case
   * "unknown" mà đếm vào mẫu số thì càng nhập cẩu thả win rate càng tụt.
   */
  function calcStats(calls, opts) {
    const options = opts || {};
    const winMultiple = options.winMultiple || 2;
    const minSample = options.minSample || MIN_SAMPLE;

    const out = {
      total: 0,
      win: 0,
      loss: 0,
      neutral: 0,
      unknown: 0,
      classified: 0,
      winRate: null,
      enoughSample: false,
      bestMultiple: null,
      medianMultiple: null,
      position: { early: 0, mid: 0, late: 0 },
      lastCallAt: null,
    };
    if (!Array.isArray(calls) || !calls.length) return out;

    const multiples = [];
    for (const call of calls) {
      out.total++;
      const r = parseResult(call.result, winMultiple);
      out[r.outcome]++;
      if (r.multiple != null) multiples.push(r.multiple);

      const pos = parsePosition(call.chart_position);
      if (pos) out.position[pos]++;

      const t = parseDateLoose(call.called_at);
      if (t != null && (out.lastCallAt == null || t > out.lastCallAt)) out.lastCallAt = t;
    }

    out.classified = out.win + out.loss;
    if (out.classified > 0) out.winRate = out.win / out.classified;
    out.enoughSample = out.total >= minSample;

    if (multiples.length) {
      multiples.sort((a, b) => a - b);
      out.bestMultiple = multiples[multiples.length - 1];
      const mid = Math.floor(multiples.length / 2);
      out.medianMultiple =
        multiples.length % 2 ? multiples[mid] : (multiples[mid - 1] + multiples[mid]) / 2;
    }
    return out;
  }

  KT.parseMultiple = parseMultiple;
  KT.parseResult = parseResult;
  KT.parsePosition = parsePosition;
  KT.POSITION_LABELS = POSITION_LABELS;
  KT.parseDateLoose = parseDateLoose;
  KT.calcStats = calcStats;
  KT.MIN_SAMPLE = MIN_SAMPLE;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      parseMultiple,
      parseResult,
      parsePosition,
      POSITION_LABELS,
      parseDateLoose,
      calcStats,
      MIN_SAMPLE,
    };
  }
})(typeof globalThis !== "undefined" ? globalThis : self);
