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
- **⚠⚠ Bảng "X Tracker" bên phải trang GMGN có hàng người TRÔNG HỆT thẻ tooltip của chart**: avatar,
  `@handle`, `x mấy`, `mấy ngày`, nội dung post, chữ "Callback". Không lọc theo VỊ TRÍ thì phép đọc
  tooltip trúng ngay một hàng trong bảng đó và trả lời một người chẳng liên quan gì tới chart — đó là
  cái đã xảy ra suốt nhiều bản: chưa lần nào bắt được thẻ trên chart cả, toàn bắt nhầm sang bảng bên
  cạnh, mà `lastTooltip` nhìn vẫn "hợp lý" nên không ai nghi.
  Luật: con trỏ đang trên chart thì ứng viên PHẢI nằm trong vùng khung chart (`chartRect()` = iframe
  to nhất, đệm 40px). Áp ở CẢ hai chỗ: lúc thẻ mọc ra, và lúc quét lại khi bấm N.
- ⚠ `scanVisibleCard` duyệt theo **ẢNH** (vài chục) chứ không theo `div` (vài nghìn) — nhưng leo từ
  ảnh lên phải đi tiếp tới tầng CÓ `@handle`, dừng ở tầng đầu tiên chứa ảnh là dừng ở cụm avatar+tên.
- **Chẩn đoán chỉ đọc được frame TRÊN CÙNG** (`chrome.tabs.sendMessage(..., {frameId: 0})`). Frame
  chart nghĩ gì thì không ai biết — bảy vòng mò mẫm phần lớn vì thiếu đúng chỗ này. Giờ frame con tự
  khai `lastTooltip` + `lastHit` của NÓ mỗi 3 giây (chỉ khi tab đang hiện), nằm trong
  `framesWithScript`.
- **Trong khung chart (`inChartFrame`) thì bỏ luật khoảng cách.** Frame đó LÀ chart, không có bảng
  X Tracker hay danh sách nào khác để lẫn, nên thẻ nào mọc ra cũng là nói về mốc đang hover — y như
  luật đã áp cho `overIframe()` ở frame cha. Luật lọc theo `chartRect()` thì ngược lại CHỈ dùng ở
  frame cha (trong iframe không có iframe nào để đo).
- **Tooltip của chart KHÔNG nằm trong iframe chart** — frame đó khai `lastTooltip: null`, `images: 0`,
  chỉ có 8 canvas. Nó nằm ở frame CHA, chồng lên vùng chart.
- **Đừng đòi thẻ phải có `<img>` khi đã biết chắc vị trí.** Điều kiện "có ảnh người" sinh ra để phân
  biệt thẻ-giới-thiệu-người với một cục SPA vừa vẽ lại — cần ở giữa trang, nhưng trong vùng chart thì
  VỊ TRÍ đã làm xong việc đó. Mà avatar trong thẻ chart rất có thể là `background-image` chứ không
  phải `<img>`, nên đòi ảnh ở đó là vứt đúng cái mình đang tìm (`looseContainer`).
  ⚠ Hệ quả: ở vùng chart, `scanVisibleCard` duyệt theo `div` (cap 8000) chứ không theo ảnh — đi từ
  ảnh thì không bao giờ tới được thẻ không có ảnh.
- **Shadow DOM là điểm mù của MỌI cách đọc trang.** `document.querySelectorAll` không trả về nội dung
  trong shadow root, MutationObserver gắn ở `documentElement` không thấy gì bên trong, và `contains`
  không đi xuyên ranh giới đó. Nếu GMGN dựng thẻ tooltip của chart trong shadow root thì mọi cách nới
  điều kiện đều vô ích — mình chưa bao giờ nhìn thấy nó. `scanRoots()` gom document + các shadow root
  MỞ (đóng thì chịu).
  ⚠ `isReallyVisible` phải biết chuyện đó: `elementFromPoint` trả về THẺ CHỦ của shadow root, so
  thẳng với phần tử bên trong là luôn ra "không hiện" — tức là loại oan sạch mọi thẻ trong shadow root.
- **`lastScan` trong chẩn đoán** kể lần quét vùng chart gần nhất: bao nhiêu gốc, xét bao nhiêu node,
  và vài ứng viên NẰM ĐÚNG VÙNG CHART mà không khớp được ai. `ungVien` rỗng = thẻ chart không nằm
  trong DOM mình với tới được; có chữ = đọc được nhưng khớp tên hỏng. Hai bệnh, hai cách chữa.
- **⚠⚠ Quét shadow root thì phải BỎ QUA shadow root của CHÍNH MÌNH.** Panel KOL Tracker cũng là một
  thẻ có avatar và `@handle`, và nó nằm đè lên chart — quét vào đó là đọc ra dòng đầu trong danh sách
  của chính mình rồi tưởng đó là người đang hover. Đã xảy ra thật: hover `Shea1121`, hộp mở
  `Roxx_Sol` (dòng đầu panel). `isOurs()` bắt theo id `kol-tracker-*`, leo 4 tầng cha.
- **Biên quanh khung chart là `CHART_PAD_PX` 120, không phải 40.** Thẻ tooltip mọc TRÀN ra ngoài mép
  chart — đo trên ảnh thật: chart hết ở x=1515, thẻ bắt đầu ở x=1550. Biên hẹp là vứt nhầm đúng cái
  mình tìm. 120px vẫn cách bảng X Tracker hơn 240px nên không kéo nó vào.

## Đám trên chart KHÔNG phải đám trong bảng X Tracker (19/09/2026)

Chủ máy khẳng định sau mười một vòng mò: mấy avatar mọc trên cây nến là một
đám KHÁC với danh sách dưới bảng X Tracker. Không có cái danh sách nào dưới
trang để tóm đám đó cả. Hai hệ quả:

