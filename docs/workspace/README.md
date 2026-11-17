# Thiết kế và bàn giao theo User Story

Workspace được lưu trên Git để dev và AI cùng dùng. Chỉ local/ là nháp cá nhân bị ignore. Không bắt cài Superpowers hay dùng một AI cụ thể.

## Vai trò theo hạng mục

Mỗi hạng mục có một **người phụ trách** sở hữu xuyên suốt: làm rõ yêu cầu, hoàn thiện spec/plan và thiết kế test, implement source/test, cập nhật checklist cùng bằng chứng sau khi chạy. Người phụ trách có thể là người hoặc AI được giao việc. Không bắt buộc một dev khác review trước khi bắt đầu thiết kế, code hoặc tích hợp lên `dev`.

`Maintain` trong quy trình này nghĩa là giữ spec/plan/test design và tài liệu vận hành hoặc runbook bị ảnh hưởng luôn khớp với implementation, đồng thời ghi cách kiểm tra và bảo trì cho người tiếp theo. Nó không có nghĩa người hay AI của một phiên sẽ tự vận hành hệ thống mãi sau khi phiên kết thúc.

Roadmap ghi riêng **người thiết kế ban đầu** để biết ai đã soạn hoặc chốt đầu vào spec/plan/test/decision. Owner có thể thiết kế trước rồi giao dev implement; dev cũng có thể tự thiết kế và implement. Khi nhận hạng mục do người khác thiết kế, người phụ trách tiếp tục sở hữu việc duy trì tài liệu và phải cập nhật chúng nếu implementation làm rõ hoặc thay đổi thiết kế.

Owner BE là reviewer cuối của cả gói spec/plan/decision, source, test và bằng chứng trên một revision cụ thể trước khi đưa lên `main`/production. Peer review của dev khác được khuyến khích khi hữu ích nhưng là bằng chứng bổ sung, không phải gate bắt buộc — **trừ khi** requirement, decision hoặc spec đã pin yêu cầu cụ thể (ví dụ `US-01-10` _Business rules_: giá trị kỹ thuật về thời hạn lời mời/phiên, chính sách mật khẩu, giới hạn tần suất phải được dev khác review). Khi đó review là gate trước `accepted`: ghi người review, link và revision; chưa có thì ghi `pending`. AI không tự ghi Owner đã duyệt, peer review đã xong hoặc đã nghiệm thu.

Nếu nguồn mâu thuẫn hoặc cần đổi nghiệp vụ, người phụ trách ghi rõ câu hỏi, giả định và phần bị ảnh hưởng; không tự thay baseline nghiệp vụ. Có thể tiếp tục phần độc lập. Quyết định Owner đã có phải được cập nhật lại vào nguồn/spec để phiên sau không phụ thuộc chat.

## Cấu trúc

- _template/: hai mẫu chính spec.md và plan.md; test-plan.md tùy chọn.
- items/: một thư mục mỗi lát, tên ổn định như us-xx-yy-short-name hoặc issue-123-short-name; không cần bộ đếm riêng.
- local/: nháp cá nhân; không chứa đầu vào bàn giao duy nhất.
- research/: hướng dẫn nghiên cứu; kết quả theo hạng mục đặt cạnh spec.
- [Đề xuất lịch sử AI dùng MongoDB](proposals/ai-history-mongodb/spec.md): draft ngày 13/11/2026, chưa là work item
  `ready`; sau duyệt thiết kế mới phân rã và đăng ký theo mẫu bên dưới.
- [prompts/](prompts/README.md): cách giao một phần G, một G hoặc nhiều G; bộ prompt theo giai đoạn cho dev tự làm hoặc dùng AI.
- [Roadmap](../roadmap.md): thứ tự dự kiến, phụ thuộc và tiến độ hạng mục.

## Chia hạng mục theo vertical slice

**Chia việc thành hạng mục** theo [work-item sizing](../rules/work-item-sizing.md) — nguồn chuẩn duy nhất: nhóm G chỉ là
container giao việc; mỗi hạng mục là một outcome kiểm chứng độc lập, ghi `## Sizing decision` (một trong bốn chế độ
`single-story`, `grouped-stories`, `split-story`, `technical-enabler`), mỗi AC của nhóm G có đúng một chủ trong scope map
`### Work-item decomposition: Gx` của roadmap (lập trước hạng mục đầu tiên) và Size exception là bằng chứng đủ trường.
Phần còn lại dưới đây là cấu trúc spec/plan (nguồn: [audit nền tảng
18/10/2026](../reviews/be-foundation-audit-2026-10-18/README.md)):

- Tách **`Primary Story/AC`** (đã giao, mỗi dòng `full`/`partial`/`n/a` theo rule sizing) khỏi **`Supporting
references`** (chỉ truy vết, không tính là đã implement) và **`Explicit out of scope`**. Không ghi Story hoàn thành khi
  còn AC `partial`. Roadmap và items index chép đúng bảng Primary của spec.
