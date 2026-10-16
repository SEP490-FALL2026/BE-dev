# Kế hoạch sửa lỗi G0, lát 1a và 1b

Liên kết: [spec](spec.md) · [báo cáo review](../../../reviews/g0-g1-remediation-2026-10-15/README.md).

## Trạng thái thực hiện

| Nhóm việc           | Trạng thái                  | Kết quả                                                                       |
| ------------------- | --------------------------- | ----------------------------------------------------------------------------- |
| N-1, R-02, N-2, N-5 | Đã implement trên nhánh sửa | Loại client timeout khỏi pool, đóng pool đúng lifecycle, map lỗi availability |
| R-15, R-12          | Đã implement trên nhánh sửa | `/me` và readiness trả 503 theo contract                                      |
| R-03, N-3, N-6      | Đã implement trên nhánh sửa | Truy vấn candidates không còn trần 5.000; ký tự tìm kiếm được xử lý literal   |
| R-14, R-09          | Đã implement trên nhánh sửa | Snapshot page/count; tránh Argon2 không cần thiết                             |
| R-13                | Đã implement trên nhánh sửa | CLI chỉ dùng cấu hình CSDL; API/worker vẫn fail closed                        |
| N-4                 | Đã cập nhật                 | Tài liệu runtime và OpenAPI đồng bộ với code                                  |
| Review của dev      | Chưa có                     | Không ghi approved/accepted trước khi có người review thật                    |
| Merge vào `dev`     | Đã có                       | `a0cf5f1` đã vào `origin/dev` qua PR #7 và #8                                 |

## Kiểm chứng và review sau merge

- [x] `pnpm check` trên checkout sạch.
- [x] E2E và OpenAPI không drift.
- [x] Integration với PostgreSQL 17 bằng role không phải superuser.
- [x] Live smoke đủ 16 operation và worker/SMTP sink.
- [x] D1/D4 cho DB pause/stall và `/me` 503.
- [x] Mutation cho các finding đã sửa.
- [x] Docker build, Compose và dependency audit.
- [ ] Khép lỗi teardown hiếm của harness integration hoặc ghi disposition được dev review.
- [ ] Dev khác review diff và các lựa chọn facade/timeout.
- [x] PR đã merge vào `origin/dev`.

Kết quả số lượng test, revision và giới hạn môi trường được giữ ở
[báo cáo review](../../../reviews/g0-g1-remediation-2026-10-15/README.md), không sao chép evidence thô vào workspace.

## Sau khi merge

1. Dev A cập nhật từ `dev` trên checkout sạch.
2. Thực hiện lát 1c và Audit Trail theo spec/plan riêng.
3. Chỉ bắt đầu phần G2 phụ thuộc R-10/R-11 sau khi nguồn Docs được pin và review.
4. Không tái sử dụng prototype hoặc patch trong lịch sử; source trên nhánh đã merge là nguồn thực thi duy nhất.

## Task sửa tiếp sau review `3d03f00` — chưa implement

