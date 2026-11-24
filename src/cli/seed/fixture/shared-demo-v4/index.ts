import type { DemoFixture } from '../demo-fixture.types';
import { CATALOG } from './catalog';
import { RETIRED_APPLICATIONS } from './catalog-extra';
import { FINANCE } from './finance';
import { DEPARTMENT_SUBSTITUTES, DEVICES, MONITORING_NOTICE, NEW_DEVICES } from './devices';
import { ORGANIZATION } from './organization';
import { REQUESTS } from './requests';
import { REQUESTS_EXTRA, RETURNS } from './requests-extra';
import { AI_SUMMARIES, RENEWALS } from './renewals';
import { SOFTWARE_LIST } from './software-list';
import { USAGE } from './usage';
import { EXTRA_USAGE_SOURCES } from './usage-extra';

export const SHARED_DEMO_V4: DemoFixture = {
  id: 'shared-demo-v4',
  marker: 'SV',
  emailDomain: 'saoviet.example',
  currency: 'VND',
  ...ORGANIZATION,
  ...CATALOG,
  ...FINANCE,
  ...REQUESTS,
  requests: [...REQUESTS.requests, ...REQUESTS_EXTRA],
  returns: RETURNS,
  renewals: RENEWALS,
  devices: DEVICES,
  newDevices: NEW_DEVICES,
  departmentSubstitutes: DEPARTMENT_SUBSTITUTES,
  monitoringNotice: MONITORING_NOTICE,
  aiSummaries: AI_SUMMARIES,
  retiredApplications: RETIRED_APPLICATIONS,
  ...USAGE,
  usageSources: [...USAGE.usageSources, ...EXTRA_USAGE_SOURCES],
  ...SOFTWARE_LIST,
};
