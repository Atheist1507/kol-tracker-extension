/** Cấu hình + khoá storage, khai MỘT chỗ cho content script / popup / options / SW. */
(function (root) {
  "use strict";
  const KT = (root.KT = root.KT || {});

  const DEFAULTS = {
    // Apps Script Web App — đường ĐỌC và GHI chính (xem apps-script/README.md)
    sheetApiUrl: "",
    sheetApiSecret: "",
    addedBy: "", // tên của mày, ghi vào cột added_by để biết ai note cái gì
    // CSV publish-to-web — đường đọc cũ, chỉ đọc, giữ làm dự phòng
    kolsCsvUrl: "",
    callsCsvUrl: "",
    sheetUrl: "", // link /edit để bấm "Mở Sheet" khi cần thêm người mới
    refreshMinutes: 30, // 0 = chỉ làm tươi thủ công
    staleMinutes: 10, // mở trang GMGN mà dữ liệu cũ hơn ngần này thì tự fetch
    winMultiple: 2, // từ xN trở lên tính là call thắng
    minSample: 5, // dưới ngần này case thì win rate chưa đáng tin
    panelEnabled: true,
    overlayRings: true, // viền màu quanh avatar quen mặt trên chart
    overlayHover: true, // hover avatar → thẻ tóm tắt
  };

  const STORAGE = {
    CONFIG: "config", // chrome.storage.sync
    DATA: "data", // chrome.storage.local — { kols, calls, syncedAt, error }
    UI: "ui", // chrome.storage.local — vị trí panel
  };

  const MSG = {
    REFRESH: "kt:refresh",
    GET_DATA: "kt:getData",
    TOGGLE_PANEL: "kt:togglePanel",
    DATA_CHANGED: "kt:dataChanged",
    DIAGNOSE: "kt:diagnose", // popup hỏi content script: chart này canvas hay DOM?
    TEST_URL: "kt:testUrl", // Options thử một link CSV trước khi lưu
    SHEET_PING: "kt:sheetPing", // Options thử kết nối Apps Script
    SAVE_NOTE: "kt:saveNote", // hộp ghi chú → Apps Script → Sheet
  };

  /**
   * Thứ tự nạp content script — khai MỘT chỗ vì có HAI đường chèn: khai báo
   * trong manifest (trang GMGN) và chrome.scripting.executeScript (popup bấm
   * "bật panel trên tab này"). Hai danh sách lệch nhau = panel chạy ở chỗ này
   * mà không chạy ở chỗ kia, không có lỗi nào hiện ra.
   */
  const CONTENT_FILES = [
    "src/lib/normalize.js",
    "src/lib/csv.js",
    "src/lib/tier.js",
    "src/lib/stats.js",
    "src/lib/model.js",
    "src/lib/gmgn.js",
    "src/lib/tooltip-text.js",
    "src/lib/sheet-url.js",
    "src/lib/config.js",
    "src/lib/styles.js",
    "src/lib/render.js",
    "content/overlay.js",
    "content/note-box.js",
    "content/panel.js",
    "content/content.js",
  ];

  function withDefaults(cfg) {
    return Object.assign({}, DEFAULTS, cfg || {});
  }

  async function getConfig() {
    const got = await chrome.storage.sync.get(STORAGE.CONFIG);
    return withDefaults(got[STORAGE.CONFIG]);
  }

  async function setConfig(patch) {
    const current = await getConfig();
    const next = Object.assign({}, current, patch);
    await chrome.storage.sync.set({ [STORAGE.CONFIG]: next });
    return next;
  }

  async function getData() {
    const got = await chrome.storage.local.get(STORAGE.DATA);
    return got[STORAGE.DATA] || { overview: [], detail: [], syncedAt: 0, error: null };
  }

  KT.DEFAULTS = DEFAULTS;
  KT.CONTENT_FILES = CONTENT_FILES;
  KT.STORAGE = STORAGE;
  KT.MSG = MSG;
  KT.withDefaults = withDefaults;
  KT.getConfig = getConfig;
  KT.setConfig = setConfig;
  KT.getData = getData;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { DEFAULTS, STORAGE, MSG, CONTENT_FILES, withDefaults };
  }
})(typeof globalThis !== "undefined" ? globalThis : self);
