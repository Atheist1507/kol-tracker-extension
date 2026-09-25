/**
 * Đọc và viết MỐC THỜI GIAN.
 *
 * Tách ra khỏi `stats.js` (13/10/2026) vì cái file đó đã trở thành hai thứ
 * không liên quan gộp làm một: phần chấm điểm track record từ cột `result`
 * của tab Calls — đã CHẾT, không còn ai gọi, và còn đọc mấy cột Sheet không
 * còn tồn tại — và mấy hàm ngày tháng mà cả extension đang dùng. Giữ chung
 * một file thì mở ra tưởng đang đọc code thống kê, mà thật ra 6 chỗ trong
 * repo chỉ cần `fmtDateTime`.
 *
 * ⚠ Ngày từ Sheet là chữ NGƯỜI GÕ. Mọi luật đọc nằm ở đây, có test, và
 * không được đoán thêm giờ phút mà dữ liệu không nói.
 */
(function (root) {
  "use strict";
  const KT = (root.KT = root.KT || {});

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

  KT.parseDateLoose = parseDateLoose;
  KT.fmtDate = fmtDate;
  KT.fmtDateTime = fmtDateTime;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { parseDateLoose, fmtDate, fmtDateTime };
  }
})(typeof globalThis !== "undefined" ? globalThis : self);
