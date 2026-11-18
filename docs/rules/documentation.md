# Quy ước tài liệu

- [README](../../README.md): giới thiệu, setup, link bắt đầu.
- [CONTRIBUTING](../../CONTRIBUTING.md): workflow, lệnh kiểm tra, tiêu chí PR.
- `docs/rules/`, `docs/guides/`: quy tắc chuyên đề và thao tác cụ thể đã đối chiếu với code/lệnh.
- `docs/architecture/`: thiết kế chi tiết khi task thực sự cần.

## Trách nhiệm từng loại tài liệu

Mỗi sự thật có **một nguồn chính**; nơi khác chỉ mô tả ngắn và link tới nguồn đó.

| Tài liệu                                                            | Nội dung thuộc về nó                                                                                                                               | Không tích lũy ở đây                                                                                          |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| [AGENTS](../../AGENTS.md) (adapter của từng công cụ chỉ dẫn vào nó) | Điểm bắt đầu cho AI/dev: file cần đọc, rule quan trọng, lệnh kiểm tra, cách bàn giao; adapter không sao chép rule                                  | Danh sách lát đã code, commit/PR, lịch sử test, tiến độ chi tiết từng Story/AC                                |
| [ARCHITECTURE](../../ARCHITECTURE.md)                               | Kiến trúc hiện hành: bản đồ source, trách nhiệm module, chiều phụ thuộc, pipeline/luồng xử lý, invariant và giới hạn kỹ thuật đang đúng trong code | Nhật ký merge, trạng thái review/nghiệm thu, kết quả test theo revision, checklist triển khai, mã remediation |
| [Roadmap](../roadmap.md)                                            | Tiến độ nhóm G và từng lát: trạng thái, phụ thuộc, revision/PR, link tới spec/review                                                               | Thiết kế chi tiết, log test dài                                                                               |
| `docs/workspace/items/*/spec.md`, `plan.md`                         | Scope Story/AC của hạng mục, thiết kế, task triển khai, dependency, việc còn lại và verification của lát                                           | Quy tắc chung sao chép từ toàn repo                                                                           |
| `docs/reviews/**`                                                   | Đã kiểm tra gì, trên revision nào, kết quả, finding và giới hạn                                                                                    | Quy tắc kiến trúc mới chưa được thống nhất; trạng thái hiện hành không có nguồn                               |
| `docs/decisions/` (ADR)                                             | Quyết định kỹ thuật, bối cảnh, lựa chọn thay thế, trạng thái và hệ quả                                                                             | Nhật ký thực hiện, tiến độ Story, log test dài                                                                |

Khi thay đổi:

- Cấu trúc hoặc hành vi kiến trúc hiện hành đổi → cập nhật ARCHITECTURE.
- Cách AI/dev phải làm việc đổi → cập nhật AGENTS hoặc rule/guide mà nó dẫn tới.
- Một lát hoàn thành hoặc đổi trạng thái → cập nhật roadmap, plan của hạng mục và review/bằng chứng.
- Quyết định kỹ thuật tốn kém để đảo ngược → ADR.
- Chi tiết riêng một hạng mục → spec/plan của hạng mục đó.
- Không chép log test, danh sách commit/PR hoặc tiến độ Story vào AGENTS hay ARCHITECTURE. Một tham chiếu commit, mã
  finding hay trạng thái ADR chỉ ở lại đó khi nó là caveat/invariant người đọc cần để hiểu thiết kế, kèm link tới nguồn
  chính.

Không có checker chứng minh phần ngữ nghĩa này; người review đối chiếu bảng trên khi đọc diff tài liệu.

Spec/plan lưu trên Git tại [workspace](../workspace/README.md), dùng mẫu chung và liên kết [roadmap](../roadmap.md). Chỉ workspace/local/ là scratch bị ignore. Task nhỏ không đổi nghiệp vụ/contract có thể dùng issue/PR. Không bắt skill/AI cụ thể. Người phụ trách sở hữu thiết kế, implementation, test và việc duy trì plan; peer review của dev khác là tùy chọn. Owner review cuối trước `main`/production. AI không tự xác nhận Owner đã phê duyệt hoặc nghiệm thu. BRD/US phải truy cập được và có revision trong spec.

Phân biệt **Proposed**, **Accepted**, **Superseded/Deprecated** với **Implemented/Verified**.
Muốn nói đã verified phải có kết quả chạy đúng source và phạm vi kiểm tra.
Đổi quyết định được chấp nhận bằng ADR mới; giữ ADR cũ và ghi liên kết thay thế.
Cập nhật [chỉ mục](../README.md) trong cùng thay đổi.

Không dựng kiến trúc thứ hai ở `docs/ARCHITECTURE.md`. Dùng link tới nguồn sở hữu,
không lặp cả đoạn chỉ để giúp mọi file tự đầy đủ. Khi chuyển nội dung, sửa link
của tài liệu đang dùng; tài liệu lịch sử cần ghi rõ phạm vi không còn áp dụng.
Không lưu secrets, dữ liệu thật hoặc đường dẫn cá nhân vào tài liệu chung.

Trước bàn giao: `pnpm rules:check`, `pnpm rules:format`, đọc diff. Bộ kiểm tra
có phạm vi tường minh trong `rules-check.config.json`; không chứng nhận toàn bộ
link trong các snapshot lịch sử hoặc nội dung trang web bên ngoài.
