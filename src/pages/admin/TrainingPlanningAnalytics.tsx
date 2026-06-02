import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { useRolePermissions } from '@/hooks/useRolePermissions';
import { ModuleAccessDenied } from '@/components/ModuleAccessDenied';
import { canAccessTrainingAnalytics } from '@/lib/training-access';
import { fetchTrainingRequests } from '@/lib/training-storage';
import type { TrainingRequestRecord } from '@/lib/training-types';
import {
  buildGanttBars,
  TrainingPlanningGantt,
} from '@/components/TrainingPlanningGantt';
import { formatDzd } from '@/lib/currency';

export default function TrainingPlanningAnalytics() {
  const { isDeveloper, canRead } = useRolePermissions();
  const canReadTraining = canRead('training');
  const canReadMgmt = canRead('training_management');

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<TrainingRequestRecord[]>([]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const data = await fetchTrainingRequests({ scope: 'all' });
      setRows(data);
      setLoading(false);
    })();
  }, []);

  const { scheduled, awaiting } = useMemo(() => buildGanttBars(rows), [rows]);

  const insights = useMemo(() => {
    const planned = rows.filter((r) => r.status === 'planned' || r.status === 'completed');
    const approvedWaiting = rows.filter((r) => r.status === 'approved').length;
    const withDates = planned.filter((r) => r.planning_details.date_debut).length;
    const totalBudget = planned.reduce((s, r) => s + (Number(r.planning_details.budget) || 0), 0);

    let recommendation = 'Consultez le diagramme de Gantt pour répartir les sessions dans le temps.';
    if (approvedWaiting > 0) {
      recommendation = `${approvedWaiting} formation(s) acceptée(s) sans planning — à positionner sur le calendrier.`;
    } else if (withDates < planned.length) {
      recommendation = 'Certaines formations planifiées n’ont pas de dates : complétez-les pour apparaître sur le Gantt.';
    }

    return { planned: planned.length, approvedWaiting, withDates, totalBudget, recommendation };
  }, [rows]);

  if (!canAccessTrainingAnalytics(isDeveloper, canReadMgmt, canReadTraining)) {
    return <ModuleAccessDenied />;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Résumé planificateur</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Diagramme de Gantt — planification des formations dans le temps
            {' · '}
            <Link to="/admin/training-planning" className="text-primary hover:underline">
              Retour planification
            </Link>
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          Chargement...
        </div>
      ) : (
        <>
          <Card className="border-primary/30 bg-primary/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Synthèse</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-3">
              <p>{insights.recommendation}</p>
              <div className="flex flex-wrap gap-6 text-xs text-muted-foreground">
                <span>
                  <strong className="text-foreground">{insights.planned}</strong> planifiée(s) / terminée(s)
                </span>
                <span>
                  <strong className="text-foreground">{insights.withDates}</strong> avec dates sur le Gantt
                </span>
                <span>
                  <strong className="text-foreground">{insights.approvedWaiting}</strong> acceptée(s) à planifier
                </span>
                <span>
                  Budget planifié :{' '}
                  <strong className="text-foreground">{formatDzd(insights.totalBudget)}</strong>
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Planification des formations (Gantt)</CardTitle>
              <p className="text-sm text-muted-foreground font-normal">
                Chaque barre représente la période planifiée (date de début → date de fin) d’une formation.
              </p>
            </CardHeader>
            <CardContent>
              <TrainingPlanningGantt scheduled={scheduled} awaiting={awaiting} />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
