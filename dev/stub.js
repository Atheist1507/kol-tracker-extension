/**
 * Giả lập chrome.* + dữ liệu mẫu cho trang xem thử (dev/preview.html).
 *
 * Nhờ nó mà panel/overlay chạy được trong một tab thường: sửa CSS hay bố cục
 * thì mở preview soi bằng mắt, KHÔNG phải dựng Google Sheet rồi reload
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

  const KOLS_CSV =
    "handle,aliases,avatar_url,tier,description,source_found,red_flags,added_by,updated_at\n" +
    `cryptoape,"Ape, khỉ","${APE}",S,"Hay call presale kỹ thuật, đọc code contract trước khi vào",Thấy trên chart GMGN con PEPE,,Tam,2026-09-16\n` +
    `moonboy,,"${MOON}",C,"Call theo trend, ăn theo KOL lớn",Group TG ABC,"Xả ngay sau khi call 2 lần (WIF, BONK). Có dấu hiệu được trả tiền pump.",Nix,2026-09-14\n` +
    `sniperhz,Sniper,,A,"Bot sniper, vào rất sớm nhưng ra cũng sớm",Twitter,,Tam,2026-09-10\n` +
    `chartguy,,,B,"Phân tích kỹ thuật, ít call altcoin rác",Youtube,,Nix,2026-08-30\n`;

  const CALLS_CSV =
    "handle,token,called_at,price_at_call,chart_position,result,added_by\n" +
    "cryptoape,PEPE,2026-01-02,0.0000012,đầu sóng,x5,Tam\n" +
    "cryptoape,WIF,2026-02-10,2.4,giữa sóng,x0.4,Tam\n" +
    "cryptoape,BONK,2026-03-14,0.000021,đầu sóng,x3.2,Tam\n" +
    "cryptoape,MOODENG,2026-05-01,0.31,đầu sóng,x12,Nix\n" +
    "cryptoape,TRUMP,2026-06-20,9.1,đu đỉnh,x0.6,Nix\n" +
    "moonboy,PEPE,2026-01-05,0.0000058,đu đỉnh,sai,Nix\n" +
    "moonboy,WIF,2026-02-18,3.9,đu đỉnh,-70%,Nix\n" +
    "sniperhz,BONK,2026-03-14,0.000018,đầu sóng,x2.1,Tam\n" +
    "ghostcaller,FARTCOIN,2026-04-02,0.4,giữa sóng,x2,Tam\n";

  const store = {
    sync: {
      config: KT.withDefaults({
        kolsCsvUrl: "https://docs.google.com/spreadsheets/d/e/DEMO/pub?output=csv",
        sheetUrl: "https://docs.google.com/spreadsheets/d/DEMO/edit",
      }),
    },
    local: {
      data: {
        kols: KT.parseTable(KOLS_CSV).rows,
        calls: KT.parseTable(CALLS_CSV).rows,
        syncedAt: Date.now() - 4 * 60000,
        error: null,
      },
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
    storage: {
      sync: area("sync"),
      local: area("local"),
      onChanged: { addListener: (fn) => listeners.push(fn) },
    },
    runtime: {
      sendMessage: async () => ({ ok: true }),
      onMessage: { addListener: () => {} },
      openOptionsPage: () => window.open("../options/options.html", "_blank"),
    },
  };

  globalThis.__KT_SAMPLE__ = { KOLS_CSV, CALLS_CSV, APE, MOON };
})();
