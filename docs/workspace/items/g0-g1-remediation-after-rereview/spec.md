# Đặc tả sửa lỗi G0, lát 1a và 1b

## Trạng thái và nguồn

- Phạm vi: sửa các finding sau review G0/1a/1b, không thêm nghiệp vụ mới.
- Base đã review lại: `dev` tại `a8ba88f`.
- Bản implement: nhánh `fix/g0-g1-remediation-2026-10-15`, commit `a0cf5f1`.
- Trạng thái: đã implement và kiểm chứng bằng AI; đã vào `origin/dev` qua PR #7/#8, chưa được dev khác review hoặc nghiệm thu.
- Báo cáo duy nhất: [review G0/G1](../../../reviews/g0-g1-remediation-2026-10-15/README.md).
- ADR-0011 và ADR-0012 vẫn `Proposed`.

## Phạm vi sửa

### An toàn giao dịch và lỗi CSDL

- Query quá thời gian phải kết thúc request trong thời gian hữu hạn và trả lỗi availability phù hợp.
- Client có query timeout phải bị loại khỏi pool; transaction còn dở không được quay lại pool để request sau commit nhầm.
- Pool do ứng dụng sở hữu phải được đóng khi shutdown. `idle_in_transaction_session_timeout` là lớp phòng vệ bổ sung.
- Lỗi kết nối PostgreSQL tạm thời đã nhận diện trả HTTP 503; lỗi lập trình hoặc dạng query không hỗ trợ không được che thành 503.
- Không tự retry thao tác ghi khi mất phản hồi ở `COMMIT`, vì kết quả phía client có thể chưa xác định.

### API và truy vấn

