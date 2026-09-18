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
- **Avatar trên trang GMGN nằm ở frame TRÊN CÙNG, không phải trong iframe chart.** Chẩn đoán
  18/09/2026: frame chart có content script và nhận được `callers: 33`, nhưng `images: 0` — nó chỉ
  chứa canvas của TradingView. Frame trên cùng mới có 71 ảnh cỡ avatar.
- **GMGN phục vụ CÙNG một avatar qua hai đường**: API trả `/defi/images/twitter/<md5>.jpg`, thẻ `<img>`
  trên trang dùng `/external-res/<md5>_v2.webp`. So nguyên URL thì chỉ 7/71 avatar khớp được.
  `avatarKey` rút về phần hash — trùng hash là trùng ảnh nên không đẻ ra khớp nhầm.
- **Tooltip của chart mọc XA avatar**, nên luật "tooltip phải ở trong bán kính quanh con trỏ" (thêm
  vào để chặn N mở nhầm người) lại giết luôn phím N trên chart. Giờ neo theo AVATAR DƯỚI CON TRỎ thay
  vì đo khoảng cách tới tooltip.
  ⚠ Nhưng phải kiểm `el.querySelector("img")` trước: thẻ giới thiệu người của GMGN luôn kèm ảnh của
  chính người đó, còn một cục SPA vừa vẽ lại có nhắc `@tên` thì không. Bỏ bước đó là bug cũ sống lại —
  đang hover một avatar lạ mà ở góc màn hình có tên ai đó là N mở nhầm sang người kia (có test).
- **Bấm ⟳ ở `chrome://extensions` KHÔNG cập nhật tab đang mở.** Bản content script cũ trong tab đó bị
  CẮT khỏi extension ngay lập tức: `chrome.runtime.id` biến mất, mọi lời gọi ném "Extension context
  invalidated", và tab không trả lời `chrome.tabs.sendMessage` nữa. Phải **F5 lại trang** mới nạp bản
  mới. Thông báo lỗi PHẢI nói ra điều đó — gộp nó chung với "tab này chưa chạy content script" là đẩy
  người dùng đi tìm sai hướng (đã mất một vòng vì đúng chuyện này).
- **Avatar TRÊN CHART là NÉT VẼ TRÊN CANVAS, không phải thẻ `<img>`.** Chẩn đoán 18/09/2026 khép lại
  chuyện này: iframe chart có `canvases: 8, images: 0`, còn cả trang chỉ có **12** ảnh cỡ avatar thật
  (`avatarBuckets: twitterPath 8, externalRes 4, giaoDien 59`) — tức là bảng X Tracker bên phải, không
  phải chart. Hệ quả, KHÔNG có cách nào lách:
  - viền quanh avatar trên chart là **bất khả thi** (không có phần tử nào để bám vào);
  - `identifyByAvatar` không bao giờ nhận ra người trên chart;
  - phím N trên chart CHỈ chạy được qua đường đọc chữ trong tooltip. Đường đó là tính năng chính, không
    còn là "dự phòng" — đừng ai xoá nó đi cho gọn.
- **Chuột vào iframe là frame cha NGỪNG nhận `pointermove`.** Nó giữ nguyên toạ độ cũ và không biết
  mình đang cầm số liệu chết, nên mọi phép "cái này có ở cạnh con trỏ không" ở frame cha đều đo từ một
  điểm sai — đó là lý do thật sự làm N chết trên chart. Frame chart tự báo toạ độ ra (`KT.MSG.POINTER`,
  hãm 80ms), frame cha cộng offset của thẻ `<iframe>` để quy về hệ toạ độ của mình.
  ⚠ Phím N bấm trong frame chart cũng gửi `NOTE_FOR` KHÔNG kèm định danh — frame con không tự nhận ra
  ai được (canvas), nên để frame trên cùng tự quyết bằng tooltip + toạ độ vừa nhận.
- **Con trỏ ở TRÊN CHART thì không đo khoảng cách tới tooltip nữa.** GMGN thả tooltip vào chỗ trống
  của nó, không bám con trỏ — mà avatar dưới con trỏ lại là nét vẽ trên canvas, không có gì để neo.
  Nên `overIframe()` (con trỏ đang trên một `<iframe>`) là đủ điều kiện nhận thẻ. Luật bán kính chỉ
  còn dùng cho phần DOM thường của trang.
- **`lastTooltip.ketQua` nói vì sao thẻ (không) hiện ra.** Trước đây `found: true` bị đọc nhầm thành
  "đã hiện thẻ" — nó chỉ có nghĩa là ĐỌC RA được cái tên; thẻ vẫn có thể bị vứt ở bước sau mà không
  để lại dấu vết nào. Mỗi nhánh loại bỏ giờ tự khai lý do, kèm toạ độ con trỏ và tuổi của nó.
- **Tooltip của GMGN là MỘT phần tử dùng đi dùng lại.** Rê sang người khác thì nó đổi NỘI DUNG chứ
  không bị xoá đi dựng lại — nên `cardAnchor.isConnected` vẫn true và `watchAnchor()` không dọn gì,
  trong khi cái tên mình nhớ đã cũ. Đó là lý do hộp ghi chú mở ra tên một người đã hover từ TRƯỚC.
  `hitAtPointer` phải ĐỌC LẠI phần tử đó ngay lúc bấm N (`matchHandleIn(cardAnchor)`), không tin vào
  cái đã nhớ.
