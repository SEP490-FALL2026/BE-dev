# ADR-0016: Ngữ cảnh `budgets` (C5) cho đề xuất và phiên bản ngân sách

## Trạng thái

**Proposed** — 23/10/2026, do người phụ trách G5 (AI theo giao việc của người dùng) đề xuất khi lập
[`g5-budget-proposal-and-review`](../workspace/items/g5-budget-proposal-and-review/spec.md). Proposed chưa phải Accepted: chưa có
sự kiện Owner review.

## Bối cảnh

Ngân sách là thứ Finance dựng từ đề xuất của trưởng phòng và Người duyệt chi quyết (`US-06-09`, `US-06-10`, `US-06-11`); Request
chỉ được kiểm tra với nó (`US-06-12`) và khoản cam kết giữ một phần của nó (`US-06-04`). [ADR-0015](0015-requests-context.md) để
Request, bước duyệt và định tuyến ở `requests` và nói rõ ngân sách, cam kết đi vào bảng riêng của các hạng mục sau. Ngân sách có
vòng đời và người dùng khác Request (Finance và Người duyệt chi, theo năm tài chính, không theo từng người xin) và `finance`
(tiền tệ, tỷ giá, hồ sơ thuế, phân bổ chi phí) không có khái niệm đề xuất hay phiên bản.

## Quyết định

1. Một module nghiệp vụ mới `budgets` (C5) sở hữu `budget_proposals`, `budget_proposal_lines`, `budget_versions`,
   `budget_version_lines`, `budget_version_line_changes` và các bảng ngân sách tiếp theo của G5 (bản ghi quyết phiên bản, khoản
   cam kết). Đây là bounded context mới vì có bảng, nghiệp vụ và vai riêng ([module structure](../rules/module-structure.md)).
2. **Hướng phụ thuộc:** `budgets → organization (Cost Center, trưởng phòng, ngày nghiệp vụ), identity-access (facade: ai giữ vai
Người duyệt chi), finance (tiền tệ, định dạng tiền), operating-parameters, audit`. `budgets` không import `requests`, `catalog`
   hay `licensing`. Ngược lại `requests → budgets (facade)`: phép kiểm ngân sách của một Request (`US-06-12`) đọc số liệu qua
   `BudgetsService` (`yearFacts`, `planLine`), và `requests` đăng ký một listener khi module khởi động
   (`registerChangeListener`) để nghe, trong transaction của thay đổi, khi một phiên bản được duyệt, bị từ chối hay bị trả lại, và
   khi một khoảng mua được dời. Khoản cam kết giữ id của Request và id của phép kiểm làm snapshot; CSDL giữ khóa ngoại cho cả hai để không có khoản nào
   không có Request (`US-06-09` AC-4), còn mã của `budgets` không đọc bảng của `requests`. Khoản cam kết do `requests` tạo trong
   transaction của quyết định duyệt chi qua `BudgetsService.holdForRequest` và đọc lại bằng `requestHoldsCommitment`.
3. **Ngân sách tính bằng tiền tệ báo cáo của tổ chức** (mọi dòng, mọi phiên bản), số nguyên đơn vị nhỏ nhất (ADR-0007). Dòng bằng
   tiền tệ khác bị từ chối thay vì quy đổi, vì quy đổi cần tỷ giá của một ngày và ngân sách không có ngày đó.
4. **Một phiên bản hiện hành, một phiên bản đang xử lý (`INV-21`) do CSDL bảo đảm**, bằng hai chỉ mục duy nhất một phần
   (`APPROVED`; `DRAFT`, `SENT`, `CHANGES_REQUESTED`) và một chỉ mục cho đề xuất đang chờ hay đang rà soát của cùng Cost Center và
   năm. Ứng dụng kiểm trước để trả lỗi rõ, và ánh xạ vi phạm khi hai người ghi đua nhau.
5. **Đề xuất không bao giờ sửa tại chỗ (`QĐ-82a`).** Rút, trả lại, nộp lại là đổi trạng thái và tạo đề xuất mới trỏ về đề xuất cũ;
   Finance chỉnh một **bản sao** các dòng trong phiên bản. Dòng của đề xuất gốc không có route sửa.
6. **Ai làm gì:** chỉ trưởng phòng của phòng đó nộp, rút, nộp lại đề xuất cho Cost Center `Unit` của phòng; chỉ Finance dựng, sửa,
   gửi phiên bản, trả lại đề xuất và đọc bảng ngân sách toàn công ty; trưởng phòng chỉ đọc đề xuất của mình, tổng và các dòng của
   phiên bản hiện hành của phòng mình, **không** đọc còn lại, kết quả kiểm tra hay số liệu phòng khác. Người duyệt chi quyết
   phiên bản (hạng mục sau), không sửa số (`QĐ-82f`).
7. **Không có ngân sách kiểm soát theo quý hay tháng (`QĐ-82e`).** Phân kỳ theo quý chỉ là dự báo, bốn quý cộng đúng tổng hoặc
   không lưu; một dòng kế hoạch không phải hạn mức (`QĐ-57c`).
8. Cảnh báo quá hạn của dòng là dẫn xuất khi đọc, theo mẫu của G2–G5.

## Hệ quả

- `PRISMA_MODEL_OWNER` thêm bảy model; `BudgetsModule` export đúng một contract, `BudgetsService`, ở `PUBLIC_CONTRACT_EXPORTS`.
- Ngưỡng giá trị cao của phiên bản là tỷ lệ trên phần còn lại và/hoặc một số tiền tuyệt đối (`QĐ-82c`); _còn lại_ = ngân sách
  trừ khoản đang giữ đã gắn và khoản đã thành chi phí (`FR-5.8`).
- Controller của `budgets` nằm trong chính module cho tới khi một worker cần nó.
- Các hạng mục sau của G5 thêm vào module này: quyết phiên bản (`g5-budget-version-decision`), kiểm tra ngân sách và Finance rà
  soát (`g5-budget-check-and-finance-review`), cam kết (`g5-commitment-creation`, đã làm: `CommitmentService`, `GET /budget-commitments` cho Finance; `g5-commitment-lifecycle`, đã làm: `releaseForRequest` cho cấp phát thất bại, rút, hủy và nhóm, sổ giải phóng, Finance giải phóng phần dư khi `requests` báo Request đã kết thúc qua `registerReleaseGuard`).
