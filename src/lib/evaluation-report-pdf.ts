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
import { getApprovalComment, getApproverName } from '@/lib/evaluation-audit';
import { formatDecimal } from '@/lib/utils';
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
    responsable: 'Responsable',
    resultsByCriterion: 'Résultats par critère',
    detailByCriterion: 'Détail des résultats par critère',
    colNum: 'N°',
    colCriterion: "Critère d'évaluation",
    colCoefficient: 'Coeff.',
    colValue: 'Réponse',
    colObtained: 'Score obtenu',
    colPoints: 'Points',
    total: 'Total',
    yes: 'Oui',
    no: 'Non',
    comment: "Commentaire de l'approbateur",
    scoreActuel: 'Score actuel',
    objectif: 'Objectif',
    ecart: 'Écart',
    evolution: 'Évolution',
    statut: 'Statut',
    synthese: 'Synthèse',
    bestCriterion: 'Meilleur critère',
    worstCriterion: 'Critère à améliorer',
    ptsUnit: 'pts',
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
    responsable: 'المسؤول',
    resultsByCriterion: 'النتائج حسب المعيار',
    detailByCriterion: 'تفصيل النتائج حسب المعيار',
    colNum: 'رقم',
    colCriterion: 'معيار التقييم',
    colCoefficient: 'المعامل',
    colValue: 'الإجابة',
    colObtained: 'النتيجة المحصّلة',
    colPoints: 'النقاط',
    total: 'المجموع',
    yes: 'نعم',
    no: 'لا',
    comment: 'تعليق المُوافِق',
    scoreActuel: 'النتيجة الحالية',
    objectif: 'الهدف',
    ecart: 'الفارق',
    evolution: 'التطوّر',
    statut: 'الحالة',
    synthese: 'الخلاصة',
    bestCriterion: 'أفضل معيار',
    worstCriterion: 'معيار للتحسين',
    ptsUnit: 'نقطة',
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

/** Largeur totale d'un texte potentiellement bidi (segments arabe + latin), même logique que drawText(). */
function measureBidiWidth(doc: jsPDF, lang: Lang, text: string, style: 'normal' | 'bold'): number {
  if (lang !== 'ar') {
    doc.setFont('helvetica', style);
    return doc.getTextWidth(text);
  }
  const runs = splitBidiRuns(text);
  let total = 0;
  runs.forEach((run, index) => {
    doc.setFont(run.arabic ? FONT_AR : 'helvetica', style);
    total += doc.getTextWidth(run.text);
    if (index > 0) total += 0.6;
  });
  return total;
}

/**
 * Réduit la taille de police jusqu'à ce que `text` tienne dans `maxWidth`, puis
 * tronque avec une ellipse si la taille minimale ne suffit toujours pas. Évite
 * le chevauchement entre cellules à largeur fixe (bandeau d'identité) quand un
 * nom de filiale/service/poste est trop long pour sa colonne — un risque plus
 * fréquent en arabe où les libellés de repère ("المصلحة", "الفرع"…) laissent
 * peu de place à la valeur dans la même cellule étroite.
 */
function fitTextToWidth(
  doc: jsPDF,
  lang: Lang,
  text: string,
  style: 'normal' | 'bold',
  maxWidth: number,
  startSize: number,
  minSize = 5.5
): { size: number; text: string } {
  let size = startSize;
  while (size > minSize && measureBidiWidth(doc, lang, text, style) > maxWidth) {
    size -= 0.5;
    doc.setFontSize(size);
  }
  doc.setFontSize(size);
  let output = text;
  if (measureBidiWidth(doc, lang, output, style) > maxWidth) {
    while (output.length > 1 && measureBidiWidth(doc, lang, `${output}…`, style) > maxWidth) {
      output = output.slice(0, -1);
    }
    output = `${output}…`;
  }
  return { size, text: output };
}

/**
 * Largeur de colonne nécessaire (mm) pour que le plus long des `values` (en
 * général l'en-tête + le contenu des lignes) tienne sur une seule ligne à la
 * taille de police déjà active sur `doc`. Évite qu'un en-tête arabe plus long
 * que son équivalent français (ex. "النتيجة المحصّلة" vs "Score obtenu") ne se
 * retrouve replié sur deux lignes dans un tableau autoTable à largeurs "auto".
 */
