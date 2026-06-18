import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, GripVertical } from 'lucide-react';
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
  EVALUATION_EXPORT_FIELD_TREE,
  getEvaluationExportColumnHeader,
  getEvaluationExportFieldLabel,
  type EvaluationExportFieldKey,
  type EvaluationExportFieldNode,
} from '@/lib/evaluation-list-export';
import { cn } from '@/lib/utils';

type ExportColumn = 'selected' | 'available';

interface EvaluationExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultSelectedFields: EvaluationExportFieldKey[];
  onExport: (fields: EvaluationExportFieldKey[]) => void | Promise<void>;
}

function isGroupNode(node: EvaluationExportFieldNode): boolean {
  return Boolean(node.children && node.children.length > 0);
}

export function EvaluationExportDialog({
  open,
  onOpenChange,
  defaultSelectedFields,
  onExport,
}: EvaluationExportDialogProps) {
  const [selectedFields, setSelectedFields] = useState<EvaluationExportFieldKey[]>(defaultSelectedFields);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set(['employee', 'branch', 'department', 'score', 'status']));
  const [draggingField, setDraggingField] = useState<EvaluationExportFieldKey | null>(null);
  const [dragSource, setDragSource] = useState<ExportColumn | null>(null);

  const selectedSet = useMemo(() => new Set(selectedFields), [selectedFields]);

  useEffect(() => {
    if (!open) return;
    setSelectedFields([...defaultSelectedFields]);
    setExpandedGroups(new Set(['employee', 'branch', 'department', 'score', 'status']));
  }, [open, defaultSelectedFields]);

  const moveField = (
    field: EvaluationExportFieldKey,
    from: ExportColumn,
    to: ExportColumn,
    targetIndex?: number
  ) => {
    if (from === to) return;

    if (from === 'selected') {
      const nextSelected = selectedFields.filter((key) => key !== field);
      if (to === 'selected') {
        const insertAt =
          typeof targetIndex === 'number' && targetIndex >= 0 && targetIndex <= nextSelected.length
            ? targetIndex
            : nextSelected.length;
        const reordered = [...nextSelected];
        reordered.splice(insertAt, 0, field);
        setSelectedFields(reordered);
        return;
      }
      setSelectedFields(nextSelected);
      return;
    }

    if (to === 'selected') {
      const nextSelected = [...selectedFields];
      const insertAt =
        typeof targetIndex === 'number' && targetIndex >= 0 && targetIndex <= nextSelected.length
          ? targetIndex
          : nextSelected.length;
      if (!nextSelected.includes(field)) {
        nextSelected.splice(insertAt, 0, field);
        setSelectedFields(nextSelected);
      }
    }
  };

  const handleDrop = (target: ExportColumn, targetIndex?: number) => {
    if (!draggingField || !dragSource) return;
    moveField(draggingField, dragSource, target, targetIndex);
    setDraggingField(null);
    setDragSource(null);
  };

  const toggleGroup = (groupKey: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
      return next;
    });
  };

  const renderDraggableLeaf = (
    fieldKey: EvaluationExportFieldKey,
    column: ExportColumn,
    index: number,
    indent = false
  ) => (
    <div
      key={`${column}-${fieldKey}`}
      draggable
      onDragStart={(event) => {
        setDraggingField(fieldKey);
        setDragSource(column);
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', fieldKey);
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
        indent && 'ml-5',
        draggingField === fieldKey && 'opacity-60'
      )}
    >
      <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span>{column === 'selected' ? getEvaluationExportColumnHeader(fieldKey) : getEvaluationExportFieldLabel(fieldKey)}</span>
    </div>
  );

  const renderAvailableTree = () => {
    const items: ReactNode[] = [];

    for (const node of EVALUATION_EXPORT_FIELD_TREE) {
      if (isGroupNode(node)) {
        const visibleChildren = (node.children ?? []).filter((child) => !selectedSet.has(child.key));
        if (visibleChildren.length === 0) continue;

        const expanded = expandedGroups.has(node.key);
        items.push(
          <div key={`group-${node.key}`} className="space-y-1">
            <button
              type="button"
              onClick={() => toggleGroup(node.key)}
              className="flex w-full items-center gap-1 rounded-md px-1 py-1 text-left text-sm font-medium hover:bg-muted/60"
            >
              {expanded ? (
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              )}
              <span>{node.label}</span>
            </button>
            {expanded &&
              visibleChildren.map((child, index) =>
                renderDraggableLeaf(child.key, 'available', index, true)
              )}
          </div>
        );
        continue;
      }

      if (!selectedSet.has(node.key)) {
        items.push(renderDraggableLeaf(node.key, 'available', items.length));
      }
    }

    return items;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Exporter les lignes sélectionnées</DialogTitle>
          <DialogDescription>
            Les champs par défaut correspondent aux colonnes du tableau. Dépliez un groupe dans « Tous
            les champs » pour glisser un sous-champ précis.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <p className="text-sm font-medium">Champs à exporter</p>
            <div
              className="min-h-[280px] rounded-lg border-2 border-dashed border-muted-foreground/25 bg-muted/20 p-2 space-y-1"
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
              }}
              onDrop={(event) => {
                event.preventDefault();
                handleDrop('selected');
              }}
            >
              {selectedFields.length === 0 ? (
                <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                  Glissez des champs ici
                </p>
              ) : (
                selectedFields.map((fieldKey, index) =>
                  renderDraggableLeaf(fieldKey, 'selected', index)
                )
              )}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Tous les champs</p>
            <div
              className="min-h-[280px] rounded-lg border-2 border-dashed border-muted-foreground/25 bg-muted/20 p-2 space-y-1"
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
              }}
              onDrop={(event) => {
                event.preventDefault();
                handleDrop('available');
              }}
            >
              {renderAvailableTree().length === 0 ? (
                <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                  Tous les champs sont déjà sélectionnés
                </p>
              ) : (
                renderAvailableTree()
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button
            disabled={selectedFields.length === 0}
            onClick={() => {
              void (async () => {
                await onExport(selectedFields);
                onOpenChange(false);
              })();
            }}
          >
            Exporter (Excel)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
