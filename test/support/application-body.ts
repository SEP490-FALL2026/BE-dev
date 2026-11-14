/**
 * The body of `POST /applications` for a suite that only needs an application as a precondition and still writes it the way it was written before
 * the one command (`QĐ-111f`): `kind` and the answers about communication are dropped (the plan says the kind, the group says communication) and a
 * first plan is added, of the kind that fits: granted by hand (K5) for an internal application, K1 for any other. A suite that proves the command
 * sends its own body; no assertion lives here.
 */
export function intakeBodyOf(legacy: object): Record<string, unknown> {
  const { kind, ...rest } = legacy as Record<string, unknown>;
  delete rest.communication;
  const internal = kind === 'INTERNAL';

  return {
    ...rest,
    plan: {
      name: 'Initial plan',
      provisioningType: internal ? 'K5' : 'K1',
      ...(internal ? {} : { controlLevel: 'PARTIAL' }),
    },
  };
}
