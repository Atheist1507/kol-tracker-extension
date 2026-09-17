/**
 * Khoảng cách từ con trỏ tới một ô chữ nhật.
 *
 * Sinh ra vì overlay phải trả lời được một câu: "cái vừa hiện ra có phải là
 * thứ người ta đang trỏ vào không?". GMGN là SPA nhảy số liên tục, node nào
 * cũng có thể đổi bất cứ lúc nào — không neo vào vị trí con trỏ thì mọi thay
 * đổi ở góc màn hình đều tự xưng là "người đang hover".
 */
(function (root) {
  "use strict";
  const KT = (root.KT = root.KT || {});

  /** 0 khi điểm nằm TRONG ô; ngoài ra là khoảng cách tới cạnh gần nhất. */
  function distToRect(x, y, rect) {
    if (!rect) return Infinity;
    const dx = Math.max(rect.left - x, 0, x - rect.right);
    const dy = Math.max(rect.top - y, 0, y - rect.bottom);
    return Math.sqrt(dx * dx + dy * dy);
  }

  function nearRect(x, y, rect, maxPx) {
    return distToRect(x, y, rect) <= maxPx;
  }

  KT.distToRect = distToRect;
  KT.nearRect = nearRect;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { distToRect, nearRect };
  }
})(typeof globalThis !== "undefined" ? globalThis : self);
