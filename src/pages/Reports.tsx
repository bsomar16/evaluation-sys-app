import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, FileSpreadsheet, FileText, Eye, Printer } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { useToast } from '@/hooks/use-toast';
import { useRolePermissions } from '@/hooks/useRolePermissions';
import { usePagination } from '@/hooks/usePagination';
import { PaginationControls } from '@/components/PaginationControls';
import { ModuleAccessDenied } from '@/components/ModuleAccessDenied';
import { hideLoadingOverlay } from '@/lib/loading-overlay';
import { formatEvaluationPercentage } from '@/lib/evaluation-calculator';
import { EVALUATION_STATUS_LABELS, type EvaluationStatus } from '@/lib/evaluation-types';
import {
  fetchEvaluationReportData,
  findPreviousEvaluationRow,
  type EvaluationReportData,
  type EvaluationReportRow,
} from '@/lib/evaluation-report-data';
import { generateEvaluationReportPdf, generateEvaluationReportsPdf } from '@/lib/evaluation-report-pdf';
import { exportEvaluationReportListToExcel, exportEvaluationReportToExcel } from '@/lib/evaluation-report-excel';
import { EvaluationReportView } from '@/components/evaluation/EvaluationReportView';

const ALL_VALUE = '__all__';

function scoreBadgeVariant(percentage: number | null): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (percentage == null) return 'outline';
  if (percentage >= 70) return 'default';
  if (percentage >= 40) return 'secondary';
  return 'destructive';
}

