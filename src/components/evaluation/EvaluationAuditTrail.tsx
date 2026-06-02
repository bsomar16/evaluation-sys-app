import { Card, CardContent } from '@/components/ui/card';
import {
  EVALUATION_AUDIT_ACTION_LABELS,
  formatAuditDate,
  type EvaluationAuditEntry,
} from '@/lib/evaluation-audit';

export function EvaluationAuditTrail({ entries }: { entries: EvaluationAuditEntry[] }) {
  if (!entries.length) return null;

  const sorted = [...entries].sort(
    (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()
  );

  return (
    <Card>
      <CardContent className="p-0">
        <ul className="divide-y text-sm">
          {sorted.map((entry) => (
            <li key={entry.id} className="px-4 py-3 space-y-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">
                  {EVALUATION_AUDIT_ACTION_LABELS[entry.action] ?? entry.action}
                </span>
                <time className="text-xs text-muted-foreground" dateTime={entry.at}>
                  {formatAuditDate(entry.at)}
                </time>
              </div>
              <p className="text-xs text-muted-foreground">{entry.user_name}</p>
              {entry.comment && (
                <p className="text-xs rounded-md bg-muted/50 p-2 mt-1">{entry.comment}</p>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
