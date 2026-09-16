/**
 * Người dùng paste cái gì cũng phải ra được link CSV.
 *
 * Setup đúng chuẩn của spec là File → Share → Publish to web → CSV. Nhưng
 * lúc đang vội thì thứ nằm trong clipboard thường là URL trên thanh địa chỉ
 * (`/edit#gid=…`). Bắt người ta tự sửa tay = một bước dễ sai im lặng: dán
 * nhầm link edit thì fetch trả về HTML, extension chỉ báo "không có dữ liệu".
 */
(function (root) {
  "use strict";
  const KT = (root.KT = root.KT || {});

  /**
   * → { url, kind, warning } hoặc { error }.
   * kind: "publish" (publish-to-web, ai có link cũng đọc được)
   *     | "export"  (link /edit — CHỈ chạy nếu Sheet đã bật "anyone with the link")
   */
  function toCsvUrl(input) {
    const raw = String(input == null ? "" : input).trim();
    if (!raw) return { error: "Chưa có link." };

    let u;
    try {
      u = new URL(raw);
    } catch (e) {
      return { error: "Không phải URL hợp lệ." };
    }
    if (!/(^|\.)docs\.google\.com$/i.test(u.hostname)) {
      return { error: "Phải là link Google Sheets (docs.google.com)." };
    }

    // Dạng publish-to-web: .../spreadsheets/d/e/<KEY>/pub | pubhtml
    const pub = u.pathname.match(/^\/spreadsheets\/d\/e\/([^/]+)\/pub(html)?$/);
    if (pub) {
      const out = new URL(u.toString());
      out.pathname = `/spreadsheets/d/e/${pub[1]}/pub`;
      out.searchParams.set("output", "csv");
      out.searchParams.set("single", "true");
      if (!out.searchParams.get("gid") && u.hash) {
        const g = u.hash.match(/gid=(\d+)/);
        if (g) out.searchParams.set("gid", g[1]);
      }
      out.hash = "";
      return { url: out.toString(), kind: "publish" };
    }

    // Dạng link thường: .../spreadsheets/d/<ID>/edit#gid=123
    const doc = u.pathname.match(/^\/spreadsheets\/d\/([^/]+)/);
    if (doc) {
      const gid =
        (u.hash.match(/gid=(\d+)/) || [])[1] || u.searchParams.get("gid") || "0";
      const out = new URL(`https://docs.google.com/spreadsheets/d/${doc[1]}/export`);
      out.searchParams.set("format", "csv");
      out.searchParams.set("gid", gid);
      return {
        url: out.toString(),
        kind: "export",
        warning:
          "Đây là link /edit nên chỉ đọc được nếu Sheet đã bật chia sẻ “Anyone with the link”. Ổn định hơn thì dùng File → Share → Publish to web → CSV.",
      };
    }

    return { error: "Link Google nhưng không phải Google Sheets." };
  }

  /** Nội dung fetch về có phải CSV thật không (dán nhầm link → Google trả HTML). */
  function looksLikeCsv(text) {
    const head = String(text == null ? "" : text).slice(0, 400).trim();
    if (!head) return false;
    return !/^<(!doctype|html|\?xml)/i.test(head);
  }

  KT.toCsvUrl = toCsvUrl;
  KT.looksLikeCsv = looksLikeCsv;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { toCsvUrl, looksLikeCsv };
  }
})(typeof globalThis !== "undefined" ? globalThis : self);