Các dấu tick phía trên thuộc vòng remediation cũ. Kết quả mới: check 321 unit, E2E 33, integration 222 đạt;
audit fail (3 high/1 moderate), mutation runner chưa kiểm. Acceptance/test chi tiết nằm ở
[spec bổ sung](spec.md#bổ-sung-sau-review-3d03f00--15102026) và findings trong báo cáo duy nhất.
Không coi đoạn _Sau khi merge_ là cho phép bỏ qua các dependency mới trước feature tiếp theo.

1. [x] **RV-01 — P2, production dependencies.** Trace transformers→sharp trong lockfile; chọn bỏ/tách phần nghiên cứu hoặc upgrade được hỗ trợ. Sau sửa: frozen install, production audit, build và smoke liên quan. Không sửa dependency trong Task 1.
2. [x] **RV-02 — P2, thống nhất hợp đồng replay.** Dev reviewer đối chiếu spec nền:175 và spec 1a:119, chốt consumed+expired khi session còn sống; đồng bộ hai spec. Thêm integration fixture A→B rồi A expired với assertion B/access/audit theo kết luận; chỉ thay source nếu hợp đồng yêu cầu. Giữ test replay còn hạn/expiry/idempotency.
3. [ ] **RV-03 — P2, ordinary-role CI và teardown.** Tạo role NOSUPERUSER riêng trong workflow, assert quyền trước integration; dùng test helper hiện có. Chạy một gate PostgreSQL 17 role thường. Bổ sung metadata teardown an toàn khi lỗi; khép 42501 bằng nguyên nhân/disposition được review, không nâng quyền để che lỗi.
4. [x] **RV-04 — P2, mất phản hồi sau COMMIT.** Thêm khả năng giữ response có giới hạn vào PgRelay hiện có; xác nhận server commit qua connection ngoài trước khi client timeout. Assert caller lỗi hữu hạn, không retry write, business+audit cùng commit và request sau dùng connection an toàn; giữ pre-commit rollback probe.
5. [ ] **RV-08 — P2, rollback bảo toàn N-1.** Chọn commit/image giữ fix `2eda0f1` cùng follow-up cần thiết, ghi schema compatibility và khôi phục tiến; đọc diff/dry-run rồi probe trên DB riêng. Không áp revert trong bước review; không chọn revision có cơ chế timeout cũ.
6. [x] **RV-05 — P2, mutation runner nhỏ.** Control → tối đa ba mutant đại diện → restore finally/hash; thêm kiểm setup fail và restore khi lỗi. Ghi riêng setup error/killed/survived; không dùng 26/26 lịch sử làm kết quả mới.
7. [x] **RV-06 — P3, OpenAPI 422.** Thêm ba annotation và test invalid UUID/inventory, regenerate rồi kiểm drift; giữ response runtime hiện có.
8. [x] **RV-07 — P3, đồng bộ merge status.** Sửa vài dòng spec/plan 1a/1b sau đối chiếu ancestry; giữ chưa dev review/ADR Proposed; chạy docs rules/format.
9. [ ] Dev khác review từng thay đổi cùng evidence, ghi disposition phần còn UNVERIFIED và dependency còn mở trước lát feature phụ thuộc. Không tự ghi approved/accepted từ kết quả AI.

Task 1 chỉ bổ sung kế hoạch trên; không đánh dấu đã sửa, không chuyển sang Task 2. Lỗi source và thiếu test được triển khai
thành thay đổi nhỏ theo thứ tự trên; các việc độc lập có thể song song. Không chạy lại full gate chỉ vì chỉnh ba tài liệu review.

## Thực hiện Task 1B — final verification local đạt

- Batch A: chuyển research dependency sang dev, bổ sung ba contract 422 và regression replay theo quyết định Task 1B;
  auth refresh 7 test, invalid UUID 3 test, OpenAPI inventory 8 test, production audit exit 0.
- Batch B: ordinary-role CI + fail-closed role assertion trong harness, diagnostics an toàn không retry; probe DB thật
  giữ 42501 và dọn được DB sau đóng backend có quyền cao hơn. GitHub Actions remote chưa chạy trong phiên.
- Batch C: response-direction COMMIT hold và test actual commit 7 test; runner 8 test, control xanh và đúng ba mutant
  KILLED trên copy tạm, restore hashes đúng và owner không đổi. Rollback criteria đã bổ sung trong báo cáo, chờ dry-run final.
- Batch D: đồng bộ trạng thái merge ở cả spec/plan 1a/1b; giữ chưa dev review/ADR Proposed. Ba tài liệu Task 1 còn nguyên finding.

Các dấu tick RV-01/02/04/05/06/07 được khép theo evidence final bên dưới. RV-03 và RV-08 giữ unchecked cho phần remote CI/artifact chưa thể xác minh; implementation và local acceptance đã đạt. Chưa ghi nghiệm thu hoặc bắt đầu Task 2.

| Acceptance cuối Task 1B                  | Kết quả                                                                                                                                                             |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RV-01, RV-02, RV-04, RV-05, RV-06, RV-07 | FIXED hoặc DISPOSITIONED theo quyết định task; toàn bộ acceptance local đạt                                                                                         |
| RV-03                                    | Implementation + local PASS: strict role, diagnostics, actual 42501, 242 integration test; remote CI UNVERIFIED, không tự đóng bằng local result                    |
| RV-08                                    | Criteria + dry-run PASS: 27 unit/13 integration probe trên copy, owner không đổi; artifact release sau merge UNVERIFIED, không bịa SHA                              |
| Final gates                              | Frozen install, check 321 unit/19 script, E2E 36, integration 242, OpenAPI đúng ba 422, audit prod, Compose/build và live 16 operation/CLI/SMTP/shutdown đều exit 0 |
| Final mutation                           | Control xanh + đúng ba mutant KILLED, restore bytes/hash đúng, ownerUnchanged=true, cleaned=true                                                                    |
| Cleanup                                  | 0 DB/0 backend suite; runtime DB, năm container/anonymous volumes, network/image và copy tạm đã dọn                                                                 |
| Dev review/remote CI/release             | Chưa được xác nhận; ADR-0011/0012 vẫn Proposed; không coi là nghiệm thu                                                                                             |

Revision vẫn `dev@3d03f00` cộng diff chưa commit; fingerprint và image thử nằm trong báo cáo duy nhất.
Lượt final check đầu phát hiện lỗi lint ở test mới, đã sửa type assertion và chạy lại gate bị ảnh hưởng thành công;
install bị EACCES đã chạy lại đúng bước với quyền network, không tắt supply-chain policy. Không lặp full gates đã xanh.
Baseline đủ điều kiện local để giao review/chuẩn bị Task 2; không tự thực hiện Task 2 hoặc thao tác Git ngoài phạm vi.
