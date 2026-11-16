# Z2 — seed, flows, dữ liệu demo (ghi chép làm việc)

Nhánh `feat/z2-seed` (tách `feat/fe-feedback` @ `1f7ffa19`). Prompt: `Code/verify-logs/Z2-PROMPT.md`. Không push/merge.

## Dừng ở đâu

- 16/11 (1): seed hết đỏ ở `budget.*` (kỳ mở/`BM-10`/tệp/phiên bản/`RETURN`), checklist PL-2 ở mọi route quyết định của seed và
  flows, nhóm chức năng, R29–R32 (DEMO-1/2/3/4), bước `demo.*` (hợp đồng, hóa đơn mua, chốt tháng/quý, điều chỉnh, chính sách xuất bản
  lại). Flows: mf4 viết lại (F4-04 vòng đời kỳ), flow mới `purchase-invoice`. Đang chạy lại `seed.integration-spec` sau khi sửa
  `demo.budget-reviews` (shape `items`) và `ghost.decisions` (lịch sử đọc bằng Super Admin). Chưa commit.

## Quyết định D-Z2-n

(câu hỏi · phương án · chọn + căn cứ · file/commit · cách đổi lại)

- **D-Z2-1 — trạng thái "sau hạn" không dựng được trong ngày seed.** Seed chỉ ghi qua HTTP bằng đồng hồ thật của API
  (`docs/rules/operational-commands.md` mục `ops:seed`: không SQL nghiệp vụ, không endpoint seed). Các trạng thái chỉ có khi một hạn đã
  qua: kỳ `LOCKED` (điều chỉnh DEMO-14, phiên bản từ số liệu nền DEMO-15), giải trình quý quá hạn (DEMO-13), hồ sơ nghỉ việc quá hạn thu
  hồi (DEMO-6), kỳ _chưa có hóa đơn_ (DEMO-10: hạn = ngày làm việc thứ 5 sau ngày thanh toán, không trước `recordedAt`), Request tiếp tục đã
  cấp lại sau điều chuyển (DEMO-7). Phương án: (a) ghi SQL — trái rule `ops:seed`, Audit Trail giả; (b) seed đặt hạn = ngày seed để từ
  ngày demo (seed ≤ 1 ngày trước) trạng thái tự tới, phần cần ghi sau hạn chạy ở lượt seed lại từ D0+1 (cùng DB, không reset); (c) bỏ.
  **Chọn (b)** theo thẩm quyền rule repo > SPEC (SPEC M-16 đã chọn "ngày tương đối + seed lại ≤ 1 ngày"). Kỳ năm `Y` hạn nộp = D0 (khóa từ
  D0+1). Các mục làm được ở lượt D0+1 ghi ở bảng DEMO. Đổi lại: thêm endpoint/CLI dựng thời gian (ngoài phạm vi Z2, cần Owner).
- **D-Z2-2 — LGL (không trưởng phòng) không có ngân sách năm `Y`.** Trước đây Finance lập phiên bản `BASELINE` ngay; nay (BG-1/BG-2,
  `QĐ-111bb`) chỉ lập được sau hạn nộp. Chọn: bỏ LGL khỏi `budgets` (không Request nào của LGL tới bước kiểm ngân sách: R13 chờ nhu cầu,
  R28 K5). `test:flows` F4-04 chứng minh phiên bản số liệu nền sau hạn. Đổi lại: thêm lại vào `budgets` khi có đường lập trước hạn.
- **D-Z2-3 — "kỳ 2027 nháp + đang mở".** Một năm chỉ có một kỳ nên không thể vừa nháp vừa mở. Chọn: `Y+1` mở (hạn D0+30, DEMO-15),
  `Y+2` nháp (hạn D0+365, Finance có thể demo "mở kỳ"). Đổi lại: `draftCycle` trong `fixture/shared-demo-v4/finance.ts`.
- **D-Z2-4 — DEMO-15 trạng thái `Y+1`.** ENG đã duyệt (Request qua năm thấy cảnh báo mềm S4), ITO `BM-10` chờ Finance, MKT phiên bản
  chờ Người duyệt chi, SAL bị trả về (`RETURN`, thay `REQUEST_CHANGES` đã bỏ), DES/FIN/BOD không nộp (`noProposalSubmitted`). Phiên bản
  "từ số liệu nền + cờ" chỉ lập được sau hạn `Y+1` (D-Z2-1).
- **D-Z2-5 — tệp trong seed.** `BM-10` và phiên bản cần tệp (PUT lên link của object storage). Seed thêm `DemoApiClient.putFile`; trong
  test, `test/support/flows/seed-storage.ts` dựng một receiver HTTP loopback làm link upload của `FakeObjectStorage` để cả seed chạy ở
  tiến trình con (`_serial/seed-check-runtime`) đặt được tệp. Seed local/VPS cần MinIO thật (đã có trong compose).
