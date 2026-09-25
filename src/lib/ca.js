/**
 * Bắt địa chỉ contract trong một đoạn chữ, rồi dựng link mở thẳng GMGN.
 *
 * Crypto X dán contract address suốt, và thao tác tay sau đó lúc nào cũng y
 * hệt: bôi đen → copy → đổi tab → dán. Cắt được ba bước đó là cắt đúng chỗ
 * tốn nhất của việc research.
 *
 * ⚠ Vì sao KHÔNG dùng regex quét giữa câu (`/\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/`)
 * mà lại cắt chữ thành từng TỪ rồi so khớp cả từ:
 *
 * Chữ ký giao dịch Solana dài 87–88 ký tự base58. Regex có {32,44} gặp một
 * dãy 88 ký tự thì không khớp được từ đầu (sau ký tự thứ 44 vẫn là ký tự chữ
 * nên `\b` trượt), nhưng nó sẽ TRƯỢT SANG vị trí 44 rồi khớp trọn 44 ký tự
 * cuối — ra một "địa chỉ" là nửa sau của một chữ ký, link dẫn tới trang trống.
 * Cắt theo từ thì một từ 88 ký tự đơn giản là không khớp, hết chuyện.
 */
(function (root) {
  "use strict";
  const KT = (root.KT = root.KT || {});

  /** base58: không có 0, O, I, l — chính chỗ đó cứu mình khỏi khớp chữ thường. */
  const SOL_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
  const EVM_RE = /^0x[0-9a-fA-F]{40}$/;

  /**
   * Mấy chuỗi dài giống base58 nhưng KHÔNG phải contract. Cái đắt nhất là
   * chữ ký giao dịch (87–88) — đã chặn bằng độ dài. Còn lại là mã hash ảnh
   * 32 ký tự HEX (GMGN dùng đúng kiểu đó cho avatar): hex thì chỉ có a-f nên
   * loại được bằng cách đòi ít nhất một ký tự ngoài dải hex.
   */
  function looksLikeHex32(word) {
    return word.length === 32 && /^[0-9a-f]+$/.test(word);
  }

  /**
   * Trả về mảng `{ addr, chain }` theo đúng thứ tự xuất hiện, không trùng.
   * `chain` là "sol" hoặc "evm" — CHƯA phải chain cụ thể, xem `gmgnUrl`.
   */
  function findAddresses(text) {
    const words = String(text || "").split(/[^0-9A-Za-z]+/);
    const out = [];
    const seen = Object.create(null);
    for (const w of words) {
      if (!w || w.length < 32) continue;
      let chain = "";
      if (EVM_RE.test(w)) chain = "evm";
      else if (SOL_RE.test(w) && !looksLikeHex32(w)) chain = "sol";
      if (!chain) continue;
      const key = chain === "evm" ? w.toLowerCase() : w;
      if (seen[key]) continue;
      seen[key] = true;
      out.push({ addr: w, chain });
    }
    return out;
  }

  /**
   * Link trang token của GMGN.
   *
   * ⚠ Với địa chỉ 0x thì chain là một câu ĐOÁN: eth, base, bsc, arbitrum đều
   * dùng chung một dạng địa chỉ, mà trong bài viết thì không có gì nói là
   * chain nào. Mặc định "eth" — đoán sai thì GMGN mở ra trang không có token,
   * chứ không dẫn sai sang một token khác. Đó là lý do nhãn trên chip phải
   * nói rõ chain nào, để người bấm biết mình đang đoán.
   */
  function gmgnUrl(addr, chain) {
    const c = chain === "evm" ? "eth" : "sol";
    return "https://gmgn.ai/" + c + "/token/" + addr;
  }

  /** `9xQeWv…usVFin` — đủ để nhận ra, không chiếm cả dòng. */
  function shortAddr(addr) {
    const s = String(addr || "");
    return s.length <= 14 ? s : s.slice(0, 6) + "…" + s.slice(-6);
  }

  KT.ca = { findAddresses, gmgnUrl, shortAddr, SOL_RE, EVM_RE };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = KT.ca;
  }
})(typeof globalThis !== "undefined" ? globalThis : self);
