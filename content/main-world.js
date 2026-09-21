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
  const PERSON_HINT_RE = /"(username|user_name|screen_name|twitter_username|twitter_screen_name|handle|nickname|author|twitter|profile_image_url|avatar_url)"/;
  /**
   * Endpoint NGHI CAN: cứ gửi nguyên văn, bỏ qua bộ lọc mùi người.
   *
   * ⚠ Bộ lọc kia đoán trước tên cột. Đo 21/09/2026: `/pf/api/v1/fomo/thesis/
   * token` — cái tên đúng nghĩa đen là nguồn của thẻ "Thesis" trên chart — bị
   * loại vì trong đó không có chữ "username". Loại xong thì `nguoi: 0`, trông
   * y hệt "endpoint này không có ai". Đoán tên cột rồi lấy kết quả rỗng làm
   * bằng chứng là tự bịt mắt mình.
   */
  const SUSPECT_RE = /thesis|fomo|callout|callback|social|community|tweet|twitter|kol|caller/i;

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
    if (body.length > MAX_BYTES) {
      // Nói RÕ vì sao bỏ qua. "Bỏ vì quá to" và "bỏ vì không thấy người" là
      // hai chuyện khác hẳn, mà trong sổ chẩn đoán thì trông giống hệt nhau.
      send("api", u + "#qua-to-" + body.length, null);
      return;
    }
    if (!SUSPECT_RE.test(u) && !PERSON_HINT_RE.test(body)) {
      send("api", u + "#khong-thay-nguoi", null);
      return;
    }
    let json;
    try {
      json = JSON.parse(body);
    } catch (e) {
      send("api", u + "#khong-phai-json", null);
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

  /* ---- WebSocket ---- */
  /**
   * Không một endpoint HTTP nào chứa đám người trên chart (đo 19/09/2026: 21
   * endpoint, 0 người). Nghi phạm còn lại là WebSocket — GMGN đẩy giá và lệnh
   * qua đó, rất có thể đẩy cả mấy mốc trên chart.
   *
   * ⚠ Tin WS bắn liên tục (mỗi tick giá một tin). Nên lọc trên CHUỖI trước,
   * chưa JSON.parse: tin giá không có chữ "username" nên rớt ngay, không tốn gì.
   */
  const OrigWS = window.WebSocket;
  if (typeof OrigWS === "function") {
    const KTWebSocket = function (url, protocols) {
      const ws = protocols === undefined ? new OrigWS(url) : new OrigWS(url, protocols);
      try {
        let binaryTold = false;
        ws.addEventListener("message", function (ev) {
          try {
            if (typeof ev.data !== "string") {
              // Nhị phân thì mình không đọc được — nhưng phải NÓI RA, kẻo
              // "không thấy ai trong WS" trông y hệt "WS không có ai".
              if (!binaryTold) {
                binaryTold = true;
                send("api", String(url) + "#nhi-phan", null);
              }
              return;
            }
            if (ev.data.length > MAX_BYTES || !PERSON_HINT_RE.test(ev.data)) return;
            send("api", String(url), JSON.parse(ev.data));
          } catch (e) {
            /* im lặng — không phải việc của trang */
          }
        });
      } catch (e) {
        /* im lặng */
      }
      return ws;
    };
    KTWebSocket.prototype = OrigWS.prototype;
    for (const k of ["CONNECTING", "OPEN", "CLOSING", "CLOSED"]) KTWebSocket[k] = OrigWS[k];
    try {
      window.WebSocket = KTWebSocket;
    } catch (e) {
      /* trang khoá thuộc tính — bỏ qua, phần fetch vẫn chạy */
    }
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
