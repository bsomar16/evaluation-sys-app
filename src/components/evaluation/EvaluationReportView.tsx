import { useMemo, useState } from 'react';
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
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FileSpreadsheet, FileText, Star, AlertTriangle } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import type { Lang } from '@/lib/i18n/translations';
import { useToast } from '@/hooks/use-toast';
import { formatEvaluationPercentage, getCriterionMaxPoints } from '@/lib/evaluation-calculator';
import { formatDecimal } from '@/lib/utils';
import { EVALUATION_STATUS_LABELS } from '@/lib/evaluation-types';
import { EvaluationAuditTrail } from '@/components/evaluation/EvaluationAuditTrail';
import { getApprovalComment, getApproverName } from '@/lib/evaluation-audit';
import { PdfLanguageDialog } from '@/components/evaluation/PdfLanguageDialog';
import {
  findPreviousEvaluationRow,
  resolveCriterionName,
  type EvaluationReportRow,
} from '@/lib/evaluation-report-data';
import { generateEvaluationReportPdf, preloadArabicFont } from '@/lib/evaluation-report-pdf';
import { exportEvaluationReportToExcel } from '@/lib/evaluation-report-excel';
import type { EvaluationCriterionRecord, CalculationRuleRecord } from '@/lib/evaluation-calculator';

function scoreHexColor(ratio: number): string {
  if (ratio >= 0.7) return '#10b981';
  if (ratio >= 0.4) return '#f59e0b';
  return '#ef4444';
}

function formatCoefficient(weight: number): string {
  const n = Number(weight);
  if (!Number.isFinite(n)) return '1';
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '');
}

/** Libellé d'axe multi-lignes, sans troncature "…" — remplace le tick par défaut de recharts. */
function wrapLabel(text: string, maxCharsPerLine: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  words.forEach((word) => {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxCharsPerLine && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  });
  if (current) lines.push(current);
  return lines;
}

function CriterionAxisTick({
  x,
  y,
  payload,
  textAnchor,
}: {
  x: number;
  y: number;
  payload: { value: string };
  textAnchor: 'start' | 'end';
}) {
  const lines = wrapLabel(payload.value, 26);
  const lineHeight = 12;
  const totalHeight = (lines.length - 1) * lineHeight;
  const startY = y - totalHeight / 2;
  return (
    <g>
      {lines.map((line, i) => (
        <text
          key={i}
          x={x}
          y={startY + i * lineHeight}
          textAnchor={textAnchor}
          fontSize={11}
          fill="hsl(var(--foreground))"
          dominantBaseline="central"
        >
          {line}
        </text>
      ))}
    </g>
  );
}

