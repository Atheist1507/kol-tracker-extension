/**
 * Sổ cái cú call — phần LƯU TRỮ (IndexedDB), chạy trong service worker.
 *
 * ⚠ Phải ở service worker, không ở content script: IndexedDB mở trong content
 * script thuộc về ORIGIN của trang (gmgn.ai / x.com) — tức là sổ bị chia đôi
 * theo trang, và nằm trong vùng lưu trữ của người khác. Ở đây nó thuộc về
 * extension, một sổ chung cho mọi trang.
 *
 * Logic (gộp, phân loại, tóm tắt) nằm ở src/lib/ledger.js và có test. File
 * này chỉ đọc/ghi, cố ý mỏng.
 */
(function () {
  "use strict";
  // ⚠ Lấy KT qua globalThis, KHÔNG dùng tên `KT` trần. File này được nạp
  // bằng importScripts GIỮA LÚC service-worker.js đang chạy, mà ở đó có
  // `const KT = globalThis.KT` khai SAU lệnh importScripts — tên `KT` trần ở
  // đây rơi vào vùng "chưa khởi tạo" của hằng đó và ném ReferenceError. Hậu
  // quả: sổ không bao giờ được nạp, mà extension vẫn chạy như chưa có gì —
  // không lỗi nào hiện ra. Test thuần không bắt được; bắt được khi nạp
  // extension thật vào Chromium.
  const KT = globalThis.KT;

  const DB_NAME = "kt-ledger";
  const DB_VERSION = 1;
  const CHECK_LOG = "ledgerCheckLog"; // chrome.storage.local — kết quả kiểm xoá bài gần nhất
  const CHECK_BATCH = 20; // tweet mỗi lượt kiểm
  const CHECK_GAP_MS = 1500; // nghỉ giữa hai lời gọi — đừng dội X
  const CHECK_TIMEOUT_MS = 15000;

  let dbPromise = null;

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("calls")) {
          const calls = db.createObjectStore("calls", { keyPath: "id" });
          calls.createIndex("personKey", "personKey", { unique: false });
          calls.createIndex("source", "source", { unique: false });
        }
        if (!db.objectStoreNames.contains("tokens")) db.createObjectStore("tokens", { keyPath: "tokenKey" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        dbPromise = null;
        reject(req.error);
      };
    });
    return dbPromise;
  }

  function reqP(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function txDone(tx) {
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  /**
   * Ghi một lô cú call. Mỗi cú đọc bản cũ rồi GỘP (mergeCall) trong CÙNG một
   * transaction — hai tab cùng gửi một cú call thì không bên nào ghi đè mất
   * `firstSeenAt` sớm hơn của bên kia.
   */
  async function addCalls(inputs, now) {
    const list = [];
    for (const i of inputs || []) {
      const c = KT.ledger.makeCall(i, now);
      if (c) list.push(c);
    }
    if (!list.length) return { added: 0, merged: 0 };
    const db = await openDb();
    const tx = db.transaction("calls", "readwrite");
    const store = tx.objectStore("calls");
    let added = 0;
    let merged = 0;
    for (const c of list) {
      const old = await reqP(store.get(c.id));
      if (old) merged++;
      else added++;
      store.put(KT.ledger.mergeCall(old, c));
    }
    await txDone(tx);
    return { added, merged };
  }

  /**
   * Mốc token ra đời. Cột tin cậy hơn (rank nhỏ hơn) thắng; cùng cột thì giữ
   * giá trị đã có — mốc tạo token là một sự kiện, không "cập nhật" được.
   */
  async function putToken(tokenKey, created, now) {
    const key = KT.ledger.tokenKeyOf(tokenKey);
    if (!key || !created || created.ts == null) return;
    const db = await openDb();
    const tx = db.transaction("tokens", "readwrite");
    const store = tx.objectStore("tokens");
    const old = await reqP(store.get(key));
    if (!old || created.rank < old.rank) {
      store.put({ tokenKey: key, createdAt: created.ts, key: created.key, rank: created.rank, seenAt: now });
    }
    await txDone(tx);
  }

  async function getToken(tokenKey) {
    const db = await openDb();
    return reqP(db.transaction("tokens").objectStore("tokens").get(KT.ledger.tokenKeyOf(tokenKey)));
  }

  async function callsOf(personKey) {
    const db = await openDb();
    return reqP(db.transaction("calls").objectStore("calls").index("personKey").getAll(personKey));
  }

  async function tokensFor(calls) {
    const db = await openDb();
    const store = db.transaction("tokens").objectStore("tokens");
    const out = {};
    const keys = Array.from(new Set(calls.map((c) => c.tokenKey)));
    for (const k of keys) {
      const t = await reqP(store.get(k));
      if (t) out[k] = t;
    }
    return out;
  }

  /** Tóm một người, tra bằng tay cầm (hoặc ví). */
  async function person(ref, now) {
    const personKey = KT.ledger.personKeyOf(ref);
    if (!personKey) return { personKey: "", summary: null, parts: [] };
    const calls = await callsOf(personKey);
    const tokens = await tokensFor(calls);
    const summary = KT.ledger.summarize(calls, tokens, now);
    return { personKey, summary, parts: KT.ledger.summaryParts(summary) };
  }

  async function stats() {
    const db = await openDb();
    const tx = db.transaction(["calls", "tokens"]);
    const calls = tx.objectStore("calls");
    const out = {
      cuCall: await reqP(calls.count()),
      tokenCoMoc: await reqP(tx.objectStore("tokens").count()),
      theoNguon: {},
    };
    for (const s of ["x", "thesis", "gmgn"]) out.theoNguon[s] = await reqP(calls.index("source").count(s));
    const got = await chrome.storage.local.get(CHECK_LOG);
    out.kiemXoaBai = got[CHECK_LOG] || null;
    return out;
  }

  /** Chỉ tweet trên X — thứ duy nhất kiểm xoá bài được (có tweet ID). */
  async function xCalls() {
    const db = await openDb();
    return reqP(db.transaction("calls").objectStore("calls").index("source").getAll("x"));
  }

  /**
   * Dọn dữ liệu thô quá hạn — trừ người đã có hồ sơ trong Sheet.
   *
   * ⚠ Duyệt bằng CURSOR, không `getAll()`: sổ đầy 90 ngày có thể tới hàng
   * trăm nghìn dòng, nạp hết vào bộ nhớ service worker mỗi 6 giờ chỉ để xoá
   * vài dòng là phí và có thể làm SW bị giết giữa chừng.
   */
  async function prune(keepPersonKeys, now) {
    const db = await openDb();
    const tx = db.transaction("calls", "readwrite");
    let removed = 0;
    await new Promise((resolve, reject) => {
      const req = tx.objectStore("calls").openCursor();
      req.onsuccess = () => {
        const cur = req.result;
        if (!cur) return resolve();
        if (KT.ledger.pruneIds([cur.value], now, keepPersonKeys).length) {
          cur.delete();
          removed++;
        }
        cur.continue();
      };
      req.onerror = () => reject(req.error);
    });
    await txDone(tx);
    return removed;
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  /**
   * Hỏi X xem một tweet còn không, qua oEmbed công khai (không cần đăng nhập,
   * không gửi cookie). Mọi thứ không chắc chắn đều ra "unknown" — xem
   * `classifyCheck`.
   */
  async function probeTweet(call) {
    const handle = call.handle || "i";
    const target = "https://twitter.com/" + encodeURIComponent(handle) + "/status/" + call.tweetId;
    const url =
      "https://publish.twitter.com/oembed?omit_script=1&dnt=true&url=" + encodeURIComponent(target);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
    try {
      const res = await fetch(url, { credentials: "omit", cache: "no-store", signal: controller.signal });
      let hasHtml = false;
      if (res.status === 200) {
        try {
          const j = await res.json();
          hasHtml = !!(j && typeof j.html === "string" && j.html.length > 0);
        } catch (e) {
          hasHtml = false;
        }
      }
      return { status: res.status, result: KT.ledger.classifyCheck(res.status, hasHtml) };
    } catch (e) {
      return { status: 0, result: "unknown" };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Một lượt kiểm bài bị xoá. Ghi lại phân bố mã trả về vào storage để
   * Chẩn đoán thấy được: "toàn 429" và "toàn 200" là hai chuyện khác hẳn,
   * mà từ bên ngoài thì trông như nhau (không ai bị đánh dấu xoá bài).
   */
  async function checkDeletions(now) {
    const due = KT.ledger.pickForCheck(await xCalls(), now, CHECK_BATCH);
    const log = { at: now, kiem: 0, maTraVe: {}, song: 0, mat: 0, khongBiet: 0 };
    for (const c of due) {
      const r = await probeTweet(c);
      log.kiem++;
      log.maTraVe[r.status] = (log.maTraVe[r.status] || 0) + 1;
      if (r.result === "alive") log.song++;
      else if (r.result === "missing") log.mat++;
      else log.khongBiet++;

      const db = await openDb();
      const tx = db.transaction("calls", "readwrite");
      const store = tx.objectStore("calls");
      const fresh = await reqP(store.get(c.id)); // đọc lại: có thể vừa được gộp thêm
      if (fresh) store.put(KT.ledger.applyCheck(fresh, r.result, Date.now()));
      await txDone(tx);

      // Bị hãm thì dừng cả lượt, đừng nện tiếp — lượt sau thử lại.
      if (r.status === 429) break;
      await sleep(CHECK_GAP_MS);
    }
    await chrome.storage.local.set({ [CHECK_LOG]: log });
    return log;
  }

  KT.ledgerStore = { addCalls, putToken, getToken, person, stats, prune, checkDeletions };
})();
