import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
import { BarChart3, Loader2, Plus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useRolePermissions } from '@/hooks/useRolePermissions';
import { ModuleAccessDenied } from '@/components/ModuleAccessDenied';
import { canAccessTrainingPlanning } from '@/lib/training-access';
import {
  fetchTrainingRequests,
  saveTrainingPlanning,
} from '@/lib/training-storage';
import type { TrainingPlanningDetails, TrainingRequestRecord } from '@/lib/training-types';
import { TRAINING_STATUS_LABELS } from '@/lib/training-types';
import { formatDzd } from '@/lib/currency';

const emptyPlanning: TrainingPlanningDetails = {
  type_formation: '',
  lieu: '',
  budget: null,
  indicateurs: '',
  methode_evaluation: '',
  responsable_suivi: '',
};

const TYPE_FORMATION_LABELS: Record<string, string> = {
  interne: 'Interne',
  externe: 'Externe',
  sur_demande: 'Sur demande',
};

const LIEU_LABELS: Record<string, string> = {
  entreprise: 'Entreprise',
  centre: 'Centre',
  en_ligne: 'En ligne',
};

const METHODE_LABELS: Record<string, string> = {
  immediate: 'Immédiate',
  observation: 'Observation',
  post_formation: 'Résultats post-formation',
};

