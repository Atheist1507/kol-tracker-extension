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
const ALARM = "kt-refresh";

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

async function doRefresh() {
  const cfg = await KT.getConfig();
  const kolsUrl = KT.toCsvUrl(cfg.kolsCsvUrl);
  const callsUrl = KT.toCsvUrl(cfg.callsCsvUrl);

  if (!cfg.kolsCsvUrl) {
    const error = "Chưa cấu hình link CSV — mở Options để dán link Google Sheet.";
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

    const kols = KT.parseTable(kolsCsv).rows;
    const calls = callsCsv ? KT.parseTable(callsCsv).rows : [];

    await saveData({ kols, calls, syncedAt: Date.now(), error: null, errorAt: 0 });
    await setBadge(null);
    return { ok: true, counts: { kols: kols.length, calls: calls.length } };
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
