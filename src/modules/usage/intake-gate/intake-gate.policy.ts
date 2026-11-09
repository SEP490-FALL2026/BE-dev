import type { DeviceSessionState } from '../../devices/public/devices.types';

export type IntakeEndpointName = 'AI_USAGE_BATCH' | 'AI_TOOL_STATUS_SNAPSHOT';
export type GateReason = 'NOT_ACKNOWLEDGED' | 'COLLECTION_STOPPED' | 'TOOL_STATUS_NOT_ACKNOWLEDGED';

/**
 * Whether the machine may be listened to at all (`US-09-03` AC-2, `US-09-04` AC-2): the holder has acknowledged, collection was not
 * stopped, and — for the snapshot of a tool's status — the notice in force that names it is acknowledged. The first thing in the
 * way is the reason; null lets the request go on to be judged day by day.
 */
export function judgeIntakeState(
  context: { state: DeviceSessionState; toolStatusAcknowledged: boolean },
  endpoint: IntakeEndpointName,
): GateReason | null {
  if (context.state === 'AWAITING_ACKNOWLEDGEMENT') return 'NOT_ACKNOWLEDGED';
  if (context.state === 'COLLECTION_STOPPED') return 'COLLECTION_STOPPED';
  if (endpoint === 'AI_TOOL_STATUS_SNAPSHOT' && !context.toolStatusAcknowledged) return 'TOOL_STATUS_NOT_ACKNOWLEDGED';

  return null;
}
