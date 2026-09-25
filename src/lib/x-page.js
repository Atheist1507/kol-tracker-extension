/**
 * Đọc trang X (twitter.com / x.com).
 *
 * Tách riêng phần THUẦN để test được: chuyện "đường dẫn này có phải hồ sơ một
 * người không" nghe đơn giản nhưng sai là hỏng câm — nút Ghi chú mọc trên
 * trang Cài đặt, và bấm vào thì ghi một người tên "settings" vào Sheet.
 */
(function (root) {
  "use strict";
  const KT = (root.KT = root.KT || {});

  /**
   * Đường dẫn KHÔNG phải tên người. X dùng chung một không gian tên cho cả
   * trang chức năng lẫn hồ sơ, nên phải liệt kê tay.
   */
  const RESERVED = [
    "home", "explore", "notifications", "messages", "compose", "search", "settings",
    "i", "intent", "share", "login", "logout", "signup", "tos", "privacy", "about",
    "download", "jobs", "bookmarks", "lists", "topics", "communities", "premium",
    "premium_sign_up", "verified", "account", "hashtag", "status", "followers",
    "following", "notifications-timeline", "connect_people", "explore-timeline",
  ];

  /** Tay cầm X hợp lệ: chữ, số, gạch dưới, tối đa 15 ký tự. */
  const HANDLE_RE = /^[A-Za-z0-9_]{1,15}$/;

  /**
   * `/FogoNFT` → "FogoNFT". `/FogoNFT/with_replies` → "FogoNFT" (vẫn là hồ sơ
   * người đó, chỉ khác tab). `/home`, `/i/flow/login`, `/` → null.
   */
  function handleFromPath(pathname) {
    const parts = String(pathname || "").split("/").filter(Boolean);
    if (!parts.length) return null;
    const first = parts[0];
    if (!HANDLE_RE.test(first)) return null;
    if (RESERVED.indexOf(first.toLowerCase()) !== -1) return null;
    // /<handle>/status/123 là một BÀI POST, không phải trang hồ sơ. Gắn nút
    // "Ghi chú người này" ở đó thì nó nằm lạc chỗ giữa một bài viết.
    if (parts[1] && ["status", "photo", "video"].indexOf(parts[1].toLowerCase()) !== -1) return null;
    return first;
  }


  /**
   * `/zachxbt/status/1968…` → "1968…". Kèm `/photo/1`, `/analytics`,
   * `/quotes` cũng vẫn ra đúng id.
   *
   * Vì sao cần: ghi chú gắn với một BÀI cụ thể thì phải có id của bài, và
   * link của bài là thứ DUY NHẤT còn lại nếu sau này nó xoá. "Hô xong xoá
   * bài" là dấu hiệu bẩn nhất trong nghề này, mà cũng là dấu hiệu tự huỷ
   * bằng chứng — chụp lại lúc đọc mới giữ được.
   */
  function statusIdFromHref(href) {
    const m = String(href || "").match(/\/status(?:es)?\/(\d{5,25})(?:[/?#]|$)/);
    return m ? m[1] : "";
  }

  /** Link thẳng tới bài. Dùng tay cầm vì X không có dạng link theo id bài. */
  function statusUrl(handle, id) {
    const h = String(handle || "").replace(/^@/, "");
    const i = String(id || "");
    if (!h || !i) return "";
    return "https://x.com/" + h + "/status/" + i;
  }

  /**
   * Ghép mấy mẩu chữ của một bài thành nguyên văn.
   *
   * X không để nội dung bài trong một node: mỗi đoạn là một `<span>`, emoji
   * là `<img alt="🔥">`, link là `<a>` với chữ bị cắt ngắn (`t.co/…`). Nên
   * phải đi gom, và gom rồi thì khoảng trắng lung tung.
   *
   * ⚠ GIỮ dấu xuống dòng: bài call hay viết mỗi ý một dòng, dồn thành một
   * đoạn liền là đọc lại không ra ý gì. Chỉ bóp mấy dòng trống liên tiếp.
   */
  function joinTweetText(chunks) {
    const raw = (Array.isArray(chunks) ? chunks : [chunks])
      .map((c) => (c == null ? "" : String(c)))
      .join("");
    return raw
      .replace(/[ \t\u00a0]+/g, " ")
      .replace(/ ?\n ?/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  /**
   * Cắt bớt trước khi ghi vào Sheet. Một ô Sheet chứa được rất nhiều, nhưng
   * một cái bảng mà mỗi ô là ba nghìn chữ thì không đọc nổi — và phần đầu bài
   * mới là phần mang luận điểm.
   */
  const POST_TEXT_MAX = 1000;

  function trimPostText(text, max) {
    const s = String(text || "");
    const n = max || POST_TEXT_MAX;
    return s.length <= n ? s : s.slice(0, n - 1).trimEnd() + "…";
  }

  KT.xPage = {
    handleFromPath,
    statusIdFromHref,
    statusUrl,
    joinTweetText,
    trimPostText,
    RESERVED,
    HANDLE_RE,
    POST_TEXT_MAX,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = KT.xPage;
  }
})(typeof globalThis !== "undefined" ? globalThis : self);
