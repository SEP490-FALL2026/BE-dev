import { CostCenterForbiddenError } from './cost-center.errors';
import { assertMayMaintainCostCenters, assertMayReadCostCenters } from './cost-center.policy';

describe('cost-center.policy (who may do what with the Cost Center catalogue, F13, QĐ-87a)', () => {
  it('lets Finance create, rename, retire and read the catalogue', () => {
    expect(() => assertMayMaintainCostCenters(['FINANCE'])).not.toThrow();
    expect(() => assertMayReadCostCenters(['FINANCE'])).not.toThrow();
  });

  it('lets the Super Admin read the catalogue, to see which department is still without a Cost Center, but not change it', () => {
    expect(() => assertMayReadCostCenters(['SUPER_ADMIN'])).not.toThrow();
    expect(() => assertMayMaintainCostCenters(['SUPER_ADMIN'])).toThrow(CostCenterForbiddenError);
  });

  it.each([[['IT_ADMIN']], [['MANAGER']], [['EMPLOYEE']], [[]]])('refuses %j to read and to change it', (roles) => {
    expect(() => assertMayReadCostCenters(roles)).toThrow(CostCenterForbiddenError);
    expect(() => assertMayMaintainCostCenters(roles)).toThrow(CostCenterForbiddenError);
  });
});
