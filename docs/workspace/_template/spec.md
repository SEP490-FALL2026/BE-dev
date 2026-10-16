# Spec: tên hạng mục

- Phụ trách: người hoặc AI sở hữu thiết kế, implementation, test và cập nhật plan/evidence.
- Thiết kế ban đầu bởi: Owner hoặc dev đã soạn/chốt đầu vào; có thể trùng người phụ trách.
- Thiết kế: draft. Owner review: chưa review; bổ sung trạng thái, ngày, revision và bằng chứng khi có.
- Nguồn: BRD link/revision/mục; US link/revision/US/AC; quyết định liên quan.
- Trạng thái yêu cầu và điều kiện thiết kế/code: ghi theo nguồn, gồm ERD nếu cần.
- [Kế hoạch](plan.md).

## Vấn đề và phạm vi

Điền người dùng, kết quả mong muốn, US/AC trong lát này, ngoài scope và phần US còn lại.

## Làm rõ yêu cầu

| Câu hỏi / mâu thuẫn | Kết luận hoặc blocker | Nguồn xác nhận / người / revision |
| ------------------- | --------------------- | --------------------------------- |

Phân biệt sự thật trong nguồn, giả định cần xác nhận và lựa chọn kỹ thuật.

## Hành vi và thiết kế

Mô tả luồng chính, biến thể, từ chối, quyền và ranh giới dữ liệu. API request/response/error; dữ liệu, constraint, transaction/concurrency; migration/tương thích; jobs/storage nếu có. Phần không liên quan ghi không áp dụng và lý do.

Ghi module sở hữu, dependency, lựa chọn và đánh đổi; link ERD/ADR nếu cần. Không dựng kiến trúc song song.

## Acceptance và kiểm chứng

| US/AC | Hành vi / tình huống | Cấp test và kết quả mong đợi | Bằng chứng sau implement |
| ----- | -------------------- | ---------------------------- | ------------------------ |

Bao gồm từ chối và edge case liên quan. Planned khác passed. Bằng chứng ghi lệnh, revision và môi trường, không chứa secrets.

## Sẵn sàng bàn giao

- [ ] Người nhận truy cập được nguồn và revision.
- [ ] Scope/AC/thiết kế rõ; dependency và điều kiện nguồn được đáp ứng.
- [ ] Không còn blocker cho phần sẽ implement; plan và spec thống nhất.
- [ ] Người phụ trách nhận ownership duy trì spec/plan/test design đến hết hạng mục.

## Thay đổi và nghiệm thu

Ghi thay đổi thiết kế/nguồn và lý do. Peer review nếu có ghi link và revision như bằng chứng bổ sung. Owner review cuối ghi AC đạt/chưa đạt, người xác nhận, revision, môi trường, PR và giới hạn. Chưa có xác nhận thật thì ghi chưa nghiệm thu.
