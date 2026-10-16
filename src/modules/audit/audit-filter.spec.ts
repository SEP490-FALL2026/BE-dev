import { buildAuditEventWhere } from './audit-filter';

const ACTOR = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';
const FROM = new Date('2026-10-16T00:00:00.000Z');
const TO = new Date('2026-10-17T00:00:00.000Z');

describe('buildAuditEventWhere', () => {
  it('selects everything when no filter is given', () => {
    expect(buildAuditEventWhere({})).toEqual({});
  });

  it('filters by the resource type alone, or by type and id together', () => {
    expect(buildAuditEventWhere({ resourceType: 'AppUser' })).toEqual({ resourceType: 'AppUser' });
    expect(buildAuditEventWhere({ resourceType: 'AppUser', resourceId: 'b1' })).toEqual({
      resourceType: 'AppUser',
      resourceId: 'b1',
    });
  });

  it('never filters by resource id without its type, even if handed one', () => {
    expect(buildAuditEventWhere({ resourceId: 'b1' })).toEqual({});
  });

  it('filters by the actor and by the exact action', () => {
    expect(buildAuditEventWhere({ actorAppUserId: ACTOR })).toEqual({ actorAppUserId: ACTOR });
    expect(buildAuditEventWhere({ action: 'APP_USER.LOCKED' })).toEqual({ action: 'APP_USER.LOCKED' });
  });

  it('reads the time window as half-open: the start is in, the end is out', () => {
    expect(buildAuditEventWhere({ occurredFrom: FROM, occurredTo: TO })).toEqual({
      occurredAt: { gte: FROM, lt: TO },
    });
  });

  it('accepts an open-ended window on either side', () => {
    expect(buildAuditEventWhere({ occurredFrom: FROM })).toEqual({ occurredAt: { gte: FROM } });
    expect(buildAuditEventWhere({ occurredTo: TO })).toEqual({ occurredAt: { lt: TO } });
  });

  it('combines every filter, each narrowing the others', () => {
    expect(
      buildAuditEventWhere({
        resourceType: 'AppUser',
        resourceId: 'b1',
        actorAppUserId: ACTOR,
        action: 'APP_USER.LOCKED',
        occurredFrom: FROM,
        occurredTo: TO,
      }),
    ).toEqual({
      resourceType: 'AppUser',
      resourceId: 'b1',
      actorAppUserId: ACTOR,
      action: 'APP_USER.LOCKED',
      occurredAt: { gte: FROM, lt: TO },
    });
  });

  it('never carries an organization filter: the client cannot choose one', () => {
    expect(Object.keys(buildAuditEventWhere({ resourceType: 'AppUser', actorAppUserId: ACTOR }))).not.toContain(
      'organizationId',
    );
  });
});
