import type { DemoFixture } from '../demo-fixture.types';
import { ORGANIZATION } from './organization';
import { CATALOG } from './catalog';
import { FINANCE } from './finance';
import { REQUESTS } from './requests';
import { EXTRAS } from './extras';

export const SHARED_DEMO_V2: DemoFixture = {
  id: 'shared-demo-v2',
  marker: 'DS1',
  emailDomain: 'ds1.slm-demo.example',
  currency: 'VND',
  ...ORGANIZATION,
  ...CATALOG,
  ...FINANCE,
  ...REQUESTS,
  ...EXTRAS,
};
