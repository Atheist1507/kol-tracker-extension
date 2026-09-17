/**
 * Đọc chữ trong một thẻ người (tooltip GMGN) ra ứng viên handle.
 *
 * Tách khỏi overlay.js để test được: đây đúng là chỗ đã có bug. Bản đầu đọc
 * `node.textContent` — thứ NỐI mọi chữ lại không có dấu cách — nên tooltip
 * "nolifeloser / Thesis / @nolifeloser / 2d / Ahaa Only up…" thành một chuỗi
 * liền, và regex @handle nuốt sang cả chữ bên cạnh thành "@nolifeloser2dAhaa".
 * Tra không bao giờ trúng, mà không có lỗi nào hiện ra.
 *
 * Nên đầu vào ở đây là MẢNG MẨU CHỮ (mỗi text node một mẩu), không phải một
 * chuỗi. Phần lấy mẩu chữ nằm ở overlay.js vì nó phải đụng DOM.
 */
(function (root) {
  "use strict";
  const KT = (root.KT = root.KT || {});

  const HANDLE_RE = /@([A-Za-z0-9_]{2,20})/g;
  const STANDALONE_HANDLE_RE = /^@[A-Za-z0-9_]{2,20}$/;
  const MAX_CHUNK_LEN = 64; // dài hơn thế thì là câu văn, không phải một cái tên

  /**
   * → { standalone, at, plain }, ba loại theo độ tin cậy giảm dần:
   *  - `standalone`: cả mẩu chữ CHỈ là "@ai_đó" → ô handle của một thẻ người.
   *  - `at`: "@ai_đó" nằm lẫn trong câu → thường là nội dung post nhắc tên
   *    người KHÁC. Vẫn tra, nhưng không được coi là chủ thẻ.
   *  - `plain`: mẩu chữ ngắn không có @ → có thể là TÊN HIỂN THỊ (khác handle),
   *    chỉ trúng nếu tên đó nằm ở cột `aliases` trong Sheet.
   */
  function candidateHandles(chunks) {
    const standalone = [];
    const at = [];
    const plain = [];

    for (const raw of chunks || []) {
      const chunk = String(raw == null ? "" : raw).trim();
      if (!chunk) continue;

      if (STANDALONE_HANDLE_RE.test(chunk)) {
        standalone.push(chunk.slice(1));
        continue;
      }
      HANDLE_RE.lastIndex = 0;
      let m;
      while ((m = HANDLE_RE.exec(chunk))) at.push(m[1]);
      if (chunk.length <= MAX_CHUNK_LEN && chunk[0] !== "@") plain.push(chunk);
    }
    return { standalone, at, plain };
  }

  KT.candidateHandles = candidateHandles;
  KT.TOOLTIP_MAX_CHUNK_LEN = MAX_CHUNK_LEN;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { candidateHandles, MAX_CHUNK_LEN };
  }
})(typeof globalThis !== "undefined" ? globalThis : self);
