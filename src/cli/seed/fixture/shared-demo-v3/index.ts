import type { DemoFixture } from '../demo-fixture.types';
import { ORGANIZATION } from './organization';
import { CATALOG } from './catalog';
import { FINANCE } from './finance';
import { REQUESTS } from './requests';
import { EXTRAS } from './extras';

export const SHARED_DEMO_V3: DemoFixture = {
  id: 'shared-demo-v3',
  marker: 'SV',
  emailDomain: 'saoviet.example',
  currency: 'VND',
  ...ORGANIZATION,
  ...CATALOG,
  ...FINANCE,
  ...REQUESTS,
  ...EXTRAS,
};
