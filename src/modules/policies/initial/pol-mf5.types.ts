import type { InitialPolicy } from './initial-policies.types';

/** POL-MF5: the text of the first version, from the approved set of policies (`QĐ-112b`, `Bộ chính sách khởi tạo.md` 1.0). */
export const POL_MF5: InitialPolicy = {
  code: 'POL-MF5',
  title: 'Chính sách thu hồi seat không sử dụng',
  applicableRoles: ['MANAGER', 'IT_ADMIN'],
  content: {
    sections: [
      {
        heading: 'Mục đích',
        body: 'seat không dùng — có bằng chứng — được trưởng phòng quyết và thu hồi theo từng người, về kho dùng chung để cấp lại; phòng thôi chịu chi phí seat đó.',
      },
      {
        heading: 'Phạm vi',
        body: 'khuyến nghị ghost seat `G3`/`G4` tầng _Cần xem xét_ trở lên (kể cả IT đẩy sớm) và việc thu hồi sau quyết định (`MF-5` `5.4`, `5.5`); `G1` ở `POL-SAAS`, `G2` ở `POL-MF2`.',
      },
      {
        heading: 'Vai trò',
        body: 'Trưởng phòng của phòng người giữ seat — quyết _Giữ lại_ / _Thu hồi_ / _Tạm miễn trừ_; IT Admin — thu hồi, được trả lại khuyến nghị một lần; IT, Finance, Người duyệt chi, Super Admin không quyết thay.',
      },
      {
        heading: 'Quy định',
        body: '1. Trưởng phòng quyết từng seat kèm lý do trong **5 ngày làm việc**; quá hạn chỉ nhắc và báo cáo, **không** tự thu hồi (`FR-3.10`, `QĐ-66t`, `C-04`). — _Đối chiếu:_ Tương tự thực tế · [ServiceNow reclaim](https://www.servicenow.com/docs/r/yokohama/it-asset-management/saas-license-management/reclaiming-user-subscriptions-saas.html); [Torii](https://support.toriihq.com/hc/en-us/articles/24406268924955-License-opimization-workflow) (S)\n2. **Checklist `5.4`** trước khi quyết; có _Không_ ⟹ chỉ còn _Thu hồi_; quyết ghost seat không có _Trả về_ (`QĐ-111ap`, `QĐ-111be`, R-24). — _Đối chiếu:_ Nội bộ — QĐ\n3. Seat của **chính trưởng phòng**: tự quyết, lý do bắt buộc, cờ audit _tự quyết_; Finance xem danh sách quyết định _tự quyết_ trong rà soát quý và ghi nhận xét vào biên bản ký (`QĐ-104h`). — _Đối chiếu:_ Nội bộ (đã sửa DX-10) · [GAO](https://dof.ca.gov/media/docs/budget/Standards-for-Internal-Control-in-the-Federal-Government.pdf); [CU Handbook](https://www.cu.edu/controller/procedures/accounting-handbook/internal-controls) (S)\n4. _Tạm miễn trừ_ bắt buộc có thời hạn ≤ **12 tháng**, nhắc trước 7 ngày, hết hạn quay lại đánh giá; _Giữ lại_ ⟹ chu kỳ sau hỏi lại (`FR-3.10`). — _Đối chiếu:_ Tương tự thực tế · [Entra inactive](https://learn.microsoft.com/en-us/entra/identity/monitoring-health/howto-manage-inactive-user-accounts)\n5. Quyền có thời hạn còn ≤ **1 tháng** tới ngày hết — lúc quét hoặc lúc quyết ⟹ khuyến nghị tự đóng, để tự hết hạn (`QĐ-103j`, `QĐ-103y`). — _Đối chiếu:_ Nội bộ — QĐ\n6. IT Admin được **trả lại** khuyến nghị tối đa một lần kèm lý do kỹ thuật (`OI-02`). — _Đối chiếu:_ Nội bộ — QĐ\n7. _Thu hồi_ ⟹ IT gỡ **đúng người đó** sau ân hạn **7 ngày**, theo kiểu cấp; khi trưởng phòng quyết _Thu hồi_, IT Admin báo người giữ seat ngày gỡ dự kiến để họ lưu hoặc chuyển dữ liệu; `K1` của người vẫn làm việc chỉ tắt gia hạn và ghi bằng chứng; không hủy Request nhóm hay thuê bao (`QĐ-94j`, `C-18`, R-35). — _Đối chiếu:_ Tương tự thực tế (đã sửa DX-11) · [ServiceNow rule](https://www.servicenow.com/docs/bundle/zurich-it-asset-management/page/product/software-asset-management2/task/add-reclamation-rule-sub.html); [Multiplier](https://multiplierhq.com/blog/automated-license-reclamation-policies-notifications-and-downgrade-flows) (S)\n8. Thu hồi **không** đồng nghĩa giảm phí; tiết kiệm thực chỉ ghi khi hóa đơn kỳ sau thấp hơn (`C-14`). — _Đối chiếu:_ Tương tự thực tế · [Zylo workflows](https://zylo.com/blog/zylo-tips-using-workflows-to-reclaim-unused-saas-licenses)',
      },
      {
        heading: 'Ngoại lệ',
        body: 'seat tài khoản máy và người đang ân hạn điều chuyển không vào khuyến nghị (`QĐ-110m`, `QĐ-110p`) · phòng chưa có trưởng phòng ⟹ quyết định chờ có kiểm soát, Super Admin được cảnh báo (`C-07`) · thu hồi vì bảo mật (`MF-2`, `MF-3`) không áp luật 1 tháng.',
      },
      {
        heading: 'Căn cứ',
        body: 'nội bộ `FR-3.10`, `FR-4.12`, `QĐ-103j`, `QĐ-103y`, `QĐ-104h`, `QĐ-111be`, `C-04`, `C-14`. Các tham số 5 ngày làm việc, ân hạn 7 ngày, miễn trừ tối đa 12 tháng, nhắc trước 7 ngày và mốc còn 1 tháng là mặc định nội bộ do dự án chọn, tham khảo thông lệ (ServiceNow, Zylo, FinOps); không phải chuẩn (DX-21).',
      },
      {
        heading: 'Tham chiếu',
        body: 'QT `5.4`, `5.5`; sơ đồ `MF-5`, `SBF-18`.',
      },
    ],
    steps: [
      {
        code: '5.4',
        title: 'Quyết ghost seat · Trưởng phòng',
        checklist: [
          {
            code: '5.4-01',
            text: 'Người quyết là trưởng phòng hiệu lực của phòng người giữ seat',
            check: 'SYSTEM',
          },
          {
            code: '5.4-02',
            text: 'Khuyến nghị có gói bằng chứng đã chụp (nguồn, mốc thời gian, độ phủ, ngưỡng)',
            check: 'SYSTEM',
          },
          {
            code: '5.4-03',
            text: 'Người giữ seat vẫn cần phần mềm này cho công việc hiện tại',
            check: 'PERSON',
          },
          {
            code: '5.4-04',
            text: 'Có lý do cụ thể cho việc ít hoặc không dùng (nghỉ phép, dự án theo mùa, việc theo kỳ) và sẽ dùng lại',
            check: 'PERSON',
          },
          {
            code: '5.4-05',
            text: 'Thu hồi rồi xin lại khi cần qua `MF-1` sẽ gây gián đoạn công việc đáng kể',
            check: 'PERSON',
          },
          {
            code: '5.4-06',
            text: 'Chi phí giữ seat tới chu kỳ rà soát sau là hợp lý so với lợi ích',
            check: 'PERSON',
          },
        ],
      },
    ],
  },
};
