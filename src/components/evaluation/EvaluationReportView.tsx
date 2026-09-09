import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FileSpreadsheet, FileText } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import {
  formatEvaluationPercentage,
  getCriterionDisplayName,
  getCriterionMaxPoints,
} from '@/lib/evaluation-calculator';
import { EVALUATION_STATUS_LABELS } from '@/lib/evaluation-types';
import { EvaluationAuditTrail } from '@/components/evaluation/EvaluationAuditTrail';
import { resolveCriterionName, type EvaluationReportRow } from '@/lib/evaluation-report-data';
import { generateEvaluationReportPdf } from '@/lib/evaluation-report-pdf';
import { exportEvaluationReportToExcel } from '@/lib/evaluation-report-excel';
import type { EvaluationCriterionRecord, CalculationRuleRecord } from '@/lib/evaluation-calculator';

function scoreHexColor(ratio: number): string {
  if (ratio >= 0.7) return '#10b981';
  if (ratio >= 0.4) return '#f59e0b';
  return '#ef4444';
}

export function EvaluationReportView({
  row,
  criteria,
  rules,
}: {
  row: EvaluationReportRow;
  criteria: EvaluationCriterionRecord[];
  rules: CalculationRuleRecord[];
}) {
  const { t, lang } = useI18n();
  const { evaluation, position, branchName, departmentName, roleName, percentage } = row;
  const responses = evaluation.responses ?? [];

  const chartData = responses.map((response) => {
    const criterion = criteria.find((c) => c.id === response.criterion_id);
    const maxPoints = criterion ? getCriterionMaxPoints(criterion, rules) * (criterion.weight ?? 1) : response.points || 1;
    const ratio = maxPoints > 0 ? Math.max(0, Math.min(1, response.points / maxPoints)) : 0;
    const points = Number(response.points.toFixed(1));
    const max = Number(maxPoints.toFixed(1));
    return {
      name: resolveCriterionName(response.criterion_id, response.criterion_name, criteria, lang),
      points,
      maxPoints: max,
      label: `${points} / ${max}`,
      percent: Math.round(ratio * 100),
      fill: scoreHexColor(ratio),
    };
  });

  const overallRatio = percentage != null ? Math.max(0, Math.min(100, percentage)) / 100 : 0;
  const overallColor = scoreHexColor(overallRatio);
  const gaugeData = [{ value: Math.round(overallRatio * 100), fill: overallColor }];

  const handleDownloadPdf = () => {
    generateEvaluationReportPdf({
      evaluation,
      employeeName: evaluation.employee_name ?? '—',
      position,
      branchName,
      departmentName,
      roleName,
      percentage,
      criteria,
      rules,
    });
  };

  const handleExportExcel = () => {
    exportEvaluationReportToExcel({
      evaluation,
      employeeName: evaluation.employee_name ?? '—',
      position,
      branchName,
      departmentName,
      roleName,
      percentage,
      criteria,
      rules,
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">{evaluation.employee_name ?? '—'}</h2>
          <p className="text-sm text-muted-foreground">{evaluation.period}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge>{EVALUATION_STATUS_LABELS[evaluation.status] ?? evaluation.status}</Badge>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={handleExportExcel}>
            <FileSpreadsheet className="h-4 w-4" />
            Excel
          </Button>
          <Button size="sm" className="gap-1.5" onClick={handleDownloadPdf}>
            <FileText className="h-4 w-4" />
            PDF
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
        <div className="rounded-md border p-3">
          <p className="text-xs text-muted-foreground">{t('evaluation.poste')}</p>
          <p className="font-medium truncate">{position || '—'}</p>
        </div>
        <div className="rounded-md border p-3">
          <p className="text-xs text-muted-foreground">{t('evaluation.branch')}</p>
          <p className="font-medium truncate">{branchName || '—'}</p>
        </div>
        <div className="rounded-md border p-3">
          <p className="text-xs text-muted-foreground">{t('evaluation.service')}</p>
          <p className="font-medium truncate">{departmentName || '—'}</p>
        </div>
        <div className="rounded-md border p-3">
          <p className="text-xs text-muted-foreground">{t('evaluation.role')}</p>
          <p className="font-medium truncate">{roleName || '—'}</p>
        </div>
      </div>

      <Card>
        <CardContent className="p-5 flex items-center gap-6">
          <div className="relative w-[110px] h-[110px] shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <RadialBarChart
                data={gaugeData}
                innerRadius="72%"
                outerRadius="100%"
                startAngle={90}
                endAngle={-270}
              >
                <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                <RadialBar dataKey="value" cornerRadius={8} background={{ fill: 'hsl(var(--muted))' }} />
              </RadialBarChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-xl font-bold" style={{ color: overallColor }}>
                {formatEvaluationPercentage(percentage)}
              </span>
            </div>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{t('evalMgmt.totalScore')}</p>
            <p className="text-3xl font-bold" style={{ color: overallColor }}>
              {formatEvaluationPercentage(percentage)}
            </p>
          </div>
        </CardContent>
      </Card>

      {chartData.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{t('reports.resultsByCriterion')}</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={Math.max(180, chartData.length * 42)}>
                <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 36 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" domain={[0, 'dataMax']} hide />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={160}
                    tick={{ fontSize: 12 }}
                    reversed={lang === 'ar'}
                    orientation={lang === 'ar' ? 'right' : 'left'}
                  />
                  <Tooltip
                    contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }}
                    formatter={(value: number, _name, ctx) => [`${value} / ${ctx.payload.maxPoints}`, t('evalMgmt.colScore')]}
                  />
                  <Bar dataKey="points" radius={[0, 4, 4, 0]}>
                    {chartData.map((entry, index) => (
                      <Cell key={index} fill={entry.fill} />
                    ))}
                    <LabelList dataKey="label" position="right" style={{ fontSize: 11, fill: 'hsl(var(--foreground))' }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {chartData.length >= 3 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{t('reports.criteriaOverview')}</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={Math.max(220, chartData.length * 42)}>
                  <RadarChart data={chartData} outerRadius="72%">
                    <PolarGrid />
                    <PolarAngleAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 9 }} tickCount={5} />
                    <Radar
                      dataKey="percent"
                      stroke={overallColor}
                      fill={overallColor}
                      fillOpacity={0.35}
                    />
                    <Tooltip
                      contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }}
                      formatter={(value: number) => [`${value} %`, t('evalMgmt.colScore')]}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {responses.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t('evalMgmt.criteria')}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-4">{t('criteria.colName')}</th>
                    <th className="text-left py-2 px-4">{t('criteria.coefficient')}</th>
                    <th className="text-right py-2 px-4">{t('common.value')}</th>
                  </tr>
                </thead>
                <tbody>
                  {responses.map((response) => {
                    const criterion = criteria.find((c) => c.id === response.criterion_id);
                    const name = criterion
                      ? getCriterionDisplayName(criterion, lang)
                      : response.criterion_name;
                    const value =
                      typeof response.value === 'boolean'
                        ? response.value
                          ? t('common.yes')
                          : t('common.no')
                        : String(response.value);
                    return (
                      <tr key={response.criterion_id} className="border-b last:border-0">
                        <td className="py-2 px-4">{name}</td>
                        <td className="py-2 px-4 text-muted-foreground">×{criterion?.weight ?? 1}</td>
                        <td className="py-2 px-4 text-right text-muted-foreground">{value}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {evaluation.feedback?.trim() && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t('evaluation.evaluatorComment')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{evaluation.feedback}</p>
          </CardContent>
        </Card>
      )}

      {evaluation.activity_log && evaluation.activity_log.length > 0 && (
        <EvaluationAuditTrail entries={evaluation.activity_log} />
      )}
    </div>
  );
}

export default EvaluationReportView;
