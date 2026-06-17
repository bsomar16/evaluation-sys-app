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

const SOURCE_BESOIN_LABELS: Record<string, string> = {
  evaluation: 'Évaluation',
  promotion: 'Promotion',
  besoin_technique: 'Besoin technique',
};

const TYPE_COMPETENCE_LABELS: Record<string, string> = {
  technique: 'Technique',
  comportementale: 'Comportementale',
  manageriale: 'Manageriale',
};

const LANGUE_LABELS: Record<string, string> = {
  ar: 'Arabe',
  fr: 'Français',
  en: 'Anglais',
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
        title: 'Erreur',
        description: 'Impossible de charger la liste des employés.',
      });
    } finally {
      setEmployeesLoading(false);
    }
  }, [toast]);

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
      toast({ variant: 'destructive', title: 'Erreur', description: 'Impossible de charger les demandes.' });
    } finally {
      setLoading(false);
      hideLoadingOverlay();
    }
  }, [canValidate, isDeveloper, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async () => {
    if (!selectedEmployee) {
      toast({
        variant: 'destructive',
        title: 'Employé requis',
        description: 'Sélectionnez d’abord un employé.',
      });
      return;
    }
    if (!form.intitule?.trim()) {
      toast({ variant: 'destructive', title: 'Champ requis', description: "L'intitulé est obligatoire." });
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
      toast({ title: 'Demande enregistrée', description: 'En attente de validation.' });
      notifyTrainingRequestsChanged();
      handleDialogOpenChange(false);
      await load();
    } catch (e) {
      console.error(e);
      toast({ variant: 'destructive', title: 'Erreur', description: "Échec de l'enregistrement." });
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
        title: status === 'approved' ? 'Demande acceptée' : 'Demande refusée',
        description:
          status === 'approved'
            ? 'Disponible pour la planification.'
            : 'Le demandeur sera notifié.',
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
        <h1 className="text-3xl font-bold">Formation</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Demandes de formation et suivi des statuts
        </p>
      </div>
      {showTrainingPlanningButton(isDeveloper, canReadTrainingManagement) && (
        <Button variant="outline" asChild className="gap-2 shrink-0">
          <Link to="/admin/training-planning">Planification des formations</Link>
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
          ← Retour à la liste
        </Button>

        <div className="space-y-3 border-b pb-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-2xl font-bold tracking-tight">
              Demande : {selectedRequest.course_name}
            </h2>
            <Badge variant={isPending ? 'secondary' : 'outline'}>
              {TRAINING_STATUS_LABELS[selectedRequest.status]}
            </Badge>
          </div>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <DetailField label="Employé" value={selectedRequest.employee_name} />
            <DetailField
              label="Date de demande"
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
              Demande en attente — consultez les informations ci-dessous puis acceptez ou refusez.
            </CardContent>
          </Card>
        )}

        {selectedRequest.status === 'approved' && (
          <Card className="border-emerald-300/50 bg-emerald-50/50 dark:bg-emerald-950/20">
            <CardContent className="py-3 text-sm">
              Demande acceptée — disponible pour la planification des formations.
            </CardContent>
          </Card>
        )}

        {selectedRequest.status === 'rejected' && (
          <Card className="border-destructive/40 bg-destructive/5">
            <CardContent className="py-3 text-sm text-muted-foreground">
              Cette demande a été refusée.
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Détail de la demande</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="grid gap-4 text-sm sm:grid-cols-2">
              <DetailField label="Problématique à résoudre" value={d.problematique ?? selectedRequest.reason} />
              <DetailField
                label="Source du besoin"
                value={SOURCE_BESOIN_LABELS[d.source_besoin ?? ''] ?? d.source_besoin}
              />
              <DetailField label="Objectif attendu" value={d.objectif} />
              <DetailField
                label="Domaine"
                value={TRAINING_DOMAIN_LABELS[d.domaine ?? ''] ?? d.domaine}
              />
              <DetailField label="Intitulé de la formation" value={selectedRequest.course_name} />
              <DetailField
                label="Type de compétence"
                value={TYPE_COMPETENCE_LABELS[d.type_competence ?? ''] ?? d.type_competence}
              />
              <div>
                <dt className="text-muted-foreground text-sm">Priorité</dt>
                <dd className="mt-1">
                  <TrainingPriorityBadge priorite={d.priorite} />
                </dd>
              </div>
              <DetailField label="Période proposée" value={PERIODE_LABELS[d.periode ?? ''] ?? d.periode} />
              <DetailField label="Langue" value={LANGUE_LABELS[d.langue ?? ''] ?? d.langue} />
              <DetailField label="Formateur proposé" value={d.formateur} />
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
                Accepter
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
                Refuser
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
          <CardTitle className="text-base">Liste des demandes</CardTitle>
          {canCreate && (
            <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
              <DialogTrigger asChild>
                <Button className="gap-2" size="sm">
                  <Plus className="h-4 w-4" />
                  Nouvelle demande
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Demande de formation</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Employé *</Label>
                    <Select
                      value={selectedEmployeeId || undefined}
                      onValueChange={setSelectedEmployeeId}
                      disabled={employeesLoading}
                    >
                      <SelectTrigger>
                        <SelectValue
                          placeholder={
                            employeesLoading
                              ? 'Chargement…'
                              : 'Sélectionner un employé en premier'
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {employees.length === 0 && !employeesLoading ? (
                          <SelectItem value="__empty" disabled>
                            Aucun employé disponible
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
                        Choisissez l’employé concerné avant de remplir le reste du formulaire.
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
                    <Label>Problématique à résoudre</Label>
                    <Textarea
                      rows={2}
                      value={form.problematique}
                      onChange={(e) => setForm((p) => ({ ...p, problematique: e.target.value }))}
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Source du besoin</Label>
                      <Select
                        value={form.source_besoin}
                        onValueChange={(v) => setForm((p) => ({ ...p, source_besoin: v }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Sélectionner" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="evaluation">Évaluation</SelectItem>
                          <SelectItem value="promotion">Promotion</SelectItem>
                          <SelectItem value="besoin_technique">Besoin technique</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Objectif attendu</Label>
                      <Input
                        value={form.objectif}
                        onChange={(e) => setForm((p) => ({ ...p, objectif: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Domaine</Label>
                      <Select
                        value={form.domaine}
                        onValueChange={(v) => setForm((p) => ({ ...p, domaine: v }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Domaine" />
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
                      <Label>Intitulé de la formation *</Label>
                      <Input
                        value={form.intitule}
                        onChange={(e) => setForm((p) => ({ ...p, intitule: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="space-y-2">
                      <Label>Type de compétence</Label>
                      <Select
                        value={form.type_competence}
                        onValueChange={(v) => setForm((p) => ({ ...p, type_competence: v }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="technique">Technique</SelectItem>
                          <SelectItem value="comportementale">Comportementale</SelectItem>
                          <SelectItem value="manageriale">Manageriale</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Priorité</Label>
                      <Select
                        value={form.priorite}
                        onValueChange={(v) => setForm((p) => ({ ...p, priorite: v }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Priorité" />
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
                      <Label>Période proposée</Label>
                      <Select
                        value={form.periode}
                        onValueChange={(v) => setForm((p) => ({ ...p, periode: v }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Trimestre" />
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
                      <Label>Langue</Label>
                      <Select
                        value={form.langue}
                        onValueChange={(v) => setForm((p) => ({ ...p, langue: v }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Langue" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ar">Arabe</SelectItem>
                          <SelectItem value="fr">Français</SelectItem>
                          <SelectItem value="en">Anglais</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Formateur proposé</Label>
                    <Input
                      value={form.formateur}
                      onChange={(e) => setForm((p) => ({ ...p, formateur: e.target.value }))}
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => handleDialogOpenChange(false)}>
                      Annuler
                    </Button>
                    <Button onClick={handleCreate} disabled={saving || !formUnlocked}>
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Enregistrer'}
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
              Chargement...
            </div>
          ) : requests.length === 0 ? (
            <p className="text-muted-foreground text-sm p-6">Aucune demande pour le moment.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Formation</TableHead>
                  <TableHead>Domaine</TableHead>
                  <TableHead>Priorité</TableHead>
                  <TableHead>Employé</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-center w-16">Statut</TableHead>
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