export default function TrainingPlanningPage() {
  const { toast } = useToast();
  const { isDeveloper, canRead, canWrite } = useRolePermissions();
  const canReadMgmt = canRead('training_management');
  const canWriteMgmt = canWrite('training_management');
  const canPlan = isDeveloper || canWriteMgmt;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [approved, setApproved] = useState<TrainingRequestRecord[]>([]);
  const [planned, setPlanned] = useState<TrainingRequestRecord[]>([]);
  const [planDialogOpen, setPlanDialogOpen] = useState(false);
  const [selectedRequestId, setSelectedRequestId] = useState('');
  const [planning, setPlanning] = useState<TrainingPlanningDetails>(emptyPlanning);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const all = await fetchTrainingRequests({ scope: 'all' });
      setApproved(all.filter((r) => r.status === 'approved'));
      setPlanned(all.filter((r) => r.status === 'planned' || r.status === 'completed'));
    } catch (e) {
      console.error(e);
      toast({ variant: 'destructive', title: 'Erreur', description: 'Chargement impossible.' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const selectedRequest = approved.find((r) => r.id === selectedRequestId) ?? null;

  const handleDialogChange = (open: boolean) => {
    setPlanDialogOpen(open);
    if (open) {
      setSelectedRequestId('');
      setPlanning(emptyPlanning);
    } else {
      setSelectedRequestId('');
      setPlanning(emptyPlanning);
    }
  };

  const handleSavePlan = async () => {
    if (!selectedRequest) {
      toast({
        variant: 'destructive',
        title: 'Formation requise',
        description: 'Sélectionnez une formation acceptée.',
      });
      return;
    }
    if (
      !planning.type_formation ||
      !planning.lieu ||
      !planning.methode_evaluation ||
      !planning.responsable_suivi?.trim()
    ) {
      toast({
        variant: 'destructive',
        title: 'Champs requis',
        description: 'Type, lieu, méthode d’évaluation et responsable de suivi sont obligatoires.',
      });
      return;
    }
    setSaving(true);
    try {
      await saveTrainingPlanning(selectedRequest.id, {
        ...planning,
        budget: planning.budget != null ? Number(planning.budget) : null,
      });
      toast({
        title: 'Planification enregistrée',
        description: `${selectedRequest.course_name} ajoutée à la liste.`,
      });
      handleDialogChange(false);
      await load();
    } catch (e) {
      console.error(e);
      toast({ variant: 'destructive', title: 'Erreur', description: 'Échec de la planification.' });
    } finally {
      setSaving(false);
    }
  };

  if (!canAccessTrainingPlanning(isDeveloper, canReadMgmt)) {
    return <ModuleAccessDenied />;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Planification des formations</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Calendrier et suivi des formations planifiées
            {' · '}
            <Link to="/training" className="text-primary hover:underline">
              Retour Formation
            </Link>
          </p>
        </div>
        <Button variant="default" className="gap-2 shrink-0" asChild>
          <Link to="/admin/training-analytics">
            <BarChart3 className="h-4 w-4" />
            Résumé planificateur
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
          <CardTitle className="text-base">Liste de planification des formations</CardTitle>
          {canPlan && (
            <>
              <Button
                size="sm"
                className="gap-2"
                onClick={() => {
                  setSelectedRequestId('');
                  setPlanning(emptyPlanning);
                  setPlanDialogOpen(true);
                }}
              >
                <Plus className="h-4 w-4" />
                Ajouter
              </Button>
              <Dialog open={planDialogOpen} onOpenChange={handleDialogChange}>
              <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Ajouter une formation à planifier</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Formation acceptée *</Label>
                    <Select
                      value={selectedRequestId || undefined}
                      onValueChange={(v) => {
                        setSelectedRequestId(v);
                        setPlanning(emptyPlanning);
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Sélectionner une formation" />
                      </SelectTrigger>
                      <SelectContent>
                        {approved.length === 0 ? (
                          <SelectItem value="__none" disabled>
                            Aucune formation acceptée disponible
                          </SelectItem>
                        ) : (
                          approved.map((r) => (
                            <SelectItem key={r.id} value={r.id}>
                              {r.course_name}
                              {r.employee_name ? ` — ${r.employee_name}` : ''}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  {selectedRequest && (
                    <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1">
                      <p>
                        <span className="text-muted-foreground">Intitulé :</span>{' '}
                        <span className="font-medium">{selectedRequest.course_name}</span>
                      </p>
                      {selectedRequest.request_details.domaine && (
                        <p>
                          <span className="text-muted-foreground">Domaine :</span>{' '}
                          {selectedRequest.request_details.domaine}
                        </p>
                      )}
                      {selectedRequest.request_details.priorite && (
                        <p>
                          <span className="text-muted-foreground">Priorité :</span>{' '}
                          {selectedRequest.request_details.priorite}
                        </p>
                      )}
                    </div>
                  )}

                  <div
                    className={
                      selectedRequest ? 'space-y-4' : 'space-y-4 opacity-50 pointer-events-none'
                    }
                  >
                    <p className="text-sm font-medium text-foreground">
                      En cas d’acceptation — informations de planification
                    </p>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Type de formation *</Label>
                        <Select
                          value={planning.type_formation}
                          onValueChange={(v) => setPlanning((p) => ({ ...p, type_formation: v }))}
                          disabled={!selectedRequest}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Interne / externe / sur demande" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="interne">Interne</SelectItem>
                            <SelectItem value="externe">Externe</SelectItem>
                            <SelectItem value="sur_demande">Sur demande</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Lieu de formation *</Label>
                        <Select
                          value={planning.lieu}
                          onValueChange={(v) => setPlanning((p) => ({ ...p, lieu: v }))}
                          disabled={!selectedRequest}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Lieu" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="entreprise">Entreprise</SelectItem>
                            <SelectItem value="centre">Centre</SelectItem>
                            <SelectItem value="en_ligne">En ligne</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Budget estimé (DZD)</Label>
                      <Input
                        type="number"
                        min={0}
                        step={0.01}
                        disabled={!selectedRequest}
                        value={planning.budget ?? ''}
                        onChange={(e) =>
                          setPlanning((p) => ({
                            ...p,
                            budget: e.target.value ? Number(e.target.value) : null,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Indicateurs de succès</Label>
                      <Textarea
                        rows={2}
                        disabled={!selectedRequest}
                        value={planning.indicateurs ?? ''}
                        onChange={(e) => setPlanning((p) => ({ ...p, indicateurs: e.target.value }))}
                        placeholder="Indicateurs attendus après la formation"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Méthode d’évaluation *</Label>
                      <Select
                        value={planning.methode_evaluation}
                        onValueChange={(v) => setPlanning((p) => ({ ...p, methode_evaluation: v }))}
                        disabled={!selectedRequest}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Méthode" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="immediate">Immédiate</SelectItem>
                          <SelectItem value="observation">Observation</SelectItem>
                          <SelectItem value="post_formation">Résultats post-formation</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Responsable de suivi *</Label>
                      <Input
                        disabled={!selectedRequest}
                        value={planning.responsable_suivi ?? ''}
                        onChange={(e) =>
                          setPlanning((p) => ({ ...p, responsable_suivi: e.target.value }))
                        }
                        placeholder="Nom du responsable"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => handleDialogChange(false)}>
                      Annuler
                    </Button>
                    <Button
                      onClick={handleSavePlan}
                      disabled={saving || !canPlan || !selectedRequest || approved.length === 0}
                    >
                      {saving ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        'Enregistrer'
                      )}
                    </Button>
                  </div>
                </div>
              </DialogContent>
              </Dialog>
            </>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              Chargement...
            </div>
          ) : planned.length === 0 ? (
            <p className="text-muted-foreground text-sm p-6">
              Aucune formation planifiée. Cliquez sur Ajouter pour planifier une formation acceptée.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Formation</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Lieu</TableHead>
                  <TableHead>Budget</TableHead>
                  <TableHead>Méthode d’évaluation</TableHead>
                  <TableHead>Responsable suivi</TableHead>
                  <TableHead>Statut</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {planned.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.course_name}</TableCell>
                    <TableCell>
                      {TYPE_FORMATION_LABELS[r.planning_details.type_formation ?? ''] ??
                        r.planning_details.type_formation ??
                        '—'}
                    </TableCell>
                    <TableCell>
                      {LIEU_LABELS[r.planning_details.lieu ?? ''] ??
                        r.planning_details.lieu ??
                        '—'}
                    </TableCell>
                    <TableCell>
                      {formatDzd(r.planning_details.budget)}
                    </TableCell>
                    <TableCell>
                      {METHODE_LABELS[r.planning_details.methode_evaluation ?? ''] ??
                        r.planning_details.methode_evaluation ??
                        '—'}
                    </TableCell>
                    <TableCell>{r.planning_details.responsable_suivi ?? '—'}</TableCell>
                    <TableCell>
                      <Badge>{TRAINING_STATUS_LABELS[r.status]}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
