# PROGRESS — Đợt 5 phần 1 Redis/BullMQ, làn `tech` (`feat/redesign-w5-redis` — Bảo)

Tracker sống qua compact context. Người code đọc lại file này **đầu mỗi gói** và **ngay sau mỗi lần compact**, cập nhật **cuối mỗi gói**.

## Nhắc lại mỗi lần đọc

- **Skill Preflight trước khi làm tiếp** (CODE-PROMPT §0): code = `superpowers:executing-plans` + `superpowers:test-driven-development` + `be-quick-check`; verify =
  `superpowers:verification-before-completion`. Đọc lại SPEC phần của gói, PLAN mục gói, **LUẬT CỨNG**.
- **Đã chốt (SPEC §10, §11, §14), không hỏi lại:** OQ-W5R-1 A bản gọn · OQ-2 A `email_outbox` · OQ-3 A chờ Redis + `poll` · OQ-4 A dự phòng bộ nhớ,
  `@nest-lab/throttler-storage-redis` · OQ-5 A Bull Board chỉ đọc, so trên hash, không đếm lần sai, không nới CSP · OQ-6 A sweeper ở API · relay gọn (`deduplication`,
  `attempts: 1`, không đối soát).
- **Không migration, không đổi API.** Dữ liệu job chỉ `{ outboxId }`; lỗi job chỉ mã; không dữ liệu cá nhân vào Redis/log.
- **Không đụng file đợt 3:** `notifications.types.ts`, `inbox/**`, `notifications.extension-points.ts`, 28 sweeper. Điểm gộp GP-1 → GP-5 ở PLAN.
- Push nhánh làn; không merge, không PR, không deploy, không co-author.

## Gói

| Gói | Mục                                                                | Trạng thái | sha | Lệnh kiểm + kết quả (unit, integration của gói) | FIX-TEST thêm | Ghi chú / chưa kiểm được |
| --- | ------------------------------------------------------------------ | ---------- | --- | ----------------------------------------------- | ------------- | ------------------------ |
| T1  | R-01 cấu hình, env, `no-redis-in-modules`                          | xong       | `7420b554` | Đỏ 10/20 ca env trước khi sửa. Unit 130/130. Recovery CLI integration 6/6. Typecheck, lint, arch:check, rules:check và 335/335 gate đạt. OpenAPI export bằng Node 22 không drift. | — | D-1 đã duyệt. |
| T2  | R-01 client, R-08 (a)(b)                                           | xong       | commit T2 | Unit 29/29. Redis Docker trả PONG cho 3 kiểu client. Typecheck, lint file sửa, arch:check, rules:check, 335 gate, OpenAPI không drift. Audit production sạch, một bản ioredis. | — | Client cấp cho BullMQ kết nối ngay. |
| T3  | R-09 CI + harness                                                  | chưa       |     |                                                 |               |                          |
| T4  | R-02 rate-limit Redis                                              | chưa       |     |                                                 |               |                          |
| T5  | R-07 compose, deploy, gate                                         | chưa       |     |                                                 |               |                          |
| T6  | ADR-0020 + tài liệu nhóm 1                                         | chưa       |     |                                                 |               |                          |
| C1  | CI full nhóm 1                                                     | chưa       |     |                                                 |               |                          |
| T7  | notifications: điều kiện chung, `claimById`, M4                    | chưa       |     |                                                 |               |                          |
| T8  | queue + relay + công tắc                                           | chưa       |     |                                                 |               |                          |
| T9  | consumer mail                                                      | chưa       |     |                                                 |               |                          |
| T9b | R-11 job dọn đêm (Owner 27/11: C1–C4, 30 ngày, chạy khi khởi động) | chưa       |     |                                                 |               |                          |
| T10 | Bull Board                                                         | chưa       |     |                                                 |               |                          |
| T11 | chốt, ca diệt đột biến                                             | chưa       |     |                                                 |               |                          |
| C2  | CI full toàn đợt                                                   | chưa       |     |                                                 |               |                          |

Trạng thái: `chưa` · `đang làm` · `xong` (chỉ sau khi đối chiếu từng tiêu chí — LUẬT CỨNG 6) · `dừng hỏi`.

## Đối chiếu tiêu chí (LUẬT CỨNG 6)

