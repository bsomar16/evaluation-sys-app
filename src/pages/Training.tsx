import { useCallback, useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, ChevronRight, Loader2, Plus, XCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useRolePermissions } from '@/hooks/useRolePermissions';
import { usePagination } from '@/hooks/usePagination';
import { PaginationControls } from '@/components/PaginationControls';
import { ModuleAccessDenied } from '@/components/ModuleAccessDenied';
import {
  hasTrainingModuleAccess,
  showTrainingPlanningButton,
} from '@/lib/training-access';
import { fetchEmployeesForEvaluation } from '@/lib/evaluation-storage';
import type { EmployeeForEvaluation } from '@/lib/evaluation-types';
import {
  createTrainingRequest,
  fetchTrainingRequests,
  updateTrainingStatus,
} from '@/lib/training-storage';
import type { TrainingRequestRecord } from '@/lib/training-types';
import {
  TRAINING_DOMAIN_LABELS,
  TRAINING_PRIORITY_LABELS,
  TRAINING_STATUS_LABELS,
  getTrainingPriorityBadgeClass,
  getTrainingPriorityLabel,
  getTrainingStatusDotClass,
} from '@/lib/training-types';
import type { TrainingRequestDetails } from '@/lib/training-types';
import { hideLoadingOverlay } from '@/lib/loading-overlay';
import { useI18n } from '@/lib/i18n';

type TrainingFormState = TrainingRequestDetails & { intitule: string };

const emptyForm: TrainingFormState = {
  intitule: '',
  problematique: '',
  source_besoin: '',
  objectif: '',
  domaine: '',
  type_competence: '',
  priorite: '',
  periode: '',
  langue: '',
  formateur: '',
  beneficiary_name: '',
};

const PERIODE_LABELS: Record<string, string> = {
  t1: 'Trimestre 1',
  t2: 'Trimestre 2',
  t3: 'Trimestre 3',
  t4: 'Trimestre 4',
};

function notifyTrainingRequestsChanged() {
  window.dispatchEvent(new CustomEvent('training-requests-changed'));
}

function TrainingPriorityBadge({ priorite }: { priorite?: string | null }) {
  if (!priorite) return <span className="text-muted-foreground text-sm">—</span>;
  const label = getTrainingPriorityLabel(priorite);
  const extraClass = getTrainingPriorityBadgeClass(priorite);
  return (
    <Badge variant="outline" className={extraClass || undefined}>
      {label}
    </Badge>
  );
}

function DetailField({ label, value }: { label: string; value?: string | null }) {
  if (!value?.trim()) return null;
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium whitespace-pre-wrap">{value}</dd>
    </div>
  );
}