export default function Reports() {
  const { t } = useI18n();
  const { toast } = useToast();
  const { canRead } = useRolePermissions();
  const [data, setData] = useState<EvaluationReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [periodFilter, setPeriodFilter] = useState(ALL_VALUE);
  const [branchFilter, setBranchFilter] = useState(ALL_VALUE);
  const [statusFilter, setStatusFilter] = useState(ALL_VALUE);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [viewingRow, setViewingRow] = useState<EvaluationReportRow | null>(null);

  useEffect(() => {
    fetchEvaluationReportData()
      .then(setData)
      .catch(() => setData({ rows: [], criteria: [], rules: [], branches: [], departments: [], roles: [] }))
      .finally(() => {
        setLoading(false);
        hideLoadingOverlay();
      });
  }, []);

  const periods = useMemo(() => {
    if (!data) return [];
    return [...new Set(data.rows.map((r) => r.evaluation.period).filter(Boolean))] as string[];
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return data.rows.filter((row) => {
      if (q && !(row.evaluation.employee_name ?? '').toLowerCase().includes(q)) return false;
      if (periodFilter !== ALL_VALUE && row.evaluation.period !== periodFilter) return false;
      if (branchFilter !== ALL_VALUE && row.branchId !== branchFilter) return false;
      if (statusFilter !== ALL_VALUE && row.evaluation.status !== statusFilter) return false;
      return true;
    });
  }, [data, search, periodFilter, branchFilter, statusFilter]);

  const pagination = usePagination(filtered, 10);

  const toggleSelect = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const selectedRows = filtered.filter((row) => selectedIds.has(row.evaluation.id));
  // Le rapport PDF n'étant produit que pour les évaluations approuvées, on ne
  // propose l'impression que pour ce sous-ensemble de la sélection (ou de la
  // liste filtrée si rien n'est coché).
  const printableRows = (selectedRows.length > 0 ? selectedRows : filtered).filter(
    (row) => row.evaluation.status === 'approved'
  );

  const handleExportSelection = () => {
    exportEvaluationReportListToExcel(selectedRows.length > 0 ? selectedRows : filtered);
  };

  const getPrevious = (row: EvaluationReportRow) => {
    if (!data) return { previousPeriodLabel: null, previousPercentage: null };
    const previous = findPreviousEvaluationRow(row, data.rows, data.periodStartByName);
    return {
      previousPeriodLabel: previous?.evaluation.period ?? null,
      previousPercentage: previous?.percentage ?? null,
    };
  };

  const handlePrintSelection = () => {
    if (!data || printableRows.length === 0) return;
    const opened = generateEvaluationReportsPdf(
      printableRows.map((row) => ({
        evaluation: row.evaluation,
        employeeName: row.evaluation.employee_name ?? '—',
        position: row.position,
        branchName: row.branchName,
        departmentName: row.departmentName,
        roleName: row.roleName,
        percentage: row.percentage,
        criteria: data.criteria,
        rules: data.rules,
        ...getPrevious(row),
      }))
    );
    if (!opened) {
      toast({ title: t('reports.popupBlockedTitle'), description: t('reports.popupBlockedDesc') });
    }
  };

  const handlePdf = (row: EvaluationReportRow) => {
    if (!data || row.evaluation.status !== 'approved') return;
    const opened = generateEvaluationReportPdf({
      evaluation: row.evaluation,
      employeeName: row.evaluation.employee_name ?? '—',
      position: row.position,
      branchName: row.branchName,
      departmentName: row.departmentName,
      roleName: row.roleName,
      percentage: row.percentage,
      criteria: data.criteria,
      rules: data.rules,
      ...getPrevious(row),
    });
    if (!opened) {
      toast({ title: t('reports.popupBlockedTitle'), description: t('reports.popupBlockedDesc') });
    }
  };

  const handleExcel = (row: EvaluationReportRow) => {
    if (!data) return;
    exportEvaluationReportToExcel({
      evaluation: row.evaluation,
      employeeName: row.evaluation.employee_name ?? '—',
      position: row.position,
      branchName: row.branchName,
      departmentName: row.departmentName,
      roleName: row.roleName,
      percentage: row.percentage,
      criteria: data.criteria,
      rules: data.rules,
      ...getPrevious(row),
    });
  };

  if (!canRead('reports')) {
    return <ModuleAccessDenied />;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold font-heading text-foreground">{t('reports.title')}</h1>
          <p className="text-muted-foreground text-sm mt-1">{t('reports.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          {printableRows.length > 0 && (
            <Button variant="outline" className="gap-2" onClick={handlePrintSelection}>
              <Printer size={16} />
              {t('evaluation.print')}
            </Button>
          )}
          <Button variant="outline" className="gap-2" onClick={handleExportSelection} disabled={filtered.length === 0}>
            <FileSpreadsheet size={16} />
            {t('reports.exportSelection')}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">{t('reports.listTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t('reports.searchPlaceholder')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={periodFilter} onValueChange={setPeriodFilter}>
              <SelectTrigger className="w-full sm:w-[160px]">
                <SelectValue placeholder={t('reports.colPeriod')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_VALUE}>{t('common.all')}</SelectItem>
                {periods.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={branchFilter} onValueChange={setBranchFilter}>
              <SelectTrigger className="w-full sm:w-[160px]">
                <SelectValue placeholder={t('reports.colBranch')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_VALUE}>{t('common.all')}</SelectItem>
                {(data?.branches ?? []).map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[160px]">
                <SelectValue placeholder={t('reports.colStatus')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_VALUE}>{t('common.all')}</SelectItem>
                {(Object.keys(EVALUATION_STATUS_LABELS) as EvaluationStatus[]).map((s) => (
                  <SelectItem key={s} value={s}>
                    {t(`evalStatus.${s}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <p>{t('common.loading')}</p>
          ) : filtered.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">{t('reports.noResults')}</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="w-10 py-3 px-4">
                        <Checkbox
                          checked={pagination.paginatedItems.length > 0 && pagination.paginatedItems.every((r) => selectedIds.has(r.evaluation.id))}
                          onCheckedChange={(checked) => {
                            pagination.paginatedItems.forEach((r) => toggleSelect(r.evaluation.id, checked === true));
                          }}
                        />
                      </th>
                      <th className="text-left py-3 px-4">{t('reports.colEmployee')}</th>
                      <th className="text-left py-3 px-4">{t('reports.colPeriod')}</th>
                      <th className="text-left py-3 px-4">{t('reports.colBranch')}</th>
                      <th className="text-right py-3 px-4">{t('reports.colScore')}</th>
                      <th className="text-center py-3 px-4">{t('reports.colStatus')}</th>
                      <th className="text-right py-3 px-4">{t('common.actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagination.paginatedItems.map((row) => (
                      <tr key={row.evaluation.id} className="border-b hover:bg-muted/50">
                        <td className="py-3 px-4">
                          <Checkbox
                            checked={selectedIds.has(row.evaluation.id)}
                            onCheckedChange={(checked) => toggleSelect(row.evaluation.id, checked === true)}
                          />
                        </td>
                        <td className="py-3 px-4 font-medium">{row.evaluation.employee_name ?? '—'}</td>
                        <td className="py-3 px-4">{row.evaluation.period || '—'}</td>
                        <td className="py-3 px-4 text-muted-foreground">{row.branchName || '—'}</td>
                        <td className="py-3 px-4 text-right">
                          {row.percentage != null ? (
                            <Badge variant={scoreBadgeVariant(row.percentage)}>{formatEvaluationPercentage(row.percentage)}</Badge>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <Badge variant="outline">{t(`evalStatus.${row.evaluation.status}`)}</Badge>
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <Button variant="ghost" size="sm" title={t('reports.viewReport')} onClick={() => setViewingRow(row)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" title="Excel" onClick={() => handleExcel(row)}>
                            <FileSpreadsheet className="h-4 w-4" />
                          </Button>
                          {row.evaluation.status === 'approved' && (
                            <Button variant="ghost" size="sm" title="PDF" onClick={() => handlePdf(row)}>
                              <FileText className="h-4 w-4" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <PaginationControls
                currentPage={pagination.currentPage}
                totalPages={pagination.totalPages}
                itemsPerPage={pagination.itemsPerPage}
                totalItems={pagination.totalItems}
                onPageChange={pagination.setCurrentPage}
                onItemsPerPageChange={pagination.setItemsPerPage}
                canGoPrev={pagination.canGoPrev}
                canGoNext={pagination.canGoNext}
              />
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!viewingRow} onOpenChange={(open) => !open && setViewingRow(null)}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('reports.detailTitle')}</DialogTitle>
            <DialogDescription>{t('reports.pdfNote')}</DialogDescription>
          </DialogHeader>
          {viewingRow && data && (
            <EvaluationReportView
              row={viewingRow}
              criteria={data.criteria}
              rules={data.rules}
              allRows={data.rows}
              periodStartByName={data.periodStartByName}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
