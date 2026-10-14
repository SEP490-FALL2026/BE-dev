# Review và remediation G0/1a/1b — 14–15/10/2026

Đây là thư mục review duy nhất cho đợt G0/1a/1b. Các báo cáo trung gian, prototype, runner và log lặp lại đã được bỏ;
lịch sử vẫn có thể truy hồi bằng Git.

## Trạng thái

- Baseline ban đầu: `64073c4`; bản sửa vòng đầu merge vào `dev` tại `a8ba88f`.
- Nhánh remediation: `fix/g0-g1-remediation-2026-10-15`, commit cuối đã kiểm `a0cf5f1`.
- Code sản phẩm đã được implement và nhánh đã được đẩy lên origin; chưa có PR/merge vì công cụ GitHub chưa đăng nhập.
- Chưa có dev khác review code/spec/plan. ADR-0011/0012 vẫn `Proposed`; không ghi nghiệm thu.
- Spec và kế hoạch: [g0-g1-remediation-after-rereview](../../workspace/items/g0-g1-remediation-after-rereview/spec.md).

## Diễn biến finding

| Giai đoạn             | Kết quả                                                                                                                   |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Review `64073c4`      | Phát hiện R-01→R-16; P2 chính là checkout sạch, DB treo và candidates cắt trước khi lọc                                   |
| Re-review `a8ba88f`   | R-01, R-04→R-08, R-16 đóng; phát hiện N-1 P1 do query timeout để client/transaction dở quay lại pool; R-03 và R-15 còn mở |
| Remediation `a0cf5f1` | Sửa N-1/R-02/N-2/N-5, R-15/R-12, R-03/N-3/N-6, R-14/R-09, R-13 và đồng bộ tài liệu                                        |

R-06 giữ quy tắc chỉ lần đăng nhập sai tăng bộ đếm thất bại. R-07 giữ rate limit riêng theo từng route trên mỗi IP.
R-10/R-11 chuyển sang G2. Các phần G1 còn lại và dịch EN–VI không thuộc đợt sửa này.

## Kiểm chứng trên nhánh sửa

| Gate                                      | Kết quả được lưu tại revision bàn giao                                               |
| ----------------------------------------- | ------------------------------------------------------------------------------------ |
| `pnpm check`                              | 321 unit test, docs gate đạt                                                         |
| E2E                                       | 33 test đạt                                                                          |
| Integration PostgreSQL 17.11, role thường | 24 suite / 203 test đạt ở lượt hoàn chỉnh                                            |
| OpenAPI và dependency audit               | Không drift; không có lỗ hổng theo gate                                              |
| Docker/Compose và API/worker fail closed  | Đạt                                                                                  |
| CLI qua PTY                               | Đạt các kịch bản success, rerun, non-TTY, weak/mismatch và Ctrl+C; không lộ mật khẩu |
| Live smoke 16 operation                   | 132 PASS / 0 FAIL, ba lượt độc lập                                                   |
| DB outage D1/D4 và `/me` 503              | 26 PASS / 0 FAIL                                                                     |
| Mutation                                  | 26/26 bị test bắt                                                                    |
| Node 22/Linux parity                      | Cùng bộ gate đạt                                                                     |

Các số trên là evidence của phiên implement trên clone sạch, không phải lần chạy lại trong đợt dọn tài liệu này.
Raw runner/log không còn được lưu trong workspace vì source, test sản phẩm và Git history đã thay thế vai trò của prototype.

## Vấn đề còn mở

Một lượt integration cuối có 203/203 test pass nhưng suite fail ở `afterAll` vì
`DROP DATABASE ... WITH (FORCE)` nhận SQLSTATE `42501` dưới role không phải superuser. Lượt chạy lại và các lượt chạy riêng
đều xanh. Chưa có metadata `pg_stat_activity` tại thời điểm fail nên không kết luận autovacuum hay loại trừ hoàn toàn leak
của test. Đây là độ ổn định của test harness, chưa có bằng chứng là hồi quy N-1.

Trước merge, dev reviewer cần quyết định cách khép teardown: thu metadata an toàn khi fail, sửa lifecycle nếu có leak, và
nếu retry thì chỉ retry có giới hạn cho lỗi cấu trúc đã xác định; không đổi test role thành superuser để che lỗi.

Chưa kiểm: GitHub Actions trên PR, PgBouncer, HA failover, mạng blackhole, tải đồng thời lớn và SMTP nhà cung cấp thật.
Khi mất phản hồi ở `COMMIT`, client vẫn có thể nhận 503 dù dữ liệu đã commit; không tự retry thao tác ghi.

## Bàn giao

1. Tạo PR từ `fix/g0-g1-remediation-2026-10-15` vào `dev` bằng tài khoản người dùng.
2. Dev khác review source, spec/plan và lỗi teardown; chạy required checks trên revision PR.
3. Người có quyền merge sau khi branch protection được đáp ứng.
4. Dev A chỉ bắt đầu lát G1 tiếp theo/G2 sau khi nhận revision đã merge; không cần implement lại remediation.

Tệp SQL kiểm tra dữ liệu từng chạy trên phiên bản có N-1 được giữ tại
[n1-consistency-check.sql](n1-consistency-check.sql). Không chạy trên môi trường dùng chung khi chưa có người vận hành phê duyệt.
