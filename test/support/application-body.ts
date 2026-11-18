/**
 * The body of `POST /applications` for a suite that only needs an application as a precondition and still writes it the way it was written before
 * the one command (`QĐ-111f`): the answers about communication are dropped (the group says communication) and `kind` becomes the first plan, which says
 * the kind now (`QĐ-111d`): granted by hand (K5) for an internal application, bought once (K4, B-5) for a licensed one, K1 for any other. The route makes
 * no `LICENSED` application: a suite that needs that kind declares it with `declareApplication`. A suite that proves the command sends its own body;
 * no assertion lives here.
 */
export function intakeBodyOf(legacy: object): Record<string, unknown> {
  const { kind, ...rest } = legacy as Record<string, unknown>;
  delete rest.communication;
  const provisioningType = kind === 'INTERNAL' ? 'K5' : kind === 'LICENSED' ? 'K4' : 'K1';

  return {
    ...rest,
    plan: {
      name: 'Initial plan',
      provisioningType,
      ...(provisioningType === 'K5' ? {} : { controlLevel: 'PARTIAL' }),
    },
  };
}
