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

  if (window.__KT_MAIN_WORLD__) return;
  window.__KT_MAIN_WORLD__ = true;

  function send(kind, url, payload) {
    try {
      window.postMessage({ source: TAG, kind: kind, url: String(url || ""), payload: payload }, "*");
    } catch (e) {
      /* payload không clone được — bỏ qua, không phải việc của trang */
    }
  }

  function inspect(url, text) {
    const u = String(url || "");
    if (!MESSAGES_RE.test(u) && !TOKEN_INFO_RE.test(u)) return;
    let json;
    try {
      json = JSON.parse(text);
    } catch (e) {
      return;
    }
    send(MESSAGES_RE.test(u) ? "messages" : "token", u, json);
  }

  /* ---- fetch ---- */
  const origFetch = window.fetch;
  if (typeof origFetch === "function") {
    window.fetch = function (...args) {
      const promise = origFetch.apply(this, args);
      try {
        const url = (args[0] && args[0].url) || args[0];
        if (MESSAGES_RE.test(String(url)) || TOKEN_INFO_RE.test(String(url))) {
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
      if (url && (MESSAGES_RE.test(String(url)) || TOKEN_INFO_RE.test(String(url)))) {
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
