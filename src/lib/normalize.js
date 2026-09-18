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
   * Gỡ lớp proxy ảnh. GMGN không nhúng thẳng ảnh Twitter mà bọc qua endpoint
   * của nó: `https://gmgn.ai/external/img?url=https%3A%2F%2Fpbs.twimg.com%2F…`
   * (thấy trên trang thật 17/09/2026). Sheet thì lưu URL GỐC, nên nếu không
   * gỡ ra thì hai chuỗi chẳng bao giờ bằng nhau và overlay im lặng không khớp
   * được ai — không lỗi, không cảnh báo, chỉ là không có viền nào hiện lên.
   *
   * Lặp tối đa 3 lớp phòng proxy lồng proxy. Không phải proxy thì trả nguyên.
   */
  function unwrapProxyUrl(raw) {
    let s = String(raw == null ? "" : raw).trim();
    if (!/^https?:\/\//i.test(s)) return s;

    for (let i = 0; i < 3; i++) {
      let inner = "";
      try {
        const u = new URL(s);
        for (const value of u.searchParams.values()) {
          if (/^https?:\/\//i.test(value)) {
            inner = value;
            break;
          }
        }
        // Có proxy nhét URL thẳng vào đường dẫn: /img/https%3A%2F%2F…
        if (!inner) {
          const m = u.pathname.match(/https?%3a%2f%2f.+$/i);
          if (m) {
            try {
              inner = decodeURIComponent(m[0]);
            } catch (e) {
              inner = "";
            }
          }
        }
      } catch (e) {
        break;
      }
      if (!inner || inner === s) break;
      s = inner;
    }
    return s;
  }

  /**
   * Khoá so khớp URL avatar. Gỡ proxy, bỏ query/hash, và bỏ hậu tố kích thước
   * của Twitter (`_normal`, `_400x400`…) vì GMGN thường hiện bản resize khác
   * với bản mình lưu trong Sheet.
   */
  function avatarKey(raw) {
    let s = unwrapProxyUrl(raw);
    if (!s) return "";
    s = s.split("#")[0].split("?")[0];
    s = s.replace(/^https?:\/\//i, "").replace(/^www\./i, "");
    // Hậu tố cỡ ảnh. Ngoài bộ của Twitter còn có bộ của bucket ảnh mà GMGN
    // đang dùng (prod-fomo-profile-pics…/<hash>_small.jpg — thấy trong HTML
    // tooltip thật 17/09/2026): cùng một người, hai cỡ, hai URL khác nhau.
    s = s.replace(
      /_(normal|bigger|mini|reasonably_small|small|medium|large|big|thumb|thumbnail|orig|original|square|\d+x\d+|x\d+)(\.[a-z]{3,4})$/i,
      "$2"
    );
    s = s.toLowerCase();

    // GMGN phục vụ CÙNG một avatar qua hai đường khác nhau:
    //   API trả   /defi/images/twitter/<md5>.jpg
    //   trang dùng /external-res/<md5>_v2.webp
    // Cùng một ảnh, hai URL, không đường nào gỡ ngược ra URL gốc trên X được.
    // Rút về phần hash là hai bên gặp nhau. Trùng hash = trùng ảnh, nên không
    // đẻ ra khớp nhầm — trừ khi hai người dùng CHUNG một ảnh, mà lúc đó thì
    // URL đầy đủ cũng trùng y như vậy.
    const hash = s.match(/(?:^|\/)([0-9a-f]{32})(?:_[a-z0-9]+)?\.[a-z]{3,4}$/);
    return hash ? hash[1] : s;
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
  KT.unwrapProxyUrl = unwrapProxyUrl;
  KT.avatarKey = avatarKey;
  KT.splitList = splitList;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      stripAccents,
      headerKey,
      displayHandle,
      handleKey,
      tokenKey,
      unwrapProxyUrl,
      avatarKey,
      splitList,
    };
  }
})(typeof globalThis !== "undefined" ? globalThis : self);
