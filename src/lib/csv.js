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
    // --- Overview: một dòng một người ---
    wallet: ["wallet", "wallet_address", "vi", "dia_chi_vi", "address"],
    username: ["username", "handle", "user", "ten_x", "x", "twitter", "nick"],
    display_name: ["display_name", "ten_hien_thi", "name", "ten"],
    twitter_url: ["twitter_url", "user_twitter_url", "x_url", "link_x", "link"],
    avatar_url: ["avatar_url", "avatar", "anh", "anh_dai_dien", "profile_image_url", "image"],
    tier: ["tier", "hang", "xep_hang", "rank", "grade", "level"],
    summary: ["summary", "tom_tat", "mo_ta", "description", "dac_diem"],
    red_flags: ["red_flags", "red_flag", "co_do", "canh_bao", "warning", "warnings"],
    followers: ["followers", "follower_count", "so_follower"],
    is_kol: ["is_kol", "kol"],
    first_seen: ["first_seen", "lan_dau_thay", "source_found", "nguon"],
    last_noted: ["last_noted", "lan_note_cuoi", "updated_at", "cap_nhat"],
    note_count: ["note_count", "so_note"],

    // --- Detail: một dòng một lần ghi chú ---
    noted_at: ["noted_at", "ngay_note", "thoi_diem_note"],
    chain: ["chain", "mang"],
    token: ["token", "coin", "ticker", "symbol", "ma_token"],
    token_address: ["token_address", "dia_chi_token", "contract"],
    post_id: ["post_id", "id_post", "message_id"],
    post_text: ["post_text", "noi_dung_post", "content", "post"],
    posted_at: ["posted_at", "ngay_post", "called_at", "thoi_diem_call"],
    multiplier_at_note: ["multiplier_at_note", "multiplier", "x", "he_so"],
    holding_state: ["holding_state", "tinh_trang_nam_giu", "holding"],
    pnl_usd_at_note: ["pnl_usd_at_note", "pnl", "pnl_usd", "lai_lo"],
    note: ["note", "ghi_chu", "notes", "nhan_xet"],
    chart_position: ["chart_position", "vi_tri", "vi_tri_song", "doan_song", "timing", "position"],
    result: ["result", "ket_qua", "outcome"],
    source_url: ["source_url", "link_nguon", "url"],

    // --- cả hai tab ---
    added_by: ["added_by", "nguoi_them", "by", "author", "added"],
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

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { parseCSV, parseTable, COLUMN_ALIASES };
  }
})(typeof globalThis !== "undefined" ? globalThis : self);
