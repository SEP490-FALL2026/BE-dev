# Danh sách đề xuất giao Dev A

Baseline, findings, bằng chứng và ranh giới audit: [báo cáo](README.md). Cập nhật theo phân công của Owner ngày
31/10/2026: **Owner giữ toàn bộ G7 và Tools; bên AI giữ phần AI của G10**. A nhận phần G3/G4/G6 còn thiếu,
gia hạn subscription thuộc G8 và BE phục vụ Mobile. Đây là backlog đề xuất, không phải mọi task đã đủ đầu vào.

Phần Mobile ở đây là API/contract và kiểm thử tích hợp BE cho EP-16; không bao gồm viết ứng dụng native.
Không nhận device registry, collector, usage ingest/engine, recommendation, privacy usage hoặc implementation AI.
Các mã A-06→A-08 trong bản phân việc trước đã được thay scope; dùng nội dung hiện tại, không dùng tên task cũ.

## Làm trước cho FE

### A-01 — Employee chọn phần mềm/gói (P0, API-GAP-02)

- Nguồn: `US-05-01` phần danh mục → chọn gói → preview; nối G3 vào G5.
- Scope: search/list/detail projection chỉ chứa application/plan hợp lệ cho người gửi Request; chốt filter/eligibility
  với preview hiện có. Không mở nguyên response catalog quản trị, không phục hồi bộ công cụ chuẩn.
- Bàn giao: Employee tìm → chọn → gọi preview → gửi được Request qua API hiện hữu; lỗi thiếu cấu hình/không đủ điều
  kiện rõ; test dữ liệu ẩn, gói không hợp lệ, pagination và đủ các loại phần mềm còn trong baseline.
- Sở hữu: catalog read capability/public API; chốt route trong spec. Không sửa workflow Request của B khi chưa phối hợp.
- Phụ thuộc: không cần G7/G8; nếu Review 2 đổi eligibility thì pin quyết định cụ thể trước phần đó.

### A-02 — Đọc Phần mềm của tôi (P1, kéo sớm phần đọc G8/G10)

- Nguồn: `US-12-15 AC-2`, `US-16-01 AC-1`.
- Đối chiếu `/saas-issues/options` và licensing projection hiện hữu; chốt contract tổng quan cho K1–K5, ngày hết hạn,
  trạng thái quyền. Không lấy form báo lỗi làm endpoint dashboard mặc định.
- Bàn giao: Employee chỉ thấy quyền của mình; không chi phí/seat người khác; test K4/K5, kết thúc quyền, nhân viên
  khác và thời điểm hiệu lực. Không tự cho đọc khóa bí mật chỉ vì hiển thị phần mềm K4.
- Không phụ thuộc collector; K4-device binding đầy đủ theo A-05 là phần tách riêng, chờ registry của Owner.

## Đóng phần G0–G6 còn lại thuộc A

### A-03 — Cảnh báo license vào inbox (P1, F58)

- Tiếp quản `g4-notification-delivery`; re-pin AC theo `FR-5.14`/`US-12-15`, bỏ phần bộ chuẩn retired.
- Chia theo sự kiện: quyền sắp hết T−7, lời mời/bàn giao chưa xong, K1 giữ đến cuối kỳ; xác minh phần nào đã có
  projection trước khi code. Auth-failure connector chờ sự kiện/contract G7 của Owner; không nhận implement connector.
- Bàn giao: đúng người nhận, đúng ngày/kênh, lặp job không trùng; test phòng thiếu trưởng phòng, người đã đổi vai và
  gia hạn/hủy thu hồi. Tái dùng inbox, reminder và audit hiện có, không tạo platform notification thứ hai.

### A-04 — Chẩn đoán lỗi chạy lại demo seed CLI (P1, vận hành)

- Đọc handoff/current seed plan; bootstrap và lần nạp đầu đã thành công. Chưa biết nguyên nhân connection retired.
- Thu log đã làm sạch, xác định lỗi command/pool/lifecycle/hạ tầng; tái hiện bằng dataset và DB cô lập trước.
- Bàn giao: nguyên nhân có bằng chứng, bản sửa nếu thuộc code, test rerun/idempotency và hướng dẫn kiểm chứng.
  Không tự reset/nạp lại VPS, sửa role thật hay xóa dump/volume. Target verification chỉ thực hiện khi được giao quyền.

