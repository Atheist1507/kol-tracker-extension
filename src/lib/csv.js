/**
 * Parser CSV tự viết (RFC 4180) + mapper header → khoá chuẩn.
 *
 * Không dùng split(",") được: ô `description` của Sheet có dấu phẩy, có
 * xuống dòng, có dấu nháy kép bên trong. Google xuất đúng chuẩn RFC nên
 * parser chỉ cần xử lý đủ 3 ca đó.
 */
(function (root) {
  "use strict";
  const KT = (root.KT = root.KT || {});

  /** CSV text → mảng các hàng (mảng ô). Giữ nguyên chuỗi, không ép kiểu. */
  function parseCSV(text) {
    const rows = [];
    let s = String(text == null ? "" : text);
    if (s.charCodeAt(0) === 0xfeff) s = s.slice(1); // BOM của Google

    let row = [];
    let field = "";
    let started = false; // hàng này đã có gì chưa (phân biệt dòng trống cuối file)
    let inQuotes = false;

    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (inQuotes) {
        if (c === '"') {
          if (s[i + 1] === '"') {
            field += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          field += c;
        }
        continue;
      }
      if (c === '"') {
        inQuotes = true;
        started = true;
      } else if (c === ",") {
        row.push(field);
        field = "";
        started = true;
      } else if (c === "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
        started = false;
      } else if (c === "\r") {
        // \r\n — bỏ \r, để \n đóng hàng
      } else {
        field += c;
        started = true;
      }
    }
    if (started || field !== "" || row.length) {
      row.push(field);
      rows.push(row);
    }
    return rows;
  }

  /**
   * Từ điển tên cột. Người nhập có thể đặt header tiếng Anh (như spec) hoặc
   * tiếng Việt — cả hai đều phải ăn, nếu không extension im lặng trả rỗng.
   */
  const COLUMN_ALIASES = {
    handle: ["handle", "kol", "ten", "name", "username", "twitter", "tai_khoan", "nick"],
    aliases: ["aliases", "alias", "ten_khac", "ten_goi_khac", "biet_danh"],
    avatar_url: ["avatar_url", "avatar", "anh", "anh_dai_dien", "image", "img", "photo"],
    tier: ["tier", "hang", "xep_hang", "rank", "grade", "level"],
    description: ["description", "mo_ta", "dac_diem", "note", "notes", "ghi_chu"],
    source_found: ["source_found", "source", "nguon", "phat_hien_tu", "tim_thay_tu"],
    red_flags: ["red_flags", "red_flag", "co_do", "canh_bao", "warning", "warnings"],
    added_by: ["added_by", "nguoi_them", "by", "author", "added"],
    updated_at: ["updated_at", "cap_nhat", "ngay_cap_nhat", "updated", "last_update"],
    token: ["token", "coin", "ticker", "symbol", "ma_token"],
    called_at: ["called_at", "thoi_diem_call", "ngay_call", "date", "time", "called"],
    price_at_call: ["price_at_call", "gia_luc_call", "price", "gia", "entry", "mc", "marketcap"],
    chart_position: ["chart_position", "vi_tri", "vi_tri_song", "doan_song", "timing", "position"],
    result: ["result", "ket_qua", "outcome", "pnl", "ket_qua_sau_do"],
  };

  const HEADER_MAP = (() => {
    const map = {};
    for (const canonical of Object.keys(COLUMN_ALIASES)) {
      for (const alias of COLUMN_ALIASES[canonical]) map[alias] = canonical;
    }
    return map;
  })();

  /**
   * CSV text → { columns, rows }. Mỗi row là object theo khoá chuẩn; cột lạ
   * (người dùng tự thêm vào Sheet) KHÔNG bị vứt đi mà nằm trong `extra` để
   * giao diện còn hiện ra được.
   */
  function parseTable(text) {
    const raw = parseCSV(text);
    if (!raw.length) return { columns: [], rows: [] };

    const headerRow = raw[0];
    const columns = headerRow.map((h) => {
      const key = KT.headerKey(h);
      return { raw: String(h).trim(), key, canonical: HEADER_MAP[key] || null };
    });

    const rows = [];
    for (let i = 1; i < raw.length; i++) {
      const cells = raw[i];
      // Hàng trống (Sheet publish thường kèm vài dòng rỗng ở cuối)
      if (!cells.some((c) => String(c).trim() !== "")) continue;

      const obj = { extra: {} };
      for (let c = 0; c < columns.length; c++) {
        const col = columns[c];
        const value = String(cells[c] == null ? "" : cells[c]).trim();
        if (col.canonical) {
          if (!obj[col.canonical]) obj[col.canonical] = value;
        } else if (col.raw && value) {
          obj.extra[col.raw] = value;
        }
      }
      obj._row = i + 1; // số dòng thật trên Sheet, tiện đối chiếu khi sai dữ liệu
      rows.push(obj);
    }
    return { columns, rows };
  }

  KT.parseCSV = parseCSV;
  KT.parseTable = parseTable;
  KT.COLUMN_ALIASES = COLUMN_ALIASES;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { parseCSV, parseTable, COLUMN_ALIASES };
  }
})(typeof globalThis !== "undefined" ? globalThis : self);
