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
  const BARE_HANDLE_RE = /^[A-Za-z0-9_]{2,20}$/;
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

    const list = (chunks || []).map((raw) => String(raw == null ? "" : raw).trim());

    for (let i = 0; i < list.length; i++) {
      const chunk = list[i];
      if (!chunk) continue;

      if (STANDALONE_HANDLE_RE.test(chunk)) {
        standalone.push(chunk.slice(1));
        continue;
      }

      // ⚠ Thẻ trên CHART của GMGN tách dấu @ ra một text node RIÊNG:
      //   ["Triggered", "Thesis", "13h", "@", "Triggeredtrad3s", "CATE JUST…"]
      // Mẩu "@" trơ trọi thì không khớp STANDALONE_HANDLE_RE, còn mẩu tên thì
      // không có @ nên rơi xuống `plain` — lẫn với "Thesis", "13h" và cả câu
      // post. Đo trên trang thật 19/09/2026: đây là lý do DUY NHẤT thẻ trên
      // chart đọc ra mà không dùng được. Ghép lại thì nó đúng là ô handle,
      // tin cậy ngang một mẩu "@ai_đó" liền mạch.
      if (chunk === "@" && BARE_HANDLE_RE.test(list[i + 1] || "")) {
        standalone.push(list[i + 1]);
        i++; // nuốt luôn mẩu tên, đừng để nó rơi xuống `plain` lần nữa
        continue;
      }
      HANDLE_RE.lastIndex = 0;
      let m;
      while ((m = HANDLE_RE.exec(chunk))) at.push(m[1]);
      if (chunk.length <= MAX_CHUNK_LEN && chunk[0] !== "@") plain.push(chunk);
    }
    return { standalone, at, plain };
  }

  /* Tuổi bài post trên thẻ chart: "6h", "75d", "13h", "2mo", "45m". */
  /**
   * ⚠ CHỮ THƯỜNG, cố ý không có cờ `i`.
   *
   * GMGN viết tuổi bài bằng chữ thường ("6h", "75d"), còn CHỮ HOA là đơn vị
   * độ lớn: "100M" là một trăm triệu vốn hoá. Bật `i` thì "100M" thành 100
   * PHÚT, và một mốc call hoàn toàn bịa được ghi thẳng vào Sheet — không có
   * triệu chứng nào, mà lại đúng vào cột mày dùng để điều tra. Test khoá lại.
   *
   * Thà bỏ sót một mốc còn hơn bịa ra một mốc.
   */
  const AGE_RE = /^(\d{1,3})\s*(s|m|h|d|w|mo|y)$/;
  const AGE_MS = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
    w: 7 * 24 * 60 * 60 * 1000,
    mo: 30 * 24 * 60 * 60 * 1000,
    y: 365 * 24 * 60 * 60 * 1000,
  };

  function ageToMs(chunk) {
    const m = AGE_RE.exec(String(chunk || "").trim());
    if (!m) return null;
    return AGE_MS[m[2]] ? Number(m[1]) * AGE_MS[m[2]] : null;
  }

  /**
   * Thẻ trên chart → những gì đáng giữ lại.
   *
   * Vì sao cần: thẻ chart nói THỜI ĐIỂM CALL — đó là lý do người ta soi chart
   * chứ không soi bảng dưới. Mà tuổi bài ("6h") thì cứ trôi, nên phải quy ngay
   * về mốc TUYỆT ĐỐI lúc đọc được. Để nguyên "6h" thì tuần sau đọc lại là sai
   * một tuần, mà không có triệu chứng nào.
   *
   * ⚠ Mốc quy ra chỉ chính xác tới ĐƠN VỊ của nó: "6h" nghĩa là đâu đó trong
   * khoảng một giờ, "75d" thì sai số cả ngày. So hai mốc với nhau phải nới
   * đúng bằng `saiSoMs`, đừng so bằng dấu bằng.
   */
  function cardFacts(chunks, now) {
    const list = (chunks || []).map((c) => String(c == null ? "" : c).trim());
    const { standalone } = candidateHandles(list);
    const handle = standalone[0] || "";

    let ageMs = null;
    let saiSoMs = null;
    let postText = "";
    for (const chunk of list) {
      const ms = ageToMs(chunk);
      if (ms !== null && ageMs === null) {
        ageMs = ms;
        saiSoMs = AGE_MS[AGE_RE.exec(chunk)[2]];
        continue;
      }
      // Bài post là mẩu DÀI NHẤT. Tên, tuổi, nhãn ("Thesis", "Best Callout")
      // đều ngắn; chỉ nội dung post mới dài.
      if (chunk.length > postText.length && chunk.length > 20 && chunk.indexOf("@") !== 0) postText = chunk;
    }

    const moc = now || Date.now();
    return {
      handle,
      postText,
      ageMs,
      saiSoMs,
      postedTs: ageMs === null ? null : moc - ageMs,
    };
  }

  KT.candidateHandles = candidateHandles;
  KT.cardFacts = cardFacts;
  KT.ageToMs = ageToMs;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { candidateHandles, cardFacts, ageToMs, MAX_CHUNK_LEN };
  }
})(typeof globalThis !== "undefined" ? globalThis : self);