### A-05 — Tích hợp K4/device lifecycle của G3/G4/G6 (chờ contract G7)

- **Owner làm `US-09-01` registry/verification/binding trong G7**. A không tạo sổ thiết bị hoặc endpoint quản trị thiết
  bị thứ hai. A thiết kế trước contract cần dùng và tiếp tục task độc lập trong lúc chờ.
- Sau handoff: phân rã `g4-device-dependent-features` thành cấp/gỡ khóa theo thiết bị, giới hạn thiết bị và phần
  revoke/đối chiếu thiết bị của G6; gọi public API thiết bị do Owner cung cấp.
- AC cần re-pin: `US-04-04 AC-8`, `US-04-11 AC-10`, `US-04-12 AC-5→8`, `US-07-01 AC-10`, `US-07-02 AC-4`,
  `US-07-05 AC-6,7`, cùng các vế registry/import tương ứng.
- Bàn giao: thiết bị hợp lệ → assignment khóa → thu hồi/đổi thiết bị có chứng cứ; test giới hạn, thiết bị chưa xác
  nhận, lặp thao tác, lỗi và quyền. Khi chưa có registry thật chỉ được claim thiết kế/contract test với mock,
  không claim hoàn tất integration K4.

## G8 — Phần gia hạn subscription

### A-06 — Quyết định và thực hiện gia hạn/giảm/hủy subscription

- Tiếp nhận phần trước đây đề xuất giao B-06. Theo EP-11, tách item: mốc báo hủy/chất lượng dữ liệu; đề xuất và
  quyết định; kết quả thực hiện/kỳ nối chuỗi; sự cố auto-renewal. Chốt thay đổi Review 2 liên quan trước phần bị tác động.
- Dùng catalog/licensing hiện hữu; kết nối cost contract của B-07. Gia hạn subscription khác gia hạn quyền cá nhân
  đã có ở G5/G6; quyết định gia hạn không tự tạo commitment theo baseline hiện hành.
- Phân rõ phần có thể làm từ subscription/assignment và phần dùng evidence usage của Owner. Không bắt mọi nhánh chờ
  collector; không tự bổ sung thuật toán nhận diện không dùng hoặc tính nguồn usage thuộc G7.
- Bàn giao đề xuất → quyết → kết quả thực tế, reminders T−15/T−7 đúng vai/kênh, late execution, kỳ nối chuỗi,
  SoD và audit; không bịa mốc báo hủy hoặc ghi tiết kiệm thực hiện chỉ từ quyết định chưa thi hành.

## G10 — BE phục vụ Mobile, không gồm AI

### A-07 — Luồng Employee trên Mobile (`US-16-01`)

- Ghép A-01/A-02 với B-03 và API preview/submit/withdraw hiện hữu: phần mềm của tôi → Request của tôi → chọn
  phần mềm/gói → xem trước → gửi/rút yêu cầu đơn giản. Không tạo nhánh nghiệp vụ hoặc backend riêng cho Mobile.
- Kiểm AC-1→AC-8: đúng dữ liệu cá nhân, trạng thái giống web, lý do bắt buộc, quyền trùng bị chặn, rút đúng trạng thái;
  chỉ paid/internal đã có danh mục theo scope hiện hành. Không thêm group/delegated/renewal/return/upload lên Mobile.
- Bàn giao API sequence/OpenAPI mapping, dữ liệu test và E2E BE với DB cô lập. Endpoint đã có thì tái dùng và ghi
  coverage; phần thiếu trong `requests` do B sửa theo B-10, A không cùng chỉnh controller/repo đó.

### A-08 — Luồng duyệt trên Mobile (`US-16-02`, `US-16-03`)

