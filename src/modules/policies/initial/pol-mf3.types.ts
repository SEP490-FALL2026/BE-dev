import type { InitialPolicy } from './initial-policies.types';

/** POL-MF3: the text of the first version, from the approved set of policies (`QĐ-112b`, `Bộ chính sách khởi tạo.md` 1.0). */
export const POL_MF3: InitialPolicy = {
  code: 'POL-MF3',
  title: 'Chính sách điều chỉnh quyền khi nhân viên chuyển phòng',
  applicableRoles: ['MANAGER', 'IT_ADMIN'],
  content: {
    sections: [
      {
        heading: 'Mục đích',
        body: 'chuyển phòng không làm tích lũy quyền cũ — thu hồi rồi tự xin lại, không giữ seat; chi phí đi đúng phòng của người giữ.',
      },
      {
        heading: 'Phạm vi',
        body: 'mọi điều chuyển phòng có ngày hiệu lực (`MF-3`); không gồm đổi chức vụ hay thôi vai.',
      },
      {
        heading: 'Vai trò',
        body: 'Super Admin — ghi điều chuyển, kế nhiệm; Trưởng phòng mới — duyệt nhu cầu Request ở phòng mới; IT Admin phụ trách phòng mới — thu hồi quyền cũ; người chuyển — tự xin lại trong ân hạn.',
      },
      {
        heading: 'Quy định',
        body: '1. Super Admin ghi phòng mới đang hoạt động, ngày hiệu lực ≥ hôm nay và căn cứ (một ô chữ); tối đa một điều chuyển chưa đóng; người chuyển là trưởng phòng cũ ⟹ **bắt buộc** kế nhiệm (`QĐ-110n`, `QĐ-110h`, `QĐ-111bd`). — _Đối chiếu:_ Khớp chuẩn · [NIST PS-5](https://csf.tools/reference/nist-sp-800-53/r5/ps/ps-5/); [NIST AC-2](https://csf.tools/reference/nist-sp-800-53/r5/ac/ac-2/)\n2. **Ân hạn 5 ngày làm việc** (ngày hiệu lực là ngày 1) chỉ giữ quyền dùng phần mềm để công việc không gián đoạn trong lúc người chuyển xin lại quyền ở phòng mới; vai admin nhà cung cấp và IT phụ trách thuê bao ở phòng cũ chuyển ngay trong ngày hiệu lực (quy định 8); hệ thống nhắc người chuyển ngày 1 và 2 ngày làm việc trước khi hết (`QĐ-110p`). — _Đối chiếu:_ Nội bộ (đã sửa DX-09) · [NIST PS-5](https://csf.tools/reference/nist-sp-800-53/r5/ps/ps-5/); [CIS 6.2](https://controls-assessment-specification.readthedocs.io/en/latest/control-6/control-6.2.html)\n3. Người chuyển **tự gửi Request ở phòng mới** qua `MF-1` thường; Request cho phần mềm đang giữ không bị `GH-1` chặn và không tính `GH-1`/`GH-2`; không liên kết quyền cũ (`QĐ-110q`). — _Đối chiếu:_ Khớp chuẩn · [NIST PS-5](https://csf.tools/reference/nist-sp-800-53/r5/ps/ps-5/); [NIST AC-2](https://csf.tools/reference/nist-sp-800-53/r5/ac/ac-2/)\n4. Ngày hiệu lực: hệ thống tự hủy Request trả phí còn mở ở phòng cũ; **cam kết của quyền cũ giải phóng ngay**; phí seat trong ân hạn là thực chi của **phòng mới** theo seat-tháng (`QĐ-110o`, `QĐ-110r`, `QĐ-111bg`). — _Đối chiếu:_ Nội bộ — QĐ\n5. Hết ân hạn ⟹ hệ thống **tự tạo tác vụ thu hồi mọi quyền cũ**, giao IT Admin phụ trách phòng mới, dấu _hệ thống tạo_ (`QĐ-110p`). — _Đối chiếu:_ Khớp chuẩn · [CIS 6.2](https://controls-assessment-specification.readthedocs.io/en/latest/control-6/control-6.2.html); [NIST PS-4](https://csf.tools/reference/nist-sp-800-53/r5/ps/ps-4/)\n6. `K1` của người **vẫn làm việc**: chỉ tắt gia hạn và ghi bằng chứng, người chuyển phối hợp; **không** đặt lại mật khẩu, **không** khóa hộp thư (`QĐ-111az`, R-35). — _Đối chiếu:_ Nội bộ — QĐ\n7. Xin lại **đúng thuê bao** đang giữ: cấp lại kết thúc quyền cũ ngay, không thao tác ở nhà cung cấp, không tạo tác vụ thu hồi quyền đó (R-49). — _Đối chiếu:_ Nội bộ — QĐ\n8. Trách nhiệm ở phòng cũ (IT phụ trách thuê bao, admin nhà cung cấp) chuyển **ngay trong ngày hiệu lực**, không chờ hết ân hạn; IT làm tay theo hàng việc hiện có, cách chuyển như `POL-MF2` quy định 9 (`QĐ-110j`, `QĐ-110k`). — _Đối chiếu:_ Khớp chuẩn (đã sửa DX-09) · [ISO A.6.5](https://www.isms.online/iso-27001/annex-a-2022/6-5-responsibilities-after-termination-change-of-employment-2022/) (TT)\n9. Mọi tác vụ thu hồi quyền cũ xong ⟹ hệ thống lưu ảnh chụp quyền trước/sau và **tự đóng** điều chuyển (`QĐ-110r`). — _Đối chiếu:_ Tương tự thực tế · [NIST AC-2](https://csf.tools/reference/nist-sp-800-53/r5/ac/ac-2/)',
      },
      {
        heading: 'Ngoại lệ',
        body: 'phòng mới chưa có trưởng phòng ⟹ Request đứng chờ, ân hạn không dừng (`QĐ-110i`) · phòng mới chưa có Cost Center ⟹ Request chỉ lưu nháp · nghỉ việc trong ân hạn ⟹ `MF-2` tiếp quản (`QĐ-110r`) · thôi vai không phải điều chuyển, không áp ân hạn (`QĐ-106f`, R-21) · đổi chức vụ chỉ là sửa hồ sơ.',
      },
      {
        heading: 'Căn cứ',
        body: 'nội bộ `QĐ-110n`→`QĐ-110r`, `QĐ-111bd`, `QĐ-111bg`, `FR-2.16`.',
      },
      {
        heading: 'Tham chiếu',
        body: 'QT `3.1`→`3.8`; `BM-04`, `BM-09`; `SBF-13`, `SBF-16`, `SBF-18`.',
      },
    ],
    steps: [],
  },
};
