import { DemoApiError } from '../demo-api-client';
import { emptyIds, type DemoRunContext } from '../demo-run.types';
import { SHARED_DEMO_V4 as fixture } from '../fixture/shared-demo-v4';
import { demoSteps } from '../seed-steps';
import { deviceBody, signatureRecordBody, allowlistBody, DEVICE_STEPS } from './devices.steps';

describe('the monitoring notice and company devices', () => {
  it('declares seven unique machines, five signed records and four acknowledgements by real account holders', () => {
    expect(fixture.devices).toHaveLength(7);
    expect(new Set(fixture.devices.map(({ assetCode }) => assetCode)).size).toBe(7);
    expect(fixture.devices.filter(({ signature }) => signature)).toHaveLength(5);
    expect(fixture.devices.filter(({ acknowledge }) => acknowledge)).toHaveLength(4);
    for (const device of fixture.devices) {
      expect(fixture.people.find(({ code }) => code === device.holder)!.account).not.toBeNull();
      if (device.acknowledge) expect(device.signature).toBe(true);
    }
    expect(fixture.devices.find(({ assetCode }) => assetCode === 'SV-LT-004')!.holder).toBe('NV-BOD4');
  });
  it('sends the employee UUID and hostname, and binds a signature to the current notice version', () => {
    const ids = emptyIds();
    ids.employees.set('NV-DEV5', '00000000-0000-4000-8000-000000000001');
    const ctx = { fixture, ids } as unknown as DemoRunContext;
    expect(deviceBody(ctx, fixture.devices[0])).toEqual({
      assetCode: 'SV-LT-001',
      hostname: 'SV-LT-001',
      os: 'Windows 11',
      holderEmployeeId: '00000000-0000-4000-8000-000000000001',
    });
    expect(signatureRecordBody('document-1', 'notice-1')).toEqual({
      documentId: 'document-1',
      noticeVersionId: 'notice-1',
    });
  });
  it('maps only the two supported tools and publishes their allowlist before acknowledgements', () => {
    const ids = emptyIds();
    ids.applications.set('claude', 'claude-id');
    ids.applications.set('chatgpt', 'chatgpt-id');
    expect(allowlistBody({ fixture, ids } as unknown as DemoRunContext).aiTools).toEqual([
      { tool: 'CLAUDE_CODE', applicationId: 'claude-id' },
      { tool: 'CODEX', applicationId: 'chatgpt-id' },
    ]);
    const keys = demoSteps(fixture).map(({ key }) => key);
    for (const [before, after] of [
      ['devices.notice', 'devices.allowlist'],
      ['devices.allowlist', 'devices.registry'],
      ['devices.registry', 'devices.acknowledgements'],
    ])
      expect(keys.indexOf(before)).toBeLessThan(keys.indexOf(after));
  });
  it('publishes the notice with tool status enabled only when no notice exists', async () => {
    expect(fixture.monitoringNotice).toMatchObject({ includesToolStatus: true, requiresReacknowledgement: true });
    const step = DEVICE_STEPS.find(({ key }) => key === 'devices.notice')!;
    const call = jest
      .fn()
      .mockRejectedValueOnce(new DemoApiError('GET', '/monitoring-notices/current', 404, 'NOTICE.NOT_FOUND'))
      .mockResolvedValue({ id: 'notice-1' });
    const ctx = {
      fixture,
      superAdminEmail: 'sa@example.test',
      mode: 'apply',
      api: { call },
    } as unknown as DemoRunContext;
    await expect(step.run(ctx)).resolves.toMatchObject({ status: 'done' });
    expect(call).toHaveBeenCalledWith(
      'sa@example.test',
      'POST',
      '/monitoring-notice-versions',
      fixture.monitoringNotice,
    );
    call.mockClear();
    await expect(step.run(ctx)).resolves.toMatchObject({ status: 'present' });
    expect(call).toHaveBeenCalledTimes(1);
  });
});
