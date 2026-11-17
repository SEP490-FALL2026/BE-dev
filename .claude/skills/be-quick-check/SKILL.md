---
name: be-quick-check
description: Use after finishing a BE item or fix round in this repo, to run the Owner's quick check set (typecheck, lint, arch, rules, gates, openapi drift, per-file tests) instead of `pnpm check` or full suites.
---

# BE quick check

Bộ kiểm tra nhanh Owner chốt từ 02/11/2026. **Không** chạy `pnpm check` hay full suite (mất ~15 phút); Owner chạy khi audit.

## Chạy theo thứ tự

1. `pnpm typecheck`
2. `pnpm lint` (type-aware, ~30 s/file — chấp nhận ở bước này)
3. `pnpm arch:check`
4. `pnpm rules:check`
5. `pnpm test:gates`
6. `pnpm openapi:export` rồi `git diff --stat openapi.json`: không được có drift ngoài ý muốn. Nếu API đổi có chủ đích, commit `openapi.json` cùng thay đổi.
7. Test **theo từng file đã sửa**: unit `pnpm jest <path>`, http `pnpm test:http -- <path>`, integration `pnpm test:integration -- <path>`.

Nếu một bước đỏ: sửa tối thiểu rồi chạy lại đúng bước đó, không chạy lại cả bộ.

## Báo cáo cuối

- Liệt kê lệnh đã chạy và kết quả từng bước, cùng danh sách test theo file cho từng item.
- Ghi rõ: "pnpm check và test toàn bộ CHƯA chạy — Owner chạy khi audit". Không được tuyên bố full suite xanh.
- Bước nào bỏ qua thì nói rõ lý do.

## Lưu ý

- Hook trong `.claude/settings.json` đã tự chạy prettier cho file `.ts` vừa sửa, và chặn sửa tay `dist/`, `openapi.json`, `pnpm-lock.yaml`, `.env*`.
- Với audit chỉ đọc (không triển khai), đừng chạy test nếu Owner chưa cho phép.
