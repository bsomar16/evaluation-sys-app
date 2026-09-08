import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { hideLoadingOverlay } from '@/lib/loading-overlay';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { Plus, Edit2, Trash2 } from 'lucide-react';
import { useRolePermissions } from '@/hooks/useRolePermissions';
import { useI18n } from '@/lib/i18n';
import { ModuleAccessDenied } from '@/components/ModuleAccessDenied';
import {
  deleteRejectionReason,
  fetchRejectionReasons,
  setRejectionReasonActive,
  upsertRejectionReason,
  type RejectionReasonRecord,
} from '@/lib/rejection-reasons';

type FormState = { label_fr: string; label_ar: string };

const emptyForm: FormState = { label_fr: '', label_ar: '' };

export default function RejectionReasonsPage() {
  const { toast } = useToast();
  const { t } = useI18n();
  const { canRead, canWrite, canDelete } = useRolePermissions();
  const [reasons, setReasons] = useState<RejectionReasonRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [openDialog, setOpenDialog] = useState(false);
  const [editing, setEditing] = useState<RejectionReasonRecord | null>(null);
  const [formData, setFormData] = useState<FormState>(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<RejectionReasonRecord | null>(null);

  const load = async () => {
    try {
      const rows = await fetchRejectionReasons();
      setReasons(rows.sort((a, b) => a.sort_order - b.sort_order));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : t('common.error');
      toast({ variant: 'destructive', title: t('common.error'), description: message });
    } finally {
      setLoading(false);
      hideLoadingOverlay();
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openCreate = () => {
    setEditing(null);
    setFormData(emptyForm);
    setOpenDialog(true);
  };

  const openEdit = (reason: RejectionReasonRecord) => {
    setEditing(reason);
    setFormData({ label_fr: reason.label_fr, label_ar: reason.label_ar ?? '' });
    setOpenDialog(true);
  };

  const handleSave = async () => {
    if (!formData.label_fr.trim()) {
      toast({ variant: 'destructive', title: t('common.error'), description: t('rejectionReasons.frRequired') });
      return;
    }
    try {
      await upsertRejectionReason({
        id: editing?.id,
        label_fr: formData.label_fr.trim(),
        label_ar: formData.label_ar.trim() || null,
        is_active: editing?.is_active ?? true,
        sort_order: editing?.sort_order ?? reasons.length + 1,
      });
      toast({
        title: t('common.success'),
        description: editing ? t('rejectionReasons.updated') : t('rejectionReasons.created'),
      });
      setOpenDialog(false);
      load();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : t('common.error');
      toast({ variant: 'destructive', title: t('common.error'), description: message });
    }
  };

  const handleToggleActive = async (reason: RejectionReasonRecord, next: boolean) => {
    setReasons((prev) => prev.map((r) => (r.id === reason.id ? { ...r, is_active: next } : r)));
    try {
      await setRejectionReasonActive(reason.id, next);
    } catch (error: unknown) {
      setReasons((prev) => prev.map((r) => (r.id === reason.id ? { ...r, is_active: !next } : r)));
      const message = error instanceof Error ? error.message : t('common.error');
      toast({ variant: 'destructive', title: t('common.error'), description: message });
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteRejectionReason(deleteTarget.id);
      toast({ title: t('common.success'), description: t('rejectionReasons.deleted') });
      setDeleteTarget(null);
      load();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : t('common.error');
      toast({ variant: 'destructive', title: t('common.error'), description: message });
    }
  };

  if (!canRead('rejection_reasons')) {
    return <ModuleAccessDenied />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t('rejectionReasons.title')}</h1>
        <p className="text-muted-foreground text-sm mt-1">{t('rejectionReasons.subtitle')}</p>
      </div>

      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-lg">{t('rejectionReasons.listTitle')}</CardTitle>
          <Dialog open={openDialog} onOpenChange={setOpenDialog}>
            <DialogTrigger asChild>
              <Button className="gap-2" disabled={!canWrite('rejection_reasons')} onClick={openCreate}>
                <Plus className="h-4 w-4" />
                {t('rejectionReasons.new')}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {editing ? t('rejectionReasons.editTitle') : t('rejectionReasons.createTitle')}
                </DialogTitle>
                <DialogDescription>{t('rejectionReasons.dialogDescription')}</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="reason-fr">{t('rejectionReasons.fieldFr')}</Label>
                  <Input
                    id="reason-fr"
                    value={formData.label_fr}
                    onChange={(e) => setFormData((p) => ({ ...p, label_fr: e.target.value }))}
                    className="border-2 border-blue-300 bg-blue-50"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="reason-ar">{t('rejectionReasons.fieldAr')}</Label>
                  <Input
                    id="reason-ar"
                    dir="rtl"
                    value={formData.label_ar}
                    onChange={(e) => setFormData((p) => ({ ...p, label_ar: e.target.value }))}
                    className="border-2 border-blue-300 bg-blue-50 text-right"
                  />
                </div>
                <Button onClick={handleSave} className="w-full" disabled={!canWrite('rejection_reasons')}>
                  {editing ? t('common.edit') : t('common.create')}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p>{t('common.loading')}</p>
          ) : reasons.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">{t('rejectionReasons.noItems')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4">{t('rejectionReasons.colFr')}</th>
                    <th className="text-left py-3 px-4">{t('rejectionReasons.colAr')}</th>
                    <th className="text-left py-3 px-4 w-24">{t('rejectionReasons.colActive')}</th>
                    <th className="text-right py-3 px-4">{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {reasons.map((r) => (
                    <tr key={r.id} className="border-b hover:bg-muted/50">
                      <td className="py-3 px-4 font-medium">{r.label_fr}</td>
                      <td className="py-3 px-4" dir="rtl">
                        {r.label_ar || <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={r.is_active !== false}
                            disabled={!canWrite('rejection_reasons')}
                            onCheckedChange={(checked) => void handleToggleActive(r, checked)}
                          />
                          <Badge variant={r.is_active !== false ? 'default' : 'secondary'}>
                            {r.is_active !== false ? t('common.active') : t('common.inactive')}
                          </Badge>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right">
                        {canWrite('rejection_reasons') && (
                          <Button variant="ghost" size="sm" onClick={() => openEdit(r)}>
                            <Edit2 className="h-4 w-4" />
                          </Button>
                        )}
                        {canDelete('rejection_reasons') && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive"
                            onClick={() => setDeleteTarget(r)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogTitle>
            {t('rejectionReasons.deleteTitle', { label: deleteTarget?.label_fr ?? '' })}
          </AlertDialogTitle>
          <AlertDialogDescription>{t('rejectionReasons.deleteDesc')}</AlertDialogDescription>
          <div className="flex gap-2 justify-end">
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              {t('common.delete')}
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
