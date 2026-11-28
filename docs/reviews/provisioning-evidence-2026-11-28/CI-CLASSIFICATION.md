# Phân loại CI P5 — kết quả cuối

Skill: `verification-before-completion`, `systematic-debugging`.

**P5 đạt tiêu chí PLAN §7:** quality, HTTP, smoke, inband xanh; không có lỗi integration mới so với nền. Toàn run vẫn `failure` do 637 test nợ cũ. Đây không phải tuyên bố toàn CI xanh.

| Run                                                                                    | Code head           | Kết quả                                                        | Từng test đỏ                                    |
| -------------------------------------------------------------------------------------- | ------------------- | -------------------------------------------------------------- | ----------------------------------------------- |
| [Nền 46116992628](https://github.com/SEP490-FALL2026/BE-dev/actions/runs/46116992628)  | dev tại lúc bắt đầu | 637 test đỏ/108 suite; HTTP/quality/inband xanh, smoke skipped | Tập so sánh cố định, không lấy dev mới thay nền |
| [Đầu 46162602020](https://github.com/SEP490-FALL2026/BE-dev/actions/runs/46162602020)  | `aa0ad0f6`          | 639 đỏ: 637 cũ + 2 mới                                         | [Đủ 639 test](CI-CLASSIFICATION-46162602020.md) |
| [Cuối 46164800057](https://github.com/SEP490-FALL2026/BE-dev/actions/runs/46164800057) | `a01ff901`          | **637 cũ + 0 mới**, tập file/title khớp hoàn toàn nền          | [Đủ 637 test](CI-CLASSIFICATION-46164800057.md) |

Hai lỗi mới của run đầu đã hết sau **một vòng sửa CI**, commit `a01ff901`:

1. `test/http/licensing/provisioning.http-spec.ts:414`, `provisioning queue routes (e2e, no database) › has no route that makes a revocation: each source opens it through the licensing facade (US-07-05 AC-3)`: thiếu route link trong inventory POST. User cho phép đúng ngoại lệ D-2; thêm một chuỗi, giữ mọi kiểm khác. Run cuối HTTP 2869 pass/0 fail.
2. `test/integration/licensing/provisioning-evidence-files-revocation.integration-spec.ts`, `evidence of K1 revocation and access cut (integration, real PostgreSQL) › SPEC case 6: keeps completion and access-cut files on the same K1 task`: fixture đọc quyền K1 bằng subscription cũ, trong khi K1 hiện trả target PLAN. Chỉ test mới đổi sang `h.plan('K1')` + `h.seat({planId})`; không đổi harness/production/luật K2. File integration này PASS trên run cuối.

| Job cuối           | Trạng thái | Số test thật / link                                                                                                                                                                                                   |
| ------------------ | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| quality            | success    | unit 10266 pass/0 fail (911 suites); gates 346 pass/0 fail (17 suites); migrations áp dụng thành công, không schema drift; [job](https://github.com/SEP490-FALL2026/BE-dev/actions/runs/46164800057/job/141039899335) |
| http-contract      | success    | 2869 pass/0 fail, 124 suites; [job](https://github.com/SEP490-FALL2026/BE-dev/actions/runs/46164800057/job/141039899310)                                                                                              |
| e2e-smoke          | success    | 48 pass/0 fail, 10 suites; [job](https://github.com/SEP490-FALL2026/BE-dev/actions/runs/46164800057/job/141039899347)                                                                                                 |
| integration-inband | success    | timing 31 pass/0 fail, 8 suites; serial 100 pass/0 fail, 14 suites; [job](https://github.com/SEP490-FALL2026/BE-dev/actions/runs/46164800057/job/141039899314)                                                        |
| integration (1)    | failure    | 1902 pass/256 fail/1 skipped; **256 cũ/0 mới**; [job](https://github.com/SEP490-FALL2026/BE-dev/actions/runs/46164800057/job/141039899352)                                                                            |
| integration (2)    | failure    | 1908 pass/180 fail; **180 cũ/0 mới**; [job](https://github.com/SEP490-FALL2026/BE-dev/actions/runs/46164800057/job/141039899375)                                                                                      |
| integration (3)    | failure    | 1801 pass/201 fail/4 skipped; **201 cũ/0 mới**; [job](https://github.com/SEP490-FALL2026/BE-dev/actions/runs/46164800057/job/141039899311)                                                                            |

Đối chiếu cặp `(file, full test title)` độc lập shard, loại trùng giữa khối lỗi đầu và summary. Tổng integration 5611 pass/637 fail/5 skipped, 510 suites pass/108 fail/1 skipped. Hai file integration mới đều PASS. Deploy skipped; không triển khai. Full test chỉ chạy trên CI GitHub.
