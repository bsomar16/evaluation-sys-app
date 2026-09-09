import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { getCriterionMaxPoints, type CalculationRuleRecord, type EvaluationCriterionRecord } from '@/lib/evaluation-calculator';
import { formatEvaluationPercentage } from '@/lib/evaluation-calculator';
import { EVALUATION_STATUS_LABELS, type EvaluationRecord } from '@/lib/evaluation-types';
import { resolveCriterionName } from '@/lib/evaluation-report-data';

/**
 * Génération du PDF en français uniquement : les polices intégrées à jsPDF
 * (Helvetica) ne couvrent pas les caractères arabes et les afficheraient sous
 * forme de blocs illisibles. La vue à l'écran (EvaluationReportView), elle,
 * reste bilingue FR/AR — seul l'export PDF est figé en français.
 */

const COLOR_PRIMARY: [number, number, number] = [30, 58, 95];
const COLOR_GREEN: [number, number, number] = [16, 185, 129];
const COLOR_ORANGE: [number, number, number] = [245, 158, 11];
const COLOR_RED: [number, number, number] = [239, 68, 68];
const COLOR_GREY: [number, number, number] = [148, 163, 184];
const COLOR_TEXT: [number, number, number] = [30, 41, 59];
const COLOR_MUTED: [number, number, number] = [100, 116, 139];

function scoreColor(ratio: number): [number, number, number] {
  if (ratio >= 0.7) return COLOR_GREEN;
  if (ratio >= 0.4) return COLOR_ORANGE;
  return COLOR_RED;
}

