# Spec: tên hạng mục

- Phụ trách: người hoặc AI sở hữu thiết kế, implementation, test và cập nhật plan/evidence.
- Thiết kế ban đầu bởi: Owner hoặc dev đã soạn/chốt đầu vào; có thể trùng người phụ trách.
- Thiết kế: `draft`. Owner review: chưa review; bổ sung trạng thái, ngày, revision và bằng chứng khi có.
- Nguồn: Docs `<sha>` (BRD vX, US vY — Story/AC dùng thật, quyết định `QĐ-*`), BE `<sha>`. Không ghi "bản mới nhất".
- Nhóm roadmap: Gx — chỉ là planning container, không phải phạm vi của hạng mục này.
- [Kế hoạch](plan.md).

## Business outcome

Một câu: sau lát này ai làm được gì, quan sát/kiểm được bằng cách nào. Một hạng mục = một outcome / vertical slice;
hệ thống build và test được sau lát. Refactor không đổi hành vi và thay đổi hành vi là hai hạng mục khác nhau.

## Primary Story/AC

| Story | AC  | Coverage | Phần còn lại thuộc |
| ----- | --- | -------- | ------------------ |

`Coverage` là `full`, `partial` hoặc `n/a`. `partial` ghi vế đã làm ở cột AC và item/nhóm sở hữu phần còn lại; không ghi
Story hoàn thành khi còn AC `partial`. Mục tiêu **1–3 primary Story**; nhiều hơn chỉ khi cùng một outcome và cùng
transaction boundary, kèm mục `## Size exception` giải thích lý do và người chấp nhận. Technical enabler không có Story
ghi một dòng `—` | mã TE/finding | `n/a`.

## Supporting references

Story/AC/quyết định/ADR chỉ để truy vết hoặc giải thích. **Không** tính là đã implement và không được chép lên roadmap như
AC đã giao.

## Explicit out of scope

Những gì người đọc dễ tưởng thuộc lát này nhưng không thuộc, kèm nơi sẽ làm (item/nhóm) nếu đã biết.

## Dependencies and blockers

Item/migration/quyết định phải có trước; blocker kèm người theo dõi và điều kiện gỡ. Migration đi trước code phụ thuộc
nó và tách thành task riêng.

## Ownership: module, data, API

Module/capability sở hữu ([module structure](../../rules/module-structure.md)); bảng đọc/ghi; operation HTTP/CLI thêm hoặc
đổi; contract phải giữ nguyên. Ghi nếu cần Nest submodule hoặc bounded context mới và điều kiện nào của rule áp dụng.

## Behavior and design

Luồng chính, biến thể, từ chối, quyền và ranh giới dữ liệu; API request/response/error (mã ổn định); transaction,
concurrency, khóa; migration và tương thích ngược; jobs/storage. Phần không áp dụng ghi `không áp dụng` và lý do. Không
dựng kiến trúc song song; link ERD/ADR nếu cần.

## Test matrix

| AC / rủi ro | Tình huống (gồm từ chối, edge case) | Cấp test | Kết quả mong đợi | Bằng chứng sau implement |
| ----------- | ----------------------------------- | -------- | ---------------- | ------------------------ |

Planned khác passed. Bằng chứng ghi lệnh, revision và môi trường, không chứa secret hay token.

## Definition of Done

- [ ] Mọi primary AC `full` có test đỏ-trước/xanh-sau ở cấp phù hợp; AC `partial` ghi đúng vế đã làm.
- [ ] Gate theo [CONTRIBUTING](../../../CONTRIBUTING.md) chạy xanh trên revision cuối; HTTP đổi thì e2e + OpenAPI.
- [ ] Spec/plan/roadmap phản ánh implementation cuối; contract đổi đã ghi và báo consumer FE.
- [ ] Không tăng legacy ledger kiến trúc; nếu gỡ được mục nào thì xóa mục đó.
- [ ] Tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.

## Changes and acceptance

Ghi thay đổi thiết kế/nguồn và lý do. Peer review nếu có ghi link và revision. Owner review cuối ghi AC đạt/chưa đạt,
người xác nhận, revision, môi trường, PR và giới hạn. Chưa có xác nhận thật thì ghi chưa nghiệm thu.
