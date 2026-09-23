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

  KT.xPage = { handleFromPath, RESERVED, HANDLE_RE };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = KT.xPage;
  }
})(typeof globalThis !== "undefined" ? globalThis : self);