- Trưởng phòng: queue B-02 → detail/dòng kế hoạch → duyệt/từ chối nhu cầu; không xem budget remaining bị cấm.
- Người duyệt chi: bước chi với snapshot chỉ đọc và bước nhu cầu của Request trưởng phòng tự gửi; phân biệt loại
  bước, giữ hai quyết định riêng. Chốt dùng hai API list hay projection chung khi thiết kế; không tự thêm endpoint.
- Bàn giao contract và E2E BE cho đúng người giữ bước, self-approval/SoD, override/lý do, bước đang chờ Finance,
  stale screen sau web quyết/rút hoặc đổi người giữ vai, không nhân đôi decision/commitment.
- B-10 sở hữu bổ sung query/action của `requests`/`budgets` nếu kiểm tra xác nhận còn thiếu; A giữ integration/test.
  Các quyết định gia hạn/hợp thức hóa/ngân sách và AI tiếp tục chỉ trên web, không đưa vào queue tác vụ Mobile.

### A-09 — Login/session/inbox và bàn giao contract Mobile (`US-16-04`)

- Xác minh dùng chung login/session/refresh/logout và vai hiệu lực với web; inbox/unread/read đúng người.
- Test khóa tài khoản/đổi vai có hiệu lực ở thao tác kế tiếp, lỗi xác thực chung, người không có vai Employee chỉ
  có tác vụ đúng vai; không cấp Employee mặc định cho IT/Finance/Super Admin.
- Bàn giao mapping đủ bốn Story Mobile, error/response examples và test smoke auth → list → action → inbox;
  phối hợp dev Mobile kiểm trên app khi có build. Không claim client native/offline UX đã verified từ test BE.
- Giữ scope không push/device token điện thoại, không biometrics/upload/offline queue. Không thêm cơ chế chặn web
  API chỉ bằng nhãn kênh do client gửi; các giới hạn màn hình cần được dev Mobile kiểm riêng.

## Read model dashboard vận hành (G8)

### A-10 — Dashboard Employee/Manager/IT/Super Admin, phần vận hành

- Phân rã theo `US-12-15 AC-2,3,4,7`: dùng lại A-02, B-02/B-03/B-04, provisioning/transfer/expiry/SaaS issue/
  personnel/role-warning APIs hiện có. Chỉ thêm projection/endpoint khi contract chưa đủ; không làm lại queue.
- Phần tiền của Manager lấy contract B-08; ghost/usage lấy contract G7 của Owner. B-08 giữ dashboard Finance và
  Người duyệt chi, cùng công thức/tổng hợp tài chính cho mọi vai. Ghi exact vế AC mỗi item, không hai chủ một vế.
- Bàn giao dữ liệu vận hành đúng vai và phòng, thiếu dependency hiện rõ trạng thái chưa có dữ liệu; không dùng 0
  để che thiếu usage/tài chính. Projection tổng hợp phải theo tier/public API, không query chéo bảng module.

## Bàn giao và phối hợp

- Dùng workflow/prompt có sẵn; mỗi outcome tạo/cập nhật spec/plan/test và scope map, không một spec cho cả G8/G10.
- Owner sở hữu G7/Tools, bên AI sở hữu phần AI của G10. A chỉ nhận contract/evidence và tích hợp K4, renewal,
  dashboard thuộc scope mình; không nhận lại ingest, rules, privacy hoặc thuật toán AI.
- B cung cấp Request/financial contract; A sở hữu catalog/licensing/subscription renewal và integration Mobile.
  Migrations/generated artifact tích hợp tuần tự; schema/public API thay đổi phải báo bên phụ thuộc.
- Các vế G6 usage exclusion/ghost decision và G2 onboarding usage/contribution recommendation do Owner giữ trong
  G7; A cung cấp personnel/licensing contract cần dùng, không tự implement vế đó dưới tên G6.
- A-03/A-06 phối hợp inbox events với B và Owner, không cùng sửa bảng mã/manifest mà không rebase.
- Bàn giao từng lát với test/quyền/timing/idempotency phù hợp và API sample đã làm sạch; Owner kiểm tra và merge.
  Chi tiết tiêu chí và lệnh kiểm chứng ở [báo cáo](README.md#điều-kiện-bàn-giao-mỗi-lát).
