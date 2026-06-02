import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  getStoredAppearanceMode,
  migrateCompanyBrandingIfNeeded,
  resolveCompanyLogoUrl,
  type AppearanceMode,
} from '@/lib/company-branding';

interface CompanyLogoProps {
  className?: string;
  /** Hauteur du logo (largeur auto) */
  height?: number;
  /** Forcer un mode (ex. page login sans AppLayout) */
  appearanceMode?: AppearanceMode;
  alt?: string;
}

export function CompanyLogo({
  className,
  height = 40,
  appearanceMode: appearanceModeProp,
  alt = 'CPH Agriculture',
}: CompanyLogoProps) {
  const [mode, setMode] = useState<AppearanceMode>(
    () => appearanceModeProp ?? getStoredAppearanceMode()
  );
  const [src, setSrc] = useState(() => resolveCompanyLogoUrl(mode));

  useEffect(() => {
    migrateCompanyBrandingIfNeeded();
  }, []);

  useEffect(() => {
    if (appearanceModeProp) {
      setMode(appearanceModeProp);
      setSrc(resolveCompanyLogoUrl(appearanceModeProp));
      return;
    }

    const sync = () => {
      const next = getStoredAppearanceMode();
      setMode(next);
      setSrc(resolveCompanyLogoUrl(next));
    };

    sync();

    const onAppearance = (e: Event) => {
      const detail = (e as CustomEvent<AppearanceMode>).detail;
      if (detail) {
        setMode(detail);
        setSrc(resolveCompanyLogoUrl(detail));
      } else {
        sync();
      }
    };

    const onBranding = () => {
      const currentMode = appearanceModeProp ?? getStoredAppearanceMode();
      setMode(currentMode);
      setSrc(resolveCompanyLogoUrl(currentMode));
    };

    window.addEventListener('appearanceModeChange', onAppearance);
    window.addEventListener('companyBrandingChange', onBranding);
    window.addEventListener('storage', onBranding);

    return () => {
      window.removeEventListener('appearanceModeChange', onAppearance);
      window.removeEventListener('companyBrandingChange', onBranding);
      window.removeEventListener('storage', onBranding);
    };
  }, [appearanceModeProp]);

  return (
    <img
      src={src}
      alt={alt}
      className={cn('w-auto object-contain object-left', className)}
      style={{ height }}
      draggable={false}
    />
  );
}

export default CompanyLogo;
