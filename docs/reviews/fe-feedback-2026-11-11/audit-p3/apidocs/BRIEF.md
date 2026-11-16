# Brief chung — viết lại tài liệu API FE theo BE prompt 3 (chat điều phối "SEP-Start 122", 16/11/2026)

Tiếng Việt cho nội dung tài liệu; giữ nguyên tiếng Anh cho operationId, field, enum, mã lỗi, đường dẫn, code.

## Mục tiêu (Owner yêu cầu)
FE (web + mobile) đọc tài liệu là nối được API **không phải đoán**: mỗi API làm gì, khi nào gọi, vai nào gọi, từng field
request/response để làm gì, bắt buộc hay tùy chọn, ràng buộc, enum nghĩa là gì, lỗi nào xảy ra khi nào và FE phản ứng sao;
mỗi luồng (5 MF + flow phụ) đi từng bước gọi API nào, trạng thái đổi ra sao; dẫn chiếu BRD/MF để giải thích nghiệp vụ.
**Đúng hơn nhanh**: mọi câu phải đúng với code BE thật — đọc controller/DTO/policy/service/test, không suy từ tên.

## Nguồn sự thật (thứ tự)
1. **Code BE** (đúng revision được mô tả): bản checkout sạch `D:\FPT\FALL2026\Code\be-verify` (detached `1f7ffa19`,
   **chỉ đọc**, không sửa, không chạy lệnh ghi git ở đó). `openapi.json` ở gốc repo đó. Module ở `src/modules/<module>/`.
2. Quyết định `QĐ-*` (`D:\FPT\FALL2026\Docs\Decisions\project-decisions.md`) → BRD
   (`D:\FPT\FALL2026\Docs\Requiments\BRD - HỆ THỐNG QUẢN TRỊ BẢN QUYỀN PHẦN MỀM & TỐI ƯU CHI PHÍ CÔNG NGHỆ.md`, §4 vai, §5.10
   5 MF + luồng hỗ trợ, §5.10.1 luật `BR-MFn-xx`) → `Quy trình và chính sách theo main flow.md` → sơ đồ
   `D:\FPT\FALL2026\Docs\Diagrams\main-workflows-activity-diagram\`, `supporting-business-flows\`.
3. Quyết định tự chốt khi code (D-n) và thay đổi phá hợp đồng: BE
   `docs/reviews/fe-feedback-2026-11-11/OVERNIGHT-DECISIONS.md`, `OVERNIGHT-DECISIONS-LANE-B.md`, SPEC.md (đọc trong `be-verify`).
   Code và BRD lệch nhau ⟹ tài liệu mô tả **code đang chạy**, thêm một dòng "Lưu ý: lệch BRD …" và ghi vào báo cáo của bạn.

## Bộ tài liệu và generator
Thư mục `D:\FPT\FALL2026\Docs\Figma UI-UX\API-Integration\` — đọc `README.md`, `conventions.md`, `changes/maintenance.md`
trước. Phần `reference/*.md`, `api-index.md`, `enums.md`, `coverage-manifest.json` là **sinh tự động — không sửa tay**. Nội
dung viết tay của reference nằm ở:
- `tools/annotations/<group>.md`: đoạn mở đầu nhóm (nghiệp vụ, trạng thái, chuyển trạng thái) + mỗi operation một mục
  `## <operationId>` (mục đích, khi gọi, vai, luật, lỗi và cách FE phản ứng, ví dụ `json request`). Xem mẫu ở file sẵn có.
- `tools/glossary/fields.json`, `tools/glossary/enums.json`: nghĩa field/enum (khóa `<tên>`, `<tag>:<tên>`,
  `<group>:<đường dẫn>`). **KHÔNG sửa trực tiếp hai file này** (nhiều agent chạy song song). Thay vào đó ghi bổ sung/sửa vào
  `tools/glossary/pending/<group-của-bạn>.fields.json` và `.enums.json` (cùng định dạng: object khóa → chuỗi nghĩa); chat
  điều phối gộp sau. Sửa nghĩa sai của khóa có sẵn cũng ghi ở pending với cùng khóa.
- `flows/*.md`, `roles/*.md`: viết tay.
- Nhóm và file mới: `tools/config/groups.json` (chat điều phối đã thêm `purchases-reconciliation`, `budget-in-year`,
  `policies-templates`; tag `profile` → `auth-session`, `stock-summary` → `licensing-seats`, `usage-overview` →
  `usage-ghost-seats`). Không sửa `groups.json`; cần đổi nhóm thì ghi vào báo cáo.

Lệnh (chạy từ thư mục `API-Integration`):
- Kiểm: `node tools/build-api-docs.mjs --be D:/FPT/FALL2026/Code/be-verify --check` — liệt kê operation thiếu chú thích,
  dòng field chưa có nghĩa, enum chưa có nghĩa, link hỏng, ví dụ sai schema. Bản chụp lúc giao:
  `D:\FPT\FALL2026\Code\verify-logs\apidocs\check-1f7ffa19.txt` (716 vấn đề). So contract cũ → mới (56 thêm, 12 bỏ, nhiều đổi):
  `D:\FPT\FALL2026\Code\verify-logs\apidocs\compare-67a1abeb-1f7ffa19.md`.
- Khi kiểm, pending chưa được gộp nên dòng field bạn đã viết ở pending vẫn báo thiếu — bình thường. Lọc output theo
  operation/nhóm của bạn. **Không chạy chế độ sinh (không `--check`)** — chỉ chat điều phối sinh lại một lần cuối.

## Tiêu chuẩn nội dung
- Mỗi operation: mục đích + khi FE gọi (màn nào), vai được gọi và phạm vi dữ liệu (ví dụ trưởng phòng chỉ phòng mình), luật
  nghiệp vụ handler kiểm (ngoài schema), **mọi mã lỗi thật** (đọc `*.http-errors.ts`, `*.errors.ts`, guard, policy) kèm
  điều kiện xảy ra và FE nên làm gì, side effect (thông báo gửi ai — dùng mã thông báo, khoản cam kết, audit), ví dụ request
  hợp lệ cho route ghi. Dẫn link BRD/MF khi giải thích luật (`FR-x`, `BR-MFn-xx`, `QĐ-x`).
- Field: nghĩa nghiệp vụ, đơn vị (tiền `{amount,currency}` chuỗi VND, ngày `YYYY-MM-DD`, giờ ISO), khi nào `null`, quan hệ
  với field khác. Required/optional/nullable do generator lấy từ schema — chỉ giải thích khi có luật điều kiện
  (vd. "bắt buộc khi `outcome = RETURN`").
- Xóa/sửa mọi câu cũ không còn đúng (Trần phòng, quý, dòng `BM-10`, tỷ giá, publish ngân sách, route đã bỏ, service account…).
- Không đưa mật khẩu, email thật, dữ liệu cá nhân thật.

## Báo cáo khi xong (trả về cho chat điều phối, ngắn)
1. File đã sửa/tạo. 2. Số vấn đề `--check` còn lại trong nhóm của bạn (sau khi tính pending) và vì sao. 3. **Lệch code ↔
BRD/QĐ** phát hiện được (route · luật · code làm gì · tài liệu nói gì). 4. **Nghi lỗi BE** (hành vi trái QĐ/BRD). 5. Thay
đổi phá hợp đồng FE cần ghi CHANGELOG. 6. Mã lỗi chung chung/thiếu `details` thấy được (đầu vào prompt 5).