- `/me` trả 503 `SERVICE_UNAVAILABLE` khi CSDL lỗi sau bước xác thực.
- Readiness trả 503 `SERVICE_UNAVAILABLE` khi PostgreSQL không sẵn sàng.
- Danh sách ứng viên loại tài khoản đã tồn tại trước khi giới hạn kết quả; tìm `%`, `_` và `\` theo ký tự thật.
- Page và count của danh sách tài khoản đọc trong cùng snapshot.
- Luồng redeem kiểm tra định dạng token và tra cứu token trước phép băm mật khẩu tốn chi phí.

### Cấu hình và CLI

- CLI cài đặt chỉ yêu cầu `DATABASE_URL` và không tải secret của API/worker.
- API và worker vẫn từ chối khởi động khi thiếu cấu hình bảo mật bắt buộc.
- Module khác không được import repository hoặc password hasher riêng của `identity-access`; giao tiếp qua facade đã công bố.

### Quyết định Owner giữ nguyên

- R-06: chỉ lần đăng nhập sai làm tăng bộ đếm thất bại; lượt đang xử lý hoặc thành công không tính là thất bại.
- R-07: rate limit toàn cục được tính riêng theo từng route trên mỗi IP.
- R-13: sửa trong đợt remediation này; CLI dùng cấu hình tối thiểu riêng.

## Ngoài phạm vi

- R-10/R-11 về JobTitle và I-2 thuộc G2.
- Đổi/đặt lại mật khẩu 1c, tra cứu Audit Trail, chuyển giao/khôi phục Super Admin và vai suy ra.
- Dịch nội dung EN–VI.
- PgBouncer, HA failover, mạng blackhole, tải lớn và SMTP nhà cung cấp thật.

## Tiêu chí hoàn thành

1. Test tái hiện N-1 chứng minh request 503 không để lại phần ghi được commit về sau.
2. Request khi CSDL treo kết thúc trong ngưỡng cấu hình và dịch vụ phục hồi không cần restart.
3. `/me`, readiness, candidates, snapshot list/count, redeem và CLI đạt các hành vi trên.
4. Gate source, E2E, integration PostgreSQL role thường, OpenAPI, audit và Docker đạt trên revision bàn giao.
5. Dev khác review code/spec/plan; PR được merge theo quy trình của dự án.

Chi tiết kết quả chạy và giới hạn còn lại nằm trong báo cáo review duy nhất được dẫn ở trên.

## Bổ sung sau review `3d03f00` — 15/10/2026

Đây là các task nhỏ phát sinh từ RV-01→RV-08 trong mục _Review revision hiện tại_ của báo cáo, chưa implement.
Nguồn nghiệp vụ G0/1a/1b vẫn là `S-2026-10-12b` tại Docs `0e0bb83`; không mở rộng sang 1c/G2.
Các checklist kiểm chứng cũ không đóng các finding mới này.

| Finding                                        | Thay đổi cần làm và acceptance                                                                                                                                                                                                                                          | Test/kiểm chứng cần có                                                                                                                                                                                                                                                                                  |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RV-01, P2: dependency audit fail               | Bỏ/tách dependency nghiên cứu không cần runtime hoặc nâng tổ hợp transformers/sharp được hỗ trợ; production graph không còn high theo gate. Không ép override khi chưa kiểm tương thích; giữ script nghiên cứu có cách chạy rõ nếu tách dependency                      | Audit production exit 0; frozen install/build và smoke API/worker; nếu vẫn dùng thư viện thì kiểm chức năng thực sự sử dụng nó                                                                                                                                                                          |
| RV-02, P2: hai spec khác cửa sổ replay         | Dev review thống nhất spec nền và spec 1a về token đã consumed nhưng expired trong phiên còn sống; ghi lựa chọn và lý do. Chỉ sửa AuthService nếu hợp đồng đã thống nhất yêu cầu revoke trường hợp này; không tự đổi nghiệp vụ trong review                             | Integration A→B, A expired nhưng B/session còn hạn: A luôn 401, không được mint token. Assert rõ B/access còn dùng được hay bị revoke theo kết luận; nếu revoke thì audit đúng một dòng đã commit dù A trả 401. Đối chứng replay A còn hạn, token chưa consumed nhưng expired, phiên đã hết hạn/revoked |
| RV-03, P2: CI dùng superuser                   | CI provision role `NOSUPERUSER CREATEDB NOCREATEROLE NOREPLICATION` trên PostgreSQL 17 riêng và dùng role này chạy integration; assert thuộc tính role trước suite. Khi teardown lỗi, thu metadata an toàn và đóng đúng resource; không đổi sang superuser để che 42501 | Một full integration gate dưới role thường; guard từ chối cấu hình superuser. Nếu cần retry teardown thì chỉ có giới hạn cho nguyên nhân đã phân loại và không che leak; không log query/credential/dữ liệu thật                                                                                        |
| RV-04, P2: chưa kiểm post-commit response loss | Mở rộng relay hiện có đủ nhỏ để COMMIT tới server nhưng response bị giữ; chứng minh DB đã commit qua connection độc lập. Caller báo lỗi availability hữu hạn, không tự retry write; business/audit nguyên tử, pool phục hồi                                             | Test response-loss sau actual COMMIT tách biệt pre-COMMIT stall; test rollback trước commit và connection retirement hiện có tiếp tục đạt. Tránh test chấp nhận cả rollback/commit mà không chứng minh nhánh cần kiểm                                                                                   |
| RV-05, P2: không có runner mutation duy trì    | Một runner nhỏ có control, xác nhận mutant áp đúng, restore trong finally + so hash; setup failure khác test bắt mutant. Không xây framework hoặc tính mutation score toàn dự án                                                                                        | Control xanh, tối đa ba mutant N-1/authorization/invitation; kiểm restore cả khi test/setup lỗi. Khi control fail thì không báo mutant killed; workspace sau chạy khớp bytes ban đầu                                                                                                                    |
| RV-06, P3: OpenAPI thiếu 422                   | Bổ sung response `422 VALIDATION_ERROR` cho resend/lock/unlock ở decorator; regenerate OpenAPI bằng script hiện có                                                                                                                                                      | HTTP invalid UUID cho cả ba operation; assertion generated document có 422, body envelope khớp; generator không drift sau commit thay đổi                                                                                                                                                               |
| RV-07, P3: trạng thái merge cũ                 | Đồng bộ dòng trạng thái trong spec/plan 1a/1b theo ancestry `a0cf5f1` đã merge; vẫn ghi chưa dev review, ADR Proposed                                                                                                                                                   | Đối chiếu Git ancestry/PR; docs rules/link/format đạt; không biến merge thành nghiệm thu                                                                                                                                                                                                                |
| RV-08, P2: rollback target chưa được kiểm      | Ghi artifact/commit rollback giữ pool retirement/disposal/idle backstop của N-1, schema compatibility và cách tiến lên lại. Không lấy `a8ba88f`/`64073c4` hoặc revert `2eda0f1` làm đường rollback mặc định                                                             | Dry-run/đọc diff của target; trên môi trường riêng xác nhận timeout hữu hạn, retirement, atomicity và migrate compatibility. Không revert repo thật hay xóa dữ liệu dùng chung để kiểm plan                                                                                                             |

Không kết luận RV-02 là lỗi code trước khi khép mâu thuẫn nguồn. RV-04/05/08 là thiếu bằng chứng đã xác định,
không phải kết quả test sản phẩm fail. Teardown 42501 lịch sử giữ mở: lượt role thường mới đạt nhưng chưa chứng minh căn nguyên.

## Quyết định và remediation Task 1B — 15/10/2026

RV-02 đã được người giao Task 1B chốt: refresh token expired luôn 401 trước consumed, không mint và không thu hồi
successor/session; consumed còn hạn trong phiên còn sống mới revoke family + đúng một audit commit rồi 401.
Hai spec nền/1a đã đồng bộ. Regression kiểm snapshot session/token/audit khi expired và B/access còn dùng được;
AuthService hiện đúng nên không sửa logic auth. Không còn blocker quyết định ở RV-02.

RV-01/03/04/05/06 đã có implementation và focused tests; RV-07 đã đồng bộ merge status.
RV-08 có tiêu chí artifact sau merge và dry-run riêng; rollout thực/remote CI không tự ghi PASS.
Kết quả final verification, fingerprint cây được kiểm và disposition từng finding nằm trong báo cáo hiện có.
Giữ nguyên các finding ban đầu để reviewer thấy trước/sau, không dùng checklist lịch sử làm bằng chứng mới.

Final Task 1B: frozen install, check (321 unit/19 script), E2E 36, integration 242 bằng role thường, production audit,
OpenAPI chỉ ba 422, Docker build/live 16 operation/CLI/SMTP/shutdown đều exit 0. N-1 dry-run 27 unit + 13 integration
probe và final control + ba mutant KILLED đạt, restore bytes/hash đúng, owner không đổi. Không thêm migration.
RV-01/03/04/05/06/07 FIXED trong implementation/local acceptance; RV-02 DISPOSITIONED theo quyết định task.
RV-08 DISPOSITIONED với criteria và dry-run; artifact release sau merge và remote CI vẫn UNVERIFIED, không bịa evidence.
Dev khác chưa review/nghiệm thu, ADR-0011/0012 vẫn Proposed. Không còn blocker quyết định RV-02 hoặc P2 code/test
chưa xử lý trong phạm vi remediation; không tự triển khai Task 2.
