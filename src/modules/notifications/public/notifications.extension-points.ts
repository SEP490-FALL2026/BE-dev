/**
 * What `notifications` opens to other modules. A notification sentence names an entity by a display name that
 * the owning module supplies at read time (N5a adds the registration contract); the kinds a sentence can name
 * are fixed here, once.
 */
export type NameKind = 'REQUEST' | 'EMPLOYEE' | 'DEPARTMENT' | 'COST_CENTER' | 'APPLICATION' | 'PLAN' | 'SUBSCRIPTION';
