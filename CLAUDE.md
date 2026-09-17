# KOL Tracker — ghi chú cho Claude

Đọc `README.md` trước: nó là spec + hướng dẫn dùng. File này chỉ ghi những quyết định KHÔNG suy ra
được từ code.

- **Không có bước build, không có dependency.** Clone về là "Load unpacked" chạy được ngay. Đừng thêm
  bundler/framework/thư viện chỉ để tiện hơn một chút — cái giá là người kia (không đọc code) phải
  cài toolchain mới dùng được extension.
- **Không ES module.** `content_scripts` của Chrome không nạp module. Mọi file `src/lib/*.js` gắn vào
  `globalThis.KT` và export thêm kiểu CommonJS ở cuối để `node --test` chạy được. Giữ đúng khuôn đó.
- **Chỉ service worker được fetch.** Content script chạy dưới origin gmgn.ai, gọi docs.google.com là
  dính CORS. Content script đọc dữ liệu từ `chrome.storage.local` và nghe `storage.onChanged`.
- **Không sửa DOM của GMGN.** Panel và overlay sống trong shadow root riêng, `position: fixed`. GMGN
  là SPA: chèn node vào cây của nó là bị ghi đè hoặc làm vỡ render, mà mình không debug được app
  người khác. Đây là lý do overlay vẽ ring bằng element riêng bám theo `getBoundingClientRect()` chứ
  không gắn class vào `<img>` của họ.
- **Mọi giá trị từ Sheet phải qua `KT.esc()`** trước khi vào HTML, và `avatar_url` phải qua
  `KT.safeUrl()` (chỉ http/https). Đó là chữ người khác gõ, được chèn vào một trang tài chính.
- **Đọc chữ trong DOM của người ta thì đi theo TEXT NODE, đừng dùng `textContent`.** Nó nối hết chữ
  lại không có dấu cách, làm regex `@handle` nuốt sang chữ bên cạnh. Đã dính một lần với tooltip GMGN,
  có test giữ lại trong `tests/tooltip-text.test.js`.
- **Quét node lạ thì phải có trần.** MutationObserver `characterData` trả về `parentElement` có thể là
  cả `<body>` (SPA đổi giá liên tục), lúc đó mọi "@ai_đó" trên trang bị coi là một thẻ người. Hai lớp
  chặn: không queue `<body>`/`<html>`, và `MAX_CARD_CHUNKS` — thẻ người chỉ có dăm mẩu chữ.
- **URL ảnh phải qua `KT.avatarKey()`** — nó gỡ lớp proxy của GMGN (`gmgn.ai/external/img?url=…`)
  trước khi so. So chuỗi thô với `avatar_url` trong Sheet là trượt 100%, im lặng.
- **Content script chạy trong mọi frame.** Panel chỉ mount khi `window.top === window`; overlay và
  `refreshIfStale` cũng phải nhớ mình đang ở frame nào, nếu không là n panel chồng nhau và n lời gọi
  fetch cho cùng một bảng.
- **Khoá của một người là `wallet_address`**, không phải username (đổi được) và TUYỆT ĐỐI không
  phải `encrypted_user_id`: đo trên trang thật thấy cùng một message trả về ba giá trị khác nhau
  trong ba lần gọi. Lấy nó làm khoá là mỗi lần mở chart đẻ ra một người mới, im lặng.
- **Dữ liệu người lấy từ API `community/messages`, không cạo từ DOM.** DOM chỉ còn là đường dự
  phòng. API trả sẵn danh tính + nội dung post + multiplier + số liệu mua/bán.
- **Mọi chuỗi ghi vào Sheet phải qua `safeValue_()`** trong Code.gs: chuỗi mở đầu bằng `=` `+` `-`
  `@` bị Sheets hiểu là công thức. Ô `note` và `post_text` là chữ người gõ tự do.
- **Mọi phép so khớp handle đi qua `KT.handleKey()`**, đừng `.toLowerCase()` tại chỗ: `@Foo`, `foo`,
  `x.com/Foo`, `Foo ` phải là một người.
- **Hai danh sách content script** (`manifest.json` và `KT.CONTENT_FILES` trong `src/lib/config.js`)
  phải khớp nhau — `npm run check` khoá lại chuyện đó. Lệch nhau thì panel chạy trên GMGN nhưng không
  chạy khi chèn tay từ popup, và Chrome không báo gì.
- **Logic thuần thì viết vào `src/lib/` kèm test.** Phần dễ sai nhất là đọc cột `result`/`called_at`
  (chữ người gõ tay) — sai ở đó thì win rate sai mà không có triệu chứng gì.
- Trước khi push: `npm test && npm run check`.
