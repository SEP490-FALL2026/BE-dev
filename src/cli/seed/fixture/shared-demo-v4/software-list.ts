import type { DemoFixture } from '../demo-fixture.types';

/*
 * The software lists of three departments (`QĐ-111c`, P16): what their people see first when they ask for software (P17), written by the
 * IT Admin in charge of each. Engineering and Design each have a proposal of their head (P18): Design's waits for its IT Admin, Engineering's
 * was rejected with a reason. Canva is left out of Design's list on purpose: it is what the waiting proposal asks for.
 */
export const SOFTWARE_LIST: Pick<DemoFixture, 'departmentSoftware' | 'softwareProposals'> = {
  departmentSoftware: [
    {
      department: 'ENG',
      items: [
        { application: 'jira', plan: 'jira-standard', note: 'Quản lý issue và sprint của mọi nhóm.' },
        { application: 'github', plan: 'github-team', note: 'Mã nguồn và review.' },
        { application: 'postman', plan: 'postman-professional' },
        { application: 'slack', plan: 'slack-pro' },
        { application: 'jetbrains', plan: 'jetbrains-all', note: 'IDE cho lập trình viên backend.' },
      ],
    },
    {
      department: 'DES',
      items: [
        { application: 'figma', plan: 'figma-professional', note: 'Công cụ thiết kế chính của phòng.' },
        { application: 'slack', plan: 'slack-pro' },
        { application: 'jira', note: 'Theo dõi yêu cầu thiết kế; xin gói khi cần.' },
      ],
    },
    {
      department: 'MKT',
      items: [
        { application: 'mailchimp', plan: 'mailchimp-standard', note: 'Gửi bản tin khách hàng.' },
        { application: 'canva', plan: 'canva-teams' },
      ],
    },
  ],
  softwareProposals: [
    {
      key: 'P1',
      department: 'DES',
      application: 'canva',
      plan: 'canva-teams',
      reason: 'Nhóm thương hiệu cần Canva để làm ấn phẩm mạng xã hội nhanh.',
      outcome: 'PENDING',
    },
    {
      key: 'P2',
      department: 'ENG',
      application: 'mailchimp',
      plan: 'mailchimp-standard',
      reason: 'Gửi bản tin phát hành sản phẩm cho khách hàng.',
      outcome: 'REJECTED',
      rejectionReason: 'Bản tin khách hàng do Marketing gửi; Kỹ thuật chuyển nội dung cho Marketing.',
    },
  ],
};
