/**
 * Theo dõi DỰ ÁN (chưa có token / mới manh nha) — logic thuần.
 *
 * Một dự án là một hồ sơ bình thường trong Sheet. Mỗi lần kiểm dự án là MỘT
 * dòng ghi chú mở đầu bằng `[Dự án]`, kèm phiếu chấm 5 câu hỏi:
 *
 *   [Dự án] loại:launchpad · ship:có · người dùng:? · team:có · builder:không · cộng đồng:? — ghi chú tự do
 *
 * ⚠ Vì sao nhét vào chữ ghi chú thay vì thêm cột: Apps Script ghi theo danh
 * sách cột CỐ ĐỊNH trong code (Code.gs), thêm cột là bắt cả hai người dán lại
 * code và deploy lại. Cách này không đụng Sheet, người đọc Sheet bằng mắt vẫn
 * hiểu, và mỗi lần kiểm là một dòng → lịch sử từng tuần có sẵn.
 * ⚠ Hệ quả: sửa tay dòng đó trong Sheet thì giữ đúng khuôn `tên:giá trị`,
 * ngăn bằng ` · `. Phần nào đọc không ra thì coi là "?" chứ không đoán.
 */
(function (root) {
  "use strict";
  const KT = (root.KT = root.KT || {});

  const MARKER = "[Dự án]";

  /** Năm câu hỏi khi dự án chưa có token — xem README mục "Theo dõi dự án". */
  const QUESTIONS = [
    { key: "ship", label: "ship", hoi: "Đang ship thật (deploy, cập nhật đều)" },
    { key: "users", label: "người dùng", hoi: "Có người dùng thật, tăng đều" },
    { key: "team", label: "team", hoi: "Team kiểm chứng được, từng ship" },
    { key: "builder", label: "builder", hoi: "Builder khác để ý / tích hợp" },
    { key: "community", label: "cộng đồng", hoi: "Cộng đồng bàn sản phẩm, không chỉ 'wen token'" },
  ];

  const CATEGORIES = ["launchpad", "DEX", "hạ tầng", "ứng dụng", "khác"];

  const VALUES = { "có": 1, "?": 0, "không": -1 };

  function norm(s) {
    const strip = KT.stripAccents || ((x) => x);
    return strip(String(s == null ? "" : s))
      .toLowerCase()
      .trim();
  }

  function isProjectNote(text) {
    return norm(text).startsWith(norm(MARKER));
  }

  /** Dựng chữ ghi chú từ phiếu chấm. `scores[key]` ∈ {1, 0, -1}. */
  function format(card) {
    const c = card || {};
    const parts = [];
    if (c.category) parts.push("loại:" + c.category);
    for (const q of QUESTIONS) {
      const v = c.scores ? c.scores[q.key] : 0;
      parts.push(q.label + ":" + (v === 1 ? "có" : v === -1 ? "không" : "?"));
    }
    const text = String(c.text || "").trim();
    return MARKER + " " + parts.join(" · ") + (text ? " — " + text : "");
  }

  /**
   * Chữ ghi chú → phiếu chấm, hoặc null nếu không phải ghi chú dự án.
   * Câu hỏi thiếu hay giá trị lạ → 0 ("chưa biết"), KHÔNG đoán là có/không.
   */
  function parse(text) {
    if (!isProjectNote(text)) return null;
    const raw = String(text).trim().slice(MARKER.length).trim();
    const dash = raw.indexOf(" — ");
    const head = dash === -1 ? raw : raw.slice(0, dash);
    const free = dash === -1 ? "" : raw.slice(dash + 3).trim();
    const scores = {};
    for (const q of QUESTIONS) scores[q.key] = 0;
    let category = "";
    for (const piece of head.split("·")) {
      const i = piece.indexOf(":");
      if (i === -1) continue;
      const k = norm(piece.slice(0, i));
      const v = piece.slice(i + 1).trim();
      if (k === "loai") {
        category = v;
        continue;
      }
      const q = QUESTIONS.find((x) => norm(x.label) === k);
      if (!q) continue;
      const val = VALUES[v.toLowerCase()];
      scores[q.key] = val === undefined ? 0 : val;
    }
    return { category, scores, text: free };
  }

  function scoreOf(scores) {
    let yes = 0;
    let no = 0;
    for (const q of QUESTIONS) {
      if (scores[q.key] === 1) yes++;
      else if (scores[q.key] === -1) no++;
    }
    return { yes, no };
  }

  /**
   * Ghi chú của MỘT hồ sơ (đã sắp mới→cũ) → tóm tắt dự án, hoặc null nếu
   * chưa từng có ghi chú dự án nào.
   *
   * `prevYes` = điểm của lần kiểm TRƯỚC — ở giai đoạn chưa có token, CHIỀU
   * HƯỚNG nói nhiều hơn con số tuyệt đối.
   */
  function fromNotes(notes) {
    const checks = [];
    for (const n of notes || []) {
      const card = parse(n && n.note);
      if (card) checks.push({ card, ts: n.notedTs == null ? null : n.notedTs, by: n.addedBy || "" });
    }
    if (!checks.length) return null;
    const last = checks[0];
    const s = scoreOf(last.card.scores);
    const prev = checks[1] ? scoreOf(checks[1].card.scores) : null;
    return {
      category: last.card.category,
      scores: last.card.scores,
      text: last.card.text,
      yes: s.yes,
      no: s.no,
      prevYes: prev ? prev.yes : null,
      checkedTs: last.ts,
      checkedBy: last.by,
      checks: checks.length,
    };
  }

  /** "3/5 ↑ từ 2" — ngắn cho pill/dải. */
  function scoreLabel(p) {
    if (!p) return "";
    let s = p.yes + "/" + QUESTIONS.length;
    if (p.prevYes != null && p.prevYes !== p.yes) s += (p.yes > p.prevYes ? " ↑" : " ↓") + " từ " + p.prevYes;
    return s;
  }

  /** Lâu chưa kiểm lại thì nhắc — mặc định 7 ngày. */
  const STALE_DAYS = 7;
  function isStale(p, now) {
    if (!p || p.checkedTs == null) return true;
    return (now || Date.now()) - p.checkedTs > STALE_DAYS * 86400000;
  }

  /**
   * Chữ ghi chú để NGƯỜI đọc: ghi chú dự án thì "◆ 3/5 — phần chữ tự do"
   * thay vì nguyên dòng "[Dự án] loại:… · ship:có · …". Ghi chú thường giữ nguyên.
   */
  function displayNote(text) {
    const c = parse(text);
    if (!c) return String(text == null ? "" : text);
    const s = scoreOf(c.scores);
    return "◆ " + s.yes + "/" + QUESTIONS.length + (c.category ? " · " + c.category : "") + (c.text ? " — " + c.text : "");
  }

  KT.project = { MARKER, displayNote, QUESTIONS, CATEGORIES, STALE_DAYS, isProjectNote, format, parse, fromNotes, scoreLabel, isStale };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = KT.project;
  }
})(typeof globalThis !== "undefined" ? globalThis : self);
