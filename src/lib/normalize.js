/**
 * Chuẩn hoá chuỗi — nền của MỌI phép so khớp trong extension.
 *
 * Dữ liệu do người gõ tay vào Google Sheet nên không có gì đảm bảo:
 * "@Foo", "foo", "x.com/Foo", "Foo " đều là một người. Mọi nơi cần so khớp
 * phải đi qua handleKey() chứ đừng tự .toLowerCase() tại chỗ.
 */
(function (root) {
  "use strict";
  const KT = (root.KT = root.KT || {});

  /** Bỏ dấu tiếng Việt (kể cả đ/Đ — NFD không tách được chữ này). */
  function stripAccents(s) {
    return String(s == null ? "" : s)
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/đ/g, "d")
      .replace(/Đ/g, "D");
  }

  /** Tên cột trong Sheet → khoá máy đọc được: "Red Flags" / "Cờ đỏ" → "red_flags" / "co_do". */
  function headerKey(s) {
    return stripAccents(s)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
  }

  const PROFILE_URL_RE =
    /(?:twitter\.com|x\.com|t\.me|telegram\.me|tiktok\.com|youtube\.com|instagram\.com|warpcast\.com)\/(?:@)?([^/?#\s]+)/i;

  /** Lấy phần handle "nhìn thấy được" từ thứ người ta paste vào (URL, @tên, tên trần). */
  function displayHandle(raw) {
    let s = String(raw == null ? "" : raw).trim();
    if (!s) return "";
    const m = s.match(PROFILE_URL_RE);
    if (m) s = m[1];
    s = s.replace(/^@+/, "").trim();
    return s;
  }

  /**
   * Khoá so khớp của một handle. Bỏ dấu, bỏ mọi ký tự không phải chữ/số —
   * nên "crypto_ape", "Crypto Ape" và "@cryptoape" gộp làm một. Gộp hơi rộng
   * là CỐ Ý: nhầm hai người khác nhau còn đỡ hơn tra không ra người mình cần.
   */
  function handleKey(raw) {
    return stripAccents(displayHandle(raw)).toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  /** Token: "$pepe" / " PEPE " → "PEPE". */
  function tokenKey(raw) {
    return stripAccents(raw).toUpperCase().replace(/[^A-Z0-9]/g, "");
  }

  /**
   * Khoá so khớp URL avatar. Bỏ query/hash, và bỏ hậu tố kích thước của
   * Twitter (`_normal`, `_400x400`…) vì GMGN thường hiện bản resize khác với
   * bản mình lưu trong Sheet.
   */
  function avatarKey(raw) {
    let s = String(raw == null ? "" : raw).trim();
    if (!s) return "";
    s = s.split("#")[0].split("?")[0];
    s = s.replace(/^https?:\/\//i, "").replace(/^www\./i, "");
    s = s.replace(/_(normal|bigger|mini|reasonably_small|\d+x\d+|x\d+)(\.[a-z]{3,4})$/i, "$2");
    return s.toLowerCase();
  }

  /** Tách ô "aliases" nhiều giá trị: phẩy, chấm phẩy, gạch đứng, xuống dòng. */
  function splitList(raw) {
    return String(raw == null ? "" : raw)
      .split(/[,;|\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  KT.stripAccents = stripAccents;
  KT.headerKey = headerKey;
  KT.displayHandle = displayHandle;
  KT.handleKey = handleKey;
  KT.tokenKey = tokenKey;
  KT.avatarKey = avatarKey;
  KT.splitList = splitList;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { stripAccents, headerKey, displayHandle, handleKey, tokenKey, avatarKey, splitList };
  }
})(typeof globalThis !== "undefined" ? globalThis : self);