- `community/messages` (nguồn của `state.callers`) **không bao giờ** chứa người
  trên chart. Mọi vòng trước đều giả định ngược lại, nên `identify()` trả null
  và hover không ra gì — không phải lỗi đo toạ độ.
- Mốc trên chart vẽ bằng **canvas**, không để lại DOM để hover. Nên đường duy
  nhất còn lại là **nghe tất cả API của GMGN** rồi tự nhận ra chỗ nào nói về
  người: `main-world.js` bắt mọi URL có `/api/`, `KT.gmgn.scanPeople()` đi khắp
  cây JSON nhặt object nào có tay cầm Twitter đọc được.
  - `scanPeople` **phải** đòi HANDLE_KEYS: token cũng có `name`/`address`/`logo`,
    thiếu chốt đó là mỗi chart đẻ ra một "người" tên CashCat (có test khoá lại).
  - Sổ `apiLog` trong Chẩn đoán ghi **cả** endpoint không có ai — "có endpoint
    này mà rỗng" là một câu trả lời, không biết nó tồn tại thì không.
- `main-world.js` giờ chạy ở **mọi frame** (`all_frames: true` +
  `match_origin_as_fallback`), vì nếu iframe chart tự gọi API thì frame trên
  cùng mù tịt. Frame nào nhặt được người thì phát `MSG.API` cho cả tab; bên
  NHẬN chỉ gộp, **không chia lại** (vòng lặp).

### Ghi chú cho người chỉ có tay cầm, không có ví
`Code.gs` từ chối dòng thiếu ví (`saveNote_` → "thiếu wallet"), mà người nhặt
từ API lạ thường không kèm ví. `note-box.js` lấy `x:<handle>` làm khoá thay thế
— viết rõ tiền tố để không ai nhìn nhầm là địa chỉ ví thật. Cái giá: gặp lại
đúng người đó kèm ví thật thì Sheet có hai dòng, gộp tay.

## Thẻ trên chart CÓ trong DOM — chết ở hai chỗ khác (19/09/2026)

Chẩn đoán v0.5.0 lật ngược kết luận của mười một vòng trước: thẻ nói về người
trên chart **có** trong DOM, **có** lọt qua bộ lọc vùng chart, và mình **có**
đọc được chữ trong đó:

```
"Triggered | Thesis | 13h | @ | Triggeredtrad3s | CATE JUST HIT 100M…"
"Manifesto |  | Best Callout | Yeon | @ | yeon__ | 75d | …"
```

Hỏng ở hai chỗ, cả hai đều nằm SAU khâu đọc:

1. **GMGN tách dấu `@` ra một text node RIÊNG.** `"@"` trơ trọi không khớp
   `STANDALONE_HANDLE_RE`, còn `"Triggeredtrad3s"` không có `@` nên rơi xuống
   `plain` — lẫn với "Thesis", "13h", "Best Callout" và cả câu post.
   `candidateHandles` giờ ghép `"@"` với mẩu kế bên (có test).
2. **`identify()` trả null cho người chưa có hồ sơ**, và `matchHandleIn` coi
   null là "không đọc được gì". Nhưng đám trên chart KHÔNG nằm trong bảng
   X Tracker (xem mục trên) nên chúng luôn luôn null — tức là người đáng ghi
   chú nhất thì bị vứt đi. Giờ có `allowUnknown`: đọc ra handle ở ô handle thật
   (`standalone`, KHÔNG nhận `plain`) mà tra không thấy ai thì dựng hồ sơ trắng.
   ⚠ Cờ này CHỈ bật cho đường phím N và CHỈ khi con trỏ ở trên chart. Viền màu
   và thẻ tóm tắt vẫn chỉ dành cho người quen mặt — bật cho cả người lạ là cả
   trang GMGN mọc viền.

⚠ Và phải chọn thẻ **GẦN CON TRỎ NHẤT**, không phải thẻ đầu tiên theo thứ tự
DOM: vùng chart có thẻ nằm lì (kiểu "Best Callout") luôn đứng trước trong cây.
Lấy cái đầu tiên là tái sinh đúng con bug "bấm N ai cũng ra một người" của mấy
bản đầu, chỉ đổi chỗ chứ chưa chết. Hoà khoảng cách thì lấy khung NHỎ hơn —
mấy khung cha chỉ bọc quanh.

## Khoá một người: ID SỐ của X, không phải username (19/09/2026)

Username đổi lúc nào cũng được, và đổi xong thì mọi dòng đã ghi trong Sheet mồ
côi — im lặng, không triệu chứng nào. Nên thứ tự khoá trong `note-box.keyOf`:

1. `wallet` (người trong bảng X Tracker — API trả sẵn)
2. `x:<id số>` nếu bắt được ID tài khoản X
3. `x:<username>` — đường cùng, biết là sẽ chết nếu họ đổi tên

Cột `twitter_url` cũng theo luật đó: có id thì ghi `x.com/i/user/<id>` (X tự
chuyển hướng sang tên HIỆN TẠI nên link không chết), không thì `x.com/<tên>`.
Không phải thêm cột nào vào Sheet, không phải đụng Code.gs.

⚠ Tới 19/09/2026 **vẫn chưa bắt được id nào** cho người trên chart: 21 endpoint
HTTP không có ai, thẻ trên chart chỉ có chữ hiển thị. Đang truy hai hướng:
- `WebSocket` (main-world bọc luôn — lọc trên CHUỖI trước khi JSON.parse, vì
  mỗi tick giá là một tin; tin nhị phân thì báo `#nhi-phan` ra chẩn đoán chứ
  không im, kẻo "không thấy ai" lẫn với "không đọc được").
- `lastScan.datId` — link, `data-*` và URL ảnh của chính thẻ đã chọn.

Ghi nhận rồi mới dùng: **đoán sai chỗ lấy id là mọi dòng trong Sheet gắn nhầm
người**, và đó là loại sai không có triệu chứng.

## GMGN KHÔNG gửi id tài khoản X xuống (đo 21/09/2026)