| Gói | Tiêu chí SPEC §6 | Test | `file:line` code |
| --- | ---------------- | ---- | ---------------- |
| T1 | R-01 (a), mặc định theo môi trường và ràng buộc proxy | `env-matrix.spec.ts` | `redis.config.ts:47`, `env-schema.ts:183` |
| T1 | R-01 (b)(c), host/mật khẩu production và tùy chọn vận hành không Redis | `env-matrix.spec.ts`, `env-example.spec.ts`, `redis.config.spec.ts` | `redis.config.ts:74`, `env-schema.ts:189` |
| T1 | R-01 (f), cấm module import thư viện Redis | `pnpm arch:check` và ca diệt đột biến | `.dependency-cruiser.cjs:39` |
| T2 | R-01 client chặn và không chặn | `redis-client.factory.spec.ts` và Redis Docker | `redis-client.factory.ts:24` |
| T2 | R-08 (a)(b), log một lần mỗi trạng thái và phân loại retry | `redis-client.factory.spec.ts`, `operator-error.spec.ts` | `redis-client.factory.ts:49`, `operator-error.ts:55` |

## Trọng tâm review (PLAN) → test

| #   | Đầu vào                                             | Test | Kết quả |
| --- | --------------------------------------------------- | ---- | ------- |
| 1   | Redis sai mật khẩu                                  |      |         |
| 2   | Redis đầy (OOM)                                     |      |         |
| 3   | Job lạ trong hàng                                   |      |         |
| 4   | `poll` rồi `bullmq`, job cũ của dòng đã `SENT`      |      |         |
| 5   | Mật khẩu Bull Board có `:`/không ASCII, base64 hỏng |      |         |

## Ca diệt đột biến (T1, T11)

| Ca                                        | Test phải đỏ      | Đỏ thật? | Ghi chú |
| ----------------------------------------- | ----------------- | -------- | ------- |
| `import 'ioredis'` trong `src/modules/**` | `pnpm arch:check` | Có | Báo `no-redis-in-modules`. Xóa file thử, chạy lại xanh. |
| bỏ `deduplication`                        | I-2 (c)           |          |         |
| `dueIds` dùng điều kiện riêng thiếu lease | I-2 (d)           |          |         |
| bỏ M4                                     | I-5 / I-3 (g)     |          |         |
| ném lỗi gốc thay vì mã                    | I-3 (i), U-5      |          |         |
| storage ném thay vì dự phòng              | I-1 (c), U-3      |          |         |
| `close()` sau ngắt DB                     | I-3 (h)           |          |         |

## Kiểm tay

| Việc                                                                       | Kết quả |
| -------------------------------------------------------------------------- | ------- |
| Bull Board trên trình duyệt, CSP mặc định, console sạch (T10)              |         |
| `docker compose up -d --wait` local: `postgres`, `redis` healthy (T5)      |         |
| `--detectOpenHandles` cho I-1 (T4)                                         |         |
| `--detectOpenHandles` cho I-4 board bật (T10)                              |         |
| `pnpm openapi:export` khi Redis tắt (T4)                                   |         |
| ca `CLIENT PAUSE` ở `_serial` chạy trong job `integration-inband` (T4, C1) |         |

## Tự quyết

| D-n | Gói | Điểm | Chọn | Vì sao | File |
| --- | --- | ---- | ---- | ------ | ---- |
| D-1 | T1 | Fixture production cũ thiếu khóa Redis và proxy | Owner duyệt bổ sung khóa fixture, giữ nguyên assertion | SPEC yêu cầu cấu hình production hợp lệ trước khi kiểm tra guard quản trị DB hoặc lỗi kết nối của recovery CLI | `database-administration-credentials.spec.ts`, `recovery-cli.integration-spec.ts` |

## Điểm gộp đã gặp

| GP  | Khi nào | Làm gì | Commit |
| --- | ------- | ------ | ------ |

## Bàn giao (đợt 5 phần 2 / Owner)

| Việc | Chữ ký / file đã có | Ai dùng |
| ---- | ------------------- | ------- |

## CI GitHub

| Commit | Link run | quality | http | integration (1/2/3) | inband | e2e-smoke | Ghi chú |
| ------ | -------- | ------- | ---- | ------------------- | ------ | --------- | ------- |
