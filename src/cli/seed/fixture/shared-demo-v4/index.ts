import type { DemoFixture } from '../demo-fixture.types';
import { CATALOG } from './catalog';
import { FINANCE } from './finance';
import { DEVICES, MONITORING_NOTICE } from './devices';
import { ORGANIZATION } from './organization';
import { REQUESTS } from './requests';
import { REQUESTS_EXTRA, RETURNS } from './requests-extra';
import { RENEWALS } from './renewals';
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
  monitoringNotice: MONITORING_NOTICE,
  ...USAGE,
  usageSources: [...USAGE.usageSources, ...EXTRA_USAGE_SOURCES],
  ...SOFTWARE_LIST,
};