Đổ ra toàn bộ tên cột thật của một message (`mauMessage`), không có
`twitter_id` nào cả. Ba cột có đuôi id, và cả ba đều KHÔNG dùng làm khoá người
được:

| Cột | Giá trị thật | Là gì |
|---|---|---|
| `id` | `gmgn_01M1MRA95JX9A0FPENYZ5Q1RB` | `"gmgn_"` + ulid **bị cắt mất ký tự cuối** |
| `ulid` | `01M1MRA95JX9A0FPENYZ5Q1RBH` | ULID của DÒNG POST, không phải của người |
| `encrypted_user_id` | `AAAAAW53UaAv/yecYOrcDeSmScoaIg` | mã hoá lại mỗi lần gọi — cấm dùng |

⚠ `id` = `ulid[0..25]` — thiếu đúng một ký tự. Nên **dùng `ulid`, đừng dùng
`id`**: cắt cụt thì về lý còn có thể đụng nhau, mà lỗi kiểu đó không bao giờ
lộ ra lúc chạy.

Hệ quả: khoá một người phải là **một CHÙM DẤU**, không phải một cột. Xếp theo
độ bền trước phép "đổi tên cho khỏi bị nhận ra":

1. `wallet_address` — chết khi họ đổi ví
2. hash avatar (`profile_image_url` → `KT.avatarKey`, GMGN băm theo NỘI DUNG
   ảnh nên không dính gì tới tên) — chết khi họ đổi ảnh đại diện
3. `ulid` của bài post đã ghi — bài cũ vẫn là bài cũ, **không chết vì đổi tên**
   (đang đo độ ổn định bằng `probeUlid`, xem dưới)
4. `username` — chết ngay lúc đổi tên

⚠ Và có một **bất đối xứng** phải nhớ: người trên CHART (thẻ Thesis) không có
ví, không có avatar trong thẻ (`datId` rỗng — không `<a href>`, không ảnh).
Với họ chỉ còn tên + tên hiển thị + nội dung post. Chùm dấu ở trên gần như chỉ
phục vụ người trong bảng X Tracker.

### probeUlid — đo trước, tin sau
`ulid` trông như một cái khoá tử tế. `encrypted_user_id` cũng thế, mà đo ra thì
nó đổi mỗi lần gọi. Nên `probeUlid` nhận mặt bài post bằng thứ KHÔNG dính tới
ulid (ví + giờ post), rồi đếm xem ulid gắn với nó có giữ nguyên qua các lần gọi
và qua cả lần F5 sau (lưu ở `chrome.storage.local`, khoá `ulidProbe`).
`lech > 0` là dấu chấm hết cho leg số 3 — đừng xây gì lên trên nó nữa.

## Đám trên CHART mới là mục tiêu (21/09/2026)

Chủ máy chốt: thứ đáng điều tra là người trên chart, **vì chart nói THỜI ĐIỂM
CALL** — bảng X Tracker dưới trang không nói. Mọi ưu tiên xoay theo đó.

Và điều đó đảo ngược đánh giá ở mục trên: tao từng bảo người trên chart "chỉ
có tên + nội dung post, yếu". Sai. Thẻ chart còn có **tuổi bài** ("6h", "75d"),
quy ra là mốc call tuyệt đối. Nên dấu của một người trên chart là:

> **(token, nội dung post, mốc call)**

Bộ ba đó **không dính gì tới tên lẫn ví** — nó là một việc ĐÃ XẢY RA, nên sống
qua cả đổi tên lẫn đổi ví. Đó là dấu bền nhất trong cả hệ, không phải yếu nhất.

`KT.cardFacts(chunks, now)` đọc bộ ba đó ra, và note-box ghi thẳng vào hai cột
`post_text` + `posted_at` đã có sẵn — **không phải đụng Code.gs**.

⚠ Quy về mốc TUYỆT ĐỐI ngay lúc đọc. Để nguyên "6h" thì tuần sau đọc lại là
sai một tuần, không triệu chứng nào.

⚠ Mốc chỉ chính xác tới ĐƠN VỊ của nó — "6h" là đâu đó trong một giờ, "75d"
sai số cả ngày. So hai mốc phải nới đúng bằng `saiSoMs`, đừng so bằng dấu bằng.

⚠⚠ `AGE_RE` **không có cờ `i`**, cố ý: chữ thường là tuổi bài, CHỮ HOA là đơn
vị độ lớn. Bật `i` thì `"100M"` (vốn hoá) thành 100 PHÚT và một mốc call bịa
được ghi thẳng vào cột mày dùng để điều tra. Có test khoá lại.

### Đừng đoán tên cột rồi lấy kết quả rỗng làm bằng chứng
`/pf/api/v1/fomo/thesis/token` — tên nó đúng nghĩa đen là nguồn của thẻ
"Thesis" trên chart — bị bộ lọc "mùi người" loại vì trong đó không có chữ
`"username"`. Loại xong thì `nguoi: 0`, trông y hệt "endpoint này không có ai".
Giờ: endpoint khớp `SUSPECT_RE` thì gửi nguyên văn bất kể bộ lọc, và mọi lần
bỏ qua đều phải NÓI LÝ DO (`#qua-to-N` / `#khong-thay-nguoi` / `#khong-phai-json`).
`scanPeople` về tay không thì ghi `hinhDang` (chỉ TÊN cột, không lấy giá trị —
giá trị là nội dung post của người ta).

## Nguồn thật của mấy mốc trên chart: `/pf/api/v1/fomo/thesis/token` (21/09/2026)

Mười bốn vòng đi tìm, và nó nằm ngay trong `apiLog` từ đầu — báo `nguoi: 0`.
Không phải vì trong đó không có ai: `scanPeople` đòi cột tên `username`, còn
feed này đặt tên là **`author_handle`**. Đoán tên cột, rồi lấy chính kết quả
rỗng do mình đoán sai làm bằng chứng "endpoint này trống".

