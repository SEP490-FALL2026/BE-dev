# Roadmap backend

Theo dõi lát US/AC theo [quy trình](workspace/README.md). Trạng thái hạng mục nằm tại đây; checklist chi tiết nằm trong plan. Chưa nhập backlog hoặc xác nhận US hoàn thành. Catalog là module mẫu, không phải bằng chứng hoàn thành US.

## Hạng mục

| Hạng mục / spec / plan | US/AC hoặc enabler | Phụ trách / reviewer | Phụ thuộc | Thiết kế | Triển khai | PR / bằng chứng |
| ---------------------- | ------------------ | -------------------- | --------- | -------- | ---------- | --------------- |

Thêm dòng khi bắt đầu làm rõ một lát; xếp theo thứ tự dự kiến và ghi phụ thuộc bằng tên hạng mục. Không có trên bảng nghĩa là chưa theo dõi. Một US chia nhiều lát phải liệt kê AC mỗi lát và phần còn lại; chỉ ghi hoàn thành cả US khi mọi AC trong scope có bằng chứng.

## Trạng thái

- Thiết kế: draft → in-review → approved; blocked khi còn điều kiện chưa giải quyết; superseded khi thay thế, kèm link mới.
- Triển khai: not-started → in-progress → in-review → merged → accepted; blocked nếu chưa thể tiếp tục.
- accepted: AC trong scope được kiểm chứng và dev khác xác nhận, có revision/môi trường/bằng chứng. Không đồng nghĩa deploy production.
- blocked ghi nguyên nhân, người theo dõi và điều kiện gỡ. Không ghi phần trăm/ngày hoàn thành thiếu căn cứ.

Người phụ trách cập nhật khi giao review, được duyệt, mở/merge PR và nghiệm thu. PR trước merge giữ in-review; ghi merged sau sự kiện thật. Trạng thái yêu cầu BRD/US ghi ở spec, không trộn vào tiến độ này.

Nếu sau này dùng GitHub Projects quản lý tiến độ, chuyển trạng thái/assignee sang đó, đặt link ở đây và chỉ giữ milestone/phụ thuộc trong roadmap. Tránh hai bảng tiến độ song song.
