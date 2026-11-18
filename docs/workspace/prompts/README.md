# Giao việc backend và bộ prompt dùng lại

Quy trình cho Owner giao **một phần G, một G hoặc nhiều G** cho một dev. Dev có thể tự làm hoặc dùng AI; người nhận vẫn
chịu trách nhiệm source, test, thiết kế và bằng chứng. Nguồn quy trình là [workspace](../README.md); nghiệp vụ và kiến
trúc lấy từ các nguồn được pin, không từ ví dụ trong bộ prompt.

## Giao ở đâu, lưu ở đâu

- Zalo hoặc công cụ nhắn tin: gửi phạm vi, người nhận, revision, nhánh, checkpoint và quyền Git theo mẫu dưới đây.
- Repo: workflow và prompt tại đây; scope map/tiến độ ở [roadmap](../../roadmap.md), spec/plan của từng outcome ở
  `docs/workspace/items/<tên-hạng-mục>/`, findings ở hạng mục hoặc `docs/reviews/` và có link từ plan.
- Quyết định đổi scope/hành vi trong chat phải được ghi vào nguồn quyết định hoặc spec phù hợp trước phần phụ thuộc;
  không sao chép BRD thành nguồn thứ hai. Không ghi nhật ký tiến độ vào prompt mẫu.

## Trước khi gửi tin giao việc

1. Chọn phạm vi: phần G phải ghi rõ Story/AC hoặc tên hạng mục đã có. G trọn lấy theo scope map/roadmap tại revision đã
   pin, trừ phần đã accepted, đã giao người khác, Deferred/Retired hoặc còn điều kiện chưa thỏa. Nêu các ngoại lệ rõ.
2. Cung cấp **BE commit và Docs commit/snapshot chia sẻ được**, cùng đường dẫn nguồn. Hai repo có revision riêng; chỉ
   nói “dev mới nhất” không đủ. Máy người nhận phải mở được nguồn. Working tree chưa commit của Owner không tự có trên
   máy dev khác; cần commit hoặc snapshot được chia sẻ kèm manifest/hash. Không đưa secret vào snapshot.
3. Chỉ định nhánh cá nhân và quyền cụ thể: tạo commit, push nhánh nào, có tạo PR không. Người nhận không merge vào `dev`,
   `main`, deploy hay sửa dữ liệu dùng chung theo quyền giao nhánh cá nhân.
4. Ghi checkpoint/hạn nếu có và yêu cầu dừng sau thiết kế nếu Owner muốn xem trước; nếu không, tiếp tục phần đã được giao
   khi đủ đầu vào. Mỗi bước dùng AI cần bàn giao trước khi người dùng chuyển model/phiên.

## Tin nhắn có thể copy cho AI

Owner điền các trường trong dấu `<...>` rồi gửi **khối chung và một dòng phạm vi**. Không gửi placeholder chưa điền làm
task thật. Dev tự làm dùng khối này như phiếu giao việc; dev dùng AI dán nguyên khối vào công cụ đang mở đúng repo BE.

### Khối chung

```text
GIAO VIỆC BACKEND
Người phụ trách: <tên dev>
Phạm vi: <chọn một mẫu phạm vi ở dưới>
Loại trừ / phần người khác đang giữ: <ghi rõ hoặc không có>
BE baseline: <commit SHA>; Docs baseline: <commit SHA hoặc snapshot + manifest/hash>
Nguồn nghiệp vụ: <repo/đường dẫn BRD, US và quyết định; phải truy cập được>
Nhánh cá nhân: <tên nhánh>; nhánh đích để Owner tích hợp: dev.
Hạng mục có sẵn: <đường dẫn spec/plan hoặc chưa phân rã>
Quyền Git: tạo commit trên nhánh cá nhân; <được push lên origin/<nhánh> / chưa được push>;
<được tạo PR vào dev / chưa được tạo PR>. Owner là người merge và nghiệm thu.
Checkpoint / hạn: <mốc thống nhất hoặc chưa ấn định>; Owner xem thiết kế trước code: <có/không>.

Đọc AGENTS.md, CONTRIBUTING.md, ARCHITECTURE.md và docs/workspace/prompts/README.md.
Theo workflow và rules chuyên đề; mỗi G phải phân rã Story/AC, không gom cả G thành một spec khổng lồ.
Phụ trách thiết kế, audit thiết kế, implement source/test, audit code, validate API và regression, cập nhật bằng chứng.
Thiếu quyết định nghiệp vụ hoặc dependency: ghi blocker, hỏi đúng phần thiếu và tiếp tục phần độc lập.
Không tự mở rộng scope, sửa tiêu chí cho khớp code hoặc ghi Owner đã duyệt.

Nếu dùng AI: bắt đầu prompt 01-design.md, chỉ làm bước 01 trong lượt đầu và bàn giao.
Sau đó người dùng lần lượt chọn model và gọi prompt 02 → 03 → 04 → 05 → 06.
Nếu hạng mục đã qua bước nào có bằng chứng tại revision tương thích, xác minh rồi tiếp quản ở bước còn thiếu.
Nếu tự làm: thực hiện cùng các bước/đầu ra, không cần gọi AI.
```

