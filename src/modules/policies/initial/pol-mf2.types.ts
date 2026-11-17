import type { InitialPolicy } from './initial-policies.types';

/** POL-MF2: the text of the first version, from the approved set of policies (`QĐ-112b`, `Bộ chính sách khởi tạo.md` 1.0). */
export const POL_MF2: InitialPolicy = {
  code: 'POL-MF2',
  title: 'Chính sách thu hồi quyền khi nhân viên nghỉ việc',
  applicableRoles: ['MANAGER', 'IT_ADMIN'],
  content: {
    sections: [
      {
        heading: 'Mục đích',
        body: 'người đã rời công ty không còn quyền ở bất kỳ ứng dụng nào; seat về kho để cấp lại hoặc giảm ở kỳ sau; hồ sơ được giữ.',
      },
      {
        heading: 'Phạm vi',
        body: 'mọi sự kiện nghỉ việc, gồm quyền (`K1`, `K2`, `K4`, `K5`) và trách nhiệm (trưởng phòng, IT Admin phụ trách thuê bao, admin nhà cung cấp) của người nghỉ (`MF-2`).',
      },
      {
        heading: 'Vai trò',
        body: 'Super Admin — xác minh `BM-09`, ghi sự kiện, chỉ định kế nhiệm; Trưởng phòng — gửi `BM-09`, xử lý dữ liệu nghiệp vụ ngoài hệ thống; IT Admin — khóa tài khoản công ty, thu hồi từng quyền, chuyển thuê bao; Hệ thống — chặn đăng nhập, tự hủy Request, tự đóng hồ sơ.',
      },
      {
        heading: 'Quy định',
        body: '1. Sự kiện nghỉ việc chỉ có hiệu lực khi **Super Admin** ghi kèm **căn cứ** ngoài hệ thống (một ô chữ, vd. _QĐ nghỉ việc số 12/2026_); `BM-09` chỉ là thông báo, không bao giờ là căn cứ; không lưu lý do nghỉ (`C-06`, `QĐ-110a`, `QĐ-111bd`). — _Đối chiếu:_ Khớp chuẩn · [NIST AC-2](https://csf.tools/reference/nist-sp-800-53/r5/ac/ac-2/); [ISO A.6.5](https://www.isms.online/iso-27001/annex-a-2022/6-5-responsibilities-after-termination-change-of-employment-2022/) (TT)\n2. **Hai nhịp** theo ô _chặn ngay_: có ngày làm việc cuối ⟹ hệ thống tự chặn khi hết ngày đó; chặn ngay ⟹ ngày cuối = ngày ghi, chặn trong ngày (`QĐ-110b`). — _Đối chiếu:_ Khớp chuẩn · [NIST PS-4](https://csf.tools/reference/nist-sp-800-53/r5/ps/ps-4/); [CIS 6.2](https://controls-assessment-specification.readthedocs.io/en/latest/control-6/control-6.2.html)\n3. Người nghỉ là trưởng phòng ⟹ **bắt buộc** chỉ định kế nhiệm khi ghi; việc đang chờ chuyển sang kế nhiệm ở ngày kế nhiệm có hiệu lực, hạn không đặt lại (`QĐ-110h`). — _Đối chiếu:_ Khớp chuẩn · [ISO A.6.5](https://www.isms.online/iso-27001/annex-a-2022/6-5-responsibilities-after-termination-change-of-employment-2022/) (TT); [NIST PS-4](https://csf.tools/reference/nist-sp-800-53/r5/ps/ps-4/)\n4. Tới mốc chặn, hệ thống **tự hủy** Request còn mở của người nghỉ, giải phóng cam kết chưa chi; không bắt đầu tác vụ cấp mới cho người đó (`QĐ-110d`). — _Đối chiếu:_ Nội bộ — QĐ\n5. **Chặn tài khoản công ty** = đặt lại mật khẩu hộp thư + đăng xuất mọi phiên, đồng thời gỡ email/số điện thoại khôi phục cá nhân (nếu có), thu hồi mật khẩu ứng dụng, khóa bảo mật và quyền OAuth đã cấp, xóa dữ liệu công ty trên thiết bị di động — **trước hoặc đồng thời** với gỡ ở nhà cung cấp; **khóa hẳn hộp thư** chỉ sau khi xong checklist `K1`. Hộp thư được đặt lại mật khẩu thay vì vô hiệu hóa ngay vì checklist `K1` cần hộp thư nhận email _Quên mật khẩu_ (`BM-08` (1a)(1b), `QĐ-110b`, R-1). — _Đối chiếu:_ Tương tự thực tế (đã sửa DX-08) · [Google offboarding](https://knowledge.workspace.google.com/admin/users/maintain-data-security-after-an-employee-leaves); [Microsoft Entra](https://learn.microsoft.com/en-us/entra/identity/users/users-revoke-access)\n6. IT Admin mở tác vụ thu hồi **sau khi chặn**, xong **≤ 1 ngày làm việc** sau mốc chặn; quá hạn nhắc IT Admin phụ trách và Super Admin mỗi ngày làm việc (`QĐ-110c`). — _Đối chiếu:_ Khớp chuẩn · [NIST PS-4](https://csf.tools/reference/nist-sp-800-53/r5/ps/ps-4/); [CIS 6.2](https://controls-assessment-specification.readthedocs.io/en/latest/control-6/control-6.2.html)\n7. **Thu hồi theo kiểu cấp:** `K1` theo checklist — đặt lại mật khẩu hộp thư ⟹ _Quên mật khẩu_ trên phần mềm ⟹ đăng xuất mọi phiên ⟹ tắt gia hạn ⟹ ghi bằng chứng ⟹ khóa hộp thư; `K2` gỡ khỏi workspace, seat về kho _Trống_; `K4` ghi cách xử lý khóa; `K5` bằng chứng (`C-18`, `QĐ-111az`, `QĐ-111p`). — _Đối chiếu:_ Tương tự thực tế · [Microsoft Entra](https://learn.microsoft.com/en-us/entra/identity/users/users-revoke-access)\n8. Hệ thống **không lưu mật khẩu** và không điều khiển Google/M365; IT tick đủ checklist kèm bằng chứng mới hoàn tất được (`QĐ-111q`, `QĐ-111az`). — _Đối chiếu:_ Tương tự thực tế · [CIS 6.2](https://controls-assessment-specification.readthedocs.io/en/latest/control-6/control-6.2.html)\n9. **Trách nhiệm:** IT Admin phụ trách chuyển mọi thuê bao và mục danh mục bằng một thao tác; tới mốc chặn chưa chuyển ⟹ hàng việc IT chung; admin nhà cung cấp còn < 2 ⟹ cờ, còn 0 ⟹ hàng việc IT; việc chưa chuyển không chặn đóng hồ sơ (`QĐ-110j`, `QĐ-110k`, R-26). — _Đối chiếu:_ Khớp chuẩn · [NIST PS-4](https://csf.tools/reference/nist-sp-800-53/r5/ps/ps-4/); [ISO A.6.5](https://www.isms.online/iso-27001/annex-a-2022/6-5-responsibilities-after-termination-change-of-employment-2022/) (TT)\n10. **Không** có bước bàn giao dữ liệu trong hệ thống — dữ liệu nghiệp vụ trong SaaS do Trưởng phòng xử lý ngoài hệ thống trước mốc chặn (`QĐ-110g`). — _Đối chiếu:_ Khớp chuẩn · [NIST PS-4](https://csf.tools/reference/nist-sp-800-53/r5/ps/ps-4/); [Google offboarding](https://knowledge.workspace.google.com/admin/users/maintain-data-security-after-an-employee-leaves)\n11. Hệ thống **tự đóng** hồ sơ khi: nhân viên _đã nghỉ việc_, mọi tác vụ thu hồi hoàn tất, mục (1b) của `BM-08` đã ghi. Hồ sơ quyền, quyết định và Audit Trail được giữ lại vì luật khác yêu cầu lưu chứng từ, đây là ngoại lệ Luật 91/2025/QH15 Điều 25 cho phép; ảnh đại diện và số điện thoại công việc bị xóa (`QĐ-110e`, `QĐ-110f`, `QĐ-111av`, B-1). — _Đối chiếu:_ Khớp chuẩn (đã sửa DX-19) · [PBGDPL Cần Thơ](https://pbgdpl.cantho.gov.vn/quy-dinh-ve-bao-ve-du-lieu-ca-nhan-trong-tuyen-dung-quan-ly-su-dung-nguoi-lao-dong) (BT); [CIS 6.2](https://controls-assessment-specification.readthedocs.io/en/latest/control-6/control-6.2.html)',
      },
      {
        heading: 'Ngoại lệ',
        body: 'hủy nghỉ việc trước _đã nghỉ việc_ cần căn cứ như ghi mới, không tự mở khóa, quyền đã thu hồi phải xin lại; không hủy sau _đã nghỉ việc_ (`QĐ-81`, `QĐ-100q`, R-41) · Super Admin nghỉ ⟹ chuyển giao vai trước (`QĐ-87c`) · người nghỉ là IT Admin ⟹ IT Admin khác làm tác vụ (`SoD-5`) · người đang trong ân hạn điều chuyển nghỉ ⟹ `MF-2` tiếp quản quyền cũ (`QĐ-110r`).',
      },
      {
        heading: 'Căn cứ',
        body: 'Bộ luật Lao động 2019 (căn cứ chấm dứt hợp đồng nằm ngoài hệ thống); Luật 91/2025/QH15; nội bộ `QĐ-110a`→`QĐ-110h`, `QĐ-111az`, `QĐ-111bd`, `FR-2.12`, `FR-2.14`.',
      },
      {
        heading: 'Tham chiếu',
        body: 'QT `2.1`→`2.9`; `BM-04`, `BM-08`, `BM-09`; `SBF-13`, `SBF-16`, `SBF-18`.',
      },
    ],
    steps: [],
  },
};
