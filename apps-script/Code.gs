/**
 * KOL Tracker — cầu nối giữa extension và chính Google Sheet này.
 *
 * Code này sống TRONG file Sheet (Tiện ích mở rộng → Apps Script), không phải
 * một dịch vụ bên ngoài. Nó làm hai việc:
 *   - doGet  : trả dữ liệu 2 tab dạng JSON cho extension đọc
 *   - doPost : nhận một lần ghi chú → thêm dòng vào Detail, tạo/cập nhật dòng
 *              tương ứng bên Overview
 *
 * Xem apps-script/README.md để biết các bước deploy.
 */

/**
 * ⚠ ĐỔI CHUỖI NÀY trước khi deploy, rồi dán đúng chuỗi đó vào Options của
 * extension. Web app deploy ở chế độ "Anyone" nên URL ai có cũng gọi được;
 * chuỗi này là thứ duy nhất chặn người mò trúng URL ghi bậy vào Sheet.
 * Không phải bảo mật thật — nhưng Sheet có Version history, sai thì khôi phục.
 */
const SECRET = "doi-chuoi-nay-di";

const OVERVIEW = "Overview";
const DETAIL = "Detail";

/** Thứ tự cột. Đổi ở đây thì đổi cả trong extension (src/lib/sheet-schema.js). */
const OVERVIEW_HEADERS = [
  "wallet",
  "username",
  "display_name",
  "twitter_url",
  "avatar_url",
  "tier",
  "summary",
  "red_flags",
  "followers",
  "is_kol",
  "first_seen",
  "last_noted",
  "note_count",
  "added_by",
];

const DETAIL_HEADERS = [
  "wallet",
  "username",
  "noted_at",
  "chain",
  "token",
  "token_address",
  "post_id",
  "post_text",
  "posted_at",
  "multiplier_at_note",
  "holding_state",
  "pnl_usd_at_note",
  "note",
  "chart_position",
  "result",
  "source_url",
  "added_by",
];

/** Cột bên Overview do NGƯỜI giữ — ghi đè là xoá mất công research. */
const USER_OWNED = ["tier", "summary", "red_flags"];

/* ------------------------------------------------------------------ */
/* Dựng Sheet                                                          */
/* ------------------------------------------------------------------ */

/**
 * Chạy MỘT LẦN từ trình soạn thảo Apps Script (chọn hàm `setup` → Run).
 * Tạo 2 tab nếu chưa có, đặt tiêu đề, đóng băng dòng 1. Chạy lại nhiều lần
 * cũng không sao — nó không đụng vào dữ liệu đã có.
 */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureSheet_(ss, OVERVIEW, OVERVIEW_HEADERS, [140, 130, 120, 180, 200, 50, 260, 260, 80, 60, 100, 100, 80, 80]);
  ensureSheet_(ss, DETAIL, DETAIL_HEADERS, [140, 130, 150, 80, 90, 140, 180, 320, 150, 90, 110, 100, 320, 100, 90, 200, 80]);
  SpreadsheetApp.getUi().alert(
    "Xong. Đã có 2 tab Overview và Detail.\n\n" +
      "Bước tiếp: Deploy → New deployment → Web app → Execute as: Me → " +
      'Who has access: Anyone → Deploy, rồi copy URL dán vào Options của extension.'
  );
}

function ensureSheet_(ss, name, headers, widths) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);

  sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight("bold");
  sh.setFrozenRows(1);
  for (let i = 0; i < widths.length; i++) sh.setColumnWidth(i + 1, widths[i]);
  return sh;
}

/* ------------------------------------------------------------------ */
/* Đọc                                                                 */
/* ------------------------------------------------------------------ */