`data.items` (200 dòng) mang đủ thứ mà đường hover không bao giờ có:

| Cột | Là gì |
|---|---|
| `author_id` | **khoá KHÔNG đổi được** — thứ đi tìm suốt mấy vòng |
| `fomo_created_at` | mốc call CHÍNH XÁC, không phải `"6h"` làm tròn |
| `thesis` | nguyên văn luận điểm |
| `holdings_usd` / `author_trade_usd` / `realized_pnl_usd` / `unrealized_pnl_usd` | nó có bỏ tiền thật không |
| `author_avatar_url`, `author_name`, `author_is_dev`, `like_count` | phần còn lại |

`KT.gmgn.parseThesis` đọc nó. Ba chỗ dễ sai, đều có test khoá:

1. ⚠ **Feed NHIỀU TOKEN** — mỗi dòng mang `token_address` riêng. Không lọc
   theo token đang mở là panel liệt kê người của token khác. Phần ngoài token
   vẫn giữ (`state.thesisAll`) làm sổ nhận mặt: gặp lại tay cầm đó ở chart
   khác vẫn tra ra `author_id`.
2. ⚠ Feed có thể về **TRƯỚC** khi biết token đang mở là cái nào → `applyThesis()`
   phải chạy lại khi `mutil_window_token_info` về.
3. ⚠ Chỉ kết luận giữ/xả **khi có đủ SỐ**. Thiếu dữ liệu mà đoán là gắn cờ đỏ
   oan — "không biết" và "hô mà không mua" là hai chuyện khác nhau.

Panel ưu tiên `state.chartPeople` hơn `state.callers`: chart nói THỜI ĐIỂM
CALL, bảng X Tracker dưới trang thì không. **Không gộp hai đám vào một danh
sách** — gộp thì không biết mình đang nhìn ai.

`ulid` đã đo là ổn định (`kiem: 31, lech: 0`), nhưng giờ không cần tới nữa:
`author_id` mạnh hơn hẳn.

## `author_id` là UUID **v5** — băm ra, không phải số ngẫu nhiên (21/09/2026)

```
author_id        = "70715228-7368-5979-a748-92662d913812"   (UUID v5)
fomo_created_at  = 1789986741960                            (number, epoch MILI)
id               = "3f1b3eae-ff45-4543-ae21-e372418f2453"   (UUID v4 — id của DÒNG post)
```

UUID v5 nghĩa là GMGN **băm từ một chuỗi gốc** (SHA-1 + namespace). Đã thử 5
namespace chuẩn × 14 dạng tên (handle, @handle, x.com/handle, twitter:handle…)
— **không tổ hợp nào khớp**. Nên chuỗi gốc là gì thì KHÔNG biết được từ ngoài.

⚠ Hệ quả, phải nói rõ vì nó quyết định cả thiết kế: **không chứng minh được
`author_id` sống qua phép đổi tên.** Nếu GMGN băm từ handle thì nó đổi theo
tên; nếu băm từ id tài khoản X thì nó không đổi. Hai khả năng đó không phân
biệt được bằng cách nhìn giá trị.

### Cây cầu KHÔNG phụ thuộc vào câu hỏi đó
Nhận ra người đổi tên bằng **`post_id`**, không bằng `author_id`:

> thấy lại một `post_id` đã ghi trong Sheet, mà `author_handle` bây giờ KHÁC
> tên đã ghi → chính nó đổi tên.

Đúng với cả hai khả năng trên, nên không phải chờ trả lời câu kia. Và Sheet
**đã có sẵn** cột `post_id` + `username` bên `Detail` — không phải đụng Code.gs.

`probeAuthorId` đánh số theo `post_id`, nên lần đo sau trả lời LUÔN cả hai:
`kiem > 0` nghĩa là `post_id` ổn định (bằng không không bao giờ khớp để mà
đếm), còn `lech` nói `author_id` có đổi không.

## Nhận ra người đổi tên: cây cầu là `post_id` (21/09/2026)

Đo xong mới dựng. `authorIdOnDinh: {kiem: 40, lech: 0}` qua một lần F5 →
**`post_id` ổn định** (bằng không thì không bao giờ khớp để mà đếm) và
`author_id` cũng không đổi giữa các lần gọi.

Nhưng vẫn neo vào **`post_id`**, KHÔNG neo vào `author_id`: `author_id` là
UUID v5 băm từ chuỗi gốc chưa biết, nên "ổn định giữa các lần gọi" ≠ "sống qua
phép đổi tên". `post_id` thì đúng trong cả hai khả năng.

> Cùng một `post_id` đã ghi trong Sheet, mà tên tác giả bây giờ khác tên đã
> lưu → chính nó đổi tên.

Ba mảnh, đều ở tầng thuần và có test:
- `buildDb` thêm chỉ mục **`byPostId`** (bài call đã ghi → người đã ghi).
- `findPerson` tra thêm bằng `postId`. ⚠ Thiếu cái này thì mỗi lần nó đổi tên
  là Sheet đẻ thêm một hồ sơ trắng, còn lịch sử cũ nằm lại ở cái tên không ai
  tra nữa.
- `findRenames(db, list)` → danh sách "tên cũ → tên mới", panel hiện thành dải
  cảnh báo ở ĐẦU trang chủ (không giấu trong chi tiết: đây là thứ không ai đi
  tìm, nên nó phải tự đập vào mắt).
- `renamedFromPost` là bản anh em của `renamedFrom` cho người KHÔNG có ví —
  `renamedFrom` đòi ví trùng mới dám kết luận nên với người trên chart nó im
  lặng mãi mãi.

⚠ Ghi chú cho người đã đổi tên phải rơi vào ĐÚNG dòng cũ. Nó rơi đúng vì
`keyOf` lấy `person.wallet` (khoá đã lưu trong Sheet) trước cái tên mới — có
test khoá lại, đừng đảo thứ tự đó.

