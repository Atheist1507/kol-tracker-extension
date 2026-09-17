# Apps Script — cầu nối để extension ĐỌC và GHI vào Sheet

Link CSV "publish to web" chỉ đọc được. Muốn gõ ghi chú xong bấm lưu là vào thẳng Sheet thì
phải có đường ghi. Cách nhẹ nhất: một Apps Script sống **trong chính file Sheet đó** — không
cần Google Cloud, không cần OAuth, không thêm dịch vụ nào bên ngoài.

Làm một lần, khoảng 10 phút.

---

## 1. Mở trình soạn thảo

Trong Google Sheet của mày: **Tiện ích mở rộng → Apps Script**.

Tab mới mở ra, có sẵn file `Code.gs` với một hàm rỗng. **Xoá sạch nội dung đó.**

## 2. Dán code

Copy toàn bộ file `apps-script/Code.gs` trong repo này, dán vào. Bấm 💾 (hoặc `⌘S`).

## 3. Đổi SECRET

Dòng gần đầu file:

```js
const SECRET = "doi-chuoi-nay-di";
```

Đổi thành chuỗi của riêng mày — gõ bừa 20 ký tự cũng được, miễn là khó đoán. **Nhớ lại chuỗi đó**,
lát nữa phải dán vào Options của extension. Bấm 💾.

> Vì sao cần: Web app deploy ở chế độ "Anyone" nên URL ai có cũng gọi được. Chuỗi này là thứ duy
> nhất chặn người vô tình mò trúng URL ghi bậy vào Sheet. Không phải bảo mật thật — nhưng Sheet có
> Version history, sai thì khôi phục.

## 4. Chạy `setup()` để dựng 2 tab

Trên thanh công cụ, ô chọn hàm đang ghi `doGet` → **đổi thành `setup`** → bấm **▶ Run**.

Lần đầu Google sẽ hỏi quyền:

1. **Review permissions** → chọn tài khoản của mày
2. Hiện màn "Google hasn't verified this app" → **Advanced** → **Go to (tên project) (unsafe)**
3. **Allow**

> Màn cảnh báo đó là bình thường với script tự viết chưa qua kiểm duyệt của Google. "App" ở đây
> chính là đoạn code mày vừa dán, chạy trên tài khoản của mày, chỉ đụng vào file Sheet này.

Chạy xong hiện hộp thoại báo đã tạo xong. Quay lại Sheet kiểm: phải có 2 tab **`Overview`** và
**`Detail`**, dòng 1 in đậm, đã đóng băng.

Tab `KOLs` / `Calls` cũ (nếu có) cứ để đó hoặc xoá, không ảnh hưởng gì.

## 5. Deploy

**Deploy → New deployment** → bấm ⚙️ cạnh "Select type" → **Web app**.

Điền:

| Ô | Chọn |
|---|---|
| Description | gì cũng được, ví dụ `kol tracker` |
| Execute as | **Me (email của mày)** |
| Who has access | **Anyone** |

→ **Deploy**.

> ⚠ **"Who has access" phải là `Anyone`**, không phải `Anyone with Google account`. Cái thứ hai bắt
> đăng nhập, mà extension thì không đăng nhập được → mọi lời gọi trả về trang HTML đăng nhập thay
> vì JSON. Đây là chỗ sai hay gặp nhất.
>
> "Anyone" **không** có nghĩa là ai cũng đọc được Sheet của mày. Họ phải có đúng URL này, và phải
> có đúng `SECRET`. Script chỉ trả về những gì nó được lập trình để trả về, không mở file Sheet ra.

Copy **Web app URL** — dạng `https://script.google.com/macros/s/AKfy…/exec`.
Phải kết thúc bằng **`/exec`**. Nếu là `/dev` thì mày đang copy nhầm link test.

## 6. Kiểm tra ngay, chưa cần extension

Dán cái này vào thanh địa chỉ trình duyệt, thay hai chỗ trong ngoặc:

```
<URL_WEB_APP>?action=ping&secret=<SECRET>
```

Đúng thì trang hiện đúng một dòng JSON:

```json
{"ok":true,"sheet":"Tên Sheet","hasOverview":true,"hasDetail":true,"overviewRows":0,"detailRows":0}
```

Thấy dòng đó là **xong sạch phần Apps Script**. Các bước dưới để dành tới lúc cài extension.

| Thấy gì | Sai ở đâu |
|---|---|
| `{"ok":false,"error":"sai secret"}` | Chuỗi trong URL khác chuỗi trong `Code.gs` — hoặc sửa `Code.gs` rồi mà quên deploy lại (bước 5) |
| `hasOverview: false` | Chưa chạy `setup()` (bước 4) |
| Hiện ra trang web/đăng nhập thay vì JSON | "Who has access" chưa để `Anyone` (bước 5) |

## 7. Nối vào extension — SAU KHI đã cài extension

> Bước này cần extension đã được **Load unpacked** vào Chrome (xem README chính của repo).
> Chưa cài thì chưa có trang Options nào để mở — cứ dừng ở bước 6, quay lại đây sau.

Mở trang Options: `chrome://extensions` → thẻ **KOL Tracker** → **Chi tiết** → **Tuỳ chọn extension**.
(Hoặc chuột phải vào icon extension trên thanh công cụ → **Tuỳ chọn**.)

Mục **1. Kết nối Sheet**:

- **URL Web App**: dán link `/exec`
- **SECRET**: dán đúng chuỗi ở bước 3
- Bấm **Thử kết nối**

Đúng thì hiện: `✓ Đã nối "<tên Sheet>" · Overview 0 dòng · Detail 0 dòng`

---

## Sửa code sau này

Sửa `Code.gs` xong **phải deploy lại**, không thì bản đang chạy vẫn là bản cũ:

**Deploy → Manage deployments** → bấm ✏️ trên bản đang có → **Version: New version** → **Deploy**.

Làm kiểu này thì **URL không đổi**, khỏi phải sửa lại Options. Bấm "New deployment" mới là ra URL
khác — đó là lúc phải cập nhật Options.

## Khi hỏng

| Hiện tượng | Nguyên nhân thường gặp |
|---|---|
| `Script trả về HTML chứ không phải JSON` | "Who has access" chưa để `Anyone`, hoặc dán nhầm link trình soạn thảo thay vì link `/exec` |
| `sai secret` | Chuỗi trong Options khác chuỗi trong `Code.gs` — hoặc sửa `Code.gs` rồi mà **quên deploy lại** |
| `chưa chạy setup()` | Bỏ qua bước 4 |
| Ghi chú lưu xong không thấy trong Sheet | Đang xem nhầm file Sheet — script ghi vào đúng file chứa nó |

## Cái này có gì trong Sheet của mày

- **`Overview`** — một dòng một người, khoá là `wallet`. Cột `tier` / `summary` / `red_flags` là
  chữ mày viết, script **không bao giờ ghi đè** trừ khi lần lưu đó gửi giá trị mới cho đúng cột đó.
- **`Detail`** — một dòng một lần ghi chú, kèm ảnh chụp tình trạng lúc đó (post gì, x mấy, còn giữ
  hay đã xả).
- `note_count` bên Overview là **công thức** `COUNTIF` tự đếm, đừng gõ đè lên.