function doGet(e) {
  const params = (e && e.parameter) || {};
  if (params.secret !== SECRET) return json_({ ok: false, error: "sai secret" });

  if (params.action === "ping") {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    return json_({
      ok: true,
      sheet: ss.getName(),
      hasOverview: !!ss.getSheetByName(OVERVIEW),
      hasDetail: !!ss.getSheetByName(DETAIL),
      overviewRows: countRows_(ss, OVERVIEW),
      detailRows: countRows_(ss, DETAIL),
    });
  }

  return json_({
    ok: true,
    overview: readSheet_(OVERVIEW),
    detail: readSheet_(DETAIL),
    syncedAt: new Date().toISOString(),
  });
}

function countRows_(ss, name) {
  const sh = ss.getSheetByName(name);
  return sh ? Math.max(0, sh.getLastRow() - 1) : 0;
}

/** Một tab → mảng object theo tên cột ở dòng 1. Ô trống thành chuỗi rỗng. */
function readSheet_(name) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sh || sh.getLastRow() < 2) return [];

  const values = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getDisplayValues();
  const headers = values[0].map(function (h) {
    return String(h).trim();
  });

  const out = [];
  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    if (!row.some(function (c) { return String(c).trim() !== ""; })) continue;
    const obj = {};
    for (let c = 0; c < headers.length; c++) {
      if (headers[c]) obj[headers[c]] = String(row[c] == null ? "" : row[c]).trim();
    }
    obj._row = r + 1;
    out.push(obj);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Ghi                                                                 */
/* ------------------------------------------------------------------ */

function doPost(e) {
  let body;
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || "{}");
  } catch (err) {
    return json_({ ok: false, error: "body không phải JSON" });
  }
  if (body.secret !== SECRET) return json_({ ok: false, error: "sai secret" });

  // Hai người có thể bấm lưu cùng lúc; không khoá thì hai dòng đè lên nhau.
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
  } catch (err) {
    return json_({ ok: false, error: "Sheet đang bận, thử lại sau vài giây" });
  }

  try {
    if (body.action === "note") return json_(saveNote_(body));
    return json_({ ok: false, error: "action lạ: " + body.action });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message ? err.message : err) });
  } finally {
    lock.releaseLock();
  }
}

/**
 * Lưu một lần ghi chú: luôn thêm một dòng Detail, và tạo (hoặc cập nhật nhẹ)
 * dòng Overview của người đó.
 *
 * `person` và `detail` là object theo đúng tên cột ở trên.
 */
function saveNote_(body) {
  const person = body.person || {};
  const detail = body.detail || {};
  const wallet = String(person.wallet || detail.wallet || "").trim().toLowerCase();
  if (!wallet) return { ok: false, error: "thiếu wallet" };

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const overview = ss.getSheetByName(OVERVIEW);
  const detailSheet = ss.getSheetByName(DETAIL);
  if (!overview || !detailSheet) return { ok: false, error: "chưa chạy setup()" };

  // Mốc thời gian ghi vào Sheet là để NGƯỜI đọc, nên viết kiểu Việt và theo
  // múi giờ của chính file Sheet. Chuỗi ISO đúng cho máy nhưng không ai đọc
  // được, mà còn lệch mấy tiếng so với lúc thật sự bấm lưu.
  // ⚠ Đánh đổi: dd/MM/yyyy KHÔNG sắp xếp đúng khi sort cột đó như chữ (ISO thì
  // có). Extension tự sắp theo mốc đã parse nên không ảnh hưởng; cần sort
  // trong Sheet thì sort theo cột khác.
  const nowIso = nowStamp_();

  // --- Detail: luôn thêm dòng mới, mỗi lần note là một dòng ---
  detail.wallet = wallet;
  if (!detail.noted_at) detail.noted_at = nowIso;
  detailSheet.appendRow(rowFor_(DETAIL_HEADERS, detail));

  // --- Overview: có rồi thì cập nhật phần MÁY biết, chưa có thì tạo ---
  const found = findRowByWallet_(overview, wallet);
  const created = !found;

  const noteCount = countNotesFor_(detailSheet, wallet);

  if (created) {
    person.wallet = wallet;
    person.first_seen = person.first_seen || nowIso;
    person.last_noted = nowIso;
    person.note_count = noteCount;
    overview.appendRow(rowFor_(OVERVIEW_HEADERS, person));
  } else {
    updateOverviewRow_(overview, found, person, nowIso, noteCount);
  }

  return { ok: true, wallet: wallet, createdPerson: created, noteCount: noteCount };
}

