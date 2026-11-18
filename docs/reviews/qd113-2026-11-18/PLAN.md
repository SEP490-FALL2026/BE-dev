# PLAN — QĐ-113 (18/11/2026)

Spec: [SPEC.md](SPEC.md). Nhánh `feat/qd113` tạo từ `dev` (local). Làm tuần tự từng gói, mỗi gói một commit (hoặc vài commit nhỏ),
author theo git config của repo (không thêm co-author/attribution). **Không push**, không merge `dev`/`main` — coordinator push nhánh để
chạy CI GitHub.

## Cách kiểm mỗi gói (quick set)

`pnpm typecheck`, `pnpm lint`, `pnpm arch:check`, `pnpm rules:check`, `pnpm test:gates`, `pnpm openapi:export` (commit `openapi.json` nếu
đổi), cộng **test theo file** đã chạm (unit; http/integration của route/luật mới, `--maxWorkers=2`). Không chạy full suite — CI GitHub lo.
Mỗi luật mới: viết test đỏ trước, chạy thấy đỏ, rồi code cho xanh.

## Thứ tự

| # | Gói | Mức | Việc chính |
| --- | --- | --- | --- |
| 1 | P1 rút Request (`QĐ-113d`) | M | policy `checkWithdrawal` + `checkLineWithdrawal` + `canWithdrawOwn`; mã lỗi mới; mô tả controller + ví dụ lỗi; sửa test rút sau duyệt (dùng hoàn trả/hủy hệ thống hoặc rút trước duyệt tùy mục đích test) |
| 2 | P4 giá tham chiếu (`QĐ-113a`) | M | migration + Plan model/DTO/service/repo/mapper/policy; `priceOfPlan` fallback + facade worker; requestable-software định giá được; case B chép báo giá; README catalog |
| 3 | P3 ảnh phòng (`QĐ-113c`) | M | tách phần thuần kiểm ảnh ra infrastructure; cột + migration; PUT/DELETE avatar; `avatarUrl` trong response phòng; audit; README organization |
| 4 | P2 sửa xếp phòng lần đầu (`QĐ-113e`) | M–L | migration nới trigger cho placement đầu chưa hiệu lực; `PATCH /employees/:id/first-placement`; các luật từ chối; audit; thông báo khi đổi phòng; README personnel/organization |
| 5 | P5 seed | S | giá tham chiếu cho mọi gói trả phí demo, một gói chỉ có giá tham chiếu, (Claude Team Standard/Premium nếu có), một người xếp phòng tương lai; seed specs; `docs/guides/demo-dataset.md` |
| 6 | Tự review | S | đọc lại toàn bộ diff so SPEC; manifests OpenAPI/api-coverage; `docs/generated/routes.md`; DB role grants nếu thêm bảng |

## Báo cáo cuối (`REPORT.md` cùng thư mục)

Bảng gói → commit → test đã chạy (lệnh + kết quả thật). Mục `## Quyết định tự chọn` (D-n, không trái QĐ). Mục `## Nợ test` (test hỏng
ngoài phạm vi, không phải lỗi logic). Ghi rõ: `pnpm check` và full suites **chưa chạy** — chạy trên CI.