### Ba cách ghi phạm vi

```text
Một phần G:
Giao phần <tên chức năng> của G<n>: <US-xx-yy + AC cụ thể hoặc hạng mục đã có>.
Không bao gồm các phần khác của G<n>. Phần AC còn lại thuộc <hạng mục/người sở hữu đã ghi trong roadmap>.

Một G:
Giao G<n> theo roadmap/scope map tại baseline đã ghi; bạn phụ trách phân rã và làm các phần còn lại trong scope.
Loại trừ: <đã accepted/đã giao người khác/ngoài scope; ghi mã hoặc hạng mục>.

Hai G:
Giao G<n> và G<m> theo roadmap/scope map tại baseline đã ghi.
Phân rã từng G và dependency giữa chúng; tích hợp từng lát đủ đầu vào, không đợi xong cả hai mới bàn giao.
Loại trừ: <mã/hạng mục cụ thể hoặc không có>.
```

Hai G là container trách nhiệm, không cho phép bỏ qua điều kiện research hay giành phần đang có chủ. Nếu phạm vi phần G
chỉ mô tả bằng lời chưa ánh xạ được AC, bước 01 phải làm rõ ranh giới trước khi code. Không tự nhận phần lân cận.

## Cách dev dùng các prompt

| Bước | File                                                       | Model khi dùng AI          | Đầu ra để chuyển bước                                                  |
| ---- | ---------------------------------------------------------- | -------------------------- | ---------------------------------------------------------------------- |
| 01   | [Thiết kế](01-design.md)                                   | Opus theo cấu hình Owner   | Scope/ownership rõ; spec/plan/test matrix; blockers và dependency      |
| 02   | [Audit và sửa thiết kế](02-review-design.md)               | Opus, nên dùng phiên mới   | Findings có disposition; thiết kế đủ đầu vào, không tự ghi Owner duyệt |
| 03   | [Implement source và test](03-implement.md)                | Sonnet theo cấu hình Owner | Code/test/tài liệu khớp; kiểm tra trọng tâm đạt                        |
| 04   | [Audit và sửa implementation](04-review-implementation.md) | Opus, nên dùng phiên mới   | Đối chiếu source/test với AC, sửa findings và kiểm tra lại phần sửa    |
| 05   | [API thật và regression](05-validate-regression.md)        | Sonnet theo cấu hình Owner | Bằng chứng chạy trên cây cuối, AC đã validate và giới hạn              |
| 06   | [Commit và bàn giao](06-handoff.md)                        | Sonnet theo cấu hình Owner | Commit đúng phạm vi, push/PR nếu được giao, báo cáo để Owner review    |

Model Owner đã nêu cho luồng này là **Opus 5.5** ở 01/02/04 và **Sonnet 5.5** ở 03/05/06. Đây là nhãn cấu hình do Owner
chọn, không phải xác nhận các model đó có sẵn trong công cụ. Người dùng tự chọn model trong UI/CLI; prompt không tự
chuyển model. Nếu không có lựa chọn đó, ghi rõ model thực dùng và thống nhất lựa chọn thay thế với Owner; không giả vờ
đã chạy đúng model. Dev tự làm không cần model. Skill dùng theo khả năng của công cụ, không bắt cài một gói riêng.

Thực hiện 01–05 **theo từng hạng mục**, có thể chuẩn bị hạng mục tiếp theo khi dependency cho phép. Với cả G/hai G,
chạy regression toàn gói trên cây cuối trước bước 06. Không thiết kế toàn bộ backlog thành một phiên quá lớn.
Review bằng AI khác phiên không tự là peer review của một dev khác khi nguồn yêu cầu người thật.

## Đầu vào chung của mỗi bước

Dán tin giao việc, chọn file prompt và bổ sung:

