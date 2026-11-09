import type {
  DetectableGroup,
  EvidenceDirection,
  SourceCapabilities,
  SourceTemplate,
  UsageReportShape,
} from './vendor-source.types';

export type TemplateProblem =
  | 'IDENTIFIER_COLUMN_MISSING'
  | 'AGGREGATE_NEEDS_DATE_COLUMN'
  | 'EVENT_NEEDS_DATE_AND_TYPE'
  | 'EVENT_NEEDS_CLASSES'
  | 'COLUMN_USED_TWICE'
  | 'CAPABILITY_MISMATCH';

const hasDateColumn = (template: SourceTemplate): boolean =>
  Boolean(template.columns.activeDates || template.columns.lastActivityDate || template.columns.date);

function judgeColumns(template: SourceTemplate): TemplateProblem | null {
  const { columns } = template;
  if (columns.identifier.trim() === '') return 'IDENTIFIER_COLUMN_MISSING';
  const named = Object.values(columns).filter((name): name is string => typeof name === 'string' && name.trim() !== '');

  return new Set(named.map((name) => name.trim().toLowerCase())).size === named.length ? null : 'COLUMN_USED_TWICE';
}

function judgeEventShape(template: SourceTemplate): TemplateProblem | null {
  const { columns } = template;
  if (!columns.date || !columns.eventType || columns.activeDates || columns.lastActivityDate) {
    return 'EVENT_NEEDS_DATE_AND_TYPE';
  }

  return Object.keys(template.eventClasses).length === 0 ? 'EVENT_NEEDS_CLASSES' : null;
}

function judgeAggregateShape(template: SourceTemplate, capabilities: SourceCapabilities): TemplateProblem | null {
  if (template.columns.date || template.columns.eventType) return 'AGGREGATE_NEEDS_DATE_COLUMN';
  const rosterOnly = capabilities.memberList && !capabilities.lastActivity && !capabilities.eventDetail;

  return hasDateColumn(template) || rosterOnly ? null : 'AGGREGATE_NEEDS_DATE_COLUMN';
}

function judgeShape(
  shape: UsageReportShape,
  template: SourceTemplate,
  capabilities: SourceCapabilities,
): TemplateProblem | null {
  return shape === 'EVENT' ? judgeEventShape(template) : judgeAggregateShape(template, capabilities);
}

function judgeCapabilities(
  shape: UsageReportShape,
  template: SourceTemplate,
  capabilities: SourceCapabilities,
): TemplateProblem | null {
  const dates = hasDateColumn(template);
  const tellsDates = capabilities.lastActivity || capabilities.eventDetail;
  if (dates && !tellsDates) return 'CAPABILITY_MISMATCH';
  if (capabilities.eventDetail && shape !== 'EVENT') return 'CAPABILITY_MISMATCH';

  return capabilities.lastActivity && !dates ? 'CAPABILITY_MISMATCH' : null;
}

/**
 * Whether the template fits the shape of the report and the capabilities the IT Admin declared (`FR-4.2`, `FR-4.4`): `AGGREGATE` reads
 * the days a person was active or the last one, `EVENT` a date and a type of event with the table that sorts the types. A report that
 * names a date must be one the vendor can tell dates of (the last activity or the detail of events); a vendor said to tell the last
 * activity or the detail must have a column for it. A source that only lists members has no date column. Returns the first problem.
 */
export function judgeTemplate(
  shape: UsageReportShape,
  template: SourceTemplate,
  capabilities: SourceCapabilities,
): TemplateProblem | null {
  return (
    judgeColumns(template) ??
    judgeShape(shape, template, capabilities) ??
    judgeCapabilities(shape, template, capabilities)
  );
}

/** The groups the vendor can detect (`FR-4.4`): members only gives `G1` and `G2`; the last activity or the detail of events gives up to `G4`. */
export function detectableGroups(capabilities: SourceCapabilities): DetectableGroup[] {
  if (capabilities.lastActivity || capabilities.eventDetail) return ['G1', 'G2', 'G3', 'G4'];
  if (capabilities.memberList) return ['G1', 'G2'];

  return [];
}

/** Whether a day without activity may be read as a day not used: only a vendor that tells the negative and has dates to tell it by (`DA6-14`). */
export function canConcludeAbsence(direction: EvidenceDirection, capabilities: SourceCapabilities): boolean {
  return direction === 'POSITIVE_AND_NEGATIVE' && (capabilities.lastActivity || capabilities.eventDetail);
}

/** The sentence of `US-08-01` AC-2 that says what this source cannot tell; null when it tells everything the rules need. */
export function limitationOf(capabilities: SourceCapabilities, direction: EvidenceDirection): string | null {
  if (detectableGroups(capabilities).length === 0) {
    return 'Nguồn này không khai báo khả năng nào: hệ thống không rút ra kết luận nào từ dữ liệu của nguồn.';
  }
  if (!capabilities.lastActivity && !capabilities.eventDetail) {
    return 'Nguồn này chỉ cho biết ai là thành viên, không cho biết ai có dùng: chỉ phát hiện được nhóm G1 và G2, không kết luận được "không dùng".';
  }
  if (!canConcludeAbsence(direction, capabilities)) {
    return 'Nguồn này chỉ cho thấy hoạt động đã xảy ra: không có hoạt động trong báo cáo không được hiểu là không dùng.';
  }

  return null;
}

export type ApplicationProblem =
  'APPLICATION_NOT_FOUND' | 'APPLICATION_INTERNAL' | 'APPLICATION_RETIRED' | 'COMMUNICATION_APP';

/**
 * Whether the usage of an application may be taken from a vendor report: it exists, is software the company buys (`QĐ-62o`: not one it built),
 * is not retired and is not a messaging or meeting service, whose usage is not collected unless the IT Admin turns it on (`US-08-02` AC-3).
 */
export function judgeSourceApplication(
  application:
    { kind: 'SAAS' | 'LICENSED' | 'INTERNAL'; isCommunicationService: boolean; retiredAt: Date | null } | undefined,
): ApplicationProblem | null {
  if (!application) return 'APPLICATION_NOT_FOUND';
  if (application.kind === 'INTERNAL') return 'APPLICATION_INTERNAL';
  if (application.retiredAt) return 'APPLICATION_RETIRED';
  if (application.isCommunicationService) return 'COMMUNICATION_APP';

  return null;
}
