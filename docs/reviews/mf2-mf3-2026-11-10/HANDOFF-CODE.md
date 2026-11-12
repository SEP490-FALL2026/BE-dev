# HANDOFF-CODE — MF-2, MF-3 và các thay đổi đi kèm

> Chat code ghi **một dòng mỗi task** sau khi commit ([PLAN v2.3](PLAN.md) §0). Ghi lệnh và kết quả **thật** (số test xanh/đỏ), không ghi
> "chắc xanh". Lệch SPEC, câu hỏi cho Owner, số đếm SQL trước/sau migration (SPEC §6) và lựa chọn kỹ thuật PLAN yêu cầu ghi lý do (vd MF2-G
> sweeper hay listener) ghi ở cột tương ứng. Không ghi giờ.
>
> Nhánh `feat/mf2-mf3`; SPEC [v2.3](SPEC.md); pin Docs: `Docs main @ 373bb6b (QĐ-110 + QĐ-111 synced 13/11/2026)`. Gate cuối mỗi gói
> (`pnpm test:gates` + `pnpm rules:check`, S-5) ghi một dòng `<gói>-G`. Enum `ADD VALUE` (X0.0) ghi "không hoàn tác". Số tác vụ/notice/duty
> mở trỏ tới dòng `SERVICE` (X-SA.1b) ghi ở bảng đếm.

## Số đếm trước khi code (SPEC §6)

| Câu SQL / mục | Kết quả | Ngày |
| ------------- | ------- | ---- |
|               |         |      |

## Log task

| Task | Commit | Việc đã làm | Lệnh quick check + kết quả thật | Lệch SPEC / câu hỏi |
| ---- | ------ | ----------- | ------------------------------- | ------------------- |
|      |        |             |                                 |                     |

## Pha cuối chung (full test, seed, review)

| Bước | Lệnh / việc | Kết quả thật | Ghi chú |
| ---- | ----------- | ------------ | ------- |
|      |             |              |         |
