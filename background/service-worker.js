/**
 * Service worker — chỗ DUY NHẤT đi lấy CSV.
 *
 * Vì sao không fetch thẳng trong content script: content script chạy dưới
 * origin của gmgn.ai, gọi docs.google.com là dính CORS. Fetch từ đây thì đi
 * bằng quyền của extension (host_permissions) nên không vướng.
 */
importScripts(
  "../src/lib/normalize.js",
  "../src/lib/csv.js",
  "../src/lib/tier.js",
  "../src/lib/stats.js",
  "../src/lib/model.js",
  "../src/lib/sheet-url.js",
  "../src/lib/config.js"
);

const KT = globalThis.KT;
const FETCH_TIMEOUT_MS = 20000;
// Apps Script khởi động nguội mất lâu hơn hẳn một lời gọi HTTP thường, nhất là
// lần đầu sau khi deploy. 20s là quá ngắn, cắt oan rồi báo như thể hỏng.
const SHEET_TIMEOUT_MS = 45000;
const ALARM = "kt-refresh";

/**
 * Mã HTTP trần không nói được gì với người dùng. Ba mã dưới đây là ba tình
 * huống khác hẳn nhau, mà cách sửa cũng khác hẳn nhau.
 */
/**
 * Mỗi lời gọi Apps Script phải có một URL DUY NHẤT.
 *
 * ⚠ Vì sao: /exec không trả dữ liệu ngay mà chuyển hướng sang
 * script.googleusercontent.com/macros/echo?user_content_key=… — cái key đó
 * dùng một lần. Chrome cache lại cú chuyển hướng, nên lần gọi sau đi thẳng
 * tới key đã hết hạn và nhận 404. Sửa cấu hình cho đúng cũng vô ích vì nó
 * không hỏi lại Google nữa.
 *
 * Triệu chứng đã gặp thật: gõ sai secret MỘT lần là 404 vĩnh viễn, sửa đúng
 * rồi thử lại vẫn 404, chỉ gỡ extension rồi cài lại mới hết (gỡ extension =
 * xoá vùng cache mạng riêng của nó). `cache: "no-store"` không chặn được
 * phần redirect.
 */
function bust(url) {
  return url + (url.includes("?") ? "&" : "?") + "_=" + Date.now();
}

function httpHint(status) {
  if (status === 404) {
    return "HTTP 404 — không có bản deploy nào ở URL này. Vào Apps Script → Deploy → Manage deployments, copy lại URL Web app.";
  }
  if (status === 403) {
    return 'HTTP 403 — bản deploy không cho gọi. Manage deployments → ✏️ → "Who has access" phải là Anyone.';
  }
  if (status === 401) {
    return "HTTP 401 — Google đòi đăng nhập. Deploy đang để \"Anyone with Google account\" thay vì \"Anyone\".";
  }
  if (status >= 500) return `HTTP ${status} — phía Google đang lỗi, thử lại sau vài phút.`;
  return "HTTP " + status;
}

let inFlight = null; // gộp nhiều lời gọi refresh song song vào một lượt fetch

