import type { InitialPolicy } from './initial-policies.types';

/** POL-USAGE: the text of the first version, from the approved set of policies (`QĐ-112b`, `Bộ chính sách khởi tạo.md` 1.0). */
export const POL_USAGE: InitialPolicy = {
  code: 'POL-USAGE',
  title: 'Chính sách rà soát mức sử dụng và tối ưu chi phí',
  applicableRoles: ['IT_ADMIN', 'MANAGER'],
  content: {
    sections: [
      {
        heading: 'Mục đích',
        body: 'dữ liệu sử dụng được thu, khớp và đọc đúng mục đích, đủ tin cậy để đề xuất thu hồi và giảm seat, không biến thành công cụ giám sát cá nhân.',
      },
      {
        heading: 'Phạm vi',
        body: 'nạp usage, khớp danh tính, phát hiện seat lãng phí, IT đẩy sớm khuyến nghị (`MF-5` `5.1`→`5.3`, `SBF-04`, `SBF-04a`), chỉ số tối ưu chi phí (`C-14`).',
      },
      {
        heading: 'Vai trò',
        body: 'IT Admin — nạp và khớp usage, rà tầng _Theo dõi_, đẩy sớm; Trưởng phòng — nhận khuyến nghị từ tầng _Cần xem xét_, dùng mức dùng khi giải trình quý; Hệ thống — quét, lọc, phân tầng, lưu bằng chứng.',
      },
      {
        heading: 'Quy định',
        body: '1. **Nhịp quét:** `G1`/`G2` hằng ngày, `G3`/`G4` hằng tuần; _usage thấp_ chỉ là _không hoạt động_ (`G3`/`G4`), không có `G5` (`FR-4.12b`, `QĐ-111ay`). — _Đối chiếu:_ Tương tự thực tế · [ServiceNow M365](https://www.servicenow.com/docs/r/yokohama/it-asset-management/software-asset-management/o365-usage-activity.html) (S); [CloudEagle](https://cloudeagle.ai/optimize/license-harvesting) (S)\n2. **Nguồn:** file usage IT nạp qua xem trước, kết quả máy công ty đã ký `BM-06`, danh sách tài khoản từ trang quản trị nhà cung cấp; ứng dụng nhóm _Liên lạc_ không thu usage (`SBF-04a`, `SBF-05`, `SBF-08`, `ADR-10`). — _Đối chiếu:_ Tương tự thực tế · [ServiceNow rule](https://www.servicenow.com/docs/bundle/zurich-it-asset-management/page/product/software-asset-management2/task/add-reclamation-rule-sub.html); [Zylo workflows](https://zylo.com/blog/zylo-tips-using-workflows-to-reclaim-unused-saas-licenses)\n3. **Quyền đọc:** IT Admin chỉ đọc usage của phòng mình phụ trách; phòng chưa có IT phụ trách ⟹ mọi IT Admin đọc được; ghi (nạp, khớp) thì IT khác làm thay được (`QĐ-111ax`, R-20). — _Đối chiếu:_ Tương tự thực tế · [ICO](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/employment/monitoring-workers/data-protection-and-monitoring-workers/)\n4. **Riêng tư:** màn tổng hợp đo số ngày hoạt động + số ngày có dữ liệu; theo người chỉ trạng thái + mã nhân viên, không họ tên, ảnh, không xếp hạng; usage chỉ dùng cho cấp, thu hồi, tối ưu chi phí (`QĐ-111aw`, `QĐ-111au`, `OQ-03`). — _Đối chiếu:_ Khớp chuẩn · [Luật 91 Đ25](https://hethongphapluat.com/luat-bao-ve-du-lieu-ca-nhan-2025/dieu-25) (BT); [ICO](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/employment/monitoring-workers/data-protection-and-monitoring-workers/)\n5. **Khớp danh tính:** một định danh một nhân viên; bản ghi chưa khớp được khớp tay trong kết quả import và không dùng để kết luận (`QĐ-111ax`, `TC-4`). — _Đối chiếu:_ Tương tự thực tế · [Entra inactive](https://learn.microsoft.com/en-us/entra/identity/monitoring-health/howto-manage-inactive-user-accounts)\n6. **Tầng không hoạt động:** _Theo dõi_ 30–59 ngày · _Cần xem xét_ ≥ 60 · _Cần xử lý_ ≥ 90 hoặc chưa từng hoạt động; seat mới có 14 ngày ân hạn; qua đủ 8 cổng lọc mới sinh khuyến nghị (`FR-4.9`, `FR-4.12`, `FR-4.13`). — _Đối chiếu:_ Tương tự thực tế (đã xử lý DX-17, DX-21) · [ServiceNow rule](https://www.servicenow.com/docs/bundle/zurich-it-asset-management/page/product/software-asset-management2/task/add-reclamation-rule-sub.html); [Productiv](https://help.productiv.com/hc/en-us/articles/4406713891213) (S)\n7. **Đẩy sớm:** IT chỉ đẩy `G3`/`G4` từ _Theo dõi_ sang _Cần xem xét_, theo checklist `5.3`; không đẩy seat tài khoản máy hay người đang ân hạn điều chuyển (`QĐ-111ay`, `QĐ-111be`). — _Đối chiếu:_ Tương tự thực tế · [Zylo workflows](https://zylo.com/blog/zylo-tips-using-workflows-to-reclaim-unused-saas-licenses)\n8. **Không tự động hóa:** ít/không dùng chỉ là căn cứ xem xét; hệ thống không tự thu hồi hay tự chặn ứng dụng (`C-04`, `SoD-6`). — _Đối chiếu:_ Nội bộ — QĐ; lựa chọn có chủ đích, khác · [ServiceNow reclaim](https://www.servicenow.com/docs/r/yokohama/it-asset-management/saas-license-management/reclaiming-user-subscriptions-saas.html)\n9. **Tối ưu chi phí:** tỷ lệ chi phí seat _Trống_ vượt **10 %** chi phí kho ⟹ cảnh báo IT cấp lại hoặc giảm ở điểm điều chỉnh; báo cáo ba con số tách rời — tiềm năng, _tránh được_, thực — chỉ _thực_ là giảm chi (`C-14`, `C-12`). — _Đối chiếu:_ Nội bộ — QĐ (DX-21); tham khảo · [Zylo license waste](https://zylo.com/solutions/license-waste) (S)\n10. Rà soát quý hiện mức dùng và cam kết dài hạn; ít dùng xử lý qua `MF-5`, không rút thời hạn Request (`QĐ-111aj`). — _Đối chiếu:_ Tương tự thực tế · [FinOps](https://www.finops.org/framework/capabilities/budgeting/)',
      },
      {
        heading: 'Ngoại lệ',
        body: 'nguồn quá cũ hoặc thiếu cửa sổ dữ liệu ⟹ không chạy rule (`QĐ-101b`) · máy cá nhân, máy dùng chung là điểm mù, không thu (`SBF-05`) · tài khoản email cá nhân chỉ phát hiện được qua usage (`QĐ-111y`, R-18).',
      },
      {
        heading: 'Căn cứ',
        body: 'Luật 91/2025/QH15 (biện pháp công nghệ quản lý người lao động trên cơ sở người lao động biết rõ); nội bộ `QĐ-111aw`→`QĐ-111ay`, `QĐ-111be`, `OQ-03`, `ADR-10`, `FR-4.9`, `FR-4.12`, `FR-4.13`, `FR-5.10`. Các tham số 14 ngày ân hạn seat mới, 8 cổng lọc, 10 % seat trống và mốc 30/60/90 ngày là mặc định nội bộ do dự án chọn, tham khảo thông lệ (ServiceNow, Zylo, FinOps); không phải chuẩn (DX-21; 14 ngày giữ theo DX-17).',
      },
      {
        heading: 'Tham chiếu',
        body: 'QT `5.1`→`5.3`, A.4; `SBF-05`, `SBF-08`.',
      },
    ],
    steps: [
      {
        code: '5.3',
        title: 'Đẩy sớm khuyến nghị `G3`/`G4` · IT Admin',
        checklist: [
          {
            code: '5.3-01',
            text: 'Khuyến nghị `G3`/`G4` ở tầng _Theo dõi_, đã qua đủ 8 cổng lọc (nguồn còn mới, danh tính đã khớp, không phải seat tài khoản máy, không ân hạn)',
            check: 'SYSTEM',
          },
          {
            code: '5.3-02',
            text: 'Quyền có thời hạn còn trên 1 tháng tới ngày hết _Thời gian dùng_',
            check: 'SYSTEM',
          },
          {
            code: '5.3-03',
            text: 'Đã đối chiếu thêm một nguồn (trang quản trị nhà cung cấp hoặc nguồn usage khác): không hoạt động là thật, không do lỗi thu thập',
            check: 'PERSON',
          },
          {
            code: '5.3-04',
            text: 'Có lý do không chờ tới ngưỡng 60 ngày: điểm điều chỉnh hoặc kỳ gia hạn sắp tới, có Request chờ seat cùng gói, hoặc chi phí seat đáng kể',
            check: 'PERSON',
          },
          {
            code: '5.3-05',
            text: 'Không biết lý do chính đáng nào cho việc tạm không dùng (nghỉ phép ngắn chưa ghi, dự án theo mùa)',
            check: 'PERSON',
          },
          {
            code: '5.3-06',
            text: 'Đã ghi chú căn cứ đẩy sớm để trưởng phòng đọc khi quyết',
            check: 'PERSON',
          },
        ],
      },
    ],
  },
};
