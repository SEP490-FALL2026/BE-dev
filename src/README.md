# src — đọc từ đâu

Ba tiến trình, ba file bắt đầu. Mọi tiến trình dùng chung `core/`, `infrastructure/` và `modules/`.

| Tiến trình | Bắt đầu ở   | Ghép ở                    | Chạy bằng                                     |
| ---------- | ----------- | ------------------------- | --------------------------------------------- |
| API        | `main.ts`   | `app/app.module.ts`       | `pnpm start:dev` · `node dist/main.js`        |
| Worker     | `worker.ts` | `worker/worker.module.ts` | `pnpm start:worker` · `node dist/worker.js`   |
| Lệnh       | `cli.ts`    | `cli/commands.ts`         | `pnpm ops:<lệnh>` · `node dist/cli.js <lệnh>` |

```text
src/
  main.ts  worker.ts  cli.ts   ba điểm vào
  app/        API: danh sách module, cấu hình HTTP (CORS, version, pipe, Swagger), tài liệu OpenAPI
  worker/     worker: hai vòng thăm dò PostgreSQL (gửi email, bước mở của Request) — *.job.ts
  cli/        lệnh vận hành: commands.ts (bảng lệnh), run-command.ts (khung chung), <lệnh>/ (phần riêng)
  core/       TypeScript thuần: ngày nghiệp vụ, tiền, CSV, extension point (Hook, Listeners, Contributions)
  infrastructure/  adapter kỹ thuật: config, database, HTTP, bảo mật, mail, object storage, queue (dự phòng, chưa có consumer)
  modules/    14 module nghiệp vụ, xếp theo tầng (docs/generated/module-graph.md)
  generated/  Prisma client (sinh bởi `pnpm prisma:generate`, không sửa tay)
```

## Tìm code

- **Một route:** tra [routes.md](../docs/generated/routes.md) → mở controller → service nó gọi → repo trong cùng
  capability.
- **Một module:** đọc `modules/<m>/README.md` (mục đích, tầng, public API, bảng sở hữu, extension point), rồi
  `modules/<m>/public/` — đó là tất cả những gì module khác được dùng.
- **Một lệnh:** `cli/commands.ts` liệt kê tên lệnh, mô tả và thư mục của nó; lệnh gọi `public/*.api.ts` của module.
- **Một việc định kỳ:** `worker/*.job.ts` (worker) hoặc `*.job.ts` trong module (sweeper chạy trong API, ADR-0018).
- **Luồng ngược chiều** (module dưới cho module trên phản ứng): `public/<m>.extension-points.ts` của module dưới, bên
  đăng ký là các `*.listener.ts` của module trên.

## Test nằm ở đâu

Unit cạnh code (`*.spec.ts`); còn lại trong `test/`: `gates/`, `http/<module>/`, `integration/<module>/`, `e2e/`. Xem
[test/README.md](../test/README.md). Quy tắc cấu trúc: [module structure](../docs/rules/module-structure.md).