- **D-Z2-6 — checklist PL-2 trong flows.** `FlowCalls.post` tự gắn checklist "mọi câu Có" của bản hiện hành cho route quyết định
  (`decisionStepOf`), như màn hình gửi; body có khóa `checklist` thì giữ nguyên. Seed đọc `GET /policies/{code}/steps/{step}` mỗi lần quyết.
- **D-Z2-7 — `ghost.decisions` chạy lại.** Ghế đã _Giữ_ quay lại hàng của trưởng phòng (item có `previousDecision`); seed coi item có
  `previousDecision.choice` = lựa chọn của fixture là `present` (trước đây lượt chạy lại thứ ba ghi lại quyết định).

## Nghi lỗi sản phẩm

(route · input · kỳ vọng theo QĐ/BRD · thực tế)

## Tài khoản demo

Mật khẩu: Super Admin = `SEED_SUPER_ADMIN_PASSWORD`, mọi tài khoản demo = `SEED_DEMO_ACCOUNT_PASSWORD` (operator chọn, đọc từ stdin;
không ghi ở đây). Super Admin: `system.admin@saoviet.example` (hoặc `SEED_SUPER_ADMIN_EMAIL`). Vai/phòng chi tiết ở
[README fixture](../../../src/cli/seed/fixture/shared-demo-v4/README.md).

| Mã      | Email đăng nhập            | Vai               | Phòng |
| ------- | -------------------------- | ----------------- | ----- |
| NV-CEO  | an.nguyen@saoviet.example  | SPENDING_APPROVER | BOD   |
| NV-DEP  | bich.tran@saoviet.example  | MANAGER           | BOD   |
| NV-ENGH | cuong.le@saoviet.example   | MANAGER           | ENG   |
| NV-DEV1 | dung.pham@saoviet.example  | EMPLOYEE          | ENG   |
| NV-DEV2 | em.hoang@saoviet.example   | EMPLOYEE          | ENG   |
| NV-DEV3 | giang.vu@saoviet.example   | EMPLOYEE          | ENG   |
| NV-DEV4 | phi.luong@saoviet.example  | EMPLOYEE          | ENG   |
| NV-OFF1 | nam.ha@saoviet.example     | EMPLOYEE          | ENG   |
| NV-CTR1 | phong.vu@saoviet.example   | EMPLOYEE          | ENG   |
| NV-INT2 | hanh.le@saoviet.example    | EMPLOYEE          | ENG   |
| NV-DESH | khanh.bui@saoviet.example  | MANAGER           | DES   |
| NV-DES1 | lan.do@saoviet.example     | EMPLOYEE          | DES   |
| NV-DES2 | manh.ngo@saoviet.example   | EMPLOYEE          | DES   |
| NV-DES3 | hoa.truong@saoviet.example | EMPLOYEE          | DES   |
| NV-FINH | ngoc.phan@saoviet.example  | MANAGER           | FIN   |
| NV-FIN1 | phuc.trinh@saoviet.example | FINANCE           | FIN   |
| NV-ITOH | thanh.tran@saoviet.example | MANAGER           | ITO   |
| NV-ITA1 | quan.ly@saoviet.example    | IT_ADMIN          | ITO   |
| NV-ITA2 | rang.mai@saoviet.example   | IT_ADMIN          | ITO   |
| NV-ITA3 | sang.doan@saoviet.example  | IT_ADMIN          | ITO   |
| NV-ITA4 | tu.kim@saoviet.example     | IT_ADMIN          | ITO   |
| NV-MKTH | uyen.dinh@saoviet.example  | MANAGER           | MKT   |
| NV-MKT1 | vinh.lam@saoviet.example   | EMPLOYEE          | MKT   |
| NV-MKT2 | xuan.chau@saoviet.example  | EMPLOYEE          | MKT   |
| NV-SALH | yen.truong@saoviet.example | MANAGER           | SAL   |
| NV-SAL1 | anh.kieu@saoviet.example   | EMPLOYEE          | SAL   |
| NV-SAL2 | bao.quach@saoviet.example  | EMPLOYEE          | SAL   |
| NV-LGL1 | thu.ly@saoviet.example     | EMPLOYEE          | LGL   |
| NV-OPSH | trang.quan@saoviet.example | MANAGER           | OPS   |
| NV-OPS1 | son.ta@saoviet.example     | EMPLOYEE          | OPS   |

## Bằng chứng gọi API (DEMO-1…15, MF-1…5)

## Chuỗi lệnh deploy-từ-đầu (VPS, sau khi drop DB)