- Spec ghi dependency/blocker, ownership module/data/API, transaction/concurrency/migration/tương thích khi áp dụng,
  test matrix theo AC (gồm từ chối và edge case) và Definition of Done.
- Mỗi task của plan có `Files`, `Depends on`, `Acceptance`, `Verify`; hạng mục nhiều phase ghi ranh giới phase/checkpoint.
  Refactor tách khỏi thay đổi hành vi; migration là task riêng đi trước code phụ thuộc nó. Mỗi lát để hệ thống
  build/test được và có checkpoint.
- Implementation làm rõ hoặc đổi contract ⟹ cập nhật spec/plan trong cùng thay đổi; lịch sử giữ bằng Git và nhãn
  _superseded_, không xóa bằng chứng.
- Header spec pin Docs `<sha>` và BE `<sha>`; trạng thái chỉ dùng từ vựng của [roadmap](../roadmap.md#trạng-thái).

`pnpm rules:check` enforce phần cấu trúc (mục bắt buộc, pin, từ trạng thái, cột `Coverage`, trường task, đăng ký ở
items index) và các quy tắc sizing máy kiểm được (liệt kê ở [rule sizing](../rules/work-item-sizing.md#phạm-vi-kiểm-tra-tự-động));
nó **không** chứng minh nội dung nghiệp vụ đúng. 16 hạng mục có trước 18/10/2026 nằm trong danh sách `legacy` của
`rules-check.config.json`: chỉ bị kiểm đăng ký, **không** sửa hàng loạt cho khớp mẫu và không coi là đã review lại.
Hạng mục legacy được chạm lớn thì chuyển sang mẫu mới và xóa khỏi danh sách. 14 hạng mục lập từ 18/10 tới trước GOV.1
(19/10/2026) nằm trong `sizingGrandfathered`: chỉ miễn mục `Sizing decision`. Cả hai danh sách chỉ co lại.

## Quy trình

Khi Owner giao một phần G, một G hoặc nhiều G, dùng [hướng dẫn nhận việc và prompt mẫu](prompts/README.md).
Tin giao việc xác định phạm vi và quyền thao tác; spec/plan, scope map và tiến độ vẫn nằm ở các nguồn hiện hữu bên dưới.
Nếu dùng AI, thực hiện các bước thiết kế → audit thiết kế → implement/test → audit implementation → validate/regression
→ commit/bàn giao theo bộ prompt. Dev tự làm cũng theo cùng đầu ra và tiêu chí, không bắt buộc dùng AI.

1. Chọn lát US/AC hoặc technical enabler; kiểm tra roadmap tránh trùng, ghi người phụ trách và người thiết kế ban đầu. Hai vai có thể cùng một người.
2. Người phụ trách dùng mẫu trong `_template/` để tạo hoặc tiếp quản spec/plan. Ghi [nguồn BRD/US](sources.md) có revision, phạm vi, quyết định và câu hỏi. Chỉ tạo research.md/test-plan.md khi chúng có nội dung riêng cần duy trì.
3. Làm rõ hành vi, API, dữ liệu, quyền, lỗi, migration, thiết kế test và cách kiểm chứng. Phần không liên quan ghi không áp dụng cùng lý do. Khi đủ đầu vào để code, đánh dấu thiết kế `ready`; trạng thái này không có nghĩa Owner đã duyệt.
4. Người phụ trách implement source/test theo spec/plan, tự review diff theo AC, cập nhật checklist và kết quả thực chạy ngay trong hạng mục. Nếu implementation làm đổi hành vi/contract hoặc cách vận hành, cập nhật spec/plan và tài liệu/runbook liên quan cùng thay đổi; không để tài liệu mô tả bản cũ.
5. Có thể nhờ dev khác peer review ở bất kỳ thời điểm nào và lưu link/bằng chứng, nhưng không bắt buộc chờ peer review để bắt đầu hoặc tiếp tục phần không bị blocker. Peer review do nguồn bắt buộc (mục trên) phải xong trước `accepted`.
6. Sau khi kiểm chứng đạt, có thể tích hợp lên `dev` theo quy trình Git của nhóm. Ghi `merged-dev` theo sự kiện thật; trạng thái này chưa phải Owner nghiệm thu và chưa cho phép tự đưa lên `main`/production.
7. Owner review cuối trên revision cụ thể, đối chiếu spec/plan/decision, source, test, AC và bằng chứng. Nếu cần sửa, ghi `changes-requested`; nếu đạt, ghi `accepted` cùng Owner, revision, môi trường và bằng chứng. Chỉ revision `accepted` mới đủ điều kiện đưa lên `main`/production; `released` chỉ ghi sau sự kiện triển khai thật.

Task nhỏ không đổi nghiệp vụ/contract dùng issue/PR với scope, kiểm tra và review. Quyết định kiến trúc lâu dài ghi ADR, liên kết từ spec thay vì sao chép.

Trong luồng giao dev khác, người nhận commit/push nhánh cá nhân theo quyền trong tin giao việc; **Owner** merge vào `dev`
và review cuối. Sau merge phải kiểm chứng revision `dev` đã kết hợp các thay đổi: kết quả trên nhánh cá nhân không thay
cho kết quả cây sau merge. Findings trả lại đi qua cùng vòng sửa → audit → kiểm chứng; không tự ghi Owner đã nghiệm thu.

## Nguồn và bàn giao

Mỗi spec ghi link/revision/US/AC thực sự dùng, không chỉ nói “bản mới nhất”. Nguồn chưa commit cần snapshot chia sẻ có version/hash. Không copy toàn bộ BRD vào spec. Trạng thái BASELINED/OWNER-PROVISIONAL/... không phải tiến độ code; tuân theo điều kiện của nguồn. Nguồn đổi thì đánh giá ảnh hưởng và review lại thiết kế liên quan, giữ lịch sử bằng Git.

Giao đường dẫn spec/plan, revision đầu vào, phạm vi task và môi trường kiểm tra. Người nhận làm được từ checkout và nguồn chung, không phụ thuộc chat. Prompt mẫu:

> Đọc AGENTS.md và spec/plan của hạng mục được giao. Đối chiếu revision đầu vào với code hiện tại. Tiếp quản và cập nhật spec/plan/test design khi cần, implement phần được giao, tự review diff theo AC, kiểm tra theo CONTRIBUTING và test guide, cập nhật tài liệu/runbook bị ảnh hưởng; ghi kết quả thực chạy và phần chưa kiểm chứng. Làm rõ blocker trước khi làm phần phụ thuộc. Không tự ghi Owner đã phê duyệt hoặc nghiệm thu.

## Skill và subagent cho AI

Repo bắt buộc **quy trình và kết quả kiểm chứng**, không bắt một AI hoặc gói skill cụ thể. Dev dùng Claude chỉ cài Superpowers vẫn đủ để làm theo workflow này. Khi có Superpowers, dùng bộ nhỏ theo đúng pha:

| Pha                        | Skill nên dùng                                    | Mục đích                                                                                          |
| -------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Bắt đầu task               | `using-superpowers`                               | Chọn đúng workflow trước khi đọc/sửa file                                                         |
| Làm rõ hoặc thiết kế mới   | `brainstorming`                                   | Chốt phạm vi, giả định, lựa chọn và AC; chỉ dùng khi còn điểm chưa rõ hoặc có quyết định thiết kế |
| Viết/cập nhật plan         | `writing-plans`                                   | Chia lát theo dependency, nêu file, test và điều kiện hoàn thành                                  |
| Implement plan đã sẵn sàng | `executing-plans`, `test-driven-development`      | Làm từng lát, có test hành vi và kiểm tra sau mỗi lát                                             |
| Điều tra lỗi/test đỏ       | `systematic-debugging`                            | Tìm nguyên nhân và tạo ca tái hiện trước khi sửa                                                  |
| Trước khi báo hoàn thành   | `verification-before-completion`                  | Chạy gate trên mã cuối và báo đúng phần chưa kiểm chứng                                           |
| Nhờ review khi cần         | `requesting-code-review`, `receiving-code-review` | Kiểm tra diff hoặc xử lý finding; peer review vẫn là tùy chọn                                     |

Không cần gọi mọi skill trong một task. Spec/plan đã `ready` thì không chạy lại brainstorming nếu không xuất hiện câu hỏi hoặc quyết định mới. Tên skill có thể khác trên công cụ khác; dùng workflow tương đương. Mẫu, vị trí và trạng thái trong repo này vẫn là nguồn bàn giao chính; không sinh bộ song song ở `docs/superpowers/`.

`subagent-driven-development` hoặc cơ chế subagent khác chỉ dùng khi có từ hai phần **độc lập** với phạm vi file, đầu vào và tiêu chí hoàn thành rõ. Agent chính giữ trách nhiệm tích hợp, review từng kết quả, chạy gate trên cây cuối và báo cáo. Các subagent không được đồng thời sửa cùng file, dùng chung database kiểm thử có thể phá hủy, tự đổi baseline nghiệp vụ, tự ghi Owner đã duyệt, hoặc commit/push/merge/deploy khi chưa được giao. Task nhỏ, thay đổi xuyên suốt một flow hoặc sửa transaction dùng một agent để tránh phân mảnh context.

## Kiểm tra và Git

Chạy pnpm rules:check và pnpm rules:format từ gốc BE. Checker kiểm tra Markdown trong workspace trừ local/; không chứng nhận nội dung web, quyền truy cập, tính đúng nghiệp vụ hay phê duyệt. Người phụ trách kiểm tra trong lúc làm; Owner đối chiếu lại ở review cuối.

Commit template, spec/plan, sources và roadmap cùng thay đổi liên quan. Không commit secrets, dữ liệu thật, chat/cache hay cấu hình skill cá nhân. Không cần đưa cả thư mục trên máy lên Git.
