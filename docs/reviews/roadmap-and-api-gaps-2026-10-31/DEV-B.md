# Danh sách đề xuất giao Dev B

Baseline, findings, bằng chứng và ranh giới audit: [báo cáo](README.md). Cập nhật theo phân công Owner 31/10/2026:
**Owner giữ toàn bộ G7 và Tools; bên AI giữ phần AI của G10**. B giữ Request/budget, actual cost/reporting và G9;
gia hạn subscription của G8 chuyển sang A-06. Không nhận lại toàn bộ G5/G6 đã có.

Phần Mobile của B là bổ sung Request/budget APIs được xác nhận còn thiếu và bàn giao cho A kiểm tích hợp;
không gồm viết app native, usage/collector hoặc AI. Các package phải phân rã theo outcome trước code.

## Làm trước cho FE và giữ đúng dữ liệu ngân sách

### B-00 — Reconcile scope/tiến độ cho đợt giao việc

- Việc ngắn: pin baseline, reclassify các khung “blocked vì G5/G6 chưa có”, đăng ký exact AC của các lát sắp nhận.
- Dẫn evidence cuối 31/10 thay vì trạng thái `not-started`/`implemented-local` cũ. A tự cung cấp disposition phần A.
- Bàn giao ma trận phần đã có / thiếu / chờ contract G7 của Owner / chờ quyết định; không đánh accepted hộ Owner. Không mở chiến dịch
  audit/refactor toàn bộ để trì hoãn các P0 dưới đây.

### B-01 — Khóa đổi tháng bắt đầu năm tài chính (P0, RA-04)

- `US-01-04 AC-8`, `g2-downstream-integration`: sau khi có bất kỳ phiên bản ngân sách, đổi tháng phải bị từ chối.
- Thiết kế guard liên module và serialization với tạo phiên bản đầu tiên; không thêm truy vấn bảng budgets vào
  operating-parameters repo hay import ngược tier. Cân nhắc extension point/ownership đúng ADR-0019.
- Bàn giao test tái hiện với phiên bản đã có (gồm chưa approved), không tạo audit/thay đổi giá trị khi từ chối,
  no-op cùng giá trị và race tạo phiên bản ↔ đổi tham số. PostgreSQL cô lập cho invariant/concurrency.

### B-02 — Hàng đợi duyệt nhu cầu (P0, API-GAP-03a)

- `US-05-04` phần mở hàng đợi → detail/action; dùng lại need decision hiện hữu.
- Lấy theo người giữ bước hiện hành: Manager hoặc Người duyệt chi/approver dự phòng tùy routing; không chỉ lọc phòng.
- Bàn giao pagination/order/filter có nghĩa; test người mới tiếp nhận, tự gửi/self approval, chờ có kiểm soát,
  request nhóm theo dòng, rút/từ chối đã kết thúc và không đọc được việc người khác. Đổi vai sau list phải kiểm lại ở action.
- Không tạo lại spend-submission/spend-approval/Finance queues đã có.

### B-03 — Yêu cầu của tôi (P0, API-GAP-01)

- `US-12-15 AC-2`, `US-16-01 AC-2`, trạng thái theo `US-05-15`; một contract cho web/mobile.
- Định nghĩa rõ creator/beneficiary/delegated/group visibility từ nguồn và quyền detail hiện hành; draft tách rõ với
  Request đã gửi, không suy người tạo luôn là người thụ hưởng.
- Bàn giao Request đang chờ/đã cấp/từ chối với lý do theo quyền, pagination/filter/order; test IDOR, hai Employee,
  nhóm/tạo thay/tài khoản dịch vụ và dữ liệu tài chính không dành cho Employee. Không chờ dashboard tổng hợp G8.

### B-04 — Khám phá công việc IT assessment (P1, API-GAP-03b)

- Trước code: chốt read list riêng hay queue IT chung, phạm vi “đang chờ ai”, khả năng làm thay và các trạng thái
  thiếu giá/BM-02 chưa hoàn tất; bổ sung scope/spec vì spec hiện không chứa list.
- `US-05-06` giữ làm nguồn nghiệp vụ; không tự ghi một AC mới như đã được duyệt.
- Sau khi chốt: bàn giao list → detail → save/complete/reject hiện có, phân quyền IT hiện hành, pagination và stale
  state. Có thể làm ngay sau B-03 nếu được chốt đủ đầu vào; nếu chưa thì làm B-05/B-07 độc lập.

## Đóng downstream còn lại và tiếp quản G8

### B-05 — Đóng các vế Request/transfer đã đủ dependency

- Re-audit `g4-request-and-transfer-integration` và phần `g2-downstream-integration` không thuộc B-01/G7.
- Đối chiếu `US-07-01 AC-3,16`, `US-07-04 AC-4,15`, `US-01-12 AC-4,8,9`, `US-03-05 AC-5`; source đã có grant/
  outcome/renewal-hold listeners. Chỉ code nếu exact AC còn thiếu, còn lại cập nhật evidence/coverage.
- Bàn giao đường Request → provisioning → kết quả và cancel/failure/renewal hold không ghi trùng commitment, không
  cấp lại quyền đã kết thúc; không tự phục hồi semantics auto-purchase/standard-toolset đã bỏ.

**B-06 của bản cũ đã chuyển cho A-06** (gia hạn/giảm/hủy subscription, EP-11). Giữ số B-07→B-10 để không nhầm
tham chiếu audit; B không làm một bản implementation renewal thứ hai.

