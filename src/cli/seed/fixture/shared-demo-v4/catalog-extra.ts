import type { DemoApplication, DemoPlan } from '../demo-fixture.types';
import { app, groupOf, k2, k4 } from './catalog-kit';

/** A per-seat plan bought one by one (K1): the control the company has over the seat is the one the vendor allows. */
const k1 = (key: string, name: string, controlLevel: NonNullable<DemoPlan['controlLevel']>): DemoPlan => ({
  key,
  name,
  provisioningType: 'K1',
  controlLevel,
  dataLossOnRemoval: false,
  sharingPolicy: 'NOT_ALLOWED',
});

/*
 * Twelve more applications and eighteen plans of real SaaS (Q3): the names are the vendors' own, the prices (in `SUBSCRIPTIONS`) are simulated
 * and near the list price. They bring what the first thirteen lacked: monthly and annual plans, a third level of control (GitHub Copilot, which
 * the company cannot control), a K4 plan with an admin console that may be shared (Visio) and one without (Sublime), a plan that loses data when
 * a user is removed (Adobe), a workspace with no company account (Notion Business), a plan with no subscription at all (Skype, retired in S21)
 * and the internal attendance system for the K5 requests of IT and Operations. Zoom and Skype stand in the group the usage rules never collect.
 * Nothing here is Miro, Whimsical or Canva Enterprise: the budget scenarios of R08, R25 and R29 name them as software outside the catalog.
 */
export const EXTRA_APPLICATIONS: DemoApplication[] = [
  app('m365', 'Microsoft 365', 'Microsoft', [
    k2('m365-basic', 'Microsoft 365 Business Basic', { vendorAdmin: 'NV-ITA3' }),
    k2('m365-standard', 'Microsoft 365 Business Standard', { vendorAdmin: 'NV-ITA3' }),
  ]),
  app(
    'zoom',
    'Zoom Workplace',
    'Zoom',
    [k2('zoom-pro', 'Zoom Workplace Pro'), k2('zoom-business', 'Zoom Workplace Business')],
    'SAAS',
    'LOW',
  ),
  app('notion', 'Notion', 'Notion Labs', [
    k2('notion-business', 'Notion Business', { withoutOwnerAccountEmail: true }),
    k2('notion-plus', 'Notion Plus'),
  ]),
  app('confluence', 'Confluence', 'Atlassian', [
    k2('confluence-standard', 'Confluence Standard'),
    k2('confluence-premium', 'Confluence Premium'),
  ]),
  app('adobe', 'Adobe Creative Cloud', 'Adobe', [
    k2('adobe-cc-teams', 'Adobe Creative Cloud Teams All Apps', {
      dataLossOnRemoval: true,
      revocationNote:
        'Tải về các tệp thiết kế lưu trên Creative Cloud của người dùng rồi mới gỡ: gỡ xong, kho lưu của họ bị xóa.',
    }),
    k2('adobe-photoshop', 'Adobe Photoshop'),
  ]),
  app(
    'claude',
    'Claude',
    'Anthropic',
    [k1('claude-pro', 'Claude Pro', 'PARTIAL'), k2('claude-team', 'Claude Team')],
    'SAAS',
    'HIGH',
  ),
  app(
    'copilot',
    'GitHub Copilot',
    'GitHub',
    [k1('copilot-pro', 'GitHub Copilot Pro', 'UNCONTROLLABLE')],
    'SAAS',
    'HIGH',
  ),
  app('visio', 'Microsoft Visio', 'Microsoft', [
    k4('visio-pro', 'Visio Professional', { hasAdminConsole: true, sharingPolicy: 'ALLOWED', vendorAdmin: 'NV-ITA3' }),
  ]),
  app('sublime', 'Sublime Text', 'Sublime HQ', [k4('sublime-license', 'Sublime Text License')]),
  app('hubspot', 'HubSpot Sales Hub', 'HubSpot', [k2('hubspot-starter', 'HubSpot Sales Hub Starter')], 'SAAS', 'HIGH'),
  {
    key: 'attendance',
    name: 'Hệ thống Chấm công',
    kind: 'INTERNAL',
    dataSensitivity: 'MEDIUM',
    functionalGroup: groupOf('attendance'),
    plans: [{ key: 'attendance-access', name: 'Truy cập Chấm công', provisioningType: 'K5', dataLossOnRemoval: false }],
  },
  app('skype', 'Skype for Business', 'Microsoft', [k2('skype-online', 'Skype Online Plan 2')], 'SAAS', 'LOW'),
];