export function EvaluationReportView({
  row,
  criteria,
  rules,
  allRows,
  periodStartByName,
}: {
  row: EvaluationReportRow;
  criteria: EvaluationCriterionRecord[];
  rules: CalculationRuleRecord[];
  /** Toutes les évaluations (autres employés/périodes inclus), pour retrouver la période précédente. */
  allRows: EvaluationReportRow[];
  periodStartByName: Record<string, string>;
}) {
  const { t, lang } = useI18n();
  const { toast } = useToast();
  const [pdfDialogOpen, setPdfDialogOpen] = useState(false);
  const { evaluation, position, branchName, departmentName, roleName, percentage } = row;
  const responses = evaluation.responses ?? [];

  const previousRow = useMemo(
    () => findPreviousEvaluationRow(row, allRows, periodStartByName),
    [row, allRows, periodStartByName]
  );
  const previousPeriodLabel = previousRow?.evaluation.period ?? null;
  const previousPercentage = previousRow?.percentage ?? null;
  const hasComparison = previousPeriodLabel != null && previousPercentage != null;
  const delta =
    percentage != null && previousPercentage != null ? percentage - previousPercentage : null;
  const approvalComment = getApprovalComment(evaluation.activity_log);
  const approverName = getApproverName(evaluation.activity_log);

  const chartData = responses.map((response) => {
    const criterion = criteria.find((c) => c.id === response.criterion_id);
    const weight = criterion?.weight ?? 1;
    const rawMax = criterion ? getCriterionMaxPoints(criterion, rules) : response.points || 1;
    // Points pondérés = points bruts × coefficient (idem pour le max), afin que
    // le coefficient soit bien reflété dans l'affichage par critère.
    const weightedPoints = response.points * weight;
    const weightedMax = rawMax * weight;
    const ratio = weightedMax > 0 ? Math.max(0, Math.min(1, weightedPoints / weightedMax)) : 0;
    const points = Number(weightedPoints.toFixed(1));
    const max = Number(weightedMax.toFixed(1));
    const name = resolveCriterionName(response.criterion_id, response.criterion_name, criteria, lang);
    const coefficient = formatCoefficient(weight);
    return {
      name,
      axisLabel: `${name} (×${coefficient})`,
      points,
      maxPoints: max,
      label: `${points} / ${max}`,
      percent: Math.round(ratio * 100),
      fill: scoreHexColor(ratio),
    };
  });

  const overallRatio = percentage != null ? Math.max(0, Math.min(100, percentage)) / 100 : 0;
  const overallColor = scoreHexColor(overallRatio);

  // Synthèse : meilleur critère et critère à améliorer (par pourcentage d'atteinte).
  const sortedByPercent = chartData.length > 0 ? [...chartData].sort((a, b) => b.percent - a.percent) : [];
  const bestCriterion = sortedByPercent[0] ?? null;
  const worstCriterion = sortedByPercent.length > 1 ? sortedByPercent[sortedByPercent.length - 1] : null;

  const handleDownloadPdf = async (pdfLang: Lang) => {
    const opened = await generateEvaluationReportPdf(
      {
        evaluation,
        employeeName: evaluation.employee_name ?? '—',
        position,
        branchName,
        departmentName,
        roleName,
        percentage,
        criteria,
        rules,
        previousPeriodLabel,
        previousPercentage,
      },
      pdfLang
    );
    if (!opened) {
      toast({ title: t('reports.popupBlockedTitle'), description: t('reports.popupBlockedDesc') });
    }
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
      previousPeriodLabel,
      previousPercentage,
    });
  };

  return (
    <div className="space-y-5">
      {/* Barre d'actions */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Badge variant="secondary">{evaluation.period}</Badge>
        <Badge>{EVALUATION_STATUS_LABELS[evaluation.status] ?? evaluation.status}</Badge>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={handleExportExcel}>
          <FileSpreadsheet className="h-4 w-4" />
          Excel
        </Button>
        {evaluation.status === 'approved' && (
          <Button
            size="sm"
            className="gap-1.5"
            onClick={() => {
              preloadArabicFont();
              setPdfDialogOpen(true);
            }}
          >
            <FileText className="h-4 w-4" />
            PDF
          </Button>
        )}
      </div>

      {/* Bandeau d'identité — une seule ligne, style tableau, séparé du reste. */}
      <div
        className="grid grid-cols-2 sm:grid-cols-5 rounded-lg overflow-hidden text-white divide-x divide-white/20"
        style={{ backgroundColor: 'hsl(var(--primary))' }}
      >
        <div className="p-3">
          <p className="text-sm font-bold leading-tight truncate">{evaluation.employee_name ?? '—'}</p>
          <p className="text-[11px] text-white/70 truncate">{roleName || '—'}</p>
        </div>
        <div className="p-3">
          <p className="text-[10px] uppercase tracking-wide text-white/70">{t('evaluation.branch')}</p>
          <p className="text-sm font-medium truncate">{branchName || '—'}</p>
        </div>
        <div className="p-3">
          <p className="text-[10px] uppercase tracking-wide text-white/70">{t('evaluation.service')}</p>
          <p className="text-sm font-medium truncate">{departmentName || '—'}</p>
        </div>
        <div className="p-3">
          <p className="text-[10px] uppercase tracking-wide text-white/70">{t('evaluation.poste')}</p>
          <p className="text-sm font-medium truncate">{position || '—'}</p>
        </div>
        <div className="p-3">
          <p className="text-[10px] uppercase tracking-wide text-white/70">{t('reports.responsable')}</p>
          <p className="text-sm font-medium truncate">{approverName || '—'}</p>
        </div>
      </div>

      {evaluation.status !== 'approved' && (
        <p className="text-xs text-muted-foreground -mt-2">{t('reports.pdfApprovedOnly')}</p>
      )}

      <Card className="overflow-hidden">
        <div className="grid grid-cols-2 sm:grid-cols-5 divide-y sm:divide-y-0 divide-x-0 sm:divide-x divide-border">
          <div className="p-4 text-center">
            <p className="text-xs text-muted-foreground mb-1">{t('reports.scoreActuel')}</p>
            <p className="text-lg font-bold" style={{ color: overallColor }}>
              {formatEvaluationPercentage(percentage)}
            </p>
          </div>
          <div className="p-4 text-center">
            <p className="text-xs text-muted-foreground mb-1">{t('reports.objectif')}</p>
            <p className="text-lg font-bold text-muted-foreground">—</p>
          </div>
          <div className="p-4 text-center">
            <p className="text-xs text-muted-foreground mb-1">{t('reports.ecart')}</p>
            <p
              className="text-lg font-bold"
              style={{
                color:
                  delta != null && delta > 0.05
                    ? '#10b981'
                    : delta != null && delta < -0.05
                      ? '#ef4444'
                      : 'hsl(var(--muted-foreground))',
              }}
            >
              {delta != null ? `${delta > 0 ? '+' : ''}${formatDecimal(delta)} pts` : '—'}
            </p>
          </div>
          <div className="p-4 text-center">
            <p className="text-xs text-muted-foreground mb-1">{t('reports.evolution')}</p>
            {hasComparison ? (
              <div className="flex items-center justify-center gap-2">
                <div>
                  <p className="text-sm font-semibold text-muted-foreground">
                    {formatEvaluationPercentage(previousPercentage)}
                  </p>
                  <p className="text-[10px] text-muted-foreground">{previousPeriodLabel}</p>
                </div>
                <span className="text-muted-foreground">→</span>
                <div>
                  <p className="text-sm font-semibold" style={{ color: overallColor }}>
                    {formatEvaluationPercentage(percentage)}
                  </p>
                  <p className="text-[10px] text-muted-foreground">{evaluation.period}</p>
                </div>
              </div>
            ) : (
              <div>
                <p className="text-sm font-semibold" style={{ color: overallColor }}>
                  {formatEvaluationPercentage(percentage)}
                </p>
                <p className="text-[10px] text-muted-foreground">{evaluation.period}</p>
              </div>
            )}
          </div>
          <div className="p-4 text-center">
            <p className="text-xs text-muted-foreground mb-1">{t('reports.statut')}</p>
            <p className="text-lg font-bold">
              {EVALUATION_STATUS_LABELS[evaluation.status] ?? evaluation.status}
            </p>
          </div>
        </div>
      </Card>

      {chartData.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{t('reports.resultsByCriterion')}</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={Math.max(200, chartData.length * 52)}>
                <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 40, top: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" domain={[0, 'dataMax']} hide />
                  <YAxis
                    type="category"
                    dataKey="axisLabel"
                    width={190}
                    interval={0}
                    tick={<CriterionAxisTick textAnchor={lang === 'ar' ? 'start' : 'end'} />}
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

      {/* Synthèse — meilleur critère et critère à améliorer (sous les résultats) */}
      {bestCriterion && worstCriterion && (
        <div>
          <h3 className="text-sm font-bold mb-2">{t('reports.synthese')}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-lg border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/20 p-4">
              <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                <Star className="h-3.5 w-3.5 fill-current" />
                {t('reports.bestCriterion')}
              </p>
              <p className="font-medium text-sm mt-1">{bestCriterion.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {bestCriterion.points} / {bestCriterion.maxPoints} {t('reports.ptsUnit')}
              </p>
            </div>
            <div className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/20 p-4">
              <p className="text-xs font-semibold text-red-700 dark:text-red-400 flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5" />
                {t('reports.worstCriterion')}
              </p>
              <p className="font-medium text-sm mt-1">{worstCriterion.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {worstCriterion.points} / {worstCriterion.maxPoints} {t('reports.ptsUnit')}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Commentaire de l'approbateur (RH), sous la synthèse */}
      {approvalComment && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t('reports.approvalComment')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{approvalComment}</p>
          </CardContent>
        </Card>
      )}

      {evaluation.activity_log && evaluation.activity_log.length > 0 && (
        <EvaluationAuditTrail entries={evaluation.activity_log} />
      )}

      <PdfLanguageDialog
        open={pdfDialogOpen}
        onOpenChange={setPdfDialogOpen}
        onSelect={(pdfLang) => {
          setPdfDialogOpen(false);
          void handleDownloadPdf(pdfLang);
        }}
      />
    </div>
  );
}

export default EvaluationReportView;
