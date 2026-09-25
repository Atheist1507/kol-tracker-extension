/**
 * Trang cài đặt. Lưu NGAY khi gõ (debounce) chứ không có nút Save: cấu hình
 * chỉ có vài ô, mà một nút Save quên bấm là extension im lặng chạy sai link.
 */
(async function () {
  "use strict";
  const KT = globalThis.KT;

  // ⚠ `addedBy` nằm trong DEFAULTS từ đầu và note-box vẫn ghi nó vào cột
  // `added_by`, nhưng trang này chưa bao giờ có ô nhập — nên nó luôn rỗng.
  // Một người dùng thì không ai để ý; hai người dùng chung Sheet thì không
  // phân biệt được ghi chú của ai, mà cột vẫn nằm đó trông như đang hoạt động.
  const TEXT_FIELDS = ["sheetApiUrl", "sheetApiSecret", "addedBy", "kolsCsvUrl", "callsCsvUrl", "sheetUrl"];
  const NUMBER_FIELDS = ["refreshMinutes", "staleMinutes"];
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

  const manifest = chrome.runtime.getManifest();
  $("ver").textContent = "v" + manifest.version;

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

  /** Ký tự vô hình hay đi lạc vào lúc copy-paste, mà nhìn thì không thấy gì. */
  function cleanText(value) {
    return String(value)
      .replace(/[\u200B-\u200D\uFEFF\u00A0]/g, "")
      .trim();
  }

  function collect() {
    const patch = {};
    for (const key of TEXT_FIELDS) patch[key] = cleanText($(key).value);
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

  /**
   * Bằng chứng thô của lần gọi vừa rồi.
   *
   * Người dùng không đọc được mã HTTP, nhưng ĐỌC ĐƯỢC "Google chuyển hướng
   * sang tài khoản thứ 2" — và đó là câu phân biệt giữa "URL sai" với "sai
   * tài khoản", thứ mà cả hai người dùng đầu tiên đều mắc kẹt.
   */
  function chiTietText(res) {
    const c = res && res.chiTiet;
    if (!c) return "";
    const bits = ["HTTP " + c.status, c.giay + "s"];
    if (c.taiKhoanThu) bits.push("Google phục vụ bằng TÀI KHOẢN THỨ " + c.taiKhoanThu + " của trình duyệt");
    else if (c.chuyenHuong) bits.push("có chuyển hướng");
    if (c.dauBody) bits.push("trả về: " + c.dauBody.replace(/\s+/g, " ").slice(0, 60) + "…");
    return "\n↳ " + bits.join(" · ") + (c.urlCuoi ? "\n↳ URL cuối: " + c.urlCuoi : "");
  }

  $("sheet-ping").addEventListener("click", async () => {
    const out = $("sheetApi-test");
    out.className = "test";
    out.textContent = "Đang thử…";

    const secret = $("sheetApiSecret").value.trim();
    const res = await chrome.runtime.sendMessage({
      type: KT.MSG.SHEET_PING,
      url: $("sheetApiUrl").value.trim(),
      secret,
    });

    if (!res || !res.ok) {
      out.className = "test err";
      let msg = (res && res.error) || "không gọi được service worker";
      // "sai secret" là lỗi mù nhất trong đám: hai chuỗi lệch một ký tự thì
      // nhìn bằng mắt y hệt nhau. Nói ra độ dài để còn so được với Code.gs.
      if (/secret/i.test(msg)) {
        msg += ` — extension gửi chuỗi ${secret.length} ký tự. Đếm lại chuỗi trong Code.gs xem có đúng bấy nhiêu không.`;
      }
      out.textContent = "✕ " + msg + chiTietText(res);
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

  /* ---------- mời người khác dùng chung ---------- */

  const REPO = "https://github.com/Atheist1507/kol-tracker-extension";

  /**
   * ⚠ CỐ Ý không kèm SECRET.
   *
   * Nó là mật khẩu ghi vào Sheet, mà lời mời thì người ta dán vào chat. Để
   * một chỗ trống bắt người gửi tự điền thì secret đi đường riêng — còn nếu
   * copy sẵn, nó sẽ nằm lại trong lịch sử chat vĩnh viễn mà không ai nghĩ tới.
   */
  function inviteText(cfg) {
    return [
      "KOL Tracker — research caller ngay trên chart GMGN. Cài thế này:",
      "",
      "1. Tải code: " + REPO + " → nút Code → Download ZIP → giải nén.",
      "   (Có git thì: git clone " + REPO + ".git)",
      "2. Chrome → gõ chrome://extensions vào thanh địa chỉ → bật Developer mode (góc trên phải)",
      "   → Load unpacked → chọn đúng thư mục vừa giải nén.",
      "3. Bấm icon extension → Cài đặt, rồi điền:",
      "   • URL Web App: " + (cfg.sheetApiUrl || "(người mời điền vào đây)"),
      "   • SECRET: mình gửi riêng ở tin nhắn sau",
      "   • Tên của bạn: tên bạn, để Sheet biết ghi chú nào của ai",
      "   Bấm 'Thử kết nối' — ra chữ xanh là xong.",
      "4. Mở một chart GMGN, bấm Alt+K.",
      "",
      "Lưu ý: dùng CHUNG Sheet với mình nên đừng deploy Apps Script riêng.",
      "Muốn lấy bản mới: tải code mới về, bấm ⟳ ở chrome://extensions, rồi F5 lại trang GMGN.",
    ].join("\n");
  }

  const inviteBtn = $("copy-invite");
  if (inviteBtn) {
    inviteBtn.addEventListener("click", async () => {
      const cfg = await KT.getConfig();
      const note = $("invite-test");
      try {
        await navigator.clipboard.writeText(inviteText(cfg));
        note.className = "test ok";
        note.textContent = cfg.sheetApiUrl
          ? "Đã copy. Nhớ gửi SECRET bằng tin nhắn riêng."
          : "Đã copy, nhưng chưa có URL Web App — điền ở mục 1 rồi copy lại.";
      } catch (e) {
        note.className = "test err";
        note.textContent = "Không copy được: " + (e && e.message ? e.message : e);
      }
    });
  }

  /* ---------- trạng thái dữ liệu ---------- */

  async function renderStatus() {
    const data = await KT.getData();
    const el = $("status");
    if (data.error) {
      el.className = "status err";
      // ⚠ Kèm TUỔI của lỗi. Lỗi nằm lại trong storage cho tới lần tải THÀNH
      // CÔNG kế tiếp, nên một lỗi từ ba hôm trước trông hệt như vừa mới hỏng —
      // và người đọc sẽ đi sửa một thứ đang chạy tốt. Đã mất một buổi vì đúng
      // chuyện này rồi.
      const tuoi = data.errorAt ? " (lúc " + KT.fmtDateTime(data.errorAt) + ", " + KT.timeAgo(data.errorAt) + ")" : "";
      el.textContent = data.error + tuoi;
      return;
    }
    if (!data.syncedAt) {
      el.className = "status";
      el.textContent = "Chưa tải lần nào.";
      return;
    }
    // ⚠ Đọc ĐÚNG hình dạng đang lưu: service worker ghi { overview, detail },
    // không phải { kols, calls } của đường CSV cũ. Bản trước đọc tên cũ nên
    // `db.kols` undefined → ném lỗi ngay giữa renderStatus, và dòng trạng
    // thái đứng nguyên ở "Đang kiểm tra…" mãi mãi. Không có lỗi nào hiện ra,
    // mà đây lại đúng là thứ người mới nhìn thấy đầu tiên.
    const db = KT.buildDb(data.overview, data.detail);
    const ghosts = db.people.filter((p) => p.ghost);
    el.className = "status";
    el.textContent =
      `${db.counts.people} người · ${db.counts.notes} ghi chú · cập nhật ${KT.timeAgo(data.syncedAt)}` +
      (ghosts.length ? ` · ${ghosts.length} người có ghi chú nhưng chưa có dòng ở tab Overview` : "");
  }

  $("refresh").addEventListener("click", async () => {
    // Gỡ class lỗi còn sót: để nguyên thì dòng "Đang tải…" hiện màu đỏ, trông
    // y như vừa hỏng thêm lần nữa.
    $("status").className = "status";
    $("status").textContent = "Đang tải… (lần đầu sau khi deploy có thể mất 30–40 giây)";
    await chrome.runtime.sendMessage({ type: KT.MSG.REFRESH });
    renderStatus();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[KT.STORAGE.DATA]) renderStatus();
  });

  renderStatus();
})();