```text
Hạng mục đang làm: <đường dẫn thư mục và spec/plan/test-plan nếu có>
Giai đoạn: <01..06>; phần được làm trong lượt này: <task/phase/hạng mục>
Review/finding đang mở: <đường dẫn + mã hoặc không có>
Revision source và thiết kế đã review: <SHA; nếu chưa commit ghi snapshot/manifest/hash>
Môi trường kiểm thử: <local riêng; không chứa connection string/secret>
Điểm tiếp tục: <task/checkpoint hoặc bắt đầu>
```

Mỗi phiên đọc lại AGENTS/CONTRIBUTING/ARCHITECTURE và các rule liên quan tại checkout đang làm; đối chiếu nguồn pin.
Không nạp toàn bộ ADR/BRD mỗi lượt nếu đã xác định được các mục liên quan. Thiếu file thì chỉ rõ đường dẫn và tác động;
không tự suy baseline cũ là hiện hành. Thiết kế/review phải chỉ ra code/test/dependency thực sự có, không chỉ đọc spec.

Nếu `dev` đã đổi từ baseline, đánh giá diff/contract/migration và tích hợp vào nhánh cá nhân theo quy trình nhóm, giữ
phần việc của người khác. Thay đổi chạm giả định của thiết kế hoặc kết luận review thì quay lại bước liên quan; không
đánh dấu review cũ vẫn áp dụng một cách mặc định.

## Kiểm thử và bằng chứng

Thực hiện theo [test guide](../../../test/README.md) và [CONTRIBUTING](../../../CONTRIBUTING.md). Test đi cùng code;
bước 05 kiểm chứng cây cuối, không phải tới đó mới viết test. “API/data thật” nghĩa là backend chạy thật, PostgreSQL
test riêng và dữ liệu giả lập có đáp án; không dùng database dùng chung hoặc dữ liệu cá nhân thật. Mock/HTTP contract
không chứng minh integration hay E2E. Nhà cung cấp ngoài chỉ claim live-tested khi thực sự có sandbox/quyền và kết quả.

- Trong từng lát: test trọng tâm ở đúng tầng (unit, gate, HTTP contract, integration, E2E smoke), chạy lại khi sửa có tác động.
- Bàn giao gói thay đổi chức năng: `pnpm check`, full `pnpm test:http`, `pnpm openapi:export`, full
  `pnpm test:integration`, `pnpm test:integration:serial`, `pnpm test:e2e`. Theo test guide về DB riêng và build CLI.
  Không chạy lại gate chỉ để tăng số lần; cây đổi sau kiểm chứng thì chạy lại phần bị ảnh hưởng, rộng hơn khi rủi ro yêu cầu.
- Lát chỉ tài liệu: `pnpm rules:check`, `pnpm rules:format`, kiểm diff; không bật DB hoặc chạy test API chỉ vì dùng prompt.
- Ghi lệnh, revision hoặc fingerprint cây làm việc, môi trường, số test/kết quả, AC được chứng minh, lỗi và phần chưa chạy
  tại `Verification and handoff` của plan. Không lưu token/password, raw response chứa dữ liệu cá nhân hay log dài vào chat.
- Không sửa test/fixture, bỏ test, nới gate chỉ để xanh. Sửa kỳ vọng phải có căn cứ yêu cầu/contract; findings ngoài scope
  ghi riêng, không lặng lẽ refactor toàn repo. Thiếu hạ tầng hoặc gate đỏ phải báo rõ, không claim `verified` toàn gói.

## Handoff, findings trả lại và Owner merge

Dev chỉ commit phần được giao, không `git add .` trên cây có thay đổi khác. Xác nhận đúng nhánh, review staged diff và
quét secret. Có quyền push thì chỉ push nhánh cá nhân đã ghi; không force-push, merge `dev`/`main` hay deploy từ quyền này.
Không tự thay nhánh/checkouts hay reset để xóa thay đổi người khác.

Khi Owner trả findings, dán tin gốc + findings và gọi 03 cho phần sửa, 04 review lại, 05 kiểm chứng, 06 commit bàn giao.
Nếu findings đổi nghiệp vụ/thiết kế thì quay 01/02 trước. Giữ finding, kết luận và revision trong plan/review thay vì
xóa dấu vết. Mỗi lần tiếp quản chỉ đọc lại phần cần thiết, không làm lại bước đã có bằng chứng tương thích.

Owner merge vào `dev`, kiểm diff tích hợp và chạy CI/kiểm chứng phù hợp trên **merge SHA**; giải quyết xung đột có thể làm
mất hiệu lực test/review cũ. Owner review implementation và bằng chứng cuối; chỉ ghi `merged-dev`, `accepted`, `released`
sau sự kiện thật theo roadmap. Bộ prompt không tự cấp quyền nghiệm thu.
