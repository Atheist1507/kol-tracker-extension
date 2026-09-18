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
- **Mọi lời gọi Apps Script phải qua `bust()`** (service-worker.js) để URL luôn duy nhất. `/exec`
  chuyển hướng sang `googleusercontent.com/macros/echo?user_content_key=…`, key dùng một lần; Chrome
  cache cú chuyển hướng đó rồi lần sau đi thẳng vào key hết hạn → 404. Đã gặp thật: gõ sai secret
  MỘT lần là 404 vĩnh viễn, sửa đúng vẫn 404, chỉ gỡ extension rồi cài lại mới hết (gỡ = xoá vùng
  cache mạng riêng). `cache: "no-store"` không chặn được phần redirect.
- **Mọi phép so khớp handle đi qua `KT.handleKey()`**, đừng `.toLowerCase()` tại chỗ: `@Foo`, `foo`,
  `x.com/Foo`, `Foo ` phải là một người.
- **Hai danh sách content script** (`manifest.json` và `KT.CONTENT_FILES` trong `src/lib/config.js`)
  phải khớp nhau — `npm run check` khoá lại chuyện đó. Lệch nhau thì panel chạy trên GMGN nhưng không
  chạy khi chèn tay từ popup, và Chrome không báo gì.
- **Logic thuần thì viết vào `src/lib/` kèm test.** Phần dễ sai nhất là đọc cột `result`/`called_at`
  (chữ người gõ tay) — sai ở đó thì win rate sai mà không có triệu chứng gì.
- Trước khi push: `npm test && npm run check`.

- **Panel có ba màn (danh sách / tìm kiếm / chi tiết) nhưng chỉ một `el.content`.** Đường vào màn
  chi tiết KHÔNG đi qua `rerender()`: click handler gọi thẳng `renderDetail(caller)`. Nên thứ gì
  phải đổi theo màn đang mở (nút ← trên thanh tiêu đề) đặt trong TỪNG hàm vẽ (`syncBackBtn`), đặt ở
  `rerender` là bấm vào một người xong nút vẫn ẩn — mà nút ẩn nghĩa là không còn đường nào ra khỏi
  màn chi tiết ngoài F5.
- **Ghi chú xong thì panel tự về danh sách** (`api.onSaved` → `panel.home()`), và mở panel ra nếu
  nó đang đóng. Ghi chú bằng phím N từ chart là ghi cho MỘT người trong một danh sách nhiều người —
  đứng lại ở màn chi tiết của người vừa ghi là bắt người dùng tự tìm đường lùi.
- **"Người đang hover" KHÔNG được là state toàn cục.** Từng có `state.hovered` do overlay ghi vào
  qua `api.setHovered`, và phím N đọc lại. Trên một SPA thì ai cũng ghi vào được: đường dự phòng đọc
  tooltip chạy theo MutationObserver, nên mỗi lần GMGN vẽ lại một chỗ nào đó có `@handle` quen mặt là
  biến đó bị ghi đè — N mở mãi một người bất kể chuột ở đâu. Giờ overlay theo dõi `pointermove` và
  phím N hỏi `overlay.hitAtPointer()`, tức là **hỏi lại con trỏ ngay lúc bấm** (`elementsFromPoint`).
  Sai người là ghi chú vào nhầm hồ sơ — hỏng im lặng, kiểu tệ nhất; nên khi không chắc thì trả `null`
  (N không làm gì) chứ đừng đoán.
- **Thẻ tóm tắt có hai nguồn, hai luật khác nhau** (`cardFromPointer`): mọc từ chính avatar dưới con
  trỏ thì chỉ còn đúng khi con trỏ VẪN nằm trên đúng avatar đó (rê sang avatar bên cạnh là hết hiệu
  lực); mọc từ tooltip GMGN thì nó nằm CẠNH avatar chứ không dưới con trỏ, nên chỉ đòi nó trong tầm
  `NEAR_POINTER_PX`. Gộp hai luật làm một là avatar người lạ sẽ ăn theo thẻ của người vừa hover trước đó.
