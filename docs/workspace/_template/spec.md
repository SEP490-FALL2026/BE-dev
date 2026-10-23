# Spec: tên hạng mục

- Phụ trách: người hoặc AI sở hữu thiết kế, implementation, test và cập nhật plan/evidence.
- Thiết kế ban đầu bởi: Owner hoặc dev đã soạn/chốt đầu vào; có thể trùng người phụ trách.
- Thiết kế: `draft`. Owner review: chưa review; bổ sung trạng thái, ngày, revision và bằng chứng khi có.
- Nguồn: Docs `<sha>` (BRD vX, US vY — Story/AC dùng thật, quyết định `QĐ-*`), BE `<sha>`. Không ghi "bản mới nhất".
- Nhóm roadmap: Gx — chỉ là planning container, không phải phạm vi của hạng mục này (xem `## Sizing decision`).
- [Kế hoạch](plan.md).

## Business outcome

Một câu: sau lát này ai làm được gì, quan sát/kiểm được bằng cách nào. Một hạng mục = một outcome / vertical slice;
hệ thống build và test được sau lát. Refactor không đổi hành vi và thay đổi hành vi là hai hạng mục khác nhau.

## Sizing decision

Bắt buộc cho hạng mục mới; quy tắc và ví dụ ở [work-item sizing](../../rules/work-item-sizing.md). Giữ đúng tên trường.

- Container: nhóm G, H-slice, bó finding hoặc yêu cầu trực tiếp đã giao — chỉ là container, không phải ranh giới.
- Mode: `single-story` | `grouped-stories` | `split-story` | `technical-enabler` (chọn một).
- Outcome and owner: outcome gắn kết duy nhất và capability sở hữu.
- Boundaries: transaction, dữ liệu/bảng, API, sự kiện/job, bảo mật/quyền.
- Not larger: vì sao không gom thêm Story/AC.
- Not smaller: vì sao không tách tiếp (tách theo tầng controller/service/repo không phải lý do).
- Siblings: tên hạng mục sibling/deferred (`` `ten-hang-muc` `` hoặc link spec), hoặc `none`.
- Scope map: một link mỗi nhóm G của Container tới `../../../roadmap.md#work-item-decomposition-g<n>`
  ([định dạng](../../rules/work-item-sizing.md#scope-map-của-nhóm-g)); `n/a` chỉ cho `technical-enabler` ngoài nhóm G.

## Primary Story/AC

| Story | AC  | Coverage | Phần còn lại thuộc |
| ----- | --- | -------- | ------------------ |

Mỗi dòng một Story; `Coverage` là `full`, `partial` hoặc `n/a`:

- `full` — `US-02-07` | `AC-1→AC-3` | `full` | `—`: dải AC chính xác sở hữu ở đây, không còn AC nào.
- `partial` — `US-02-01` | `AC-1, AC-6, AC-7` | `partial` | `` AC-2→AC-4: `g2-import-confirm` ``: AC sở hữu ở đây; cột
  cuối không rỗng, nêu hạng mục sibling/deferred sở hữu từng AC còn lại. Không ghi Story hoàn thành khi còn `partial`.
- `n/a` — `—` | `GATE2-01` | `n/a` | `` gỡ chặn `ten-hang-muc` ``: chỉ cho `technical-enabler`, không claim Story, nêu
  hạng mục phía sau.

Trên ba primary Story cần mục `## Size exception` với đủ `- Cohesion:`, `- Why not split:`, `- Checkpoints:`,
`- Maximum scope:`, `- Accepted by:` ([rule](../../rules/work-item-sizing.md#size-exception)); xóa ghi chú này khi điền.

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

Collection `GET` mới hoặc đổi: summary projection, biên/paging, thứ tự ổn định, detail/subresource tương ứng và kỳ vọng số
câu lệnh theo [API-LIST-DETAIL.1](../../rules/api-contract.md#collection-và-detail-api-list-detail1); ngoại lệ chỉ qua registry
của gate.

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