⚠ `findRenames` phải chạy lại khi **Sheet** tải xong, không chỉ khi feed về:
người đổi tên chỉ lộ ra khi có CẢ hồ sơ cũ lẫn danh sách đang hiện, mà hai
thứ đó không về cùng lúc.

## Nhãn đúng với 200/200 người thì KHÔNG phải phát hiện (21/09/2026)

`phanBoHolding` đo trên feed thật: `{holding: 200}`. Cả 200 người đều
"còn giữ", vì `holdings_usd > 0` đúng với tất cả.

Một nhãn đúng với mọi người thì không phân loại được gì — mà tệ hơn, nó
**trông như** một phát hiện đã kiểm chứng, nên người đọc tin vào nó. Đây đúng
là vết xe của bản đầu (gắn cờ đỏ cho 46/50 người), chỉ lật ngược lại.

Nên feed thesis **không gán nhãn giữ/xả**: `holding: "unknown"`, không cờ đỏ.
Chưa biết `holdings_usd` là "đang giữ bây giờ" hay "giá trị lúc call", cũng
chưa biết feed có lọc sẵn người đã xả ra không.

Thay vào đó hiện **TIỀN** — `author_trade_usd`, lãi/lỗ — vì đó là số GMGN đưa
thẳng, không qua diễn giải của mình, và nó phân loại được thật (`$500` với
`$80K` là hai câu chuyện khác nhau). `KT.fmtUsd` rút gọn cho vừa hàng hẹp.

⚠ Hai test cũ khoá hành vi gắn nhãn đã được sửa theo quyết định mới, KHÔNG
sửa code về cũ cho test xanh.

`tienTrenChart` trong chẩn đoán đếm xem có ai `realized_pnl != 0` không — nếu
không một ai thì feed đúng là chỉ chứa người còn giữ, và nhãn kia vô nghĩa
thật chứ không phải mình đọc sai cột.

## Trang Options: hai lỗi im lặng chỉ lộ ra khi có người thứ hai (21/09/2026)

1. **Dòng trạng thái chết từ lâu.** `renderStatus` đọc `data.kols`/`data.calls`
   và `db.kols` — hình dạng của đường CSV CŨ. Service worker lưu
   `{ overview, detail }`, còn `buildDb` trả `{ people, counts:{people,notes} }`,
   nên `db.kols.filter` ném lỗi giữa chừng và dòng trạng thái đứng nguyên ở
   "Đang kiểm tra…" mãi mãi. Không có lỗi nào hiện ra — mà đây đúng là thứ
   người mới nhìn thấy đầu tiên.
2. **`addedBy` không có ô nhập.** Nó nằm trong `DEFAULTS` từ đầu, `note-box`
   vẫn ghi nó vào cột `added_by`, nhưng trang Options chưa bao giờ có ô để
   điền → luôn rỗng. Một người dùng thì không ai để ý; hai người dùng chung
   Sheet thì **không phân biệt được ghi chú của ai**, mà cột vẫn nằm đó trông
   như đang hoạt động.

Cả hai đều thuộc loại "chỉ sai khi có người thứ hai", nên đừng chỉ thử bằng
máy của chính mình.

### Lời mời cài đặt cố ý KHÔNG kèm SECRET
`SECRET` là mật khẩu GHI vào Sheet, mà lời mời thì người ta dán vào chat và nó
nằm lại đó vĩnh viễn. Nút "Copy lời mời" để một chỗ trống bắt người gửi tự
điền, kèm câu nhắc gửi riêng.

### Hai nút ⟳ khác nhau — phải nói rõ ở cả Options lẫn README
- ⟳ trong popup/Options = **tải lại dữ liệu từ Sheet**.
- ⟳ ở `chrome://extensions` = **nạp lại code**, và bắt buộc **F5 lại trang
  GMGN** sau đó.

## HTTP 404 Apps Script: nghi can số một là TÀI KHOẢN GOOGLE, không phải cấu hình

`credentials: "omit"` là **bắt buộc** cho mọi lời gọi Apps Script. Deploy chế
độ "Anyone" thì không cần đăng nhập; nhưng nếu request mang theo cookie Google
mà trình duyệt đang đăng nhập **nhiều tài khoản**, `/exec` chuyển hướng sang
URL gắn số tài khoản (`/u/1/`, `/u/2/`…) — tài khoản đó có thể không phải chủ
script → **404**.

Đây chính là kiểu 404 "tự nhiên hỏng dù không đụng gì vào Apps Script": thứ
đổi không phải cấu hình, mà là tài khoản Google đang đăng nhập.

⚠ `fetchCsv` có dòng này từ đầu, còn `callSheetApi` / `saveNote` / `sheetPing`
thì KHÔNG (sửa 22/09/2026) — nên cùng một Sheet mà đường CSV chạy còn đường
Apps Script 404, trông vô lý và không ai nghĩ tới chuyện tài khoản.

### Tách "hỏng ở đâu" trong 30 giây
Dán vào thanh địa chỉ **cửa sổ ẩn danh**:
`<URL_WEB_APP>?action=ping&secret=<SECRET>`
- Ẩn danh ra JSON `"ok":true` mà extension vẫn 404 → lỗi phía extension.
- Ẩn danh cũng 404 → không liên quan extension, vào Apps Script kiểm deploy.
- Cửa sổ thường 404 nhưng ẩn danh chạy → đúng ca nhiều tài khoản ở trên.

### Lỗi trong Options phải kèm TUỔI
Lỗi nằm lại trong storage tới lần tải THÀNH CÔNG kế tiếp, nên lỗi từ ba hôm
trước trông hệt như vừa mới hỏng — và người đọc đi sửa một thứ đang chạy tốt.
Panel đã hiện tuổi từ v0.3.8; trang Options thì tới 22/09/2026 mới có.

## Đừng để thông báo lỗi KHẲNG ĐỊNH một nguyên nhân mình chỉ đang đoán

