# Hoàn tất G2–G4: kiểm kê, quyết định và kế hoạch (21/10/2026)

- Phụ trách: AI theo giao việc Owner. Owner review: chưa review. Peer review: chưa có.
- Nền: BE `5f3b2b3` (nhánh `Bao_dev_be`) cộng cây làm việc chưa commit; Docs `9416fe0` (BRD v3.46, US v0.15). Môi trường: Windows, Node 24.0.2, pnpm 11.1.3, PostgreSQL 17 trong Docker (`127.0.0.1:55432` cho integration).
- Phạm vi: mọi lát G2, G3, G4 **không bị chặn**. Bốn lát `blocked` (`g3-downstream-finance-integration`, `g4-device-dependent-features`, `g4-request-and-transfer-integration`, `g4-notification-delivery`) giữ nguyên `blocked`; không làm giả G5–G8.

## 1. Baseline đo được trước khi sửa

| Lệnh                    | Kết quả                                                                                                                                                          |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm check`            | **Đỏ** lúc đầu: một dòng chưa format trong `test/integration/plan-http.integration-spec.ts`. Sau `prettier --write` đúng một tệp: exit 0, 136 suite / 1970 test. |
| `pnpm test:e2e`         | Xanh: 32 suite, 811 test.                                                                                                                                        |
| `pnpm test:integration` | 96/97 suite, 1279/1282 test. Ba test đỏ ở `departments-http`: ngày cứng `2026-10-20` (xem Task A1), không phải lỗi nghiệp vụ.                                    |

## 2. Phát hiện chính từ bảy lượt kiểm kê (đã đối chiếu AC nguyên văn)

Mỗi lát được đối chiếu AC với mã và test bởi một lượt đọc độc lập chỉ-đọc; không lượt nào chạy test. Kết quả theo lát:

| Lát                                | AC phủ                                     | Khoảng trống thật                                                                                                                                 |
| ---------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `g3-catalog-retire`                | Đủ                                         | OpenAPI thiếu mã lỗi mới; khóa nhân viên `FOR SHARE` khi xác nhận (INV-06); hai repo cùng ghi `applications`; test race chỉ một lần chạy          |
| `g3-subscription-seat-guards`      | AC-6 vế xác nhận baseline **chưa có test** | Test race không tất định; mã lỗi thiếu trong OpenAPI                                                                                              |
| `g3-license-key-vault`             | Đủ (AC-3, AC-12 một phần có chủ đích)      | Schema env không kiểm `LICENSE_KEY_VAULT_PREVIOUS_KEYS`; chưa buộc khác `OUTBOX_PAYLOAD_KEY`; chưa có runbook xoay khóa                           |
| `g3-contract-documents`            | AC-2, AC-9, AC-10b một phần                | Lỗi kho lưu trữ ra 500 thay vì 503; không kiểm byte đầu tệp; tài liệu còn ghi "chưa mount" kho lưu trữ                                            |
| `g3-standard-toolset`              | AC-4, AC-12 test yếu                       | Test AC-4 không seed Assignment; thiếu test `mine` (chức vụ ngừng, chưa có placement, cặp chưa có bộ); trigger không chặn INSERT vào phiên bản cũ |
| `g4-provisioning-queue-manual`     | Đủ                                         | Đồ thị trạng thái chỉ do ứng dụng giữ; test AC-13 yếu                                                                                             |
| `g4-provisioning-failure-handling` | AC-3, 6, 12, 13 một phần có chủ đích       | Nhánh `selfExecuted` của quyết định chưa test; AC-11 dựng task bằng SQL; đồ thị trạng thái không có ràng buộc DB                                  |
| G2 còn chờ G3/G4                   | Phần lớn đã xong                           | `US-02-02` AC-15 vế ngày vào làm; `US-01-04` AC-13 vế "áp cho tác vụ tạo sau"; hai test chéo lát                                                  |

Mọi spec/plan/roadmap của các lát G3/G4 vẫn ghi `chưa chạy` / `not-started` dù mã, migration và test đã nằm trong `5f3b2b3`; số operation trong spec (121–133) lệch thực tế 143.

## 3. Điều mình **không** sửa vì thiếu căn cứ nghiệp vụ (câu hỏi cho Owner)

Các mục này làm đổi hành vi nhưng nguồn chưa chốt hoặc chốt khác spec; ghi lại, không tự quyết.

| #   | Câu hỏi                                                                                                                                 | Vì sao chưa làm                                                                                              |
| --- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Q1  | Có chặn ngừng Cost Center `COMPANY` đang được Assignment tài khoản dịch vụ dùng không?                                                  | `OQ-B-18` còn mở, `US-04-09` không có AC.                                                                    |
| Q2  | `US-07-01` ghi cấm người thụ hưởng là chính IT Admin ngay khi **cấp**; spec chỉ áp lúc nhận, hoàn tất, báo lỗi.                         | Spec cố ý hẹp hơn US; cổng Request (G5) mới gọi `grant`.                                                     |
| Q3  | Một Request có thể được cấp hai lần trên hai thuê bao cùng gói; ràng buộc "một lần cấp mỗi Request" thuộc cổng Request hay bảng tác vụ? | Hợp đồng của `GRANT_REQUEST_GATE` thuộc G5. Mình ghi rủi ro vào spec của lát `g4-provisioning-queue-manual`. |
| Q4  | US nói Audit Trail ghi "bằng chứng chuyển làm tay"; spec giữ bằng chứng chỉ trên dòng tác vụ (tránh lộ bí mật).                         | Spec có chủ đích, kèm test; đổi cần Owner xác nhận (`OQ-D-02`).                                              |
| Q5  | Tài liệu của hợp đồng có cần route liệt kê và dọn tệp mồ côi (`AWAITING_UPLOAD`, `PENDING_ATTACH`) không?                               | Không có AC; là câu hỏi sản phẩm.                                                                            |
| Q6  | `attempts` về 0 khi thử lại có đúng ý "N lần thử lại" không (chu kỳ vô hạn)?                                                            | Spec đã chọn; chờ Owner review.                                                                              |
| Q7  | Gói của ứng dụng đã ngừng có được đưa vào bộ công cụ chuẩn không (`OQ-B-09`)?                                                           | Câu hỏi sản phẩm.                                                                                            |
| Q8  | Cần công cụ re-seal để bỏ khóa kho cũ khỏi cấu hình không?                                                                              | Mình chỉ viết runbook (Task B4); công cụ là phạm vi mới.                                                     |

## 4. Quyết định của mình (đánh dấu là quyết định của AI, chờ Owner)

- **D1.** Ngày vào làm (`US-02-02` AC-15): hàng import hiện trạng có ngày bắt đầu trước `hireDate` bị **từ chối cả hàng** với mã `EFFECTIVE_BEFORE_HIRE`; `grant` cho người chưa vào làm bị từ chối 409 `PROVISIONING.BENEFICIARY_NOT_STARTED`. Không tự dời ngày.
- **D2.** Tham số thử lại (`US-01-04` AC-13): giá trị tối đa được **chốt trên dòng tác vụ lúc tạo**; thay tham số không đổi tác vụ đã tạo.
- **D3.** Kiểm tệp (`US-04-04` AC-10): thêm kiểm byte đầu tệp theo loại khai báo (PDF/PNG/JPEG) khi hoàn tất; không quét mã độc.
- **D4.** Đồ thị trạng thái `provisioning_tasks` và tính bất biến của phiên bản bộ công cụ chuẩn được **ràng buộc thêm ở DB** (trigger), vì `database-business.md` yêu cầu bất biến ở tầng dữ liệu.

## 5. Kế hoạch task

Quy tắc chung cho mọi task: test đỏ trước, xem nó đỏ đúng lý do, mã tối thiểu, xem xanh, chạy lại suite liên quan; migration là task riêng đi trước mã dùng nó; không commit nếu chưa được yêu cầu.

### Phase A — hành vi G2/G4 còn thiếu

- **A1 — ngày trong test.** `departments-http.integration-spec.ts` dùng ngày cứng; đổi sang `today()`/`addDays()`. Verify: suite xanh 57/57 (đã làm). Rà thêm các test khác cứng ngày tương lai chạm placement; sửa nếu có.
- **A2 — ngày vào làm.** Files: `seat-baseline-rows.ts`, `provisioning.service.ts` (+ policy), test unit và integration của hai lát. Acceptance: không Assignment nào có hiệu lực trước `hire_date` (D1). Verify: test đỏ trước; đột biến bỏ kiểm tra làm test đỏ.
- **A3 — chốt giới hạn thử lại.** Migration thêm `max_attempts` cho `provisioning_tasks` (backfill từ giá trị hiện hành), service dùng giá trị trên dòng. Verify: tạo tác vụ A với N=3 và B với N=1; đổi tham số; A còn 4 lần, B còn 2.

### Phase B — G3

- **B1 — ngừng ứng dụng và seat guard.** Khóa nhân viên `FOR SHARE` khi xác nhận; chuyển `markRetired` về `ApplicationRepo`; test `GET .../retirement` của ứng dụng đã ngừng; test vế xác nhận baseline của AC-6; test race tất định bằng khóa giữ (mẫu của `departments-http`); mã lỗi vào OpenAPI.
- **B2 — bộ công cụ chuẩn.** Test AC-4 seed Assignment và đếm `provisioning_tasks`; test `mine` cho chức vụ ngừng, chưa placement, cặp chưa có bộ; đổi tên chức vụ → bộ hiển thị tên mới; migration chặn INSERT vào phiên bản đã ghi (D4).
- **B3 — tài liệu hợp đồng.** Ánh xạ lỗi kho lưu trữ sang 503 (có test kho lỗi); kiểm byte đầu tệp (D3) qua phương thức mới của port; mã lỗi tên tệp rỗng theo spec; test AC-6 sau thu hồi vai.
- **B4 — kho khóa.** Schema env kiểm `LICENSE_KEY_VAULT_PREVIOUS_KEYS` (định dạng, 32 byte, không khóa công khai) và buộc khác `OUTBOX_PAYLOAD_KEY`; sửa `docs/guides/containers.md`; viết runbook xoay khóa; đính chính spec (AAD có tiền tố miền).

### Phase C — G4

- **C1 — tác vụ cấp phát.** Migration trigger đồ thị trạng thái `provisioning_tasks` (D4) kèm test ràng buộc; test `selfExecuted` cho retry/hand-off/close; AC-11 đi qua `recordFailure`; test AC-13 khi baseline đã đóng.

### Phase D — tài liệu, bằng chứng, gate

- **D1.** Cập nhật spec/plan từng lát: bảng Verification có lệnh và kết quả thật, tick checklist, số operation 143, mã lỗi 422, tên hàm thật; đóng cột "chờ chạy".
- **D2.** `docs/roadmap.md`, `docs/workspace/items/README.md`: trạng thái đúng bằng chứng; sửa các dòng G2 ghi "chờ G3/G4" đã có mã; sửa "chưa mount" kho lưu trữ ở `ARCHITECTURE.md`, `README.md`, `compose.yaml`, `docs/rules/security-jobs.md`, spec env.
- **D3.** Gate cuối: `pnpm check`, `pnpm test:e2e`, `pnpm test:integration`, `pnpm openapi:export` (diff chỉ chứa thay đổi dự kiến), `pnpm exec prisma migrate diff` không lệch, `pnpm rules:check`.

## 6. Giới hạn

- Kết quả kiểm kê là đọc mã; chỉ những gì chạy được ở Phase D mới là bằng chứng.
- Chưa có remote CI, chưa chạy trên môi trường dùng chung, chưa có Owner/dev review. Không lát nào được ghi `accepted`.

## 7. Kết quả thực hiện (cùng ngày)

- **Đã làm:** A1 (test `departments-http` không còn cứng ngày), A2 (`EFFECTIVE_BEFORE_HIRE` và `BENEFICIARY_NOT_STARTED`), A3 (`max_attempts`, migration `20261021100000`), B1 (khóa nhân viên khi xác nhận ngừng, một repo ghi `applications`, test khóa tất định), B2 (test AC-4 và `mine`, migration `20261021110000`), B3 (kho lưu trữ → 503, kiểm byte đầu tệp), B4 (kiểm tra khóa kho, runbook), C1 (migration `20261021120000`, test `selfExecuted`, AC-11, AC-13, `US-01-11` AC-7), D (tài liệu).
- **Bằng chứng đỏ-trước:** mọi hành vi mới có test đỏ đúng lý do trước khi sửa. Với hành vi đã có sẵn (khóa, `selfExecuted`), test được kiểm bằng đột biến: bỏ khóa hoặc vô hiệu hóa trigger làm test đỏ, khôi phục thì xanh.
- **Không thể xảy ra:** "xác nhận baseline khi thuê bao quay về nháp" — ràng buộc `subscriptions_active_complete` cấm nên không có test; vế xác nhận được chứng minh qua ứng dụng đã ngừng.

Kết quả gate trên cây cuối (Windows, Node 24.0.2, pnpm 11.1.3, PostgreSQL 17 trong Docker):

| Lệnh                                                                                                                     | Kết quả                                                     |
| ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| `pnpm check`                                                                                                             | exit 0; unit và kiểm cấu trúc 138 suite, 2006 test          |
| `pnpm test:e2e`                                                                                                          | 32 suite, 811 test xanh                                     |
| `pnpm test:integration`                                                                                                  | 97 suite, 1307 test xanh                                    |
| `prisma migrate deploy` trên CSDL tạm, rồi `prisma migrate diff --from-config-datasource --to-schema prisma --exit-code` | không có khác biệt (exit 0)                                 |
| `pnpm openapi:export`                                                                                                    | chỉ đổi 14 dòng mô tả lỗi, không operation nào thêm hay đổi |

Lượt integration đầy đủ đầu tiên trong ngày (08:33) có hai suite đỏ: `department-tools-http` (fixture ngày vào làm của chính quy tắc mới, đã sửa) và `seat-baseline-import-constraints` ("Cannot drop disposable database", lỗi xóa CSDL tạm ngắt quãng đã ghi ở roadmap, xanh khi chạy riêng và ở lượt cuối).

### Giới hạn còn lại

- Không làm: bốn lát `blocked`, và mọi mục Q1–Q8 (cần quyết định của Owner).
- Kiểm byte đầu tệp bắt đầu ở vị trí 0 theo chữ ký PDF/PNG/JPEG; một PDF hiếm có dữ liệu thừa trước `%PDF-` sẽ bị từ chối. Liên kết tải lên dùng lại được 15 phút nên tệp đã xác minh vẫn có thể bị thay (ADR-0014).
- `ProvisioningService` có 10 phụ thuộc trong hàm khởi tạo (tín hiệu review là 6).
- Kho thật (S3/MinIO) chưa được kiểm chứng: test dùng kho trong bộ nhớ; adapter có test đơn vị với client giả.
- Các test cứng ngày tương lai chỉ được rà bằng đọc; chưa chạy với đồng hồ dịch sang ngày khác.
- Chưa chạy remote CI, chưa chạy trên môi trường dùng chung, chưa commit, chưa Owner hay dev review.
