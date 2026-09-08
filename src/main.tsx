import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { migrateCompanyBrandingIfNeeded } from './lib/company-branding';
import { colorPalettes } from './lib/palette-utils';
import { applyDocumentLanguage, getStoredLanguage } from './lib/i18n';

try {
  // Applique la langue + direction (RTL/LTR) avant le rendu React.
  applyDocumentLanguage(getStoredLanguage());

  migrateCompanyBrandingIfNeeded();

  // Initialize palette variables BEFORE React renders to prevent flash of unstyled content
  const appearanceMode = localStorage.getItem('appearanceMode') || 'standard';
  const selectedPalette = localStorage.getItem('selectedPalette') || 'corporate';

  const palette = colorPalettes[selectedPalette as keyof typeof colorPalettes];
  if (palette) {
    if (appearanceMode === 'standard') {
      // Apply light mode colors for content
      Object.entries(palette.light).forEach(([key, value]) => {
        const cssVar = `--${key.replace(/_/g, '-')}`;
        document.documentElement.style.setProperty(cssVar, value as string, 'important');
      });
      // Override with dark sidebar colors
      Object.entries(palette.dark).forEach(([key, value]) => {
        if (key.startsWith('sidebar_')) {
          const cssVar = `--${key.replace(/_/g, '-')}`;
          document.documentElement.style.setProperty(cssVar, value as string, 'important');
        }
      });
    } else {
      const colors = palette[appearanceMode as 'light' | 'dark'];
      Object.entries(colors).forEach(([key, value]) => {
        const cssVar = `--${key.replace(/_/g, '-')}`;
        document.documentElement.style.setProperty(cssVar, value as string, 'important');
      });
    }
  }

  // Apply dark class if needed
  if (appearanceMode === 'dark') {
    document.documentElement.classList.add('dark');
  }
} catch (error) {
  console.error('Error initializing app:', error);
}

createRoot(document.getElementById("root")!).render(<App />);