### B-07 — Invoice/thuế thực tế và posting chi phí (G8)

- Các item riêng: invoice + thuế/chứng từ/quyền đọc; match/correction; commitment → actual và giải phóng phần dư;
  cách xử lý đã chi/refund khi Request rút/cấp thất bại; financial period close theo nguồn.
- Đóng vế của `g3-downstream-finance-integration`, `US-12-09 AC-9`, `US-06-06`, `US-06-09 AC-12`,
  `US-05-08 AC-10`, `US-05-09 AC-7`, `US-05-18 AC-7` theo scope map hiện hành.
- Chốt pricing kỳ hủy được/F35 trước projection phụ thuộc. Không viết lại budget versions, tax profile/rates;
  không khôi phục chia chi phí tỷ lệ hay Cost Center Company đã bị loại.
- Bàn giao invoice đúng quyền/SoD → match → actual/commitment nhất quán; test thuế/tỷ giá snapshot, chỉnh/hủy,
  rounding, duplicate, race và rollback/audit trên DB thật cô lập.

### B-08 — Báo cáo/chi phí và dashboard read models (G8)

- Tách báo cáo actual/commitment/budget không cần usage; cost theo ngày/phòng và lifecycle; immutable period report;
  savings/KPI cần bằng chứng usage; dashboard Finance/Người duyệt chi (`US-12-15 AC-5,6`). Không gom EP-12 vào một spec.
- Đóng vế cost của G6: `US-03-01 AC-12`, `US-03-05 AC-3`, `US-03-07 AC-10`, `US-07-09 AC-24`;
  giữ Unit theo phòng và phần Chưa phân bổ đúng baseline. US-12-15 chỉ claim các AC/vế thực hiện.
- B sở hữu phép tính/tổng hợp tài chính và contract trả dữ liệu tiền cho dashboard Manager của A-10. A giữ các
  projection vận hành của Employee/Manager/IT/Super Admin; chốt từng vế AC để tránh trùng owner.
- Dữ liệu usage/recommendation lấy contract G7 của Owner; A cung cấp assignment/provisioning và renewal outcome.
  Khi G7 chưa đủ thì KPI thiếu dữ liệu có lý do, không suy 0 usage hay savings thực hiện từ quyết định chưa thi hành.
- Bàn giao test đối chiếu tổng, boundary ngày, backdated ownership/transfer, dữ liệu ẩn theo vai và snapshot bất biến.

## Package sau G8

### B-09 — CSV spend reconciliation và hợp thức hóa (G9)

- EP-13; tách preview/confirm import → phát hiện/điều tra → quyết hợp thức hóa → match từng khoản chi.
- Phụ thuộc B-07 ledger. Chốt/giới hạn `OOS-24` trước `US-13-06`; không tự cho phép hợp thức hóa ngoài phạm vi.
- Bàn giao ca CSV lỗi/trùng, rerun, quyền Finance/IT/approver đúng bước và đối soát không nhân đôi chi phí.
  File/credentials thật chỉ dùng ở môi trường và quyền được giao.

### B-10 — Bổ sung Request/budget APIs cho Mobile (G10, không gồm AI)

- B-02/B-03 cùng spend-approval/detail/action hiện có là đầu vào cho A-07/A-08. A kiểm tích hợp bốn Story Mobile;
  B sở hữu sửa query/action/DTO trong `requests`/`budgets` nếu exact AC còn thiếu.
- Kiểm `US-16-02` dòng kế hoạch/ngày dự kiến chi; `US-16-03` snapshot chỉ đọc, queue có bước nhu cầu và bước chi,
  hai quyết định riêng, trạng thái chờ Finance, SoD/override và audit. Chốt composition hai list hay query chung với A.
- Không tự xây lại những API đã đủ contract. Bàn giao operation/error mapping, permission và DB test cho phần sửa;
  A chạy E2E Mobile-BE sau khi tích hợp. Không thêm bulk action hoặc quyết định chỉ-web vào phạm vi Mobile.
- `US-15-05`, `US-15-06` và phần tích hợp AI không nằm trong list hai dev theo phân công hiện tại; chỉ cung cấp
  API nghiệp vụ hiện hữu nếu bên AI cần, không nhận thêm AI endpoint/workflow mà chưa có task mới từ Owner.

## Bàn giao và phối hợp

- B làm owner tích hợp scope map/roadmap của đợt này; A cung cấp evidence/AC của A. Chỉ một người sửa generated
  OpenAPI/manifest và app wiring ở mỗi lần tích hợp; rebase rồi sinh lại artifact sau merge.
- A-06 sở hữu subscription decision/outcome; B-07/B-08 sở hữu actual cost/reporting. Chốt event/contract giữa hai bên
  trước implement phần phụ thuộc; không dùng quyết định chưa thi hành thay kết quả thực tế.
- B-07↔A: dùng public contract về lịch sử quyền/ownership; không query bảng module A hoặc đổi contract một phía.
- G7/Tools và các vế usage/privacy/ghost/onboarding liên quan do Owner giữ; B không gán lại chúng cho A hoặc tự làm.
- A-07→A-09 giữ integration/test BE cho Mobile, B-10 giữ bổ sung phần Request/budget; phía Mobile giữ app native.
- Mỗi outcome chạy thiết kế → audit → code/test → validate → handoff theo bộ prompt hiện có; không claim cả G
  accepted. Tiêu chí test và lệnh ở [báo cáo](README.md#điều-kiện-bàn-giao-mỗi-lát).
