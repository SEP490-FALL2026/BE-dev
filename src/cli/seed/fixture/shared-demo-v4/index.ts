import type { DemoFixture } from '../demo-fixture.types';
import { CATALOG } from './catalog';
import { FINANCE } from './finance';
import { ORGANIZATION } from './organization';
import { REQUESTS } from './requests';
import { REQUESTS_EXTRA, RETURNS } from './requests-extra';
import { SOFTWARE_LIST } from './software-list';
import { USAGE } from './usage';

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
  ...USAGE,
  ...SOFTWARE_LIST,
};
