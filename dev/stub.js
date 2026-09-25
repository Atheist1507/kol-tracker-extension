/**
 * Giả lập chrome.* + dữ liệu mẫu cho trang xem thử (dev/preview.html).
 *
 * Nhờ nó mà panel/overlay/hộp note chạy được trong một tab thường: sửa CSS
 * hay bố cục thì mở preview soi bằng mắt, KHÔNG phải dựng Sheet rồi reload
 * extension sau mỗi lần sửa một dòng.
 *
 * CHỈ dùng cho preview — không nằm trong manifest, không lên bản cài.
 */
(function () {
  "use strict";
  const KT = globalThis.KT;

  function avatar(a, b) {
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96">` +
      `<rect width="96" height="96" fill="rgb(${a})"/>` +
      `<circle cx="48" cy="38" r="17" fill="rgb(${b})"/>` +
      `<circle cx="48" cy="92" r="30" fill="rgb(${b})"/></svg>`;
    return "data:image/svg+xml;base64," + btoa(svg);
  }

  const APE = avatar("34,42,54", "232,184,75");
  const MOON = avatar("40,32,48", "163,113,247");
  const NEW = avatar("28,36,30", "63,185,80");

  const W_APE = "0xf1b6a4d6aecc5a618ade56a53fa9956ea508e16c";
  const W_MOON = "0xaaa2222222222222222222222222222222222222";
  const W_NEW = "0xbbb3333333333333333333333333333333333333";

  const OVERVIEW = [
    { wallet: W_APE, username: "cryptoape", display_name: "Ape", avatar_url: APE, tier: "S",
      summary: "Đọc contract trước khi vào, call sớm", followers: "12400", is_kol: "true",
      first_seen: "2026-08-01T00:00:00Z", added_by: "Tam", extra: {} },
    { wallet: W_MOON, username: "moonboy", display_name: "moon", avatar_url: MOON, tier: "C",
      summary: "Hô theo trend", red_flags: "Hô xong xả sạch 2 lần (WIF, BONK)", followers: "800",
      added_by: "Nix", extra: {} },
  ];

  const DETAIL = [
    { wallet: W_APE, username: "cryptoape", noted_at: "2026-09-14T10:00:00Z", chain: "robinhood",
      token: "PEPE", token_address: "0xtok1", post_text: "giga runner", multiplier_at_note: "5",
      holding_state: "còn giữ", note: "Call sớm, luận điểm rõ. Theo dõi tiếp.",
      chart_position: "đầu sóng", added_by: "Tam", extra: {} },
    { wallet: W_APE, username: "cryptoape", noted_at: "2026-09-16T09:00:00Z", chain: "robinhood",
      token: "WIF", token_address: "0xtok2", post_text: "send it", multiplier_at_note: "0.4",
      holding_state: "đã xả sạch", note: "Lần này hô xong xả ngay — để ý.", added_by: "Nix", extra: {} },
    { wallet: W_MOON, username: "moonboy", noted_at: "2026-09-15T10:00:00Z", chain: "robinhood",
      token: "PEPE", token_address: "0xtok1", post_text: "ONLY UP", multiplier_at_note: "0.6",
      holding_state: "đã xả sạch", note: "Đu đỉnh rồi mới hô.", chart_position: "đu đỉnh",
      added_by: "Nix", extra: {} },
  ];

  /** Response giả của /api/v1/token/{chain}/{token}/community/messages */
  const MESSAGES_PAYLOAD = {
    code: 0,
    data: {
      messages: [
        { id: "m1", username: "cryptoape", display_name: "Ape", profile_image_url: APE,
          wallet_address: W_APE, user_twitter_url: "https://x.com/cryptoape", follower_count: 12400,
          created_at: "2026-09-03T23:05:28Z", content: "giga runner, contract clean",
          multiplier: "5.2", is_kol: true, bought_amount: "100", sold_amount: "0", balance: "100",
          current_pnl_usd: "420", transfer_out_amount: "0" },
        { id: "m2", username: "moonboy", display_name: "moon", profile_image_url: MOON,
          wallet_address: W_MOON, follower_count: 800, created_at: "2026-09-05T10:00:00Z",
          content: "ONLY UP FROM HERE", multiplier: "0.6", bought_amount: "50", sold_amount: "50",
          balance: "0", current_pnl_usd: "-40", transfer_out_amount: "0" },
        { id: "m3", username: "nolifeloser", display_name: "nolifeloser", profile_image_url: NEW,
          wallet_address: W_NEW, follower_count: 8, created_at: "2026-09-06T01:00:00Z",
          content: "Ahaa Only up from here stack up!!!!!", multiplier: "1.03",
          bought_amount: "0", sold_amount: "0", balance: "0", transfer_out_amount: "0" },
      ],
    },
  };

  const TOKEN_PAYLOAD = { code: 0, data: [{ address: "0xtok1", symbol: "CASHCAT", name: "Cash Cat" }] };

  const store = {
    sync: {
      config: KT.withDefaults({
        sheetApiUrl: "https://script.google.com/macros/s/DEMO/exec",
        sheetApiSecret: "demo",
        addedBy: "Tam",
      }),
    },
    local: {
      data: { overview: OVERVIEW, detail: DETAIL, syncedAt: Date.now() - 4 * 60000, error: null },
      ui: { open: true },
    },
  };

  const listeners = [];
  function area(name) {
    return {
      get: async (key) => (key ? { [key]: store[name][key] } : Object.assign({}, store[name])),
      set: async (obj) => {
        const changes = {};
        for (const k of Object.keys(obj)) {
          changes[k] = { oldValue: store[name][k], newValue: obj[k] };
          store[name][k] = obj[k];
        }
        listeners.forEach((fn) => fn(changes, name));
      },
    };
  }

  globalThis.chrome = {
    storage: { sync: area("sync"), local: area("local"), onChanged: { addListener: (fn) => listeners.push(fn) } },
    runtime: {
      id: "preview", // thiếu cái này thì alive() tưởng extension vừa bị gỡ — mọi lời gửi sang SW im lặng
      sendMessage: async (msg) => {
        if (msg && msg.type === "kt:saveNote") {
          console.log("[preview] saveNote payload:", JSON.parse(JSON.stringify(msg.payload)));
          globalThis.__LAST_SAVE__ = msg.payload;
          return { ok: true, createdPerson: true };
        }
        // Sổ tự ghi: giữ lại mọi cú call gửi sang, để soi bằng mắt / Playwright
        // xem trang đọc ra ĐÚNG người, đúng bài (nhất là quote tweet).
        if (msg && msg.type === "kt:ledgerAdd") {
          (globalThis.__LEDGER__ = globalThis.__LEDGER__ || []).push(...msg.calls);
          return { added: msg.calls.length, merged: 0 };
        }
        if (msg && msg.type === "kt:ledgerPerson") {
          return { parts: ["7 kèo (3 ghi trước)", "có ngày ≥5 kèo", "1 bài call đã bị xoá"] };
        }
        if (msg && msg.type === "kt:ledgerTokenGet") return null;
        return { ok: true };
      },
      onMessage: { addListener: () => {} },
      openOptionsPage: () => window.open("../options/options.html", "_blank"),
    },
  };

  globalThis.__KT_SAMPLE__ = { APE, MOON, NEW, MESSAGES_PAYLOAD, TOKEN_PAYLOAD };

  /** Bắn ra đúng thứ main-world.js gửi khi GMGN gọi API. */
  globalThis.__ktFeedApi = function () {
    window.postMessage(
      { source: "kol-tracker", kind: "token", url: "/api/v1/mutil_window_token_info", payload: TOKEN_PAYLOAD },
      "*"
    );
    window.postMessage(
      {
        source: "kol-tracker",
        kind: "messages",
        url: "/api/v1/token/robinhood/0xtok1/community/messages?limit=50",
        payload: MESSAGES_PAYLOAD,
      },
      "*"
    );
  };
})();