export default function Training() {
  const { toast } = useToast();
  const { t } = useI18n();
  const {
    isDeveloper,
    canRead,
    canWrite,
    canRequestTraining,
    canReviewTraining,
  } = useRolePermissions();
  const canReadTraining = canRead('training');
  const canWriteTraining = canWrite('training');
  const canReadTrainingManagement = canRead('training_management');
  const canCreate = isDeveloper || canRequestTraining() || canWriteTraining;
  const canValidate = isDeveloper || canReviewTraining();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [requests, setRequests] = useState<TrainingRequestRecord[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [employees, setEmployees] = useState<EmployeeForEvaluation[]>([]);
  const [employeesLoading, setEmployeesLoading] = useState(false);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);

  const pagination = usePagination(requests, 10);

  const selectedEmployee = employees.find((e) => e.id === selectedEmployeeId) ?? null;
  const selectedRequest =
    selectedRequestId != null ? requests.find((r) => r.id === selectedRequestId) ?? null : null;
  const formUnlocked = Boolean(selectedEmployeeId);

  const loadEmployees = useCallback(async () => {
    setEmployeesLoading(true);
    try {
      const list = await fetchEmployeesForEvaluation({ directSubordinateLevelOnly: false });
      setEmployees(list);
    } catch (e) {
      console.error(e);
      toast({
        variant: 'destructive',
        title: t('common.error'),
        description: t('training.errorLoadEmployees'),
      });
    } finally {
      setEmployeesLoading(false);
    }
  }, [toast, t]);

  const handleDialogOpenChange = (open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      setForm(emptyForm);
      setSelectedEmployeeId('');
    } else {
      void loadEmployees();
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const scope = canValidate || isDeveloper ? 'all' : 'mine';
      const data = await Promise.race([
        fetchTrainingRequests({ scope }),
        new Promise<TrainingRequestRecord[]>((_, reject) => {
          window.setTimeout(() => reject(new Error('timeout')), 15000);
        }),
      ]);
      setRequests(data);
      notifyTrainingRequestsChanged();
    } catch (e) {
      console.error(e);
      setRequests([]);
      toast({ variant: 'destructive', title: t('common.error'), description: t('training.errorLoadRequests') });
    } finally {
      setLoading(false);
      hideLoadingOverlay();
    }
  }, [canValidate, isDeveloper, toast, t]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async () => {
    if (!selectedEmployee) {
      toast({
        variant: 'destructive',
        title: t('training.employeeRequiredTitle'),
        description: t('training.employeeRequiredDesc'),
      });
      return;
    }
    if (!form.intitule?.trim()) {
      toast({ variant: 'destructive', title: t('training.fieldRequiredTitle'), description: t('training.titleRequiredDesc') });
      return;
    }
    setSaving(true);
    try {
      const { intitule, ...request_details } = form;
      await createTrainingRequest({
        course_name: intitule.trim(),
        reason: form.problematique || null,
        request_details: {
          ...request_details,
          beneficiary_name: selectedEmployee.name,
        },
        beneficiary: {
          id: selectedEmployee.id,
          email: selectedEmployee.email ?? undefined,
          name: selectedEmployee.name,
        },
      });
      toast({ title: t('training.requestSaved'), description: t('training.requestSavedDesc') });
      notifyTrainingRequestsChanged();
      handleDialogOpenChange(false);
      await load();
    } catch (e) {
      console.error(e);
      toast({ variant: 'destructive', title: t('common.error'), description: t('training.saveFailed') });
    } finally {
      setSaving(false);
    }
  };

  const handleReview = async (status: 'approved' | 'rejected') => {
    if (!selectedRequest) return;
    setSaving(true);
    try {
      await updateTrainingStatus(selectedRequest.id, status);
      toast({
        title: status === 'approved' ? t('training.requestAccepted') : t('training.requestRejected'),
        description:
          status === 'approved'
            ? t('training.requestAcceptedDesc')
            : t('training.requestRejectedDesc'),
      });
      notifyTrainingRequestsChanged();
      await load();
    } finally {
      setSaving(false);
    }
  };

  const canOpenRequestDetail =
    isDeveloper || canReadTraining || canWriteTraining || canValidate;

  if (!hasTrainingModuleAccess(isDeveloper, canReadTraining, canWriteTraining)) {
    return <ModuleAccessDenied />;
  }

  const pageHeader = (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 className="text-3xl font-bold">{t('nav.training')}</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {t('training.subtitle')}
        </p>
      </div>
      {showTrainingPlanningButton(isDeveloper, canReadTrainingManagement) && (
        <Button variant="outline" asChild className="gap-2 shrink-0">
          <Link to="/admin/training-planning">{t('nav.training_management')}</Link>
        </Button>
      )}
    </div>
  );

  if (selectedRequest) {
    const d = selectedRequest.request_details;
    const isPending = selectedRequest.status === 'pending';

    return (
      <div className="space-y-6 animate-fade-in max-w-3xl">
        {pageHeader}
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 w-fit"
          onClick={() => setSelectedRequestId(null)}
        >
          ← {t('training.backToList')}
        </Button>

        <div className="space-y-3 border-b pb-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-2xl font-bold tracking-tight">
              {t('training.requestTitle', { name: selectedRequest.course_name })}
            </h2>
            <Badge variant={isPending ? 'secondary' : 'outline'}>
              {TRAINING_STATUS_LABELS[selectedRequest.status]}
            </Badge>
          </div>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <DetailField label={t('training.fEmployee')} value={selectedRequest.employee_name} />
            <DetailField
              label={t('training.fRequestDate')}
              value={
                selectedRequest.created_at
                  ? new Date(selectedRequest.created_at).toLocaleDateString('fr-FR')
                  : null
              }
            />
          </dl>
        </div>

        {isPending && canValidate && (
          <Card className="border-orange-300/60 bg-orange-50 dark:bg-orange-950/30">
            <CardContent className="py-3 text-sm">
              {t('training.pendingInfo')}
            </CardContent>
          </Card>
        )}

        {selectedRequest.status === 'approved' && (
          <Card className="border-emerald-300/50 bg-emerald-50/50 dark:bg-emerald-950/20">
            <CardContent className="py-3 text-sm">
              {t('training.approvedInfo')}
            </CardContent>
          </Card>
        )}

        {selectedRequest.status === 'rejected' && (
          <Card className="border-destructive/40 bg-destructive/5">
            <CardContent className="py-3 text-sm text-muted-foreground">
              {t('training.rejectedInfo')}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('training.detailTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="grid gap-4 text-sm sm:grid-cols-2">
              <DetailField label={t('training.fProblem')} value={d.problematique ?? selectedRequest.reason} />
              <DetailField
                label={t('training.fSource')}
                value={d.source_besoin ? t(`training.source_${d.source_besoin}`) : d.source_besoin}
              />
              <DetailField label={t('training.fObjective')} value={d.objectif} />
              <DetailField
                label={t('training.fDomain')}
                value={TRAINING_DOMAIN_LABELS[d.domaine ?? ''] ?? d.domaine}
              />
              <DetailField label={t('training.fTitle')} value={selectedRequest.course_name} />
              <DetailField
                label={t('training.fSkillType')}
                value={d.type_competence ? t(`training.skill_${d.type_competence}`) : d.type_competence}
              />
              <div>
                <dt className="text-muted-foreground text-sm">{t('training.fPriority')}</dt>
                <dd className="mt-1">
                  <TrainingPriorityBadge priorite={d.priorite} />
                </dd>
              </div>
              <DetailField label={t('training.fPeriod')} value={PERIODE_LABELS[d.periode ?? ''] ?? d.periode} />
              <DetailField label={t('training.fLanguage')} value={d.langue ? t(`training.lang_${d.langue}`) : d.langue} />
              <DetailField label={t('training.fTrainer')} value={d.formateur} />
            </dl>
          </CardContent>
        </Card>

        {isPending && canValidate && (
          <Card>
            <CardContent className="flex flex-wrap gap-2 py-4">
              <Button
                className="gap-2"
                onClick={() => handleReview('approved')}
                disabled={saving}
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle className="h-4 w-4" />
                )}
                {t('training.accept')}
              </Button>
              <Button
                variant="destructive"
                className="gap-2"
                onClick={() => handleReview('rejected')}
                disabled={saving}
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <XCircle className="h-4 w-4" />
                )}
                {t('training.reject')}
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {pageHeader}

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
          <CardTitle className="text-base">{t('training.listTitle')}</CardTitle>
          {canCreate && (
            <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
              <DialogTrigger asChild>
                <Button className="gap-2" size="sm">
                  <Plus className="h-4 w-4" />
                  {t('training.newRequest')}
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{t('training.dialogTitle')}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>{t('training.employeeRequired')}</Label>
                    <Select
                      value={selectedEmployeeId || undefined}
                      onValueChange={setSelectedEmployeeId}
                      disabled={employeesLoading}
                    >
                      <SelectTrigger>
                        <SelectValue
                          placeholder={
                            employeesLoading
                              ? t('training.loadingPlaceholder')
                              : t('training.selectEmployeeFirst')
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {employees.length === 0 && !employeesLoading ? (
                          <SelectItem value="__empty" disabled>
                            {t('training.noEmployeeAvailable')}
                          </SelectItem>
                        ) : (
                          employees.map((emp) => (
                            <SelectItem key={emp.id} value={emp.id}>
                              {emp.name}
                              {emp.position ? ` — ${emp.position}` : ''}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    {!formUnlocked && (
                      <p className="text-xs text-muted-foreground">
                        {t('training.chooseEmployeeFirst')}
                      </p>
                    )}
                  </div>

                  <div
                    className={
                      formUnlocked
                        ? 'space-y-4'
                        : 'space-y-4 opacity-50 pointer-events-none select-none'
                    }
                  >
                  <div className="space-y-2">
                    <Label>{t('training.fProblem')}</Label>
                    <Textarea
                      rows={2}
                      value={form.problematique}
                      onChange={(e) => setForm((p) => ({ ...p, problematique: e.target.value }))}
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>{t('training.fSource')}</Label>
                      <Select
                        value={form.source_besoin}
                        onValueChange={(v) => setForm((p) => ({ ...p, source_besoin: v }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={t('training.select')} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="evaluation">{t('training.source_evaluation')}</SelectItem>
                          <SelectItem value="promotion">{t('training.source_promotion')}</SelectItem>
                          <SelectItem value="besoin_technique">{t('training.source_besoin_technique')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>{t('training.fObjective')}</Label>
                      <Input
                        value={form.objectif}
                        onChange={(e) => setForm((p) => ({ ...p, objectif: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>{t('training.fDomain')}</Label>
                      <Select
                        value={form.domaine}
                        onValueChange={(v) => setForm((p) => ({ ...p, domaine: v }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={t('training.fDomain')} />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(TRAINING_DOMAIN_LABELS).map(([k, label]) => (
                            <SelectItem key={k} value={k}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>{t('training.fTitleRequired')}</Label>
                      <Input
                        value={form.intitule}
                        onChange={(e) => setForm((p) => ({ ...p, intitule: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="space-y-2">
                      <Label>{t('training.fSkillType')}</Label>
                      <Select
                        value={form.type_competence}
                        onValueChange={(v) => setForm((p) => ({ ...p, type_competence: v }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={t('training.typePlaceholder')} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="technique">{t('training.skill_technique')}</SelectItem>
                          <SelectItem value="comportementale">{t('training.skill_comportementale')}</SelectItem>
                          <SelectItem value="manageriale">{t('training.skill_manageriale')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>{t('training.fPriority')}</Label>
                      <Select
                        value={form.priorite}
                        onValueChange={(v) => setForm((p) => ({ ...p, priorite: v }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={t('training.fPriority')} />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(TRAINING_PRIORITY_LABELS).map(([k, label]) => (
                            <SelectItem key={k} value={k}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>{t('training.fPeriod')}</Label>
                      <Select
                        value={form.periode}
                        onValueChange={(v) => setForm((p) => ({ ...p, periode: v }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={t('training.quarterPlaceholder')} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="t1">T1</SelectItem>
                          <SelectItem value="t2">T2</SelectItem>
                          <SelectItem value="t3">T3</SelectItem>
                          <SelectItem value="t4">T4</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>{t('training.fLanguage')}</Label>
                      <Select
                        value={form.langue}
                        onValueChange={(v) => setForm((p) => ({ ...p, langue: v }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={t('training.fLanguage')} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ar">{t('training.lang_ar')}</SelectItem>
                          <SelectItem value="fr">{t('training.lang_fr')}</SelectItem>
                          <SelectItem value="en">{t('training.lang_en')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>{t('training.fTrainer')}</Label>
                    <Input
                      value={form.formateur}
                      onChange={(e) => setForm((p) => ({ ...p, formateur: e.target.value }))}
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => handleDialogOpenChange(false)}>
                      {t('common.cancel')}
                    </Button>
                    <Button onClick={handleCreate} disabled={saving || !formUnlocked}>
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : t('common.save')}
                    </Button>
                  </div>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              {t('common.loading')}
            </div>
          ) : requests.length === 0 ? (
            <p className="text-muted-foreground text-sm p-6">{t('training.noRequests')}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('training.colTraining')}</TableHead>
                  <TableHead>{t('training.colDomain')}</TableHead>
                  <TableHead>{t('training.colPriority')}</TableHead>
                  <TableHead>{t('training.fEmployee')}</TableHead>
                  <TableHead>{t('common.date')}</TableHead>
                  <TableHead className="text-center w-16">{t('common.status')}</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagination.paginatedItems.map((r) => (
                  <TableRow
                    key={r.id}
                    className={
                      canOpenRequestDetail ? 'cursor-pointer hover:bg-muted/50' : undefined
                    }
                    onClick={() => {
                      if (canOpenRequestDetail) setSelectedRequestId(r.id);
                    }}
                  >
                    <TableCell className="font-medium">{r.course_name}</TableCell>
                    <TableCell>
                      {TRAINING_DOMAIN_LABELS[r.request_details.domaine ?? ''] ??
                        r.request_details.domaine ??
                        '—'}
                    </TableCell>
                    <TableCell>
                      <TrainingPriorityBadge priorite={r.request_details.priorite} />
                    </TableCell>
                    <TableCell>{r.employee_name ?? '—'}</TableCell>
                    <TableCell>
                      {r.created_at
                        ? new Date(r.created_at).toLocaleDateString('fr-FR')
                        : '—'}
                    </TableCell>
                    <TableCell className="text-center">
                      <span
                        className={`inline-block h-2.5 w-2.5 rounded-full ${getTrainingStatusDotClass(r.status)}`}
                        title={TRAINING_STATUS_LABELS[r.status]}
                        aria-label={TRAINING_STATUS_LABELS[r.status]}
                      />
                    </TableCell>
                    <TableCell>
                      {canOpenRequestDetail && (
                        <ChevronRight size={16} className="text-muted-foreground" />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {requests.length > 0 && (
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}
