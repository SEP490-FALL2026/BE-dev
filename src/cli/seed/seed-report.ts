import type { StepReport, StepStatus } from './demo-run.types';

export interface DemoReport {
  fixture: string;
  mode: 'plan' | 'apply';
  organization: string;
  today: string;
  steps: StepReport[];
  exitCode: number;
}

const LABEL: Record<StepStatus, string> = {
  present: 'ĐÃ CÓ',
  done: 'ĐÃ GHI',
  planned: 'SẼ GHI',
  waiting: 'CHỜ',
  conflict: 'XUNG ĐỘT',
  blocked: 'BỊ CHẶN',
  failed: 'LỖI',
};

/** The report as text: one line per step, then the counts. It carries ids of nothing and no secret. */
export function formatDemoReport(report: DemoReport): string {
  const lines = [
    `Dataset ${report.fixture} — ${report.mode === 'plan' ? 'xem trước (không ghi dữ liệu dataset)' : 'apply'} — tổ chức "${report.organization}", hôm nay ${report.today}`,
    ...report.steps.map(
      (step) => `[${LABEL[step.status]}] ${step.key} — ${step.title}${step.detail ? `: ${step.detail}` : ''}`,
    ),
  ];
  const counts = (Object.keys(LABEL) as StepStatus[])
    .map((status) => [status, report.steps.filter((step) => step.status === status).length] as const)
    .filter(([, count]) => count > 0)
    .map(([status, count]) => `${LABEL[status]} ${count}`);
  lines.push(`Tổng: ${counts.join(' · ')} — mã thoát ${report.exitCode}`);

  return `${lines.join('\n')}\n`;
}

export function formatDemoReportJson(report: DemoReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}