- ⚠ Trong `processTooltipQueue`, một node bị loại phải `continue` chứ KHÔNG `return`: hàng đợi có thể
  chứa cả mẩu text lẻ lẫn cả thẻ tooltip thật, bỏ cuộc ở mẩu đầu là không bao giờ tới được thẻ thật.
- **Ẩn THẺ ≠ quên NGƯỜI.** `hideCard()` xoá `cardHit`, nhưng phần tử tooltip của GMGN vẫn còn nguyên
  trên trang và vẫn đang nói về đúng người đó — GMGN dựng lại tooltip một nhịp là `watchAnchor()` dọn
  mất thẻ, và bấm N lúc đó ra rỗng. Giữ riêng `lastPerson` (sống 20s, qua cả lúc thẻ bị ẩn).
  ⚠ `lastPerson` phải nhớ nó đến từ đâu (`fromPointer`): thẻ neo vào một AVATAR đã bị bước 2 loại khi
  con trỏ rời avatar đó, để nó rơi xuống nhánh tooltip là trả lời người cũ cho avatar mới.
- **`hitAtPointer` tự khai lý do ở MỌI đường ra** (`diagnose().lastHit`). Hàm này đã vá bốn lần, mỗi
  lần hỏng lại là một vòng đoán mò. Sửa nó thì giữ nguyên thói quen đó.
- **Đừng bám vào NODE vừa đổi — leo lên tìm KHUNG thẻ** (`cardContainer`, tối đa 5 tầng, phải có ảnh
  người và kích thước hợp lý). Node vừa đổi có thể chỉ là một mẩu chữ bên trong; bám vào nó thì GMGN
  vẽ lại một nhịp là mất dấu, và `lastPerson.el.isConnected` thành false giữa lúc hover và lúc bấm N
  (đo được trên chart thật: `lastHit.lyDo = "không có thẻ tooltip nào còn sống"`).
- **Phần tử bị xoá thì NGƯỜI vẫn còn.** GMGN chỉ hiện một tooltip tại một thời điểm, nên người đọc
  được vài giây trước vẫn là người dưới con trỏ — rê sang ai khác thì đã có thẻ mới. Cửa sổ tin cậy
  cho trường hợp này (`ORPHAN_TTL_MS` 6s) CỐ TÌNH ngắn hơn `PERSON_TTL_MS` (20s): không đọc lại được
  nữa thì càng để lâu càng dễ ghi chú vào nhầm hồ sơ. Và chỉ áp dụng khi con trỏ đang ở TRÊN CHART.
- **Lỗi kết nối Sheet nằm lại trong storage cho tới lần tải THÀNH CÔNG kế tiếp** (cố ý: giữ dữ liệu
  cũ để panel còn dùng được khi mất mạng). Hệ quả phải bù lại: dải đỏ PHẢI nói nó cũ bao lâu
  (`data.errorAt`), và `refreshIfStale` phải tự thử lại khi đang mang một lỗi cũ hơn 60s — bằng không
  một sự cố thoáng qua trông y hệt một sự cố đang xảy ra, và người dùng đi sửa nhầm chỗ.
- **GMGN KHÔNG xoá thẻ tooltip cũ — nó giữ lại trong trang và GIẤU đi.** Thẻ cũ vẫn `isConnected`,
  vẫn có kích thước, `getBoundingClientRect()` vẫn trả số đẹp. Đọc lại nó ra đúng cái tên nó đang giữ
  — của người đã hover từ TRƯỚC. Đây là lý do hộp ghi chú mở ra tên người khác trong khi tooltip trên
  màn hình là người đang hover (`lastHit.ra = "sfdn__"` trong khi màn hình là `Shea1121`).
  Nên phải chọn thẻ **ĐANG HIỆN** (`isReallyVisible`: rect + display/visibility/opacity của cả chuỗi
  cha + `elementFromPoint` để bắt trường hợp bị thẻ mới đè lên), không phải thẻ mới nhất.
- ⚠ `processTooltipQueue` GHI SỔ mọi thẻ khớp được rồi mới quyết định hiện cái nào. Hai tooltip có
  thể mọc trong cùng một nhịp; dừng ở cái đầu tiên là cái thứ hai không bao giờ vào sổ, và lúc bấm N
  thì "chọn thẻ đang hiện" không có gì để chọn.
- **GMGN DỰNG SẴN thẻ tooltip cho từng mốc rồi chỉ BỎ GIẤU khi hover.** Không thêm node, không đổi
  chữ — nên MutationObserver KHÔNG thấy gì và thẻ đó không bao giờ vào sổ. Triệu chứng: hover người
  thứ hai thì N im, chẩn đoán báo "thẻ đã bị xoá N giây trước" trong khi tooltip đang hiện rành rành.
  Nên `hitAtPointer` phải QUÉT LẠI màn hình (`scanVisibleCard`) khi trong sổ không có thẻ nào đang
  hiện. Quét chỉ chạy lúc bấm N, và quét trong `poolRoot` (khung chứa đám thẻ, nhớ từ lần khớp
  trước) chứ không phải cả trang.
  ⚠ Đây là bài học thứ ba cùng một kiểu: MutationObserver chỉ kể được chuyện nó CHỨNG KIẾN. Thứ gì
  phải đúng tại THỜI ĐIỂM BẤM PHÍM thì hỏi lại DOM tại thời điểm đó, đừng tin sổ sách.
