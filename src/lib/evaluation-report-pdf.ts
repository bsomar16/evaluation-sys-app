import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  getCriterionDisplayName,
  getCriterionMaxPoints,
  formatEvaluationPercentage,
  type CalculationRuleRecord,
  type EvaluationCriterionRecord,
} from '@/lib/evaluation-calculator';
import { type EvaluationRecord } from '@/lib/evaluation-types';
import { resolveCriterionName } from '@/lib/evaluation-report-data';
import { translations, type Lang } from '@/lib/i18n/translations';

/**
 * Génération du PDF bilingue FR/AR.
 *
 * En français : polices Helvetica standard de jsPDF.
 * En arabe : police Amiri embarquée (chargée à la demande, voir
 * arabic-font-data.ts) — jsPDF sait façonner les lettres arabes
 * (formes isolée/initiale/médiane/finale) et réordonner le texte en
 * bidi nativement, il ne manquait qu'une police avec les glyphes
 * arabes. La mise en page est mise en miroir (alignement à droite,
 * barres qui se remplissent depuis la droite) pour un rendu RTL correct.
 *
 * Le PDF s'ouvre dans un nouvel onglet (visionneuse PDF du navigateur) plutôt
 * que de forcer un téléchargement, pour une consultation rapide.
 */

const COLOR_PRIMARY: [number, number, number] = [30, 58, 95];
const COLOR_GREEN: [number, number, number] = [16, 185, 129];
const COLOR_ORANGE: [number, number, number] = [245, 158, 11];
const COLOR_RED: [number, number, number] = [239, 68, 68];
const COLOR_GREY: [number, number, number] = [148, 163, 184];
const COLOR_TEXT: [number, number, number] = [30, 41, 59];
const COLOR_MUTED: [number, number, number] = [100, 116, 139];

const FONT_AR = 'Amiri';

const PDF_LABELS: Record<Lang, Record<string, string>> = {
  fr: {
    title: "RAPPORT D'ÉVALUATION",
    period: 'Période',
    status: 'Statut',
    poste: 'Poste',
    branch: 'Filiale',
    department: 'Service',
    role: 'Rôle',
    resultsByCriterion: 'Résultats par critère',
    colCriterion: 'Critère',
    colCoefficient: 'Coefficient',
    colValue: 'Valeur saisie',
    colPoints: 'Points',
    yes: 'Oui',
    no: 'Non',
    comment: "Commentaire de l'évaluateur",
    vsPrevious: 'Vs période précédente',
    generatedOn: 'Généré le',
    page: 'Page',
  },
  ar: {
    title: 'تقرير التقييم',
    period: 'الفترة',
    status: 'الحالة',
    poste: 'المنصب',
    branch: 'الفرع',
    department: 'المصلحة',
    role: 'الدور',
    resultsByCriterion: 'النتائج حسب المعيار',
    colCriterion: 'المعيار',
    colCoefficient: 'المعامل',
    colValue: 'القيمة المدخلة',
    colPoints: 'النقاط',
    yes: 'نعم',
    no: 'لا',
    comment: 'تعليق المُقيّم',
    vsPrevious: 'مقارنة بالفترة السابقة',
    generatedOn: 'أُنشئ في',
    page: 'صفحة',
  },
};

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

let arabicFontPromise: Promise<void> | null = null;

/**
 * Charge et enregistre la police Amiri (arabe) dans le document, à la demande.
 * Le module de police (~800 Ko en base64) est chargé dynamiquement (chunk
 * séparé) pour ne pas alourdir le bundle principal des utilisateurs qui
 * n'exportent jamais de rapport en arabe.
 */
async function registerArabicFont(doc: jsPDF): Promise<void> {
  const { AMIRI_REGULAR_BASE64, AMIRI_BOLD_BASE64 } = await import('@/lib/arabic-font-data');
  doc.addFileToVFS('Amiri-Regular.ttf', AMIRI_REGULAR_BASE64);
  doc.addFont('Amiri-Regular.ttf', FONT_AR, 'normal');
  doc.addFileToVFS('Amiri-Bold.ttf', AMIRI_BOLD_BASE64);
  doc.addFont('Amiri-Bold.ttf', FONT_AR, 'bold');
}

/** Précharge le module de police arabe en arrière-plan (appelé dès l'ouverture du choix de langue). */
export function preloadArabicFont(): void {
  if (!arabicFontPromise) {
    arabicFontPromise = import('@/lib/arabic-font-data').then(() => undefined);
  }
}

