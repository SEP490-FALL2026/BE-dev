# HANDOFF-CODE-LANE-B — lane B của Prompt 3 (PL-1, PL-3, PF-1, BG-1, BG-2)

> Lane B chạy song song với lane A ([HANDOFF-CODE.md](HANDOFF-CODE.md), chỉ đọc). Nhánh `feat/fe-feedback-lane-b` (từ `fa87ca41`), worktree
> `be-fe-lane-b`. Một dòng mỗi task sau khi commit: task · commit · lệnh + kết quả thật · lệch SPEC. Migration dải riêng `2026111310xxxx`.
> Không sửa demo seed (`src/cli/seed/**`); mục "Seed cần cho Z2" và "Chạm chung lane A" ở cuối.

## Task đã commit

| Task   | Commit     | Lệnh và kết quả thật                                                                                                                                                              | Lệch SPEC / ghi chú                                                                                                                  |
| ------ | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| PL-1.1 | `3daefba1` | `pnpm arch:check` 0 vi phạm (2250 module); `pnpm typecheck` exit 0; `pnpm rules:check` 0 lỗi; `pnpm test:gates` 16 suite / 335 test xanh                                           | Module `policies` T3 chưa có capability; module card ghi "chưa có" cho public API/bảng, cập nhật theo từng task                      |
| PL-1.2 | `8e2cbcdd` | `pnpm prisma validate` xanh; `migrate deploy` lên DB tạm rồi `migrate diff --exit-code` = "No difference"; SQL tay thử 9 ca ràng buộc/trigger đúng; unit 16 test xanh; `test:gates` 335 xanh; `typecheck` exit 0 | Migration `20261113100000_pl1_policy_library`. `policy_versions` một bảng cho nháp và bản xuất bản (nháp = `version_number` NULL); `policy_acknowledgements` vào `RUNTIME_TABLE_EXCEPTIONS` |

## Chạm chung lane A

- (chưa có)

## Seed cần cho Z2

- (chưa có)