- **API `community/messages` trả từng BÀI POST, không phải từng người.** `parseMessages` lọc trùng
  theo `postId` rồi **gộp theo ví** (`groupCallers`): một thằng hô năm lần thì trước đây nằm năm dòng,
  panel ghi "50 người đã post" trong khi thật ra là 50 bài, và "N đã có hồ sơ" đếm trùng theo (thấy
  trên $CASHCAT 17/09/2026: panel ghi 5 trong khi Sheet chỉ có 2 người). Đại diện là bài **sớm nhất** —
  đó mới là cú call; mấy bài sau là hô thêm khi giá đã chạy. Nhưng **tình trạng giữ hàng lấy theo bài
  mới nhất**: giữ hay xả là chuyện của cả tài khoản, không của riêng một bài.
- **Viền trên chart chỉ khoanh người ĐÃ có hồ sơ.** Khoanh cả người lạ thì ai cũng có viền và cái viền
  không còn nói gì — trên GMGN avatar vốn đã có viền vàng/cam sẵn, thêm một viền xám nữa là vô hình.
- **Mốc thời gian: ISO để MÁY đọc, `dd/MM/yyyy lúc HH:mm` để NGƯỜI đọc.** Cả UI lẫn Sheet từng bày
  nguyên chuỗi ISO (`2026-09-17T16:05:22.669Z`) — không ai đọc được, mà còn lệch mấy tiếng so với lúc
  thật sự bấm lưu. Hiển thị đi qua `KT.fmtDateTime` (stats.js, cạnh `parseDateLoose` vì đọc và ghi
  phải khớp nhau); Apps Script ghi bằng `nowStamp_()` theo múi giờ của chính file Sheet.
  ⚠ `parseDateLoose` PHẢI đọc được cả phần giờ của chuỗi đó, nếu không hai ghi chú cùng một ngày đều
  về 00:00 và thứ tự giữa chúng là ngẫu nhiên.
  ⚠ Ô CHỈ có ngày thì KHÔNG bịa ra "lúc 00:00" — trông như một mốc chính xác trong khi thật ra không
  ai biết mấy giờ.
  ⚠ Đánh đổi đã biết: `dd/MM/yyyy` không sort đúng khi sort cột đó như CHỮ trong Sheet (ISO thì có).
  Extension tự sắp theo mốc đã parse nên không ảnh hưởng.
- **Chart của GMGN là TradingView trong một iframe `blob:` RIÊNG; avatar trên chart nằm trong đó.**
  Cái panel bên phải trang ("X Tracker") mới ở frame trên cùng — nên trước đây mọi thứ extension bắt
  được đều là của panel đó, còn hover avatar trên chart rồi bấm N thì không có gì xảy ra. Hai lý do
  chồng lên nhau, phải chữa cả hai:
  1. `main-world.js` khai `all_frames: false` (nó vá `fetch` của GMGN, vá ở mọi frame là vá nhầm chỗ)
     → chỉ frame trên cùng thấy danh sách người. Frame chart mù tịt. Giờ frame trên cùng đẩy
     `KT.MSG.CALLERS` qua service worker, SW phát lại cho MỌI frame của tab.
  2. Hộp ghi chú chỉ dựng ở frame trên cùng (một trang một hộp). Bấm N trong frame chart giờ gửi
     `KT.MSG.NOTE_FOR` → SW → `frameId: 0`. Gửi ĐỊNH DANH (ví + username) chứ không gửi cả object:
     frame trên cùng có dữ liệu Sheet mới hơn, để nó tự tra lại.
  ⚠ SW gọi `chrome.tabs.sendMessage` thì PHẢI có host permission cho gmgn — `content_scripts.matches`
  KHÔNG cấp quyền đó, và `activeTab` chỉ có hiệu lực cho popup sau cú bấm của người dùng.
  ⚠ Mỗi frame tự khai `KT.MSG.FRAME_HELLO`, nút Chẩn đoán in ra `framesWithScript`. Không có nó thì
  "iframe không vào được" trông y hệt "vào được nhưng không khớp avatar nào" — hai bệnh, hai cách chữa.