`httpHint(404)` bản trước viết: *"không có bản deploy nào ở URL này. Vào Apps
Script → Deploy → Manage deployments, copy lại URL Web app."* Nghe rất dứt
khoát. Và **sai**, ở cả hai người dùng đầu tiên: link đúng, không ai đụng vào
Apps Script, vẫn 404. Họ đi copy lại một cái URL vốn đã đúng, nhiều lần, rồi
kết luận extension hỏng.

Một câu khẳng định sai còn tệ hơn một câu "chưa rõ": nó **chỉ định sai chỗ để
sửa**, và người ta tin.

Giờ 404 **liệt kê** các khả năng theo thứ tự hay gặp, và nói thẳng "URL sai là
cái ÍT gặp nhất":
1. Trình duyệt đăng nhập nhiều tài khoản Google → Google phục vụ bằng nhầm
   tài khoản (xem mục `credentials: "omit"` ở trên).
2. Deploy để `"Anyone with Google account"` thay vì `"Anyone"`.
3. Dán nhầm link `/dev` thay vì `/exec`.

### Bằng chứng thay cho suy đoán
`sheetPing` trả thêm `chiTiet`: `status`, `urlCuoi` (URL **sau** chuyển hướng),
`chuyenHuong`, **`taiKhoanThu`** (bắt từ `/u/<N>/` trong URL cuối), `giay`, và
`dauBody` khi response không phải JSON.

`taiKhoanThu` là thứ phân biệt DỨT KHOÁT "URL sai" với "sai tài khoản" — mã
404 trần không bao giờ nói được điều đó. Khi nó có giá trị, thông báo lỗi nói
thẳng "Google chuyển hướng sang tài khoản thứ N của trình duyệt".

⚠ `.test` và `.status` trong `options.css` phải có `white-space: pre-wrap`:
thông báo 404 nhiều dòng, không có nó thì dồn thành một dòng dài và không ai
đọc tới dòng cuối — mà dòng cuối mới là cách chữa.

## Thẻ hover in thẳng GHI CHÚ, không chỉ đếm số (23/09/2026)

Bản trước ghi `"1 ghi chú"` rồi bắt người dùng đi mở chỗ khác để đọc — trong
khi nội dung đã nằm sẵn trong `person.notes`. Mà đó đúng là câu hỏi lúc hover:
*"thằng này mình từng nghĩ gì về nó?"*. Đếm một thứ rồi giấu nó đi là bắt
người ta làm thêm một bước không cần thiết.

`cardHtml` lấy `person.notes[0]` (mảng đã sắp mới→cũ trong `buildDb`) và in
nội dung + ngày + token + người ghi.

⚠ Dòng đếm chỉ còn hiện khi có **nhiều hơn một** ghi chú. In nội dung ra rồi
thì "1 ghi chú" không thêm được thông tin nào — trừ khi ô `note` rỗng, lúc đó
con số vẫn là thứ duy nhất nói lên có ghi chú.

`.kt-card-note` có vạch trái xanh + `-webkit-line-clamp: 4`: nó phải tách khỏi
mấy dòng số liệu của GMGN bằng mắt, và ghi chú dài không được kéo thẻ cao
tràn màn hình.

### Soi thẻ bằng mắt mà không cần GMGN
`dev/preview.html` + Playwright dựng lại được đúng thẻ đó. Trong môi trường
này Chromium có sẵn: `chromium.launch({ executablePath: "/opt/pw-browsers/chromium" })`,
đừng gọi `npx playwright install`.
⚠ Muốn chụp riêng thẻ thì giấu `#kol-tracker-panel` trước — panel nằm đè lên,
và `elementHandle.screenshot` chụp đúng cái đang được VẼ ở chỗ đó. Giấu bằng
`[id^="kol-tracker"]` là giấu nhầm cả `#kol-tracker-overlay` chứa thẻ.

## KOL Tracker trên X (twitter.com / x.com) — v0.13.0

Trên GMGN mình đi tìm người giữa một chart vẽ bằng canvas. Trên X thì ngược
lại: **tay cầm nằm ngay trong URL**. Nên phần khó không phải "người này là ai"
mà là "gắn cái nút vào đâu cho nó không rụng khi X đổi giao diện".

Hai thứ mọc thêm: nút **Ghi chú** cạnh nút Theo dõi, và một **dải** ngay dưới
dòng "Được theo dõi bởi" — hạng + ghi chú gần nhất. Chưa có hồ sơ thì nút ghi
`+ Ghi chú` và **không** mọc dải rỗng.

### Thang neo, không phải một selector
Class của X sinh tự động, đọc không ra nghĩa. Mỗi chỗ gắn là một **thang**
`data-testid`, thử lần lượt, và **ghi lại bắt được bằng nấc nào**
(`neoNut`/`neoDai` trong Chẩn đoán) — hỏng thì biết ngay nấc nào vừa mất, thay
vì chỉ thấy "nút không hiện".
- Nút: `placementTracking` → `userActions` → `UserName`.
- Dải: `a[href$="/followers_you_follow"]` → `UserProfileHeader_Items` →
  `UserDescription` → `UserName`. Neo đầu là thẻ `<a>` nằm lọt trong một dòng
  chữ nên phải trèo lên khối cha một nấc mới chèn được.

⚠ Nút chèn **TRƯỚC** nút Theo dõi: chèn sau thì nó bị đẩy xuống dòng khi cửa
sổ hẹp, vì nút Theo dõi vốn nằm sát mép phải.

### X là SPA
Bấm sang hồ sơ khác KHÔNG tải lại trang. Nghe cả `pushState`/`replaceState`/
`popstate` lẫn `MutationObserver`. ⚠ Observer phải tự chặn vòng lặp: chính
mình chèn node nên callback gọi lại mình — chỉ vẽ lại khi nút **thật sự**
không còn trên trang, và hãm 250ms.

