# QĐ-95 — một vai, tự phục vụ, seed hợp nhất và CI shard (04/11/2026)

Hồ sơ của gói sửa BE theo `QĐ-95` (Owner 04/11/2026): câu lệnh giao Codex, báo cáo triển khai của Codex và sổ audit của
phiên review. Spec, plan và test matrix của từng hạng mục nằm trong `docs/workspace/items/<slug>/`:

- [qd95-one-role-per-account](../../workspace/items/qd95-one-role-per-account/plan.md): mỗi tài khoản đúng một vai trực tiếp,
  `PUT /app-users/{id}/role` thay grant/revoke.
- [qd95-self-service-every-role](../../workspace/items/qd95-self-service-every-role/plan.md): mọi vai dùng màn tự phục vụ.
- [unified-seed-reset](../../workspace/items/unified-seed-reset/plan.md): một lệnh `seed`, wrapper local và VPS, bỏ `dev:seed`
  và `demo-dataset`.
- [ci-integration-shards](../../workspace/items/ci-integration-shards/plan.md): integration chia ba shard song song.

## Bản giao

- Codex triển khai bốn nhánh xếp chồng, đầu là `feat/unified-seed-reset` `5e42e186`.
- Review và sửa trên `fix/qd95-seed-audit` (8 commit `fb6caebb..9d2e3cd7`, cùng `b873ff1a`), merge vào `dev` qua PR #27
  (`db9e098f`).
- Vận hành VPS (dọn DB, deploy, seed): runbook và nhật ký ở [seed](../../guides/seed.md#dựng-lại-vps-một-lần-trước-release-qđ-95--owner-thực-hiện).
- Log test thô không đưa vào repo.

## Thứ tự đọc

| Thư mục                            | Nội dung                                                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| [prompts/](prompts/)               | `codex-qd95-seed-ci-prompt.md`: câu lệnh giao Codex (chỉ implement, chạy test đơn giản).                     |
| [implementation/](implementation/) | `codex-qd95-seed-ci-report.md`: báo cáo của Codex theo từng hạng mục và task.                                |
| [audit/](audit/)                   | `findings.md`: sổ finding (A CI, B tự phục vụ, S seed, R một vai), commit sửa và các finding đóng không sửa. |

## Kiểm chứng

| Lượt | Commit     | Kết quả                                                                                                                                                                                                                       |
| ---- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| w1   | `5e42e186` | Full trên bản Codex: http 1 đỏ (số operation); integration 27 suite đỏ (201→200, body `roles[]`, trigger cũ, test seed); serial 1 đỏ; e2e 2 đỏ; timing xanh; `check` đỏ ở `arch:docs:check`                                   |
| w2   | `a893ce57` | File đỏ của w1 + file đã sửa: integration 40/40 suite (457 test), serial 3/3, e2e 2/2; http 1 đỏ (mã quyết định lọt vào mô tả OpenAPI, sửa ở `b873ff1a`)                                                                      |
| w3   | `9d2e3cd7` | http `openapi-presentation` 13/13; `check`: rules, format, prisma, lint, typecheck, unit 343 suite / 4558 test, gates 325, arch, discovery, build xanh; `test:scripts` 302/306 — 2 đỏ chỉ do môi trường máy review (xem dưới) |

Hai test script đỏ ở `bootstrap-installation.test.mjs` không do code: worktree review checkout `.env.bootstrap.example`
bằng CRLF (`core.autocrlf=true`), và assertion `includes('BOOTSTRAP_')` khớp biến `TEST_DATABASE_BOOTSTRAP_URL` runner
review export. CI Linux không gặp.

## Việc còn lại

- Lượt `seed:local` có reset thật; bước 2–4 của runbook VPS (deploy, seed, kiểm tra).
- Chạy thử CI shard trên GitHub và đo hai run `main` (plan `ci-integration-shards`).
- Cập nhật tài liệu API cho FE (repo Docs, `Figma UI-UX/API-Integration`) theo contract mới.