function setFont(doc: jsPDF, lang: Lang, style: 'normal' | 'bold'): void {
  doc.setFont(lang === 'ar' ? FONT_AR : 'helvetica', style);
}

const ARABIC_CHAR_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

function isArabicText(text: string): boolean {
  return ARABIC_CHAR_RE.test(text);
}

interface BidiRun {
  text: string;
  arabic: boolean;
}

/**
 * Découpe une chaîne en segments arabe / non-arabe (nom français, nombre,
 * pourcentage…), dans l'ordre logique. Les espaces restent attachés au
 * segment courant pour ne pas fragmenter inutilement les phrases arabes.
 */
function splitBidiRuns(text: string): BidiRun[] {
  const runs: BidiRun[] = [];
  let current = '';
  let currentArabic: boolean | null = null;
  for (const ch of Array.from(text)) {
    const isSpace = ch === ' ' || ch === ' ';
    const charIsArabic = isArabicText(ch);
    if (currentArabic === null) {
      current = ch;
      currentArabic = isSpace ? false : charIsArabic;
    } else if (isSpace || charIsArabic === currentArabic) {
      current += ch;
    } else {
      runs.push({ text: current, arabic: currentArabic });
      current = ch;
      currentArabic = charIsArabic;
    }
  }
  if (current) runs.push({ text: current, arabic: currentArabic ?? false });
  return runs;
}

/**
 * doc.text() avec façonnage/bidi corrects. La police Amiri embarquée ne
 * couvrant pas correctement le latin/les chiffres, tout texte arabe est
 * découpé en segments arabe (police Amiri, `isInputVisual: true` — jsPDF
 * façonne et réordonne lui-même un texte source en ordre logique) et
 * segments latins/numériques (police Helvetica, ordre normal), positionnés
 * les uns à côté des autres pour reconstituer un rendu bidirectionnel correct.
 */
function drawText(
  doc: jsPDF,
  lang: Lang,
  text: string | string[],
  x: number,
  y: number,
  options: { align?: 'left' | 'right' | 'center'; style?: 'normal' | 'bold' } = {}
): void {
  const style = options.style ?? 'normal';

  if (Array.isArray(text)) {
    const lineHeightFactor =
      typeof doc.getLineHeightFactor === 'function' ? doc.getLineHeightFactor() : 1.15;
    const lineHeight = (doc.getFontSize() / doc.internal.scaleFactor) * lineHeightFactor;
    text.forEach((line, index) => drawText(doc, lang, line, x, y + index * lineHeight, options));
    return;
  }

  if (lang !== 'ar') {
    doc.setFont('helvetica', style);
    doc.text(text, x, y, { align: options.align });
    return;
  }

  const runs = splitBidiRuns(text);
  if (runs.length === 0) return;

  if (runs.length === 1) {
    const run = runs[0];
    doc.setFont(run.arabic ? FONT_AR : 'helvetica', style);
    doc.text(run.text, x, y, run.arabic ? { align: options.align, isInputVisual: true } : { align: options.align });
    return;
  }

  const RUN_GAP = 0.6; // léger espace entre segments arabe/latin pour éviter un accolement visuel
  const widths = runs.map((run) => {
    doc.setFont(run.arabic ? FONT_AR : 'helvetica', style);
    return doc.getTextWidth(run.text);
  });
  const total = widths.reduce((a, b) => a + b, 0) + RUN_GAP * (runs.length - 1);
  const rightEdge = options.align === 'left' ? x + total : options.align === 'center' ? x + total / 2 : x;

  let cursor = rightEdge;
  runs.forEach((run, index) => {
    doc.setFont(run.arabic ? FONT_AR : 'helvetica', style);
    doc.text(run.text, cursor, y, run.arabic ? { align: 'right', isInputVisual: true } : { align: 'right' });
    cursor -= widths[index] + RUN_GAP;
  });
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
  /** Période précédente (chronologique) de cet employé, pour la comparaison d'évolution. */
  previousPeriodLabel?: string | null;
  previousPercentage?: number | null;
}

function formatCoefficient(weight: number): string {
  const n = Number(weight);
  if (!Number.isFinite(n)) return '1';
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '');
}

