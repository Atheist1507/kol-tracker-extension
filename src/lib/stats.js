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
    if (m) {
      // Có phần giờ (chuỗi ISO từ API GMGN, từ ô Sheet cũ) thì để Date.parse
      // lo — nó hiểu cả hậu tố Z lẫn offset múi giờ. Nhánh UTC bên dưới chỉ
      // dành cho ô CHỈ có ngày, ở đó bịa ra giờ là sai.
      if (/^\d{4}-\d{1,2}-\d{1,2}[T ]\d/.test(s)) {
        const t = Date.parse(s);
        if (!Number.isNaN(t)) return t;
      }
      return Date.UTC(+m[1], +m[2] - 1, +m[3]);
    }

    m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
    if (m) {
      let [, d, mo, y] = m;
      let year = +y;
      if (year < 100) year += 2000;
      // Giờ phút nếu có: "18/09/2026 lúc 14:37" — chính là thứ Code.gs ghi vào
      // Sheet. Thiếu bước này thì hai ghi chú cùng một ngày đều về 00:00 và
      // thứ tự giữa chúng là ngẫu nhiên.
      const clock = s.slice(m[0].length).match(/(\d{1,2})\s*(?::|g|h|giờ|gio)\s*(\d{1,2})?/i);
      const hh = clock ? +clock[1] : 0;
      const mi = clock && clock[2] ? +clock[2] : 0;
      return Date.UTC(year, +mo - 1, +d, hh <= 23 ? hh : 0, mi <= 59 ? mi : 0);
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

  /**
   * Mốc thời gian đọc bằng mắt người Việt: "18/09/2026 lúc 14:37".
   *
   * Sinh ra vì UI lẫn Sheet đang bày nguyên chuỗi ISO ("2026-09-17T16:05:22.669Z")
   * — đúng cho máy, nhưng không ai đọc được, mà còn lệch múi giờ so với lúc
   * mình thật sự bấm lưu.
   *
   * Giữ cả PHÚT chứ không chỉ giờ tròn: hai ghi chú về cùng một người trong
   * cùng một buổi chiều mà đều ghi "lúc 14 giờ" thì không phân biệt được
   * cái nào trước.
   */
  function pad2(n) {
    return (n < 10 ? "0" : "") + n;
  }

  function fmtDate(value) {
    const ts = typeof value === "number" ? value : parseDateLoose(value);
    if (ts == null) return "";
    const d = new Date(ts);
    return pad2(d.getDate()) + "/" + pad2(d.getMonth() + 1) + "/" + d.getFullYear();
  }

  function fmtDateTime(value) {
    const ts = typeof value === "number" ? value : parseDateLoose(value);
    if (ts == null) return "";
    const d = new Date(ts);
    // Nửa đêm đúng 00:00 gần như luôn là "chỉ biết ngày" (ô Sheet gõ tay,
    // hoặc chuỗi không có phần giờ) — bịa ra "lúc 00:00" là nói điêu.
    if (!d.getHours() && !d.getMinutes()) return fmtDate(ts);
    return fmtDate(ts) + " lúc " + pad2(d.getHours()) + ":" + pad2(d.getMinutes());
  }

  KT.parseMultiple = parseMultiple;
  KT.fmtDate = fmtDate;
  KT.fmtDateTime = fmtDateTime;
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
      fmtDate,
      fmtDateTime,
      calcStats,
      MIN_SAMPLE,
    };
  }
})(typeof globalThis !== "undefined" ? globalThis : self);