function requiredColumnWidth(
  doc: jsPDF,
  lang: Lang,
  values: string[],
  style: 'normal' | 'bold' = 'normal',
  minWidth = 8
): number {
  const cellPadding = 5;
  const widest = values.reduce((max, v) => Math.max(max, measureBidiWidth(doc, lang, v, style)), 0);
  return Math.max(minWidth, widest + cellPadding);
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

  cursorY = 32;

  // ── Bandeau d'identité (une seule ligne, style tableau) ────────────
  const approverName = getApproverName(evaluation.activity_log);
  const infoBandHeight = 15;
  doc.setFillColor(...COLOR_PRIMARY);
  doc.rect(marginX, cursorY, pageWidth - marginX * 2, infoBandHeight, 'F');

  type InfoCell = { title: string; sub: string; isName?: boolean };
  const infoCells: InfoCell[] = [
    { title: employeeName || '—', sub: roleName || '—', isName: true },
    { title: L.branch, sub: branchName || '—' },
    { title: L.department, sub: departmentName || '—' },
    { title: L.poste, sub: position || '—' },
    { title: L.responsable, sub: approverName || '—' },
  ];
  const infoCellW = (pageWidth - marginX * 2) / infoCells.length;
  const orderedInfoCells = isRtl ? [...infoCells].reverse() : infoCells;
  orderedInfoCells.forEach((cell, i) => {
    const cellX = marginX + i * infoCellW;
    if (i > 0) {
      doc.setDrawColor(255, 255, 255);
      doc.setLineWidth(0.15);
      doc.line(cellX, cursorY + 2.5, cellX, cursorY + infoBandHeight - 2.5);
    }
    const textX = isRtl ? cellX + infoCellW - 3 : cellX + 3;
    const align = isRtl ? 'right' : 'left';
    const cellTextMaxWidth = infoCellW - 6;
    doc.setTextColor(255, 255, 255);
    setFont(doc, lang, 'bold');
    const titleFit = fitTextToWidth(doc, lang, cell.title, 'bold', cellTextMaxWidth, cell.isName ? 9.5 : 7.5);
    doc.setFontSize(titleFit.size);
    drawText(doc, lang, titleFit.text, textX, cursorY + 6.5, { align });
    setFont(doc, lang, 'normal');
    const subFit = fitTextToWidth(doc, lang, cell.sub, 'normal', cellTextMaxWidth, cell.isName ? 7.5 : 8);
    doc.setFontSize(subFit.size);
    drawText(doc, lang, subFit.text, textX, cursorY + 11.5, { align });
  });
  cursorY += infoBandHeight + 8;
  doc.setTextColor(...COLOR_TEXT);

  // ── Résumé (Score actuel / Objectif / Écart / Évolution / Statut) ───
  const ratio = percentage != null ? Math.max(0, Math.min(100, percentage)) / 100 : 0;
  const barColor = scoreColor(ratio);
  const hasComparison = previousPeriodLabel != null && previousPercentage != null;
  const delta = percentage != null && previousPercentage != null ? percentage - previousPercentage : null;
  const deltaColor = delta == null ? COLOR_MUTED : delta > 0.05 ? COLOR_GREEN : delta < -0.05 ? COLOR_RED : COLOR_MUTED;

  const summaryY = cursorY;
  const summaryHeight = 24;
  doc.setFillColor(240, 253, 250);
  doc.roundedRect(marginX, summaryY, pageWidth - marginX * 2, summaryHeight, 2, 2, 'F');

  // Poids relatifs des colonnes, dans l'ordre logique [scoreActuel, écart,
  // évolution, statut] — évolution a besoin de plus de place pour les deux
  // périodes. Somme = 5 unités réparties sur la largeur disponible.
  // En RTL, les colonnes elles-mêmes sont réaffichées en ordre inverse (voir
  // orderedColumns plus bas) : leurs largeurs doivent suivre le même ordre,
  // sans quoi la colonne double-largeur "évolution" se retrouve positionnée
  // dans un emplacement étroit prévu pour une autre colonne et déborde sur sa
  // voisine.
  const unit = (pageWidth - marginX * 2) / 5;
  const colWidths = [unit, unit, unit * 2, unit];
  const orderedColWidths = isRtl ? [...colWidths].reverse() : colWidths;
  const colCenters: number[] = [];
  {
    let x = marginX;
    for (const w of orderedColWidths) {
      colCenters.push(x + w / 2);
      x += w;
    }
  }

  // Séparateurs verticaux entre les colonnes du résumé.
  doc.setDrawColor(199, 231, 224);
  doc.setLineWidth(0.3);
  {
    let bx = marginX;
    for (let i = 0; i < orderedColWidths.length - 1; i += 1) {
      bx += orderedColWidths[i];
      doc.line(bx, summaryY + 3, bx, summaryY + summaryHeight - 3);
    }
  }

  const labelY = summaryY + 7;
  const valueY = summaryY + 16;

  type SummaryColumn = { label: string; draw: (centerX: number) => void };

  const columns: SummaryColumn[] = [
    {
      label: L.scoreActuel,
      draw: (x) => {
        doc.setTextColor(...barColor);
        setFont(doc, lang, 'bold');
        doc.setFontSize(13);
        drawText(doc, lang, percentage != null ? formatEvaluationPercentage(percentage) : '—', x, valueY, { align: 'center' });
      },
    },
    {
      label: L.ecart,
      draw: (x) => {
        doc.setTextColor(...deltaColor);
        setFont(doc, lang, 'bold');
        doc.setFontSize(13);
        const text = delta != null ? `${delta > 0 ? '+' : ''}${formatDecimal(delta)} pts` : '—';
        drawText(doc, lang, text, x, valueY, { align: 'center' });
      },
    },
    {
      label: L.evolution,
      draw: (x) => {
        if (hasComparison) {
          const half = colWidths[2] / 4;
          const prevX = x - half;
          const nextX = x + half;
          doc.setTextColor(...COLOR_MUTED);
          setFont(doc, lang, 'bold');
          doc.setFontSize(11);
          drawText(doc, lang, formatEvaluationPercentage(previousPercentage), prevX, valueY - 1, { align: 'center' });
          doc.setTextColor(...barColor);
          drawText(doc, lang, formatEvaluationPercentage(percentage), nextX, valueY - 1, { align: 'center' });
          doc.setTextColor(...COLOR_MUTED);
          setFont(doc, lang, 'normal');
          doc.setFontSize(9);
          // Flèche ASCII simple : les caractères flèche unicode (←→) ne font pas partie
          // de l'encodage WinAnsi des polices standard et s'affichaient corrompus.
          drawText(doc, lang, isRtl ? '<' : '>', x, valueY - 1, { align: 'center' });
          doc.setFontSize(6.5);
          drawText(doc, lang, previousPeriodLabel ?? '', prevX, valueY + 4, { align: 'center' });
          drawText(doc, lang, evaluation.period || '', nextX, valueY + 4, { align: 'center' });
        } else {
          doc.setTextColor(...barColor);
          setFont(doc, lang, 'bold');
          doc.setFontSize(12);
          drawText(doc, lang, percentage != null ? formatEvaluationPercentage(percentage) : '—', x, valueY - 1, { align: 'center' });
          doc.setTextColor(...COLOR_MUTED);
          setFont(doc, lang, 'normal');
          doc.setFontSize(6.5);
          drawText(doc, lang, evaluation.period || '', x, valueY + 4, { align: 'center' });
        }
      },
    },
    {
      label: L.statut,
      draw: (x) => {
        doc.setTextColor(...COLOR_TEXT);
        setFont(doc, lang, 'bold');
        doc.setFontSize(11);
        drawText(doc, lang, statusLabel, x, valueY, { align: 'center' });
      },
    },
  ];

  const orderedColumns = isRtl ? [...columns].reverse() : columns;
  orderedColumns.forEach((column, index) => {
    const centerX = colCenters[index];
    doc.setTextColor(...COLOR_MUTED);
    setFont(doc, lang, 'normal');
    doc.setFontSize(8);
    drawText(doc, lang, column.label, centerX, labelY, { align: 'center' });
    column.draw(centerX);
  });

  cursorY += summaryHeight + 8;

  const responses = evaluation.responses ?? [];

  // ── Diagramme par critère ────────────────────────────────────────────
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
      const weight = criterion?.weight ?? 1;
      const rawMax = criterion ? getCriterionMaxPoints(criterion, rules) : response.points;
      // Points pondérés = points bruts × coefficient (idem pour le max).
      const weightedPoints = response.points * weight;
      const maxPoints = rawMax * weight;
      const criterionRatio = maxPoints > 0 ? Math.max(0, Math.min(1, weightedPoints / maxPoints)) : 0;
      const baseName = resolveCriterionName(response.criterion_id, response.criterion_name, criteria, lang);
      const coefficient = formatCoefficient(weight);
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
      drawText(doc, lang, `${formatDecimal(weightedPoints)}/${formatDecimal(maxPoints)}`, valueX, barY + 4, {
        align: endAlign,
      });

      cursorY += rowHeight;
    });
    cursorY += 4;
  }

  // ── Tableau détaillé ─────────────────────────────────────────────────
  if (responses.length > 0) {
    setFont(doc, lang, 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...COLOR_TEXT);
    drawText(doc, lang, L.detailByCriterion, startX, cursorY, { align: startAlign });
    cursorY += 3;

    let totalEarned = 0;
    let totalMax = 0;
    const bodyRows = responses.map((response, index) => {
      const criterion = criteria.find((c) => c.id === response.criterion_id);
      const weight = criterion?.weight ?? 1;
      const rawMax = criterion ? getCriterionMaxPoints(criterion, rules) : response.points;
      const weightedPoints = response.points * weight;
      const weightedMax = rawMax * weight;
      totalEarned += weightedPoints;
      totalMax += weightedMax;
      const name = resolveCriterionName(response.criterion_id, response.criterion_name, criteria, lang);
      const value =
        typeof response.value === 'boolean' ? (response.value ? L.yes : L.no) : String(response.value);
      // « Score obtenu » = points bruts / max brut ; « Points » = pondérés (× coefficient).
      const obtained = `${formatDecimal(response.points)} / ${formatDecimal(rawMax)}`;
      const weighted = `${formatDecimal(weightedPoints)} / ${formatDecimal(weightedMax)}`;
      return [String(index + 1), name, formatCoefficient(weight), value, obtained, weighted];
    });

    const totalPct = totalMax > 0 ? (totalEarned / totalMax) * 100 : 0;
    const totalRow = [
      '',
      L.total,
      '—',
      '—',
      '—',
      `${formatDecimal(totalEarned)} / ${formatDecimal(totalMax)} (${formatDecimal(totalPct)} %)`,
    ];

    const head = [[L.colNum, L.colCriterion, L.colCoefficient, L.colValue, L.colObtained, L.colPoints]];
    const allRows = [...bodyRows, totalRow];

    // Largeurs explicites pour les colonnes "étroites" — sans ça, autoTable
    // répartit l'espace selon le contenu du corps du tableau (souvent court :
    // "5 / 10", "Oui"…) et un en-tête plus long (surtout en arabe, ex.
    // "النتيجة المحصّلة") se retrouve replié sur deux lignes faute de place.
    // La colonne "Critère" reste 'auto' pour absorber l'espace restant.
    doc.setFontSize(8.5);
    const numW = requiredColumnWidth(doc, lang, [L.colNum, ...bodyRows.map((r) => r[0])], 'bold');
    const coeffW = requiredColumnWidth(doc, lang, [L.colCoefficient, ...bodyRows.map((r) => r[2])], 'bold');
    const valueW = requiredColumnWidth(doc, lang, [L.colValue, ...bodyRows.map((r) => r[3])], 'bold');
    const obtainedW = requiredColumnWidth(doc, lang, [L.colObtained, ...allRows.map((r) => r[4])], 'bold');
    const pointsW = requiredColumnWidth(doc, lang, [L.colPoints, ...allRows.map((r) => r[5])], 'bold');
    const logicalColWidths: Array<number | undefined> = [numW, undefined, coeffW, valueW, obtainedW, pointsW];
    const orderedColWidths = isRtl ? [...logicalColWidths].reverse() : logicalColWidths;
    const columnStyles = Object.fromEntries(
      orderedColWidths.map((w, i) => [i, w != null ? { cellWidth: w } : {}])
    );

    autoTable(doc, {
      startY: cursorY,
      margin: { left: marginX, right: marginX },
      head: isRtl ? head.map((r) => [...r].reverse()) : head,
      body: isRtl ? allRows.map((r) => [...r].reverse()) : allRows,
      styles: { cellPadding: 2.5, font: isRtl ? FONT_AR : 'helvetica', halign: isRtl ? 'right' : 'left', fontSize: 8.5 },
      headStyles: { fillColor: COLOR_PRIMARY, textColor: 255, fontSize: 8.5, halign: isRtl ? 'right' : 'left' },
      bodyStyles: { fontSize: 8.5, textColor: COLOR_TEXT },
      columnStyles,
      alternateRowStyles: { fillColor: [246, 248, 250] },
      // Dernière ligne (Total) mise en évidence.
      didParseCell: (data) => {
        const isTotalRow = data.section === 'body' && data.row.index === allRows.length - 1;
        if (isTotalRow) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [232, 240, 246];
        }
        // La police Amiri n'ayant pas une bonne couverture latine, chaque cellule
        // choisit sa police selon son propre contenu (nom français vs texte arabe).
        if (isRtl) {
          const raw = Array.isArray(data.cell.raw) ? data.cell.raw.join(' ') : String(data.cell.raw ?? '');
          data.cell.styles.font = isArabicText(raw) ? FONT_AR : 'helvetica';
        }
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cursorY = (doc as any).lastAutoTable.finalY + 10;
  }

  // ── Synthèse (meilleur critère / critère à améliorer) ─────────────────
  if (responses.length >= 2) {
    const scored = responses.map((response) => {
      const criterion = criteria.find((c) => c.id === response.criterion_id);
      const weight = criterion?.weight ?? 1;
      const rawMax = criterion ? getCriterionMaxPoints(criterion, rules) : response.points;
      const weightedPoints = response.points * weight;
      const maxPoints = rawMax * weight;
      const r = maxPoints > 0 ? weightedPoints / maxPoints : 0;
      return {
        name: resolveCriterionName(response.criterion_id, response.criterion_name, criteria, lang),
        points: weightedPoints,
        maxPoints,
        ratio: r,
      };
    });
    const sorted = [...scored].sort((a, b) => b.ratio - a.ratio);
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];

    const gap = 4;
    const boxWidth = (pageWidth - marginX * 2 - gap) / 2;

    const measureNameLines = (name: string) => {
      doc.setFont(lang === 'ar' && isArabicText(name) ? FONT_AR : 'helvetica', 'bold');
      doc.setFontSize(9.5);
      return (doc.splitTextToSize(name, boxWidth - 8) as string[]).slice(0, 2);
    };
    const bestLines = measureNameLines(best.name);
    const worstLines = measureNameLines(worst.name);
    const maxLines = Math.max(bestLines.length, worstLines.length);
    const boxHeight = 12 + maxLines * 4.6;

    // Saut de page si la synthèse ne tient pas en bas de page (titre + boîtes).
    if (cursorY + boxHeight + 12 > 285) {
      doc.addPage();
      cursorY = 20;
    }

    setFont(doc, lang, 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...COLOR_TEXT);
    drawText(doc, lang, L.synthese, startX, cursorY, { align: startAlign });
    cursorY += 5;

    const drawSyntheseBox = (
      boxX: number,
      bg: [number, number, number],
      titleColor: [number, number, number],
      title: string,
      nameLines: string[],
      points: number,
      maxPoints: number
    ) => {
      doc.setFillColor(...bg);
      doc.roundedRect(boxX, cursorY, boxWidth, boxHeight, 2, 2, 'F');
      const textX = isRtl ? boxX + boxWidth - 4 : boxX + 4;
      const align = isRtl ? 'right' : 'left';

      setFont(doc, lang, 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(...titleColor);
      drawText(doc, lang, title, textX, cursorY + 6, { align });

      doc.setTextColor(...COLOR_TEXT);
      doc.setFontSize(9.5);
      drawText(doc, lang, nameLines, textX, cursorY + 11, { align, style: 'bold' });

      setFont(doc, lang, 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...COLOR_MUTED);
      drawText(
        doc,
        lang,
        `${formatDecimal(points)} / ${formatDecimal(maxPoints)} ${L.ptsUnit}`,
        textX,
        cursorY + 11 + maxLines * 4.6,
        { align }
      );
    };

    // En FR : meilleur (vert) à gauche, à améliorer (rouge) à droite ; miroir en AR.
    const bestBoxX = isRtl ? marginX + boxWidth + gap : marginX;
    const worstBoxX = isRtl ? marginX : marginX + boxWidth + gap;
    drawSyntheseBox(bestBoxX, [236, 253, 245], COLOR_GREEN, L.bestCriterion, bestLines, best.points, best.maxPoints);
    drawSyntheseBox(worstBoxX, [254, 242, 242], COLOR_RED, L.worstCriterion, worstLines, worst.points, worst.maxPoints);

    cursorY += boxHeight + 8;
  }

  // ── Commentaire de l'approbateur ──────────────────────────────────────
  const approvalComment = getApprovalComment(evaluation.activity_log);
  if (approvalComment) {
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
    doc.setFont(lang === 'ar' && isArabicText(approvalComment) ? FONT_AR : 'helvetica', 'normal');
    const lines = doc.splitTextToSize(approvalComment, pageWidth - marginX * 2);
    drawText(doc, lang, lines, startX, cursorY, { align: startAlign });
    cursorY += lines.length * 5 + 10;
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