/**
 * Đếm số ghi chú của một ví, bằng SỐ chứ không phải công thức.
 *
 * ⚠ Bản đầu ghi `=COUNTIF(Detail!$A:$A, $A2)` vào ô. Sai, và chỉ lộ ra trên
 * Sheet thật: Sheet để locale Việt Nam thì dấu ngăn tham số là `;` chứ không
 * phải `,`, nên công thức thành #ERROR!. Mà `appendRow` ghi chuỗi mở đầu bằng
 * `=` thì Sheets parse THEO LOCALE của file, không theo cú pháp Mỹ.
 *
 * Đếm sẵn rồi ghi số thì không phụ thuộc locale, và cũng không có gì để hỏng
 * khi ai đó kéo-thả hay sắp xếp lại các dòng.
 */
/** "18/09/2026 lúc 14:37" theo múi giờ của file Sheet. */
function nowStamp_() {
  const tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone() || "Asia/Ho_Chi_Minh";
  return Utilities.formatDate(new Date(), tz, "dd/MM/yyyy 'lúc' HH:mm");
}

function countNotesFor_(detailSheet, wallet) {
  const last = detailSheet.getLastRow();
  if (last < 2) return 0;
  const values = detailSheet.getRange(2, 1, last - 1, 1).getValues();
  let n = 0;
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][0]).trim().toLowerCase() === wallet) n++;
  }
  return n;
}

/**
 * Cập nhật dòng Overview đã có. CHỈ ghi đè những cột máy biết chắc
 * (username/display_name/avatar/followers…) và `last_noted`.
 * `tier`/`summary`/`red_flags` là chữ người viết — không bao giờ đụng vào,
 * trừ khi lần lưu này gửi giá trị mới cho đúng cột đó.
 */
function updateOverviewRow_(sheet, rowNumber, person, nowIso, noteCount) {
  const width = OVERVIEW_HEADERS.length;
  const range = sheet.getRange(rowNumber, 1, 1, width);
  const current = range.getValues()[0];

  for (let c = 0; c < width; c++) {
    const key = OVERVIEW_HEADERS[c];
    if (key === "wallet" || key === "first_seen") continue;
    if (key === "note_count") {
      current[c] = noteCount;
      continue;
    }
    if (key === "last_noted") {
      current[c] = nowIso;
      continue;
    }
    const incoming = person[key];
    if (incoming === undefined || incoming === null || incoming === "") continue;
    // Cột của người: chỉ ghi khi lần lưu này thật sự gửi lên
    if (USER_OWNED.indexOf(key) !== -1 && !person.hasOwnProperty(key)) continue;
    current[c] = safeValue_(incoming);
  }
  range.setValues([current]);
}

function findRowByWallet_(sheet, wallet) {
  const last = sheet.getLastRow();
  if (last < 2) return 0;
  const values = sheet.getRange(2, 1, last - 1, 1).getValues();
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][0]).trim().toLowerCase() === wallet) return i + 2;
  }
  return 0;
}

function rowFor_(headers, obj) {
  return headers.map(function (key) {
    return safeValue_(obj[key]);
  });
}

/**
 * ⚠ Chuỗi mở đầu bằng = + - @ bị Sheets hiểu là CÔNG THỨC.
 * Ô `note` là chữ người gõ tự do, `post_text` là chữ người lạ viết — một bài
 * post mở đầu bằng "+300% ez" là đủ để ô đó thành #NAME? và dữ liệu biến mất.
 * Thêm dấu nháy đơn để ép về text.
 */
function safeValue_(value) {
  if (value === undefined || value === null) return "";
  if (typeof value === "number" || typeof value === "boolean") return value;
  const s = String(value);
  if (s && "=+-@".indexOf(s.charAt(0)) !== -1) return "'" + s;
  return s;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
