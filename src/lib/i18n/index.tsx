import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { translations, type Lang } from './translations';

export type { Lang } from './translations';

const STORAGE_KEY = 'appLanguage';
export const LANGUAGE_CHANGE_EVENT = 'appLanguageChange';

export function getStoredLanguage(): Lang {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'ar' || value === 'fr' ? value : 'fr';
  } catch {
    return 'fr';
  }
}

/** Applique lang + dir sur <html>. À appeler tôt (main.tsx) pour éviter le flash. */
export function applyDocumentLanguage(lang: Lang): void {
  const el = document.documentElement;
  el.lang = lang;
  el.dir = lang === 'ar' ? 'rtl' : 'ltr';
}

function resolveKey(lang: Lang, key: string): string | undefined {
  const parts = key.split('.');
  let current: unknown = translations[lang];
  for (const part of parts) {
    if (current && typeof current === 'object' && part in (current as Record<string, unknown>)) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return typeof current === 'string' ? current : undefined;
}

export function translate(
  lang: Lang,
  key: string,
  vars?: Record<string, string | number>
): string {
  let value = resolveKey(lang, key) ?? (lang !== 'fr' ? resolveKey('fr', key) : undefined) ?? key;
  if (vars) {
    for (const [name, replacement] of Object.entries(vars)) {
      value = value.replace(new RegExp(`\\{${name}\\}`, 'g'), String(replacement));
    }
  }
  return value;
}

type I18nContextValue = {
  lang: Lang;
  dir: 'rtl' | 'ltr';
  setLang: (lang: Lang) => void;
  toggleLang: () => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => getStoredLanguage());

  useEffect(() => {
    applyDocumentLanguage(lang);
  }, [lang]);

  useEffect(() => {
    const onExternalChange = (event: Event) => {
      const detail = (event as CustomEvent<Lang>).detail;
      if (detail === 'ar' || detail === 'fr') {
        setLangState((prev) => (prev === detail ? prev : detail));
      }
    };
    window.addEventListener(LANGUAGE_CHANGE_EVENT, onExternalChange);
    return () => window.removeEventListener(LANGUAGE_CHANGE_EVENT, onExternalChange);
  }, []);

  const setLang = useCallback((next: Lang) => {
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
    setLangState(next);
    window.dispatchEvent(new CustomEvent(LANGUAGE_CHANGE_EVENT, { detail: next }));
  }, []);

  const toggleLang = useCallback(() => {
    setLang(getStoredLanguage() === 'ar' ? 'fr' : 'ar');
  }, [setLang]);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => translate(lang, key, vars),
    [lang]
  );

  const value = useMemo<I18nContextValue>(
    () => ({ lang, dir: lang === 'ar' ? 'rtl' : 'ltr', setLang, toggleLang, t }),
    [lang, setLang, toggleLang, t]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    // Fallback hors provider : français, sans état partagé.
    const lang = getStoredLanguage();
    return {
      lang,
      dir: lang === 'ar' ? 'rtl' : 'ltr',
      setLang: () => undefined,
      toggleLang: () => undefined,
      t: (key, vars) => translate(lang, key, vars),
    };
  }
  return ctx;
}