/** Dessine un rapport d'évaluation sur la page courante du document (déjà positionnée). */
function renderEvaluationReport(doc: jsPDF, input: EvaluationReportPdfInput, lang: Lang): void {
  const {
    evaluation,
    employeeName,
    position,
    branchName,
    departmentName,
    roleName,
    percentage,
    criteria,
    rules,
    previousPeriodLabel,
    previousPercentage,
  } = input;
  const isRtl = lang === 'ar';
  const L = PDF_LABELS[lang];
  const statusLabel = translations[lang].evalStatus?.[evaluation.status] ?? evaluation.status;
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 14;
  const startX = isRtl ? pageWidth - marginX : marginX;
  const endX = isRtl ? marginX : pageWidth - marginX;
  const startAlign = isRtl ? 'right' : 'left';
  const endAlign = isRtl ? 'left' : 'right';
  let cursorY = 0;

  // ── Bandeau d'en-tête ──────────────────────────────────────────────
  doc.setFillColor(...COLOR_PRIMARY);
  doc.rect(0, 0, pageWidth, 26, 'F');
  doc.setTextColor(255, 255, 255);
  setFont(doc, lang, 'bold');
  doc.setFontSize(16);
  drawText(doc, lang, L.title, startX, 15, { align: startAlign });
  setFont(doc, lang, 'normal');
  doc.setFontSize(10);
  drawText(doc, lang, `${L.period} : ${evaluation.period || '—'}`, startX, 22, { align: startAlign });
  drawText(doc, lang, `${L.status} : ${statusLabel}`, endX, 22, { align: endAlign });

  cursorY = 36;

  // ── Identité employé ───────────────────────────────────────────────
  doc.setTextColor(...COLOR_TEXT);
  setFont(doc, lang, 'bold');
  doc.setFontSize(14);
  drawText(doc, lang, employeeName || '—', startX, cursorY, { align: startAlign });
  cursorY += 8;

  const infoPairs: [string, string][] = [
    [L.poste, position || '—'],
    [L.branch, branchName || '—'],
    [L.department, departmentName || '—'],
    [L.role, roleName || '—'],
  ];
  setFont(doc, lang, 'normal');
  doc.setFontSize(10);
  const colWidth = (pageWidth - marginX * 2) / 2;
  infoPairs.forEach(([label, value], index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const x = isRtl ? pageWidth - marginX - col * colWidth : marginX + col * colWidth;
    const y = cursorY + row * 7;
    doc.setTextColor(...COLOR_TEXT);
    drawText(doc, lang, `${label} : ${value}`, x, y, { align: startAlign });
  });
  cursorY += Math.ceil(infoPairs.length / 2) * 7 + 6;

  // ── Score global ───────────────────────────────────────────────────
  const ratio = percentage != null ? Math.max(0, Math.min(100, percentage)) / 100 : 0;
  const barColor = scoreColor(ratio);

  setFont(doc, lang, 'bold');
  doc.setFontSize(22);
  doc.setTextColor(...barColor);
  drawText(doc, lang, percentage != null ? formatEvaluationPercentage(percentage) : '—', startX, cursorY + 8, {
    align: startAlign,
  });

  const scoreLabelWidth = 40;
  const barWidth = pageWidth - marginX * 2 - scoreLabelWidth;
  const barY = cursorY + 2;
  const barX = isRtl ? marginX : marginX + scoreLabelWidth;
  doc.setFillColor(...COLOR_GREY);
  doc.roundedRect(barX, barY, barWidth, 6, 2, 2, 'F');
  if (percentage != null) {
    doc.setFillColor(...barColor);
    const filledWidth = Math.max(barWidth * ratio, 4);
    const filledX = isRtl ? barX + barWidth - filledWidth : barX;
    doc.roundedRect(filledX, barY, filledWidth, 6, 2, 2, 'F');
  }
  cursorY += 14;

  // ── Comparaison avec la période précédente ──────────────────────────
  if (previousPeriodLabel && previousPercentage != null) {
    const delta = percentage != null ? percentage - previousPercentage : null;
    const deltaColor = delta == null ? COLOR_MUTED : delta > 0.05 ? COLOR_GREEN : delta < -0.05 ? COLOR_RED : COLOR_MUTED;
    // Symboles ASCII simples : les caractères géométriques (▲▼＝) ne font pas
    // partie de l'encodage WinAnsi des polices standard et s'affichaient
    // corrompus dans le PDF.
    const arrow = delta == null ? '' : delta > 0.05 ? '^' : delta < -0.05 ? 'v' : '=';
    const deltaText = delta == null ? '' : `${arrow} ${delta > 0 ? '+' : ''}${delta.toFixed(1)} pts`;

    setFont(doc, lang, 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...COLOR_MUTED);
    drawText(
      doc,
      lang,
      `${L.vsPrevious} (${previousPeriodLabel}) : ${formatEvaluationPercentage(previousPercentage)}`,
      startX,
      cursorY,
      { align: startAlign }
    );
    setFont(doc, lang, 'bold');
    doc.setTextColor(...deltaColor);
    drawText(doc, lang, deltaText, endX, cursorY, { align: endAlign });
    cursorY += 8;
  }
  cursorY += 4;

  // ── Diagramme par critère ────────────────────────────────────────────
  const responses = evaluation.responses ?? [];
  if (responses.length > 0) {
    setFont(doc, lang, 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...COLOR_TEXT);
    drawText(doc, lang, L.resultsByCriterion, startX, cursorY, { align: startAlign });
    cursorY += 6;

    const chartLabelWidth = 60;
    const chartGap = 3;
    const valueWidth = 22;
    const chartBarWidth = pageWidth - marginX * 2 - chartLabelWidth - chartGap * 2 - valueWidth;
    // Zone du graphique : le libellé est toujours du côté "début" (droite en AR,
    // gauche en FR), la barre au centre, la valeur du côté "fin".
    const labelX = startX;
    const barAreaX = isRtl ? marginX + valueWidth + chartGap : marginX + chartLabelWidth + chartGap;
    const valueX = endX;

    setFont(doc, lang, 'normal');
    doc.setFontSize(9);

    responses.forEach((response) => {
      const criterion = criteria.find((c) => c.id === response.criterion_id);
      const maxPoints = criterion ? getCriterionMaxPoints(criterion, rules) * (criterion.weight ?? 1) : response.points;
      const criterionRatio = maxPoints > 0 ? Math.max(0, Math.min(1, response.points / maxPoints)) : 0;
      const baseName = resolveCriterionName(response.criterion_id, response.criterion_name, criteria, lang);
      const coefficient = formatCoefficient(criterion?.weight ?? 1);
      const name = `${baseName} (×${coefficient})`;
      const color = scoreColor(criterionRatio);

      doc.setTextColor(...COLOR_TEXT);
      // Mesure du retour à la ligne avec la police correspondant au script dominant
      // (Amiri n'ayant pas une bonne couverture latine, un nom français mesuré avec
      // cette police donnerait un retour à la ligne incorrect).
      doc.setFont(lang === 'ar' && isArabicText(baseName) ? FONT_AR : 'helvetica', 'normal');
      const nameLines = doc.splitTextToSize(name, chartLabelWidth);
      const rowHeight = Math.max(7, nameLines.length * 4.2 + 2.5);
      const barY = cursorY + (rowHeight - 5) / 2;

      drawText(doc, lang, nameLines, labelX, cursorY + 3.5, { align: startAlign });

      doc.setFillColor(230, 234, 240);
      doc.rect(barAreaX, barY, chartBarWidth, 5, 'F');
      doc.setFillColor(...color);
      const filledWidth = Math.max(chartBarWidth * criterionRatio, 1);
      const filledX = isRtl ? barAreaX + chartBarWidth - filledWidth : barAreaX;
      doc.rect(filledX, barY, filledWidth, 5, 'F');

      doc.setTextColor(...COLOR_MUTED);
      drawText(doc, lang, `${response.points.toFixed(1)}/${maxPoints.toFixed(1)}`, valueX, barY + 4, {
        align: endAlign,
      });

      cursorY += rowHeight;
    });
    cursorY += 4;
  }

  // ── Tableau détaillé ─────────────────────────────────────────────────
  if (responses.length > 0) {
    const bodyRows = responses.map((response) => {
      const criterion = criteria.find((c) => c.id === response.criterion_id);
      const name = resolveCriterionName(response.criterion_id, response.criterion_name, criteria, lang);
      const value =
        typeof response.value === 'boolean' ? (response.value ? L.yes : L.no) : String(response.value);
      return [name, formatCoefficient(criterion?.weight ?? 1), value, response.points.toFixed(1)];
    });
    const head = [[L.colCriterion, L.colCoefficient, L.colValue, L.colPoints]];

    autoTable(doc, {
      startY: cursorY,
      margin: { left: marginX, right: marginX },
      head: isRtl ? head.map((r) => [...r].reverse()) : head,
      body: isRtl ? bodyRows.map((r) => [...r].reverse()) : bodyRows,
      styles: { cellPadding: 2.5, font: isRtl ? FONT_AR : 'helvetica', halign: isRtl ? 'right' : 'left' },
      headStyles: { fillColor: COLOR_PRIMARY, textColor: 255, fontSize: 9 },
      bodyStyles: { fontSize: 9, textColor: COLOR_TEXT },
      alternateRowStyles: { fillColor: [246, 248, 250] },
      // La police Amiri n'ayant pas une bonne couverture latine, chaque cellule
      // choisit sa police selon son propre contenu (nom français vs texte arabe).
      didParseCell: (data) => {
        if (!isRtl) return;
        const raw = Array.isArray(data.cell.raw) ? data.cell.raw.join(' ') : String(data.cell.raw ?? '');
        data.cell.styles.font = isArabicText(raw) ? FONT_AR : 'helvetica';
      },
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
    setFont(doc, lang, 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...COLOR_TEXT);
    drawText(doc, lang, L.comment, startX, cursorY, { align: startAlign });
    cursorY += 6;
    doc.setFontSize(9.5);
    doc.setTextColor(...COLOR_MUTED);
    const feedbackText = evaluation.feedback.trim();
    doc.setFont(lang === 'ar' && isArabicText(feedbackText) ? FONT_AR : 'helvetica', 'normal');
    const lines = doc.splitTextToSize(feedbackText, pageWidth - marginX * 2);
    drawText(doc, lang, lines, startX, cursorY, { align: startAlign });
  }
}

function addFooters(doc: jsPDF, lang: Lang): void {
  const L = PDF_LABELS[lang];
  const isRtl = lang === 'ar';
  const marginX = 14;
  const pageCount = doc.getNumberOfPages();
  const now = new Date();
  // Chiffres occidentaux dans les deux langues (évite les chiffres indo-arabes
  // de la locale 'ar', que la police embarquée ne couvre pas correctement).
  const generatedDate = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    setFont(doc, lang, 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...COLOR_MUTED);
    const startX = isRtl ? pageWidth - marginX : marginX;
    const endX = isRtl ? marginX : pageWidth - marginX;
    drawText(doc, lang, `${L.generatedOn} ${generatedDate}`, startX, pageHeight - 8, {
      align: isRtl ? 'right' : 'left',
    });
    drawText(doc, lang, `${L.page} ${page}/${pageCount}`, endX, pageHeight - 8, {
      align: isRtl ? 'left' : 'right',
    });
  }
}

/**
 * Ouvre le PDF dans un nouvel onglet (visionneuse native du navigateur). Si le
 * navigateur bloque la pop-up (bloqueur de pop-up), replie automatiquement sur
 * un téléchargement direct pour que l'utilisateur récupère toujours le fichier.
 * Retourne `true` si l'onglet a pu s'ouvrir, `false` si on est passé par le repli.
 */
function openPdfOrDownload(doc: jsPDF, title: string, filename: string): boolean {
  doc.setProperties({ title });
  const blobUrl = String(doc.output('bloburl'));
  const win = window.open(blobUrl, '_blank');
  if (win) return true;

  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = filename;
  link.click();
  return false;
}

/**
 * Génère le rapport PDF d'une évaluation (français ou arabe) et l'ouvre dans un
 * nouvel onglet. Retourne `true` si l'onglet a pu s'ouvrir, `false` si le
 * navigateur a bloqué la pop-up et que le fichier a été téléchargé à la place.
 */
export async function generateEvaluationReportPdf(
  input: EvaluationReportPdfInput,
  lang: Lang = 'fr'
): Promise<boolean> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  if (lang === 'ar') await registerArabicFont(doc);
  renderEvaluationReport(doc, input, lang);
  addFooters(doc, lang);
  const title = `${lang === 'ar' ? 'تقرير' : 'Evaluation'} ${input.employeeName} - ${input.evaluation.period ?? ''}`.trim();
  const filename = `evaluation-${sanitizeFilenamePart(input.employeeName)}-${sanitizeFilenamePart(input.evaluation.period || 'periode')}.pdf`;
  return openPdfOrDownload(doc, title, filename);
}

/**
 * Génère un PDF combinant plusieurs rapports d'évaluation (une section par
 * employé, chacune sur ses propres pages) et l'ouvre dans un seul nouvel onglet.
 * Même repli automatique sur téléchargement si la pop-up est bloquée.
 */
export async function generateEvaluationReportsPdf(
  inputs: EvaluationReportPdfInput[],
  lang: Lang = 'fr'
): Promise<boolean> {
  if (inputs.length === 0) return true;
  if (inputs.length === 1) {
    return generateEvaluationReportPdf(inputs[0], lang);
  }

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  if (lang === 'ar') await registerArabicFont(doc);
  inputs.forEach((input, index) => {
    if (index > 0) doc.addPage();
    renderEvaluationReport(doc, input, lang);
  });
  addFooters(doc, lang);
  return openPdfOrDownload(doc, `Rapports d'évaluation (${inputs.length})`, `rapports-evaluations-${inputs.length}.pdf`);
}