async function fetchCsv(url, label) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      cache: "no-store",
      credentials: "omit",
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`${label}: HTTP ${res.status}`);
    const text = await res.text();
    if (!KT.looksLikeCsv(text)) {
      throw new Error(
        `${label}: link trả về HTML chứ không phải CSV. Kiểm tra lại "Publish to web → CSV", hoặc quyền chia sẻ của Sheet.`
      );
    }
    return text;
  } catch (err) {
    if (err.name === "AbortError") throw new Error(`${label}: quá ${FETCH_TIMEOUT_MS / 1000}s không phản hồi.`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function setBadge(error) {
  try {
    await chrome.action.setBadgeText({ text: error ? "!" : "" });
    if (error) {
      await chrome.action.setBadgeBackgroundColor({ color: "#F85149" });
      await chrome.action.setTitle({ title: "KOL Tracker — " + error });
    } else {
      await chrome.action.setTitle({ title: "KOL Tracker" });
    }
  } catch (e) {
    /* action API có thể chưa sẵn sàng lúc SW vừa khởi động */
  }
}

async function saveData(patch) {
  const current = await KT.getData();
  const next = Object.assign({}, current, patch);
  await chrome.storage.local.set({ [KT.STORAGE.DATA]: next });
  return next;
}

/** GET tới Apps Script Web App. Trả về đúng object script gửi lại. */
async function callSheetApi(cfg, params) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SHEET_TIMEOUT_MS);
  try {
    const qs = new URLSearchParams(Object.assign({ secret: cfg.sheetApiSecret || "" }, params));
    const url = cfg.sheetApiUrl + (cfg.sheetApiUrl.includes("?") ? "&" : "?") + qs.toString();
    const res = await fetch(bust(url), { signal: controller.signal, cache: "no-store", redirect: "follow" });
    if (!res.ok) throw new Error(httpHint(res.status));
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch (e) {
      throw new Error(
        'Script trả về HTML chứ không phải JSON — kiểm lại deploy có để "Who has access: Anyone" chưa.'
      );
    }
  } catch (err) {
    // ⚠ Đừng để DOMException lọt nguyên văn ra màn hình: người dùng đọc được
    // "signal is aborted without reason" thì chẳng biết phải làm gì.
    if (err && err.name === "AbortError") {
      throw new Error(
        `Quá ${SHEET_TIMEOUT_MS / 1000}s không phản hồi — Apps Script không trả lời. ` +
          "Thử dán URL kèm ?action=ping&secret=… vào thanh địa chỉ xem có ra JSON không."
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Ghi một lần ghi chú.
 *
 * ⚠ Gửi `Content-Type: text/plain` chứ KHÔNG phải `application/json`: Apps
 * Script không trả lời request OPTIONS, nên bất cứ header nào kích hoạt
 * preflight là hỏng. text/plain là "simple request", đi thẳng. Thân request
 * vẫn là chuỗi JSON, phía Code.gs vẫn JSON.parse bình thường.
 */
async function saveNote(payload) {
  const cfg = await KT.getConfig();
  if (!cfg.sheetApiUrl) {
    return { ok: false, error: "Chưa cấu hình Apps Script — mở Options, mục Kết nối Sheet." };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(bust(cfg.sheetApiUrl), {
      method: "POST",
      signal: controller.signal,
      redirect: "follow",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(Object.assign({ secret: cfg.sheetApiSecret || "" }, payload)),
    });
    if (!res.ok) throw new Error(httpHint(res.status));
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch (e) {
      throw new Error('Script trả về HTML — deploy chưa để "Who has access: Anyone"?');
    }
    if (json && json.ok) refresh(); // kéo lại để panel thấy ngay dòng vừa ghi
    return json;
  } catch (err) {
    if (err.name === "AbortError") {
      return {
        ok: false,
        error: `Quá ${SHEET_TIMEOUT_MS / 1000}s không phản hồi. Dán "URL?action=ping&secret=…" vào thanh địa chỉ: ra JSON thì vấn đề nằm ở extension, không ra thì nằm ở bản deploy.`,
      };
    }
    return {
      ok: false,
      error: String(err && err.message ? err.message : err) + ` (sau ${Math.round((Date.now() - started) / 1000)}s)`,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function doRefresh() {
  const cfg = await KT.getConfig();

  // Đường chính: Apps Script. Đọc và ghi cùng một endpoint, không dính độ trễ
  // 5 phút của bản CSV publish-to-web.
  if (cfg.sheetApiUrl) {
    try {
      const json = await callSheetApi(cfg, {});
      if (!json || !json.ok) throw new Error((json && json.error) || "script trả về lỗi");
      await saveData({
        overview: json.overview || [],
        detail: json.detail || [],
        syncedAt: Date.now(),
        error: null,
        errorAt: 0,
      });
      await setBadge(null);
      return { ok: true, counts: { people: (json.overview || []).length, notes: (json.detail || []).length } };
    } catch (err) {
      const error = String(err && err.message ? err.message : err);
      await saveData({ error, errorAt: Date.now() }); // GIỮ dữ liệu cũ
      await setBadge(error);
      return { ok: false, error };
    }
  }

  const kolsUrl = KT.toCsvUrl(cfg.kolsCsvUrl);
  const callsUrl = KT.toCsvUrl(cfg.callsCsvUrl);

  if (!cfg.kolsCsvUrl) {
    const error = "Chưa nối Sheet — mở Options, mục Kết nối Sheet.";
    await saveData({ error, errorAt: Date.now() });
    await setBadge(error);
    return { ok: false, error };
  }
  if (kolsUrl.error) {
    const error = "Link tab KOLs không hợp lệ: " + kolsUrl.error;
    await saveData({ error, errorAt: Date.now() });
    await setBadge(error);
    return { ok: false, error };
  }

  try {
    const [kolsCsv, callsCsv] = await Promise.all([
      fetchCsv(kolsUrl.url, "Tab KOLs"),
      cfg.callsCsvUrl && !callsUrl.error ? fetchCsv(callsUrl.url, "Tab Calls") : Promise.resolve(""),
    ]);

    const overview = KT.parseTable(kolsCsv).rows;
    const detail = callsCsv ? KT.parseTable(callsCsv).rows : [];

    await saveData({ overview, detail, syncedAt: Date.now(), error: null, errorAt: 0 });
    await setBadge(null);
    return { ok: true, counts: { people: overview.length, notes: detail.length } };
  } catch (err) {
    const error = String(err && err.message ? err.message : err);
    // GIỮ dữ liệu cũ: mất mạng một lúc mà xoá sạch DB thì panel thành vô dụng
    await saveData({ error, errorAt: Date.now() });
    await setBadge(error);
    return { ok: false, error };
  }
}

/** Thử một link CSV và nói rõ đọc được gì — để Options không phải đoán. */
async function testUrl(rawUrl) {
  const parsed = KT.toCsvUrl(rawUrl);
  if (parsed.error) return { ok: false, error: parsed.error };
  try {
    const text = await fetchCsv(parsed.url, "Link");
    const table = KT.parseTable(text);
    const known = table.columns.filter((c) => c.canonical).map((c) => c.canonical);
    const unknown = table.columns.filter((c) => c.raw && !c.canonical).map((c) => c.raw);
    return {
      ok: true,
      kind: parsed.kind,
      warning: parsed.warning || null,
      rows: table.rows.length,
      known,
      unknown,
    };
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err) };
  }
}

/**
 * Thử kết nối tới Apps Script Web App. Trả về đúng lời script nói, để Options
 * chỉ ra được sai ở đâu: URL, secret, hay chưa chạy setup().
 */
async function sheetPing(url, secret) {
  if (!url) return { ok: false, error: "Chưa có URL Apps Script." };
  if (!/^https:\/\/script\.google\.com\//i.test(url)) {
    return { ok: false, error: "Phải là URL /exec của Apps Script (script.google.com)." };
  }
  if (/\/dev\s*$/.test(url)) {
    return { ok: false, error: "Đây là link /dev của trình soạn thảo. Cần link /exec của bản deploy." };
  }
  if (!/\/exec\s*$/.test(url.split("?")[0])) {
    return { ok: false, error: "URL phải kết thúc bằng /exec." };
  }

  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SHEET_TIMEOUT_MS);
  try {
    const target =
      url + (url.includes("?") ? "&" : "?") + "action=ping&secret=" + encodeURIComponent(secret || "");
    const res = await fetch(bust(target), { signal: controller.signal, cache: "no-store", redirect: "follow" });
    if (!res.ok) throw new Error(httpHint(res.status));
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch (e) {
      // Apps Script trả HTML khi deploy sai chế độ truy cập, hoặc khi URL là
      // link /edit của trình soạn thảo thay vì link /exec của bản deploy.
      return {
        ok: false,
        error:
          "Script trả về HTML chứ không phải JSON — nhiều khả năng deploy chưa đặt " +
          '"Who has access: Anyone", hoặc dán nhầm link trình soạn thảo thay vì link /exec.',
      };
    }
  } catch (err) {
    if (err.name === "AbortError") {
      return {
        ok: false,
        error: `Quá ${SHEET_TIMEOUT_MS / 1000}s không phản hồi. Dán "URL?action=ping&secret=…" vào thanh địa chỉ: ra JSON thì vấn đề nằm ở extension, không ra thì nằm ở bản deploy.`,
      };
    }
    return {
      ok: false,
      error: String(err && err.message ? err.message : err) + ` (sau ${Math.round((Date.now() - started) / 1000)}s)`,
    };
  } finally {
    clearTimeout(timer);
  }
}

function refresh() {
  if (!inFlight) {
    inFlight = doRefresh().finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

async function syncAlarm() {
  const cfg = await KT.getConfig();
  await chrome.alarms.clear(ALARM);
  if (cfg.refreshMinutes > 0) {
    chrome.alarms.create(ALARM, {
      periodInMinutes: Math.max(1, cfg.refreshMinutes),
      delayInMinutes: Math.max(1, cfg.refreshMinutes),
    });
  }
}

chrome.runtime.onInstalled.addListener(async (details) => {
  await syncAlarm();
  const cfg = await KT.getConfig();
  if (!cfg.kolsCsvUrl && details.reason === "install") {
    chrome.runtime.openOptionsPage();
  } else {
    refresh();
  }
});

chrome.runtime.onStartup.addListener(() => {
  syncAlarm();
  refresh();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM) refresh();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync" || !changes[KT.STORAGE.CONFIG]) return;
  const before = changes[KT.STORAGE.CONFIG].oldValue || {};
  const after = changes[KT.STORAGE.CONFIG].newValue || {};
  syncAlarm();
  if (before.kolsCsvUrl !== after.kolsCsvUrl || before.callsCsvUrl !== after.callsCsvUrl) refresh();
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.type) return;

  if (msg.type === KT.MSG.REFRESH) {
    refresh().then(sendResponse);
    return true; // giữ kênh mở cho lời gọi bất đồng bộ
  }
  if (msg.type === KT.MSG.GET_DATA) {
    KT.getData().then(sendResponse);
    return true;
  }
  if (msg.type === KT.MSG.SAVE_NOTE) {
    saveNote(msg.payload).then(sendResponse);
    return true;
  }
  if (msg.type === KT.MSG.SHEET_PING) {
    sheetPing(msg.url, msg.secret).then(sendResponse);
    return true;
  }
  if (msg.type === KT.MSG.TEST_URL) {
    testUrl(msg.url).then(sendResponse);
    return true;
  }
  if (msg.type === "kt:openOptions") {
    chrome.runtime.openOptionsPage();
    sendResponse({ ok: true });
    return undefined;
  }
  return undefined;
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "toggle-panel") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: KT.MSG.TOGGLE_PANEL });
  } catch (e) {
    // Tab chưa có content script (không phải GMGN) — nạp tay rồi thử lại
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: KT.CONTENT_FILES });
      await chrome.tabs.sendMessage(tab.id, { type: KT.MSG.TOGGLE_PANEL });
    } catch (e2) {
      /* trang chrome:// — không chèn được, im lặng bỏ qua */
    }
  }
});
