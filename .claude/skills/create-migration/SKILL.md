---
name: create-migration
description: Create or review a Prisma migration in this repo following DB-05/DB-15/DB-16 (naming, ordering, roll-forward, no role grants). Invoke manually with /create-migration when changing prisma/models.
disable-model-invocation: true
---

# Tạo migration Prisma (BE)

Nguồn quy tắc: `docs/rules/database-business.md` (DB-05, DB-15, DB-16). Đọc lại nếu nghi ngờ.

## Trước khi tạo

1. Sửa `prisma/models/*` (không sửa `schema.prisma` gốc nếu chỉ thêm model).
2. `pnpm prisma:validate` phải xanh.
3. Xác định migration cuối đã merge trong `scripts/verify/merged-migrations.txt` (migration mới phải đứng **sau** nó).

## Tạo

- Tên thư mục: `YYYYMMDDHHMMSS_<snake_case>`, thời điểm hợp lệ (giờ 00–23, phút/giây 00–59), lớn hơn migration cuối đã merge.
- Tạo bằng `pnpm db:migrate:dev --name <snake_case>` trên CSDL **local development** (loopback). Không bao giờ chạy trên CSDL dùng chung hay production; không dùng `db push` thay migration.
- Không có down migration (DB-05). Sửa lỗi sau khi đã áp = migration mới (roll-forward) hoặc khôi phục từ backup.

## Review SQL trước khi dùng

- Không `GRANT`/`REVOKE`/`OWNER TO` và không nêu tên vai: quyền do `ops:db-roles` cấp.
- Thao tác phá dữ liệu (DROP, đổi kiểu, NOT NULL mới): cần backfill/bước phụ, ghi rõ trong spec của hạng mục.
- Đổi giá trị mà codec đọc (enum, mã lỗi): cần migration dữ liệu, không nới codec.
- Bảng/cột truy vấn thường xuyên: có index phù hợp.

## Sau khi tạo

- `pnpm prisma:generate`, `pnpm typecheck`.
- Drift (DB-16): CI áp mọi migration vào CSDL rỗng và chạy `prisma migrate diff`; sửa `prisma/models` mà thiếu migration sẽ đỏ. Có thể kiểm tra local tương tự.
- Khi migration được **merge** vào bản phát hành: thêm một dòng thư mục vào `scripts/verify/merged-migrations.txt`. Từ đó không sửa hay đổi tên nó (hook `.claude/hooks/block-generated.mjs` cũng chặn).
- Báo cáo: nói rõ test/gate nào đã chạy và cái nào chưa (Owner chạy full khi audit).
