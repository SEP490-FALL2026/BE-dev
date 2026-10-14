# Kiểm artifact lượt 3 và source đã tích hợp — 15/10/2026

Reviewer: Codex, có sub-agent đọc runtime. Đây là review có giới hạn, không thay nghiệm thu hoặc
phê duyệt ADR. Không sửa product source trong lượt kiểm này, chưa commit/push.

## Kết luận cho Owner

Task `PROMPT_CLAUDE_FINALIZE_REMEDIATION_EVIDENCE_2026-10-14.md` đã hoàn tất đúng phạm vi prototype:
F-1→F-5 có artifact và bằng chứng khép; không cần tiếp tục vòng nghiên cứu/prototype.
Run3 đủ làm đầu vào tích hợp/kiểm chứng product. Các giới hạn GitHub Actions, PgBouncer/HA và SMTP vendor
không tự chặn bàn giao local trong phạm vi đã giao, nhưng phải được ghi trước deploy môi trường tương ứng.

**Hiện trạng đã tiến xa hơn báo cáo Claude gửi:** BE HEAD vẫn `a8ba88f`, nhưng working tree đã có bản sửa
thật trong `src/`, `test/`, config và tài liệu. [Báo cáo tích hợp](backend-g0-g1-integration-2026-10-15.md)
đang ghi kiểm chứng chưa hoàn tất. Vì vậy bước tiếp theo là tiếp tục source đã có, kiểm gate/evidence và
đóng gói Git đúng phạm vi; không áp lại diff, không giao dev A implement remediation nữa.

## Đã tự kiểm

| Kiểm tra                                                                                    | Kết quả lượt Codex này                                                                                 |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| SHA-256 diff/fixture/mutation/smoke/reset/SQL                                               | 6/6 khớp chỉ mục run3                                                                                  |
| Tái dựng clone local từ `a8ba88f`, apply diff + fixture, write-tree                         | `99ce604d8d6db2b1e2f0c9beb1bd184c014a8f3a`, khớp artifact `db69477`                                    |
| Mutation JSON run3                                                                          | `COMPLETED`, 22 killed; 0 survived/unapplied/infra-error/otherFailure/restoreFailed                    |
| Ba log live smoke run3                                                                      | Không có dòng FAIL; bản ghi 132/0 ở cả ba lượt                                                         |
| Source actual so với prototype                                                              | Mọi source TS khớp nội dung chuẩn hóa LF, trừ thông báo lỗi CLI đã sửa để không hứa rollback chắc chắn |
| Integration test actual so với prototype                                                    | Các test TS khớp                                                                                       |
| Unit actual: pg-pool, env-schema, health controller, me controller, architecture boundaries | **5 suite, 108/108 đạt**, exit 0                                                                       |
| `pnpm rules:check`, `pnpm rules:format`                                                     | 59 tệp/434 link/0 lỗi; format đạt lúc kiểm, trước khi thêm báo cáo này                                 |

Scratch tái dựng được tạo/dọn trong thư mục riêng đã kiểm path. Không chạy lại full integration/E2E,
Docker, mutation có DB hoặc D1/D4 trong lượt này. 318/201/33, 22/22 và smoke run3 là số Claude đã lưu;
108/108 là lần tự chạy trên actual source của Codex. Không lấy prototype để chứng nhận gate product mới.

## F-1→F-5

- F-1: smoke runner mới chờ worker-ready và trạng thái outbox đúng với deadline/timeline;
  M-2/X-2 giữ assertion; ba lượt mới đạt. Race runner cũ vẫn được ghi là giả thuyết, không biến thành kết luận chắc chắn.
- F-2: T6 capture pool bằng spy trong test và cleanup `finally`; assertion leak trước cleanup không đổi.
  Mutation DISP giờ killed, JSON không có infra-error/restore failure.
- F-3: README có local snapshot commit trước mutation, clean guard giữ nguyên. Tree/hash có thể tái dựng.
- F-4: runbook dừng/drain API và worker/CLI/other writers khi cần containment; ingress-only không còn là đảm bảo.
- F-5: contract bounded được ghi rõ; test cũ đã dùng PgRelay; lịch sử run2 được giữ riêng, trạng thái cập nhật đúng run3.

Không tìm thấy blocker runtime mới trong phạm vi source đã đối chiếu. Client/Facade vẫn là lựa chọn cần review
thực tế, không cần dựng framework mới; chưa ghi thành phê duyệt của dev thật.

## Việc còn lại trước đưa lên Git

1. Hoàn tất gate trên source product snapshot/revision thật; fix failure trong phạm vi và cập nhật báo cáo tích hợp.
2. Kiểm source CLI wording mới, OpenAPI/drift, env fail-closed và lỗi DB/D1/D4 trên code tích hợp.
3. Tách commit remediation khỏi dependency/model/script và hạng mục dịch, G2/1c đang soạn của phiên khác.
   Gate audit trên lockfile baseline không chứng nhận working tree có Transformers; không gộp dependency chưa đạt.
4. Chỉ commit file/hunk đã review, có báo cáo/runner/evidence cần thiết để người nhận tái chạy.
5. Commit/push nhánh sửa riêng và chuẩn bị PR về `dev` theo ủy quyền triển khai; không force-push,
   không tự Accepted/accepted/deployed. Dev A nhận bản sửa đã kiểm để tiếp tục feature G1/G2.

Prompt mới ở gốc workspace: `PROMPT_CLAUDE_IMPLEMENT_VERIFY_PUBLISH_G0_G1_2026-10-15.md`.
Đây là yêu cầu hoàn thành source sản phẩm thật, không còn giới hạn chỉ prototype.
