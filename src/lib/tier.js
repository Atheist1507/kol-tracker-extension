/**
 * Tier (S/A/B/C…) → chữ cái + màu. Màu là NGÔN NGỮ CHÍNH của extension:
 * mục tiêu cuối là nhìn viền avatar trên chart biết ngay nên tin tới đâu.
 */
(function (root) {
  "use strict";
  const KT = (root.KT = root.KT || {});

  const TIER_ORDER = ["S", "A", "B", "C", "D", "F"];

  const TIER_COLORS = {
    S: "#E8B84B", // vàng — đỉnh thang, để dành riêng cho S
    A: "#3FB950", // xanh lá
    B: "#58A6FF", // xanh lam
    C: "#A371F7", // tím
    D: "#F0883E", // cam
    F: "#F85149", // đỏ
    "": "#8B949E", // chưa xếp hạng
  };

  /**
   * "S+", "Hạng A", "tier b", "C-" → "S" / "A" / "B" / "C".
   * Bỏ các từ chỉ mục ("tier"/"hạng"/"rank") TRƯỚC khi bắt chữ cái, nếu không
   * "Tier S" trả ra chữ T rồi rơi về "chưa xếp hạng".
   */
  function tierLetter(raw) {
    const cleaned = KT.stripAccents(raw)
      .toUpperCase()
      .replace(/TIER|HANG|RANK|XEP|LOAI|CAP|LEVEL|GRADE/g, " ");
    const m = cleaned.match(/[SABCDF]/);
    return m ? m[0] : "";
  }

  function tierColor(raw) {
    return TIER_COLORS[tierLetter(raw)] || TIER_COLORS[""];
  }

  /** Thứ tự sắp xếp: S trước, chưa xếp hạng xuống cuối. */
  function tierRank(raw) {
    const i = TIER_ORDER.indexOf(tierLetter(raw));
    return i === -1 ? TIER_ORDER.length : i;
  }

  KT.TIER_ORDER = TIER_ORDER;
  KT.TIER_COLORS = TIER_COLORS;
  KT.tierLetter = tierLetter;
  KT.tierColor = tierColor;
  KT.tierRank = tierRank;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { TIER_ORDER, TIER_COLORS, tierLetter, tierColor, tierRank };
  }
})(typeof globalThis !== "undefined" ? globalThis : self);