function sanitizeFilenamePart(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

export interface EvaluationReportPdfInput {
  evaluation: EvaluationRecord;
  employeeName: string;
  position: string | null;
  branchName: string | null;
  departmentName: string | null;
  roleName: string | null;
  percentage: number | null;
  criteria: EvaluationCriterionRecord[];
  rules: CalculationRuleRecord[];
}

export function generateEvaluationReportPdf(input: EvaluationReportPdfInput): void {
  const { evaluation, employeeName, position, branchName, departmentName, roleName, percentage, criteria, rules } = input;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 14;
  let cursorY = 0;

  // ── Bandeau d'en-tête ──────────────────────────────────────────────
  doc.setFillColor(...COLOR_PRIMARY);
  doc.rect(0, 0, pageWidth, 26, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text("RAPPORT D'ÉVALUATION", marginX, 15);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Période : ${evaluation.period || '—'}`, marginX, 22);
  const statusLabel = EVALUATION_STATUS_LABELS[evaluation.status] ?? evaluation.status;
  doc.text(`Statut : ${statusLabel}`, pageWidth - marginX, 22, { align: 'right' });

  cursorY = 36;

  // ── Identité employé ───────────────────────────────────────────────
  doc.setTextColor(...COLOR_TEXT);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(employeeName || '—', marginX, cursorY);
  cursorY += 8;

  const infoPairs: [string, string][] = [
    ['Poste', position || '—'],
    ['Filiale', branchName || '—'],
    ['Service', departmentName || '—'],
    ['Rôle', roleName || '—'],
  ];
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const colWidth = (pageWidth - marginX * 2) / 2;
  infoPairs.forEach(([label, value], index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const x = marginX + col * colWidth;
    const y = cursorY + row * 7;
    doc.setTextColor(...COLOR_MUTED);
    doc.text(`${label} :`, x, y);
    doc.setTextColor(...COLOR_TEXT);
    doc.text(value, x + 22, y);
  });
  cursorY += Math.ceil(infoPairs.length / 2) * 7 + 6;

  // ── Score global ───────────────────────────────────────────────────
  const ratio = percentage != null ? Math.max(0, Math.min(100, percentage)) / 100 : 0;
  const barColor = scoreColor(ratio);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(...barColor);
  doc.text(percentage != null ? formatEvaluationPercentage(percentage) : '—', marginX, cursorY + 8);

  const barX = marginX + 40;
  const barWidth = pageWidth - marginX - barX;
  const barY = cursorY + 2;
  doc.setFillColor(...COLOR_GREY);
  doc.roundedRect(barX, barY, barWidth, 6, 2, 2, 'F');
  if (percentage != null) {
    doc.setFillColor(...barColor);
    doc.roundedRect(barX, barY, Math.max(barWidth * ratio, 4), 6, 2, 2, 'F');
  }
  cursorY += 18;

  // ── Diagramme par critère ────────────────────────────────────────────
  const responses = evaluation.responses ?? [];
  if (responses.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...COLOR_TEXT);
    doc.text('Résultats par critère', marginX, cursorY);
    cursorY += 6;

    const chartLabelWidth = 55;
    const chartBarX = marginX + chartLabelWidth;
    const chartBarMaxWidth = pageWidth - marginX - chartBarX - 14;
    const rowHeight = 7;

    responses.forEach((response) => {
      const criterion = criteria.find((c) => c.id === response.criterion_id);
      const maxPoints = criterion ? getCriterionMaxPoints(criterion, rules) * (criterion.weight ?? 1) : response.points;
      const criterionRatio = maxPoints > 0 ? Math.max(0, Math.min(1, response.points / maxPoints)) : 0;
      const name = resolveCriterionName(response.criterion_id, response.criterion_name, criteria, 'fr');
      const color = scoreColor(criterionRatio);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...COLOR_TEXT);
      const truncatedName = doc.splitTextToSize(name, chartLabelWidth - 3)[0];
      doc.text(truncatedName, marginX, cursorY + 4.5);

      doc.setFillColor(230, 234, 240);
      doc.rect(chartBarX, cursorY, chartBarMaxWidth, 5, 'F');
      doc.setFillColor(...color);
      doc.rect(chartBarX, cursorY, Math.max(chartBarMaxWidth * criterionRatio, 1), 5, 'F');

      doc.setTextColor(...COLOR_MUTED);
      doc.text(`${response.points.toFixed(1)} / ${maxPoints.toFixed(1)}`, chartBarX + chartBarMaxWidth + 2, cursorY + 4.5);

      cursorY += rowHeight;
    });
    cursorY += 4;
  }

  // ── Tableau détaillé ─────────────────────────────────────────────────
  if (responses.length > 0) {
    autoTable(doc, {
      startY: cursorY,
      margin: { left: marginX, right: marginX },
      head: [['Critère', 'Coefficient', 'Valeur saisie', 'Points']],
      body: responses.map((response) => {
        const criterion = criteria.find((c) => c.id === response.criterion_id);
        const name = resolveCriterionName(response.criterion_id, response.criterion_name, criteria, 'fr');
        const value =
          typeof response.value === 'boolean' ? (response.value ? 'Oui' : 'Non') : String(response.value);
        return [name, formatCoefficient(criterion?.weight ?? 1), value, response.points.toFixed(1)];
      }),
      headStyles: { fillColor: COLOR_PRIMARY, textColor: 255, fontSize: 9 },
      bodyStyles: { fontSize: 9, textColor: COLOR_TEXT },
      alternateRowStyles: { fillColor: [246, 248, 250] },
      styles: { cellPadding: 2.5 },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cursorY = (doc as any).lastAutoTable.finalY + 10;
  }

  // ── Commentaire de l'évaluateur ──────────────────────────────────────
  if (evaluation.feedback?.trim()) {
    if (cursorY > 250) {
      doc.addPage();
      cursorY = 20;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...COLOR_TEXT);
    doc.text("Commentaire de l'évaluateur", marginX, cursorY);
    cursorY += 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(...COLOR_MUTED);
    const lines = doc.splitTextToSize(evaluation.feedback.trim(), pageWidth - marginX * 2);
    doc.text(lines, marginX, cursorY);
    cursorY += lines.length * 5 + 4;
  }

  // ── Pied de page ───────────────────────────────────────────────────
  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    const pageHeight = doc.internal.pageSize.getHeight();
    doc.setFontSize(8);
    doc.setTextColor(...COLOR_MUTED);
    doc.text(
      `Généré le ${new Date().toLocaleDateString('fr-FR')} — Page ${page}/${pageCount}`,
      marginX,
      pageHeight - 8
    );
  }

  const filename = `evaluation-${sanitizeFilenamePart(employeeName)}-${sanitizeFilenamePart(evaluation.period || 'periode')}.pdf`;
  doc.save(filename);
}

function formatCoefficient(weight: number): string {
  const n = Number(weight);
  if (!Number.isFinite(n)) return '1';
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '');
}
