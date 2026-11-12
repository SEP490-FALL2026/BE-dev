# OVERNIGHT-DECISIONS — điểm tự chốt khi Owner vắng (chế độ chạy đêm, 13/11/2026)

> Owner ngủ tới sáng, không ai trả lời. Gặp câu hỏi, chỗ SPEC mâu thuẫn code hay luật thiếu, chat code tự chọn theo thứ tự căn cứ:
> QĐ (`QD-110-DRAFT`, `QD-111-DRAFT`, sổ QĐ Docs) → BRD 4.13 → `OWNER-REVIEW.md` → SPEC/PLAN → code hiện có → thông lệ thực tế.
> Ưu tiên: đúng QĐ/BRD; đơn giản nhất; dễ đổi lại (không xóa dữ liệu, không drop, không đổi contract khó lùi); an toàn nghiệp vụ
> (không tự cấp quyền, không tự thu hồi khi chưa chắc). **Không** tự chốt điều trái một QĐ đã có: khi phương án tốt nhất trái QĐ, làm
> theo QĐ hiện hành và ghi đề xuất đổi ở đây.
>
> Mỗi mục: `D-n · gói/task · câu hỏi · phương án (ưu/nhược) · ĐÃ CHỌN + lý do + căn cứ · file/commit chạm tới · cách đổi nếu Owner chọn khác`.
> Commit message của task có điểm tự chốt thêm "(tạm chốt D-n)". Task bị chặn thật ghi ở mục "Bị chặn" cuối file.

## Điểm tự chốt

### D-1 · X0 (X0.0, X0.7) · Có ghi nhãn tương thích rollback (`DATA_REPRESENTATIONS` + nhãn Docker) cho các giá trị enum mới không?
- **Phương án A:** thêm ngay nhãn cho hai nguyên nhân hủy `SYSTEM_BENEFICIARY_LEFT/TRANSFERRED` (và các enum của X0.0) vào `src/modules/installation/public/recovery-target.policy.ts` + nhãn Docker. Ưu: bản cũ không chạy nhầm lên dữ liệu mới. Nhược: đụng cơ chế cài đặt/rollback, cần sửa Dockerfile và spec đếm nhãn; cả đợt chưa có enum nào làm vậy.
- **Phương án B:** chưa thêm; ghi vào danh sách việc trước release. Ưu: không đụng cơ chế cài đặt; `ADD VALUE` vốn không hoàn tác (DB-05), đã ghi ở HANDOFF X0.0. Nhược: bản trước X0 lỗi khi đọc dòng mang giá trị mới.
- **ĐÃ CHỌN: B.** Lý do: rollback về bản trước đợt này đã không an toàn vì `ADD VALUE`; cơ chế nhãn chỉ có ý nghĩa nếu cả đợt dùng, nên làm một lần ở pha cuối (Z) cho mọi enum/giá trị mới. Căn cứ: DB-05 (`docs/rules/database-business.md`), tiền lệ chỉ QĐ-93 có nhãn. Chạm: không có file.
- **Đổi nếu Owner muốn A:** thêm khóa vào `DATA_REPRESENTATIONS` cho từng giá trị, sửa `recovery-target.policy.spec.ts` và nhãn Docker `io.github.baophipham.slm.data-reads`.

### D-2 · X0.7 · `PAID_OLD_DEPARTMENT` có hủy case B (đề xuất phần mềm chưa có trong danh mục, đã có giá) không?
- **A:** hủy cả case B còn mở của người chuyển. Ưu: khớp chữ "Request trả phí còn mở" của `QĐ-110o`, người chuyển không để lại việc ở phòng cũ. Nhược: lúc gửi case B chưa biết là trả phí hay `K5` miễn phí (R-43) nên có thể hủy oan Request miễn phí.
- **B:** chỉ hủy Request `PAID_IN_CATALOG` loại `GRANT`/`RENEWAL`/nhóm (hiện trạng). Case B và Request miễn phí chuyển bước nhu cầu sang trưởng phòng mới (`QĐ-110o` vế sau).
- **ĐÃ CHỌN: B.** Lý do: an toàn (không hủy khi chưa chắc có phí), đơn giản, dễ đổi; vế sau `QĐ-110o` đã dùng cho Request nội bộ chưa chắc trả phí. Căn cứ: `QĐ-110o`, R-43. Chạm: `requests/cancellation/beneficiary-gone-scope.policy.ts` (đã có).
- **Đổi sang A:** thêm loại case B (giá đã biết) vào phạm vi `PAID_OLD_DEPARTMENT` ở policy + test.

### D-3 · X0.7 · `ALL_OPEN` tính theo người thụ hưởng: Request do người nghỉ gửi hộ người khác thì sao?
- **A:** để nguyên (người thụ hưởng còn làm việc vẫn cần phần mềm; người gửi đã chặn nên không còn thao tác). Ưu: không mất nhu cầu thật. Nhược: Request không còn người gửi để rút/trả lời yêu cầu bổ sung.
- **B:** hủy cả Request do người nghỉ gửi hộ. Ưu: không treo. Nhược: hủy nhu cầu còn hiệu lực của người khác.
- **ĐÃ CHỌN: A.** Lý do: `QĐ-110d` nói "Request còn mở của **người nghỉ**" (người thụ hưởng); hủy nhu cầu của người khác là trái ý. Treo (nếu có) do SLA và cảnh báo nghẽn đã có xử lý. Chạm: không có file. Đề xuất cho Owner: thêm luật "người gửi nghỉ ⟹ chuyển quyền rút cho trưởng phòng".

### D-4 · X0.7 · "Hàng việc IT" của `QĐ-110d` khi Request có tác vụ cấp đang chạy
- **A:** chỉ thông báo inbox `REQUEST_BENEFICIARY_GONE_IT_CHECK` (hiện trạng). Nhược: mất dấu khi đã đọc.
- **B:** thêm cờ/hàng đợi riêng cho IT. Ưu: bền. Nhược: thêm bảng/route, chưa có luật mô tả hình dạng.
- **ĐÃ CHỌN: A**, kèm đường đóng tay cũ của IT Admin (`POST /access-requests/{id}/cancellation`) và cờ `NEEDS_IT_CHECK` ở kết quả. Lý do: Owner ghét phức tạp, chưa có luật cho hàng đợi mới. Căn cứ: `QĐ-110d`, nguyên tắc "một thứ một nguồn". Đề xuất cho Owner: nếu muốn bền thì thêm bộ lọc "Request của người đã rời còn mở" vào danh sách Request của IT.

### D-5 · X0.6d · CLI `record-super-admin-event` giữ bốn cờ `--basis-*` hay đổi sang một cờ?
- **ĐÃ CHỌN: giữ bốn cờ**, đổi thành một câu khi ghi sự kiện (`groundsNoteOfBasis`). Lý do: `--from-notice` cần bốn phần cho chính thông báo (thông báo giữ form cũ, `QĐ-110`); đổi một cờ buộc bỏ `--from-notice` hoặc đổi form thông báo (trái QĐ). Chạm: không có file (hiện trạng).
- **Đổi nếu Owner muốn một cờ:** thêm `--basis <text>` cho mọi mode trừ `--from-notice`, cập nhật `record-super-admin-event.arguments.ts` + spec.

## Bị chặn

(chưa có)

## Dừng ở đâu

(chưa dừng)

## Tóm tắt cho Owner

(viết khi xong hết hoặc khi dừng)
