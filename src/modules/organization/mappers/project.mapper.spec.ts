import { toProjectWire } from './project.mapper';

describe('toProjectWire (project wire model)', () => {
  const project = {
    id: '6f1b6a2e-3c1f-4c55-9a43-0d7e3f0c9b11',
    name: 'Onboarding portal',
    description: null,
    status: 'RUNNING' as const,
    departments: [{ id: 'dep-1', code: 'DES', name: 'Design' }],
    createdAt: new Date('2026-01-01T08:00:00.000Z'),
    updatedAt: new Date('2026-01-02T09:30:00.000Z'),
  };

  it('writes exactly the wire fields, with ISO-8601 instants', () => {
    expect(toProjectWire(project)).toEqual({
      id: '6f1b6a2e-3c1f-4c55-9a43-0d7e3f0c9b11',
      name: 'Onboarding portal',
      description: null,
      status: 'RUNNING',
      departments: [{ id: 'dep-1', code: 'DES', name: 'Design' }],
      createdAt: '2026-01-01T08:00:00.000Z',
      updatedAt: '2026-01-02T09:30:00.000Z',
    });
  });

  it('keeps a description and an empty department list as they are', () => {
    expect(toProjectWire({ ...project, description: 'Internal tool', departments: [] })).toMatchObject({
      description: 'Internal tool',
      departments: [],
    });
  });
});
