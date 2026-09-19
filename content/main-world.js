/**
 * Chạy trong "main world" — cùng thế giới JS với chính trang GMGN.
 *
 * Vì sao phải có file riêng này: content script thường sống ở thế giới CÁCH
 * LY, thấy được DOM nhưng KHÔNG thấy biến/hàm của trang. Muốn nghe được dữ
 * liệu GMGN tải về thì phải đứng cùng thế giới với nó để bọc `fetch`/`XHR`.
 *
 * ⚠ File này chạm vào bên trong trang của người khác, nên luật là:
 *   - CHỈ ĐỌC. Trả lại đúng response gốc, không sửa, không nuốt lỗi.
 *   - Bọc try/catch mọi chỗ. Mình hỏng thì mình im, KHÔNG được làm GMGN hỏng.
 *   - Không đụng vào DOM. Việc vẽ là của content script bên kia.
 *
 * Gửi dữ liệu sang bên kia bằng window.postMessage (đường duy nhất nối hai
 * thế giới). Bên nhận phải kiểm `event.source === window` — xem content.js.
 */
(function () {
  "use strict";

  const TAG = "kol-tracker";
  const MESSAGES_RE = /\/api\/v1\/token\/([^/?#]+)\/([^/?#]+)\/community\/messages/;
  const TOKEN_INFO_RE = /\/api\/v1\/mutil_window_token_info/;
  /**
   * MỌI API của GMGN, không chỉ hai cái trên.
   *
   * Vì sao nghe hết: đám avatar mọc trên cây nến KHÔNG phải đám trong bảng
   * X Tracker (community/messages) — chủ máy đã khẳng định. Mốc trên chart vẽ
   * bằng canvas nên không có DOM để hover; muốn biết chúng là ai thì phải tìm
   * cho ra endpoint nuôi chúng, mà tên endpoint đó mình chưa biết.
   *
   * Nghe hết thì tốn, nên có hai cái phanh: bỏ qua response quá to, và chỉ
   * gửi nguyên văn JSON khi trong đó thật sự có mùi người.
   */
  const ANY_API_RE = /\/api\//;
  const MAX_BYTES = 800000;
  const PERSON_HINT_RE = /"(username|screen_name|twitter_username|twitter_screen_name|handle)"/;

  if (window.__KT_MAIN_WORLD__) return;
  window.__KT_MAIN_WORLD__ = true;

  function send(kind, url, payload) {
    try {
      window.postMessage({ source: TAG, kind: kind, url: String(url || ""), payload: payload }, "*");
    } catch (e) {
      /* payload không clone được — bỏ qua, không phải việc của trang */
    }
  }

  function watched(url) {
    const u = String(url || "");
    return MESSAGES_RE.test(u) || TOKEN_INFO_RE.test(u) || ANY_API_RE.test(u);
  }

  function inspect(url, text) {
    const u = String(url || "");
    if (!watched(u)) return;

    if (MESSAGES_RE.test(u) || TOKEN_INFO_RE.test(u)) {
      let json;
      try {
        json = JSON.parse(text);
      } catch (e) {
        return;
      }
      send(MESSAGES_RE.test(u) ? "messages" : "token", u, json);
      return;
    }

    // Endpoint lạ: báo tên nó ra dù không đọc được gì. Biết "có endpoint này
    // mà rỗng người" khác hẳn với không biết endpoint đó tồn tại.
    const body = String(text || "");
    if (body.length > MAX_BYTES || !PERSON_HINT_RE.test(body)) {
      send("api", u, null);
      return;
    }
    let json;
    try {
      json = JSON.parse(body);
    } catch (e) {
      send("api", u, null);
      return;
    }
    send("api", u, json);
  }

  /* ---- fetch ---- */
  const origFetch = window.fetch;
  if (typeof origFetch === "function") {
    window.fetch = function (...args) {
      const promise = origFetch.apply(this, args);
      try {
        const url = (args[0] && args[0].url) || args[0];
        if (watched(url)) {
          promise
            .then((res) => {
              // clone() để KHÔNG đụng vào body mà trang sắp đọc
              res.clone().text().then((t) => inspect(url, t)).catch(() => {});
              return res;
            })
            .catch(() => {});
        }
      } catch (e) {
        /* im lặng */
      }
      return promise;
    };
  }

  /* ---- XMLHttpRequest ---- */
  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url) {
    try {
      this.__ktUrl = url;
    } catch (e) {
      /* im lặng */
    }
    return origOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function () {
    try {
      const url = this.__ktUrl;
      if (url && watched(url)) {
        this.addEventListener("load", () => {
          try {
            inspect(url, this.responseText || "");
          } catch (e) {
            /* im lặng */
          }
        });
      }
    } catch (e) {
      /* im lặng */
    }
    return origSend.apply(this, arguments);
  };
})();
