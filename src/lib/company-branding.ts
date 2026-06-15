export type AppearanceMode = 'light' | 'dark' | 'standard';
export type LogoThemeSlot = 'light' | 'dark';

export interface CompanyBrandingSettings {
  /** Logo 1 (blanc — fond sombre) */
  logo1Url: string;
  /** Logo 2 (couleur — mode Standard + mode clair par défaut) */
  logo2Url: string;
  /** Mode d'apparence où afficher le logo 1 */
  logo1For: LogoThemeSlot;
  /** Mode d'apparence où afficher le logo 2 */
  logo2For: LogoThemeSlot;
}

const STORAGE_KEY = 'companyBranding';
const BRANDING_VERSION_KEY = 'companyBrandingVersion';
/** Incrémenter quand le fichier logo couleur change sur le serveur */
const BRANDING_VERSION = 2;

export const DEFAULT_LOGO_WHITE = '/branding/cph-logo-white.png';
/** ?v=2 : bust cache après remplacement du fichier couleur */
export const DEFAULT_LOGO_COLOR = '/branding/cph-logo-color.png?v=2';

export const DEFAULT_COMPANY_BRANDING: CompanyBrandingSettings = {
  logo1Url: DEFAULT_LOGO_WHITE,
  logo2Url: DEFAULT_LOGO_COLOR,
  logo1For: 'dark',
  logo2For: 'light',
};

function migrateLogoUrl(url: string | undefined, fallback: string): string {
  if (!url) return fallback;
  if (url.includes('logo-white') || url.includes('cph-logo-white')) {
    return fallback;
  }
  // Ancien placeholder (copie du blanc) ou chemin sans cache-bust
  if (
    url === '/branding/cph-logo-color.png' ||
    url.startsWith('/branding/cph-logo-color.png?')
  ) {
    return DEFAULT_LOGO_COLOR;
  }
  // Import base64 du placeholder blanc (~4 Ko) encore en localStorage
  if (url.startsWith('data:image') && url.length < 20000) {
    return DEFAULT_LOGO_COLOR;
  }
  return url;
}

export function loadCompanyBranding(): CompanyBrandingSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_COMPANY_BRANDING };
    const parsed = JSON.parse(raw) as Partial<CompanyBrandingSettings>;
    return {
      logo1Url: parsed.logo1Url || DEFAULT_COMPANY_BRANDING.logo1Url,
      logo2Url: migrateLogoUrl(parsed.logo2Url, DEFAULT_COMPANY_BRANDING.logo2Url),
      logo1For: parsed.logo1For === 'light' || parsed.logo1For === 'dark' ? parsed.logo1For : 'dark',
      logo2For: parsed.logo2For === 'light' || parsed.logo2For === 'dark' ? parsed.logo2For : 'light',
    };
  } catch {
    return { ...DEFAULT_COMPANY_BRANDING };
  }
}

export function saveCompanyBranding(settings: CompanyBrandingSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  window.dispatchEvent(new CustomEvent('companyBrandingChange', { detail: settings }));
}

/** Met à jour le logo 2 couleur en localStorage si l’ancien placeholder est encore enregistré. */
export function migrateCompanyBrandingIfNeeded(): void {
  try {
    const storedVersion = parseInt(localStorage.getItem(BRANDING_VERSION_KEY) || '0', 10);
    const raw = localStorage.getItem(STORAGE_KEY);

    if (storedVersion < BRANDING_VERSION) {
      const parsed = raw ? (JSON.parse(raw) as Partial<CompanyBrandingSettings>) : {};
      saveCompanyBranding({
        logo1Url: migrateLogoUrl(parsed.logo1Url, DEFAULT_LOGO_WHITE) || DEFAULT_LOGO_WHITE,
        logo2Url: DEFAULT_LOGO_COLOR,
        logo1For: parsed.logo1For === 'light' || parsed.logo1For === 'dark' ? parsed.logo1For : 'dark',
        logo2For: parsed.logo2For === 'light' || parsed.logo2For === 'dark' ? parsed.logo2For : 'light',
      });
      localStorage.setItem(BRANDING_VERSION_KEY, String(BRANDING_VERSION));
      return;
    }

    if (!raw) return;
    const parsed = JSON.parse(raw) as Partial<CompanyBrandingSettings>;
    const nextLogo2 = migrateLogoUrl(parsed.logo2Url, DEFAULT_LOGO_COLOR);
    if (nextLogo2 === parsed.logo2Url) return;
    saveCompanyBranding({
      logo1Url: parsed.logo1Url || DEFAULT_COMPANY_BRANDING.logo1Url,
      logo2Url: nextLogo2,
      logo1For: parsed.logo1For === 'light' || parsed.logo1For === 'dark' ? parsed.logo1For : 'dark',
      logo2For: parsed.logo2For === 'light' || parsed.logo2For === 'dark' ? parsed.logo2For : 'light',
    });
  } catch {
    /* ignore */
  }
}

export function getStoredAppearanceMode(): AppearanceMode {
  const saved = localStorage.getItem('appearanceMode');
  if (saved === 'dark' || saved === 'standard' || saved === 'light') return saved;
  return 'standard';
}

function resolveLightAppearanceLogo(settings: CompanyBrandingSettings): string {
  return settings.logo1For === 'light' ? settings.logo1Url : settings.logo2Url;
}

function resolveDarkAppearanceLogo(settings: CompanyBrandingSettings): string {
  return settings.logo1For === 'dark' ? settings.logo1Url : settings.logo2Url;
}

/**
 * Résout l'URL du logo selon le mode d'apparence.
 * Mode standard : toujours le logo 2 (couleur CPH).
 */
export function resolveCompanyLogoUrl(
  appearanceMode: AppearanceMode,
  settings: CompanyBrandingSettings = loadCompanyBranding()
): string {
  if (appearanceMode === 'standard') {
    return settings.logo2Url;
  }

  if (appearanceMode === 'light') {
    return resolveLightAppearanceLogo(settings);
  }

  return resolveDarkAppearanceLogo(settings);
}

export function getLogoLabel(slot: LogoThemeSlot): string {
  return slot === 'light' ? 'Mode clair' : 'Mode sombre';
}