### Ghi chú từ X không gắn với cú call nào
Không token, không ví → `note-box` **ẩn** phần "call ở đoạn nào của sóng": câu
hỏi không có câu trả lời thì hỏi chỉ tổ làm người ta phân vân. Khoá vẫn đi qua
`keyOf`, nên người đã note từ GMGN thì ghi chú từ X rơi vào **đúng dòng cũ**.

### `dev/x-preview.html` — soi bằng mắt, không cần X
Dựng lại trang hồ sơ X với đúng các `data-testid`.
⚠ Trang này gọi `history.replaceState` để giả `/cryptoape`, nên mọi thẻ
`<script>` phải dùng đường dẫn **TUYỆT ĐỐI** — sau lệnh đó đường dẫn tương đối
đổi gốc, `stub.js` 404, và triệu chứng duy nhất là
`chrome.storage.sync undefined`.
⚠ `stub.js` gọi `KT.withDefaults` ngay lúc chạy nên phải nạp **sau** thư viện.

## Trong DÒNG THỜI GIAN của X — v0.14.0

Mỗi bài viết mọc thêm một **pill** cạnh tên: người đã có hồ sơ thì hiện hạng +
số ghi chú (màu theo hạng), người lạ thì hiện `+`. Bấm pill = mở hộp ghi chú.
Rê chuột vào **avatar** (hoặc pill) = thẻ nổi với hạng, tóm tắt, ghi chú gần
nhất.

### ⚠⚠ X TÁI DÙNG LẠI node khi cuộn
Cùng một thẻ `<article>` lúc trước là bài của A, cuộn một đoạn thành bài của B
— node thì vẫn nguyên đó. Nên **"đã gắn rồi thì bỏ qua" là SAI**: nó để lại
hạng của A trên bài của B, và đó là kiểu sai tệ nhất ở đây, vì người đọc thấy
hạng S trên bài của thằng hạng D mà **không có dấu hiệu gì**.

Cách chữa: nhớ tay cầm đã gắn ngay trên node (`data-kt-pill`), mỗi lượt quét
**đọc lại tay cầm thật** rồi so, khác thì vẽ lại. Listener trên avatar cũng
phải đọc lại tay cầm lúc CHẠY, không bắt theo biến đóng gói lúc gắn.
Có kiểm bằng Playwright: đổi `href` của một bài rồi xác nhận pill đổi theo.

⚠ Pill dùng **CLASS**, không dùng `id`: mỗi bài một cái, mà `id` phải duy nhất
trong cả trang — dùng `id` thì `document.getElementById` chỉ thấy cái đầu
tiên, sai âm thầm.

⚠ Quét có **trần 60 bài**: một cú cuộn dài để lại hàng trăm `<article>` trong
DOM, mà mình chỉ cần mấy bài đang nhìn thấy.

⚠ MutationObserver trong feed **không** kiểm "nút còn không" để quyết định vẽ
lại nữa — feed đổi liên tục nên lúc nào cũng hẹn quét, `veTrongFeed` tự bỏ qua
bài đã gắn đúng người nên không tốn gì.

## Ngân sách giao diện — đọc TRƯỚC khi thêm bất cứ thứ gì hiện lên màn hình (25/09/2026)

Máy tính được càng nhiều thì càng muốn bày hết ra, và extension thành một rừng
số. Sáu luật, chủ máy đã duyệt:

1. **Hiện kết luận, không hiện con số.** Số liệu chỉ nằm ở tầng "bấm vào".
   Kết luận của máy (đợt sau) dùng một bộ từ CỐ ĐỊNH ~5 nhãn, không đẻ thêm.
   Chưa đủ bằng chứng thì KHÔNG hiện gì — không có nhãn xám "chưa rõ".
2. **Ba tầng, ngân sách cố định.** Nhìn lướt (hàng panel, pill X): tối đa MỘT
   tín hiệu. Rê chuột (thẻ hover): tối đa 3 dòng. Bấm vào (màn chi tiết, trang
   hồ sơ X): chỗ duy nhất được bày số. Thêm một thứ = bỏ một thứ, không mở chỗ mới.
3. **Người thắng máy.** Hạng tay của chủ máy là thứ hiện; máy chỉ lên tiếng khi
   KHÔNG đồng ý với hạng đó.
4. **Rác thì gập lại**, không bày ra (dòng "Đã ẩn N người" — đợt sau).
5. **Phần chạy ngầm không có giao diện.** Số liệu kỹ thuật vào Chẩn đoán.
6. **Cảnh báo phải hiếm.**

Mọi thứ hiện ra đều có công tắc ở trang Cài đặt (mục 5 cho phần sổ).

## Sổ tự ghi cú call — v0.15.0 (25/09/2026)

Trước bản này extension chỉ nhớ người được bấm N; feed thesis (200 cú call,
nhiều token) sống trong RAM rồi mất khi F5. Giờ MỌI cú call nhìn thấy được ghi
vào IndexedDB — logic ở `src/lib/ledger.js` (có test), lưu trữ ở
`background/ledger-store.js`. Nguồn: feed thesis, bảng X Tracker, tweet có CA
trên X. KHÔNG ghi vào Sheet.

- **Sổ phải nằm ở service worker.** IndexedDB mở trong content script thuộc về
  origin của TRANG (gmgn.ai / x.com) — sổ bị chia đôi theo trang.
- ⚠⚠ **`ledger-store.js` lấy `KT` qua `globalThis`, không dùng tên trần.** Nó
  được `importScripts` giữa lúc service-worker.js chạy, mà `const KT` ở đó khai
  SAU lệnh import → tên trần rơi vào TDZ → ReferenceError → CẢ service worker
  chết (kể cả tải Sheet), không lỗi nào hiện ra. Chỉ bắt được khi nạp extension
  thật vào Chromium — test thuần không thấy.
- **Khoá người trong sổ là `personKeyOf`** — chỉ nhận tay cầm X hợp lệ, giữ `_`.

