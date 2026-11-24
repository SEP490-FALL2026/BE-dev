# Hướng dẫn chạy BE-WDP ở local (Docker) — dùng cho buổi demo

Tất cả lệnh chạy trong **Git Bash** tại thư mục `D:\FPT\FALL2026\Code\BE-WDP` (dùng dấu `/` trong đường dẫn, **không** dùng `\` — Git Bash sẽ nuốt dấu `\`).

```bash
cd /d/FPT/FALL2026/Code/BE-WDP
```

**Không đổi file env.** `.env` và `.env.seed.local` đã được cấu hình sẵn cho Docker. Đừng sửa, đừng xóa.

## 0. Bức tranh tổng thể

| Thành phần                                      | Chạy ở đâu                    | Cổng trên máy              |
| ----------------------------------------------- | ----------------------------- | -------------------------- |
| PostgreSQL 17                                   | Docker (service `postgres`)   | **5433**                   |
| MinIO (lưu file hợp đồng, ngân sách)            | Docker (profile `storage`)    | 9000 (API), 9001 (console) |
| MongoDB (lịch sử gọi AI)                        | Docker (profile `history`)    | **27018**                  |
| BE API                                          | máy bạn (`pnpm start:dev`)    | **4000**                   |
| Worker (gửi mail, chuyển lịch sử AI sang Mongo) | máy bạn (`pnpm start:worker`) | —                          |

Vì sao 5433 và 27018: máy bạn còn Postgres và MongoDB cài sẵn (native) đang chiếm 5432 và 27017. Hai cái đó **không liên quan** — để yên.

Điều kiện: Docker Desktop **đã bật**, Node 22 hoặc 24, pnpm 11.1.3, đã `pnpm install` một lần.

---

## KỊCH BẢN A — Sửa code xong chạy lại (Docker + DB vẫn còn dữ liệu)

Dùng khi chỉ sửa code BE. Không cần seed lại, không migrate lại (trừ khi bạn thêm migration).

```bash
# 1. Bật Docker nếu chưa chạy (an toàn khi chạy lại, không mất dữ liệu)
docker compose --profile storage --profile history up -d --wait

# 2. Chỉ khi có migration MỚI:
pnpm db:migrate:deploy

# 3. Chạy BE (tự reload khi sửa code)
pnpm start:dev
```

Terminal thứ hai, nếu cần worker (gửi mail, đẩy lịch sử AI sang Mongo):

```bash
pnpm start:worker
```

Kiểm tra BE sống: mở `http://localhost:4000/api/v1/health/ready` → phải trả `200`.
Swagger: `http://localhost:4000/api/docs` (nếu `SWAGGER_ENABLED` bật).

Nếu bạn sửa `.ts` mà `pnpm start:dev` đang chạy → tự biên dịch lại, không cần làm gì.
Nếu bạn muốn chạy lệnh CLI (`pnpm ops:*`) → cần `pnpm build` trước.

---

## KỊCH BẢN B — Xóa hết, setup lại Docker từ đầu (sạch hoàn toàn)

Dùng khi muốn demo "dựng lại từ số 0" hoặc DB hỏng.

> ⚠️ `docker compose down -v` **xóa sạch** dữ liệu Postgres, MinIO và Mongo của dự án này. Chỉ xóa volume của compose `software-license-management`, không đụng Postgres/Mongo native của máy.

```bash
# 0. Dừng BE và worker nếu đang chạy (Ctrl+C ở terminal của chúng)

# 1. Xóa container + volume cũ
docker compose --profile storage --profile history down -v

# 2. Dựng lại 3 dịch vụ, chờ đến khi healthy
docker compose --profile storage --profile history up -d --wait

# 3. Tạo bảng trong DB (≈ 200 migration)
pnpm db:migrate:deploy

# 4. Build (sinh Prisma client + CLI)
pnpm build

# 5. Tạo bucket trên MinIO (code BE không tự tạo bucket)
node ../local-infra/create-local-bucket.mjs
#   → "Đã tạo bucket "software-license-files"."

# 6. Seed dữ liệu demo (PHẢI tắt start:dev và start:worker trước, cổng 3000 phải trống)
pnpm seed:local
#   → cuối log: "Tổng: ĐÃ GHI 64 · ... mã thoát 0"

# 7. Chạy BE
pnpm start:dev
# terminal khác (tùy chọn):
pnpm start:worker
```

Thời gian: bước 3 + 4 + 6 mất vài phút. Chạy trước buổi demo ít nhất 15 phút.

### Xóa sạch: container + image KHÔNG đủ, phải xóa VOLUME

Dữ liệu nằm trong **volume**, không nằm trong container hay image. Chỉ xóa container/image rồi dựng lại thì container mới gắn lại volume cũ → DB vẫn còn dữ liệu cũ, `seed:local` sẽ in "ĐÃ CÓ" thay vì ghi mới.

Ba volume của dự án này:

| Volume                                      | Chứa                       |
| ------------------------------------------- | -------------------------- |
| `software-license-management_postgres-data` | Database                   |
| `software-license-management_minio-data`    | File đã upload (và bucket) |
| `software-license-management_mongodb-data`  | Lịch sử gọi AI             |

Cách xóa đúng:

```bash
docker compose --profile storage --profile history down -v
```

Nếu container đã bị xóa từ trước thì `down -v` có thể không dọn được volume. Khi đó xóa trực tiếp, rồi kiểm tra:

```bash
docker volume rm software-license-management_postgres-data software-license-management_minio-data software-license-management_mongodb-data
docker volume ls      # 3 volume trên phải biến mất
```

Sau đó làm tiếp từ bước 2 của Kịch bản B. **Nhớ chạy lại bước 5 (tạo bucket)** vì volume MinIO đã mất.

- **Không cần xóa image** (`postgres:17-alpine`, `mongo:8.0`, `slm-minio`): image chỉ là phần mềm cài sẵn, không chứa dữ liệu. Xóa chỉ làm lần `up` sau phải tải lại (`mongo` khoảng 1.3 GB). Chỉ xóa khi cần giải phóng ổ đĩa.
- **Không dùng `docker system prune` hay xóa tất cả container.** Máy còn các container khác không thuộc dự án (`slm-seed`, `slm-seed-minio`, `slm-seed-test`, `redis-server`) và volume không tên; lệnh rộng sẽ làm mất chúng. `down -v` ở trên chỉ xóa đúng dự án này.

---

## KỊCH BẢN C — Giữ Docker, chỉ làm lại dữ liệu seed

```bash
pnpm seed:local
```

Vì DB đã có dữ liệu, script hỏi:

| Bạn nhập                              | Kết quả                                    |
| ------------------------------------- | ------------------------------------------ |
| Enter                                 | Thoát, không đổi gì                        |
| Gõ đúng `software_license_management` | **Reset** schema, migrate, seed lại từ đầu |
| `c`                                   | Chạy tiếp, chỉ ghi phần còn thiếu          |

Không muốn bị hỏi:

```bash
pnpm seed:local --continue                                  # chạy tiếp
pnpm seed:local --confirm-reset software_license_management # reset không hỏi
```

---

## Đăng nhập demo

- **Super Admin:** email là `SEED_SUPER_ADMIN_EMAIL` trong `.env.seed.local` (nếu trống thì mặc định `system.admin@saoviet.example`), mật khẩu là `SEED_SUPER_ADMIN_PASSWORD`.
- **Tài khoản demo khác** (trưởng phòng, IT Admin, Finance, Người duyệt chi, nhân viên): mật khẩu chung là `SEED_DEMO_ACCOUNT_PASSWORD`. Danh sách email xem `docs/guides/seed.md` hoặc hỏi lại.
- Mở file `.env.seed.local` để xem mật khẩu (đừng chụp màn hình đưa vào slide).

---

## Lỗi thường gặp

| Triệu chứng                                                      | Nguyên nhân                                                                 | Cách xử lý                                                                                                       |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `Cannot find module '...local-infracreate...'`                   | Dùng `\` trong Git Bash                                                     | Dùng `/`: `node ../local-infra/create-local-bucket.mjs`                                                          |
| `docker compose` báo không kết nối được                          | Docker Desktop chưa bật                                                     | Bật Docker Desktop, đợi biểu tượng xanh                                                                          |
| `Stop pnpm start:dev before seeding; the API port is responding` | Cổng 3000 đang bị chiếm                                                     | Tắt tiến trình trên cổng 3000, rồi seed lại                                                                      |
| Seed in `mã thoát 2` và "ĐÃ CÓ 65"                               | **Không phải lỗi** — dữ liệu đã seed rồi, không còn gì để ghi               | Bình thường. Muốn làm lại thì dùng Kịch bản C (reset)                                                            |
| Seed dòng `demo.budget-adjustments ... chạy lại seed từ ngày đó` | Điều chỉnh ngân sách DEMO-14 chỉ tạo được khi kỳ 2026 đã khóa (sau hạn nộp) | Bình thường, không phải lỗi                                                                                      |
| `OBJECT_STORAGE_REFUSED` hoặc lỗi bucket                         | MinIO chưa chạy hoặc chưa có bucket                                         | Chạy lại bước `up -d --wait`, rồi `node ../local-infra/create-local-bucket.mjs`                                  |
| BE báo không kết nối DB                                          | Postgres container chưa lên, hoặc sai cổng                                  | `docker compose ps` — `postgres` phải `healthy`; `.env` dùng cổng **5433**                                       |
| `Port 5433/9000/27018 is already allocated`                      | Có thứ khác đang chiếm cổng                                                 | `docker compose ps`; tắt thứ đang chiếm hoặc đổi `POSTGRES_PORT`/`MONGODB_PORT` trong `.env` (và `DATABASE_URL`) |
| Lịch sử AI không hiện                                            | Worker chưa chạy                                                            | `pnpm start:worker`                                                                                              |
| AI không trả lời                                                 | Cần internet + `AI_SERVICE_BASE_URL`/`AI_SERVICE_TOKEN` hợp lệ              | Kiểm tra mạng, token AI server                                                                                   |

---

## Lệnh Docker cần nhớ

```bash
docker compose ps                                              # trạng thái các container
docker compose logs -f postgres                                # xem log Postgres
docker compose --profile storage --profile history down        # tắt, GIỮ dữ liệu
docker compose --profile storage --profile history down -v     # tắt và XÓA dữ liệu
docker compose --profile storage --profile history up -d --wait  # bật lại
```

Console MinIO để xem file đã upload: `http://localhost:9001` (đăng nhập bằng `OBJECT_STORAGE_ACCESS_KEY_ID` / `OBJECT_STORAGE_SECRET_ACCESS_KEY` trong `.env`).

---

## Kiểm tra nhanh trước khi lên demo

```bash
docker compose ps                    # postgres, minio, mongodb đều healthy
pnpm ops:inspect                     # exit 0 = đã cài, dữ liệu nhất quán (cần pnpm build trước)
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4000/api/v1/health/ready   # 200
```

## Nếu giáo viên hỏi "sao không Docker cho BE?"

BE chạy trực tiếp trên máy (`pnpm start:dev`) để sửa code và reload ngay. Chỉ hạ tầng (DB, file, lịch sử AI) nằm trong Docker, nên xóa dựng lại bằng một lệnh mà không ảnh hưởng máy.
