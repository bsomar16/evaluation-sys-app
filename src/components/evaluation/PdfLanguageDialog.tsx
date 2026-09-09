import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n';
import type { Lang } from '@/lib/i18n/translations';

/** Choix de la langue du PDF (français ou arabe), affiché avant génération. */
export function PdfLanguageDialog({
  open,
  onOpenChange,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (lang: Lang) => void;
}) {
  const { t } = useI18n();

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogTitle>{t('reports.choosePdfLanguage')}</AlertDialogTitle>
        <AlertDialogDescription>{t('reports.choosePdfLanguageDesc')}</AlertDialogDescription>
        <div className="flex gap-2 justify-end pt-2">
          <Button variant="outline" onClick={() => onSelect('fr')}>
            Français
          </Button>
          <Button onClick={() => onSelect('ar')}>العربية</Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default PdfLanguageDialog;
