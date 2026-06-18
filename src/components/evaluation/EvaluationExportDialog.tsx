import { useEffect, useState } from 'react';
import { GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  EVALUATION_LIST_EXPORT_FIELD_DEFS,
  getEvaluationListExportLabel,
  type EvaluationListExportFieldKey,
} from '@/lib/evaluation-list-export';
import { cn } from '@/lib/utils';

type ExportColumn = 'selected' | 'available';

interface EvaluationExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultSelectedFields: EvaluationListExportFieldKey[];
  onExport: (fields: EvaluationListExportFieldKey[]) => void;
}

export function EvaluationExportDialog({
  open,
  onOpenChange,
  defaultSelectedFields,
  onExport,
}: EvaluationExportDialogProps) {
  const [selectedFields, setSelectedFields] = useState<EvaluationListExportFieldKey[]>(defaultSelectedFields);
  const [availableFields, setAvailableFields] = useState<EvaluationListExportFieldKey[]>([]);
  const [draggingField, setDraggingField] = useState<EvaluationListExportFieldKey | null>(null);
  const [dragSource, setDragSource] = useState<ExportColumn | null>(null);

  useEffect(() => {
    if (!open) return;
    const selected = [...defaultSelectedFields];
    const available = EVALUATION_LIST_EXPORT_FIELD_DEFS.map((field) => field.key).filter(
      (key) => !selected.includes(key)
    );
    setSelectedFields(selected);
    setAvailableFields(available);
  }, [open, defaultSelectedFields]);

  const moveField = (field: EvaluationListExportFieldKey, from: ExportColumn, to: ExportColumn, targetIndex?: number) => {
    if (from === to) return;

    const source = from === 'selected' ? selectedFields : availableFields;
    const destination = to === 'selected' ? selectedFields : availableFields;
    const sourceIndex = source.indexOf(field);
    if (sourceIndex === -1) return;

    const nextSource = source.filter((key) => key !== field);
    const nextDestination = [...destination];
    const insertAt =
      typeof targetIndex === 'number' && targetIndex >= 0 && targetIndex <= nextDestination.length
        ? targetIndex
        : nextDestination.length;
    nextDestination.splice(insertAt, 0, field);

    if (from === 'selected') {
      setSelectedFields(to === 'selected' ? nextDestination : nextSource);
      setAvailableFields(to === 'selected' ? nextSource : nextDestination);
      return;
    }

    setAvailableFields(to === 'available' ? nextDestination : nextSource);
    setSelectedFields(to === 'available' ? nextSource : nextDestination);
  };

  const handleDrop = (target: ExportColumn, targetIndex?: number) => {
    if (!draggingField || !dragSource) return;
    moveField(draggingField, dragSource, target, targetIndex);
    setDraggingField(null);
    setDragSource(null);
  };

  const renderFieldList = (column: ExportColumn, fields: EvaluationListExportFieldKey[], title: string) => (
    <div className="space-y-2">
      <p className="text-sm font-medium">{title}</p>
      <div
        className="min-h-[220px] rounded-lg border-2 border-dashed border-muted-foreground/25 bg-muted/20 p-2 space-y-1"
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = 'move';
        }}
        onDrop={(event) => {
          event.preventDefault();
          handleDrop(column);
        }}
      >
        {fields.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">Glissez un champ ici</p>
        ) : (
          fields.map((field, index) => (
            <div
              key={`${column}-${field}`}
              draggable
              onDragStart={(event) => {
                setDraggingField(field);
                setDragSource(column);
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', field);
              }}
              onDragEnd={() => {
                setDraggingField(null);
                setDragSource(null);
              }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                event.stopPropagation();
                handleDrop(column, index);
              }}
              className={cn(
                'flex items-center gap-2 rounded-md border bg-background px-2 py-2 text-sm cursor-grab active:cursor-grabbing',
                draggingField === field && 'opacity-60'
              )}
            >
              <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span>{getEvaluationListExportLabel(field)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Exporter les lignes sélectionnées</DialogTitle>
          <DialogDescription>
            Glissez les champs entre les deux colonnes. L&apos;ordre dans « Champs à exporter » définit les
            colonnes du fichier.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-2">
          {renderFieldList('selected', selectedFields, 'Champs à exporter')}
          {renderFieldList('available', availableFields, 'Tous les champs')}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button
            disabled={selectedFields.length === 0}
            onClick={() => {
              onExport(selectedFields);
              onOpenChange(false);
            }}
          >
            Exporter (CSV)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