## Dấu `_` là một phần của tên — v0.15.1 (25/09/2026)

`KT.handleKey` từng xoá mọi thứ không phải chữ/số, kể cả `_` ("gộp hơi rộng là
cố ý"). Trên X, `foo_bar` và `foobar` là HAI tài khoản — ai cũng đăng ký được
cái kia. Gộp làm một = ghi chú, hạng, cờ đỏ của người này dán lên người kia.
Với công cụ đánh giá uy tín, nhầm người tệ hơn tra không ra.

- `handleKey` giờ GIỮ `_` — dùng cho mọi phép "có phải cùng một người không".
- `looseHandleKey` (bỏ cả `_`) CHỈ cho ô tìm kiếm và để dò hồ sơ gộp nhầm.
  Tuyệt đối không dùng nó để quyết định hai dòng là một người.
- Người không có ví được ghi vào Sheet với khoá `x:<handleKey>`, nên người ghi
  TRƯỚC bản sửa có khoá kiểu `x:cryptoape` cho `@crypto_ape`. Họ vẫn rơi đúng
  dòng cũ vì `findPerson` tra theo cột `username` (lưu tên THẬT), và `keyOf`
  lấy `person.wallet` đã lưu trước khi tự dựng khoá mới. Có test khoá lại.
- Hồ sơ đã bị gộp nhầm từ trước KHÔNG tách tự động được: `mergedNames` báo ra
  (màn chi tiết + dòng trạng thái ở Cài đặt) khi một hồ sơ chứa hai tên CHỈ
  khác nhau ở dấu `_`. Đổi tên hẳn thì không báo — đó là chuyện bình thường.
- **Đơn vị đếm là (người, token)**, không phải bản ghi: cùng kèo thấy ở X lẫn
  GMGN, hay hô năm lần, vẫn là MỘT kèo.
- **"Ghi trước" / "ghi muộn" quyết định theo LÚC MÌNH THẤY, không theo kết
  quả.** Chỉ cú "ghi trước" mới đáng chấm điểm — nhìn lại sau khi kèo pump thì
  ai cũng giỏi. Lần thấy ĐẦU TIÊN quyết định; thấy lại muộn hơn không lật được
  (`mergeCall`). Ngưỡng ở `LEDGER` (2h + <1.5x khi biết hệ số x; 30 phút khi
  không biết). Luật "đã chạy ≥1.5x thì là ghi muộn" loại cú thắng nhanh nhiều
  hơn cú thua — cố ý nghiêng về phía NGHI NGỜ người call.
- **Đọc CA trong tweet** (`extractContracts`): địa chỉ trơ trọi có thể là VÍ —
  chỉ nhận khi có cashtag / chữ CA / đuôi `pump`. Địa chỉ sau `/` là link
  (thường là địa chỉ PAIR) → bỏ. ⚠ Quét EVM trước rồi XOÁ khỏi chuỗi mới quét
  Solana: phần hex sau số 0 của địa chỉ EVM là một chuỗi base58 hợp lệ.
- ⚠⚠ **Quote tweet** (`readTweet` trong x.js): hai khối tên, hai mốc giờ, hai
  khối chữ. Đọc chữ trần là gán CA của bài BỊ trích cho người quote. Vùng bài
  bị trích = leo từ khối tên thứ 2 lên tới tầng cao nhất chưa chứa khối tên
  đầu. Link bài phải mang đúng tay cầm người viết, lệch thì bỏ. Có fixture trong
  `dev/x-preview.html` (quoter_x không được có cú call nào).
- **Mốc token ra đời** (đo "call sau bao lâu") đọc từ `mutil_window_token_info`
  theo `CREATED_KEYS`. ⚠ CHƯA ĐO trên GMGN thật: Chẩn đoán in `mocTokenRaDoi`
  (cột bắt được + tên mọi cột trông như thời gian). ⚠ CỐ Ý không có
  `open_timestamp` — đó là lúc mở pool (pump.fun: lúc tốt nghiệp), dùng nó thì
  spam-bot trông như người research chậm rãi. Call trước mốc tạo token > 2 phút
  = mốc sai, loại khỏi phép đo (`speed.invalid`).
- **"Có ngày ≥K kèo" là CẬN DƯỚI**: sổ chỉ thấy những gì chủ máy lướt qua.
  Đừng đổi thành "K kèo/ngày".
- **Kiểm xoá bài** (oEmbed `publish.twitter.com`, 6h một lượt, 20 tweet, nghỉ
  1.5s, gặp 429 thì dừng lượt). Chỉ 404 là "mất"; mọi mã khác là "không biết".
  "Đã xoá" đòi CẢ BA: mất ở 2 lần kiểm cách ≥20h, VÀ cùng lúc đó còn tweet khác
  của chính người đó vẫn sống. Mọi bài cùng mất = tài khoản khoá/xoá
  (`unreachable`), chuyện khác hẳn "xoá chọn lọc cú thua". Người đổi tên có
  personKey mới nên bài cũ của họ không bao giờ làm "anh em còn sống" cho bài
  mới. ⚠ CHƯA đo oEmbed trên máy thật (sandbox chặn mạng): Cài đặt + Chẩn đoán
  in phân bố mã trả về của lượt gần nhất — toàn 429/0 thì tính năng đang mù.
- **Dọn**: dữ liệu thô quá 90 ngày bị xoá bằng cursor (đừng `getAll` cả sổ),
  trừ người có dòng trong Sheet. Bản tóm tắt cố định cỡ + "tấm bia" cho bot là
  việc của đợt gắn nhãn — hình dạng của nó phụ thuộc nhãn cần gì.
- `dev/stub.js` phải có `runtime.id` — thiếu là `alive()` tưởng extension bị gỡ
  và mọi lời gửi sang SW im lặng. Stub giữ mọi cú call gửi sang ở `__LEDGER__`.
