/**
 * Trang cài đặt. Lưu NGAY khi gõ (debounce) chứ không có nút Save: cấu hình
 * chỉ có vài ô, mà một nút Save quên bấm là extension im lặng chạy sai link.
 */
(async function () {
  "use strict";
  const KT = globalThis.KT;

  const TEXT_FIELDS = ["sheetApiUrl", "sheetApiSecret", "kolsCsvUrl", "callsCsvUrl", "sheetUrl"];
  const NUMBER_FIELDS = ["winMultiple", "minSample", "refreshMinutes", "staleMinutes"];
  const BOOL_FIELDS = ["panelEnabled", "overlayRings", "overlayHover"];

  const KOL_HEADERS = [
    "handle",
    "aliases",
    "avatar_url",
    "tier",
    "description",
    "source_found",
    "red_flags",
    "added_by",
    "updated_at",
  ];
  const CALL_HEADERS = [
    "handle",
    "token",
    "called_at",
    "price_at_call",
    "chart_position",
    "result",
    "added_by",
  ];

  const $ = (id) => document.getElementById(id);

  document.getElementById("kols-headers").textContent = KOL_HEADERS.join(",");
  document.getElementById("calls-headers").textContent = CALL_HEADERS.join(",");

  let cfg = await KT.getConfig();

  for (const key of TEXT_FIELDS) $(key).value = cfg[key] || "";
  for (const key of NUMBER_FIELDS) $(key).value = cfg[key];
  for (const key of BOOL_FIELDS) $(key).checked = !!cfg[key];

  let saveTimer = null;
  function flashSaved() {
    const el = $("saved");
    el.textContent = "Đã lưu";
    clearTimeout(flashSaved.t);
    flashSaved.t = setTimeout(() => (el.textContent = ""), 1500);
  }

  function collect() {
    const patch = {};
    for (const key of TEXT_FIELDS) patch[key] = $(key).value.trim();
    for (const key of NUMBER_FIELDS) {
      const n = parseFloat($(key).value);
      patch[key] = Number.isFinite(n) ? n : KT.DEFAULTS[key];
    }
    for (const key of BOOL_FIELDS) patch[key] = $(key).checked;
    return patch;
  }

  function queueSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      cfg = await KT.setConfig(collect());
      flashSaved();
      renderStatus();
    }, 350);
  }

  for (const key of [...TEXT_FIELDS, ...NUMBER_FIELDS]) $(key).addEventListener("input", queueSave);
  for (const key of BOOL_FIELDS) $(key).addEventListener("change", queueSave);

  /* ---------- thử link ---------- */

  document.querySelectorAll("[data-test]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const key = btn.dataset.test;
      const out = $(key + "-test");
      const url = $(key).value.trim();
      if (!url) {
        out.className = "test err";
        out.textContent = "Chưa có link.";
        return;
      }
      out.className = "test";
      out.textContent = "Đang thử…";

      const res = await chrome.runtime.sendMessage({ type: KT.MSG.TEST_URL, url });
      if (!res || !res.ok) {
        out.className = "test err";
        out.textContent = "✕ " + ((res && res.error) || "không gọi được service worker");
        return;
      }
      const missing = (key === "kolsCsvUrl" ? ["handle"] : ["handle", "token"]).filter(
        (c) => !res.known.includes(c)
      );
      const bits = [`✓ đọc được ${res.rows} dòng`];
      if (res.known.length) bits.push(`cột hiểu được: ${res.known.join(", ")}`);
      if (res.unknown.length) bits.push(`cột lạ (vẫn hiện ở thẻ chi tiết): ${res.unknown.join(", ")}`);
      out.className = missing.length || res.warning ? "test warn" : "test ok";
      if (missing.length) bits.push(`⚠ thiếu cột bắt buộc: ${missing.join(", ")}`);
      if (res.warning) bits.push("⚠ " + res.warning);
      out.textContent = bits.join(" · ");
    });
  });

  /* ---------- thử kết nối Apps Script ---------- */

  $("sheet-ping").addEventListener("click", async () => {
    const out = $("sheetApi-test");
    out.className = "test";
    out.textContent = "Đang thử…";

    const res = await chrome.runtime.sendMessage({
      type: KT.MSG.SHEET_PING,
      url: $("sheetApiUrl").value.trim(),
      secret: $("sheetApiSecret").value.trim(),
    });

    if (!res || !res.ok) {
      out.className = "test err";
      out.textContent = "✕ " + ((res && res.error) || "không gọi được service worker");
      return;
    }
    if (!res.hasOverview || !res.hasDetail) {
      out.className = "test warn";
      out.textContent =
        "Kết nối được, nhưng Sheet chưa có đủ 2 tab. Mở Apps Script chạy hàm setup() một lần.";
      return;
    }
    out.className = "test ok";
    out.textContent =
      `✓ Đã nối "${res.sheet}" · Overview ${res.overviewRows} dòng · Detail ${res.detailRows} dòng`;
  });

  /* ---------- copy tiêu đề ---------- */

  document.querySelectorAll("[data-copy]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await navigator.clipboard.writeText(document.getElementById(btn.dataset.copy).textContent);
      btn.textContent = "Đã copy";
      setTimeout(() => (btn.textContent = "Copy dòng tiêu đề"), 1400);
    });
  });

  /* ---------- trạng thái dữ liệu ---------- */

  async function renderStatus() {
    const data = await KT.getData();
    const el = $("status");
    if (data.error) {
      el.className = "status err";
      el.textContent = data.error;
      return;
    }
    if (!data.syncedAt) {
      el.className = "status";
      el.textContent = "Chưa tải lần nào.";
      return;
    }
    const db = KT.buildDb(data.kols, data.calls, cfg);
    const ghosts = db.kols.filter((k) => k.ghost);
    el.className = "status";
    el.textContent =
      `${db.counts.kols} KOL · ${db.counts.calls} call · cập nhật ${KT.timeAgo(data.syncedAt)}` +
      (ghosts.length ? ` · ${ghosts.length} handle có call nhưng chưa có hồ sơ ở tab KOLs` : "");
  }

  $("refresh").addEventListener("click", async () => {
    $("status").textContent = "Đang tải…";
    await chrome.runtime.sendMessage({ type: KT.MSG.REFRESH });
    renderStatus();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[KT.STORAGE.DATA]) renderStatus();
  });

  renderStatus();
})();
