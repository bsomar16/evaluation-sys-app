import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ImageIcon, LayoutDashboard, Palette, RefreshCw } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DEFAULT_COMPANY_BRANDING,
  getLogoLabel,
  loadCompanyBranding,
  resolveCompanyLogoUrl,
  saveCompanyBranding,
  type CompanyBrandingSettings,
  type LogoThemeSlot,
} from '@/lib/company-branding';
import { cn } from '@/lib/utils';
import { colorPalettes, applyPaletteToDOM, type PaletteKey, type ThemeMode } from '@/lib/palette-utils';
import { loadDashboardTemplate, saveDashboardTemplate, type DashboardTemplate } from '@/lib/dashboard-template';
type ColorKey = PaletteKey;
type ThemeMode = 'light' | 'dark';
type ColorVariable = 'background' | 'sidebar_background' | 'card' | 'accent' | 'muted' | 'foreground' | 'sidebar_foreground' | 'muted_foreground' | 'border' | 'input' | 'ring' | 'selection' | 'selection_foreground' | 'destructive' | 'success' | 'warning' | 'button_primary' | 'button_primary_text' | 'button_secondary' | 'button_secondary_text' | 'button_hover';

export default function UIStudio() {
  const [selectedPalette, setSelectedPalette] = useState<ColorKey>(() => {
    const saved = localStorage.getItem('selectedPalette');
    return (saved as ColorKey) || 'corporate';
  });
  const [themeMode, setThemeMode] = useState<ThemeMode>('light');
  const [customColors, setCustomColors] = useState<Record<string, Record<ThemeMode, Record<ColorVariable, string>>>>(() => {
    const saved = localStorage.getItem('customColorPalette');
    return saved ? JSON.parse(saved) : colorPalettes;
  });

  const [previewMode, setPreviewMode] = useState<ThemeMode>('light');
  const [appearanceMode, setAppearanceMode] = useState<'light' | 'dark' | 'standard'>(() => {
    return (localStorage.getItem('appearanceMode') as any) || 'standard';
  });
  const [branding, setBranding] = useState<CompanyBrandingSettings>(() => loadCompanyBranding());
  const [dashboardTemplate, setDashboardTemplate] = useState<DashboardTemplate>(() => loadDashboardTemplate());

  const chooseDashboardTemplate = (template: DashboardTemplate) => {
    setDashboardTemplate(template);
    saveDashboardTemplate(template);
  };

  // Watch for appearance mode changes from AppLayout
  useEffect(() => {
    const handleStorageChange = () => {
      const newMode = localStorage.getItem('appearanceMode') as any || 'standard';
      setAppearanceMode(newMode);
    };

    // Listen for storage changes from other components
    window.addEventListener('storage', handleStorageChange);
    
    // Also listen for custom appearance mode change event
    const handleAppearanceModeChange = (e: any) => {
      setAppearanceMode(e.detail);
    };
    window.addEventListener('appearanceModeChange', handleAppearanceModeChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('appearanceModeChange', handleAppearanceModeChange);
    };
  }, []);

  // Appliquer la palette
  const applyPalette = (paletteKey: ColorKey) => {
    // IMPORTANT: In standard mode, palette changes are ignored (standard mode is fixed)
    if (appearanceMode === 'standard') {
      console.log('⚠️ Standard mode: palette change ignored');
      return;
    }

    // Apply the palette to DOM CSS variables
    applyPaletteToDOM(paletteKey, appearanceMode);

    // Save to localStorage
    localStorage.setItem('selectedPalette', paletteKey);
    localStorage.setItem('customColorPalette', JSON.stringify(customColors));
    setSelectedPalette(paletteKey);

    // Dispatch event to notify AppLayout and other components of palette change
    window.dispatchEvent(new CustomEvent('paletteChange', { 
      detail: { paletteKey } 
    }));
  };

  // Auto-apply palette when appearance mode changes
  useEffect(() => {
    applyPalette(selectedPalette);
  }, [appearanceMode]);

  // Reset aux palettes par défaut
  const resetToDefaults = () => {
    setCustomColors(colorPalettes);
    localStorage.removeItem('customColorPalette');
    localStorage.removeItem('selectedPalette');
    applyPalette('corporate');
  };

  // Mettre à jour une couleur personnalisée
  const updateBranding = (patch: Partial<CompanyBrandingSettings>) => {
    setBranding((prev) => ({ ...prev, ...patch }));
  };

  const saveBranding = () => {
    saveCompanyBranding(branding);
  };

  const resetBranding = () => {
    const defaults = { ...DEFAULT_COMPANY_BRANDING };
    setBranding(defaults);
    saveCompanyBranding(defaults);
  };

  const handleLogoFile = (which: 1 | 2, file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result ?? '');
      if (which === 1) updateBranding({ logo1Url: url });
      else updateBranding({ logo2Url: url });
    };
    reader.readAsDataURL(file);
  };

  const swapLogos = () => {
    setBranding((prev) => ({
      ...prev,
      logo1Url: prev.logo2Url,
      logo2Url: prev.logo1Url,
      logo1For: prev.logo2For,
      logo2For: prev.logo1For,
    }));
  };

  const updateCustomColor = (paletteKey: ColorKey, mode: ThemeMode, colorVar: ColorVariable, value: string) => {
    setCustomColors(prev => ({
      ...prev,
      [paletteKey]: {
        ...prev[paletteKey],
        [mode]: {
          ...prev[paletteKey][mode],
          [colorVar]: value,
        },
      },
    }));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Palette className="w-8 h-8" />
          UI Studio
        </h1>
      </div>

      {/* Modèle de tableau de bord */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LayoutDashboard className="w-5 h-5" />
            Modèle de tableau de bord
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button
              onClick={() => chooseDashboardTemplate('classic')}
              className={cn(
                'p-4 rounded-lg border-2 transition-all text-left hover:shadow-md',
                dashboardTemplate === 'classic' ? 'border-accent bg-accent/20' : 'border-border hover:border-accent/50'
              )}
            >
              <h3 className="font-semibold mb-1">Classique</h3>
              <p className="text-xs text-muted-foreground mb-3">
                Filtres période/filiale/service en carrousel, classement des employés, courbe d'évolution.
              </p>
              {dashboardTemplate === 'classic' && <Badge className="w-full justify-center">Actuel</Badge>}
            </button>
            <button
              onClick={() => chooseDashboardTemplate('analytics')}
              className={cn(
                'p-4 rounded-lg border-2 transition-all text-left hover:shadow-md',
                dashboardTemplate === 'analytics' ? 'border-accent bg-accent/20' : 'border-border hover:border-accent/50'
              )}
            >
              <h3 className="font-semibold mb-1">Analytique</h3>
              <p className="text-xs text-muted-foreground mb-3">
                Vue synthétique multi-panneaux : KPI, comparaison filiales/départements, alertes, classements, tendances par critère.
              </p>
              {dashboardTemplate === 'analytics' && <Badge className="w-full justify-center">Actuel</Badge>}
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Palettes Prédéfinies */}
      <Card>
        <CardHeader>
          <CardTitle>Palettes Prédéfinies</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries(customColors).map(([key, palette]) => (
              <button
                key={key}
                onClick={() => applyPalette(key as ColorKey)}
                className={cn(
                  "p-4 rounded-lg border-2 transition-all text-left hover:shadow-md",
                  selectedPalette === key
                    ? "border-accent bg-accent/20"
                    : "border-border hover:border-accent/50"
                )}
              >
                <h3 className="font-semibold mb-3">{palette.name || key}</h3>
                <div className="flex gap-2 mb-3">
                  {/* Light mode preview */}
                  <div className="flex-1">
                    <div className="text-xs text-muted-foreground mb-1">Light</div>
                    <div className="space-y-1">
                      <div
                        className="h-6 rounded border"
                        style={{ backgroundColor: `hsl(${palette.light.background})` }}
                      />
                      <div
                        className="h-6 rounded border"
                        style={{ backgroundColor: `hsl(${palette.light.sidebar_background})` }}
                      />
                    </div>
                  </div>
                  {/* Dark mode preview */}
                  <div className="flex-1">
                    <div className="text-xs text-muted-foreground mb-1">Dark</div>
                    <div className="space-y-1">
                      <div
                        className="h-6 rounded border"
                        style={{ backgroundColor: `hsl(${palette.dark.background})` }}
                      />
                      <div
                        className="h-6 rounded border"
                        style={{ backgroundColor: `hsl(${palette.dark.sidebar_background})` }}
                      />
                    </div>
                  </div>
                </div>
                {selectedPalette === key && (
                  <Badge className="w-full justify-center">Actuelle</Badge>
                )}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Éditeur de Palettes */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Éditeur de Palettes</CardTitle>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={resetToDefaults}
            className="gap-2"
          >
            <RefreshCw size={16} />
            Réinitialiser
          </Button>
        </CardHeader>
        <CardContent>
          <Tabs value={themeMode} onValueChange={(v) => setThemeMode(v as ThemeMode)}>
            <TabsList className="grid w-full grid-cols-2 mb-4">
              <TabsTrigger value="light">Mode Clair</TabsTrigger>
              <TabsTrigger value="dark">Mode Sombre</TabsTrigger>
            </TabsList>

            {(['light', 'dark'] as const).map((mode) => (
              <TabsContent key={mode} value={mode} className="space-y-4">
                {(['background', 'sidebar_background', 'card', 'accent', 'muted', 'foreground', 'sidebar_foreground', 'muted_foreground', 'border', 'input', 'ring', 'selection', 'selection_foreground', 'destructive', 'success', 'warning', 'button_primary', 'button_primary_text', 'button_secondary', 'button_secondary_text', 'button_hover'] as const).map((colorVar) => {
                  const currentValue = customColors[selectedPalette]?.[mode]?.[colorVar] || '';
                  return (
                    <div key={colorVar} className="space-y-2">
                      <label className="text-sm font-medium capitalize">
                        {colorVar.replace(/_/g, ' ')}
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={currentValue}
                          onChange={(e) =>
                            updateCustomColor(selectedPalette, mode, colorVar, e.target.value)
                          }
                          className="flex-1 px-3 py-2 border rounded-md text-sm font-mono"
                          placeholder="h s l"
                        />
                        <div
                          className="w-12 h-10 rounded border border-border"
                          style={{ backgroundColor: `hsl(${currentValue})` }}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Format: h s% l% (exemple: 220 13% 91%)
                      </p>
                    </div>
                  );
                })}
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>

      {/* Aperçu en Temps Réel */}
      <Card>
        <CardHeader>
          <CardTitle>Aperçu en Temps Réel</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs value={previewMode} onValueChange={(v) => setPreviewMode(v as ThemeMode)}>
            <TabsList className="grid w-full grid-cols-2 mb-4">
              <TabsTrigger value="light">Clair</TabsTrigger>
              <TabsTrigger value="dark">Sombre</TabsTrigger>
            </TabsList>

            {(['light', 'dark'] as const).map((mode) => {
              const palette = customColors[selectedPalette];
              const colors = palette[mode];
              return (
                <TabsContent key={mode} value={mode} className="space-y-4">
                  {/* Main Content Area */}
                  <div
                    className="p-6 rounded-lg border-2"
                    style={{ 
                      backgroundColor: `hsl(${colors.background})`,
                      color: `hsl(${colors.foreground})`,
                      borderColor: `hsl(${colors.border})`
                    }}
                  >
                    <h3 className="font-semibold mb-3 text-lg">Zone de Contenu Principal</h3>
                    <p className="text-sm mb-4" style={{ color: `hsl(${colors.muted_foreground})` }}>
                      Ceci est la zone de contenu avec texte principal et texte secondaire
                    </p>
                    
                    <div className="space-y-3">
                      {/* Card */}
                      <div
                        className="p-4 rounded-lg border"
                        style={{ 
                          backgroundColor: `hsl(${colors.card})`,
                          borderColor: `hsl(${colors.border})`
                        }}
                      >
                        <h4 className="font-medium text-sm" style={{ color: `hsl(${colors.foreground})` }}>Composant Card</h4>
                        <p className="text-xs mt-1" style={{ color: `hsl(${colors.muted_foreground})` }}>
                          Texte secondaire dans une card
                        </p>
                      </div>

                      {/* Buttons */}
                      <div className="space-y-3">
                        <div className="flex gap-2 flex-wrap">
                          <button
                            disabled
                            className="px-4 py-2 rounded text-sm font-medium border-2 transition-all"
                            style={{ 
                              backgroundColor: `hsl(${colors.button_primary})`,
                              color: `hsl(${colors.button_primary_text})`,
                              borderColor: `hsl(${colors.button_primary})`,
                              opacity: 0.7
                            }}
                          >
                            Bouton Principal
                          </button>
                          <button
                            disabled
                            className="px-4 py-2 rounded text-sm font-medium border-2 transition-all"
                            style={{ 
                              backgroundColor: `hsl(${colors.button_secondary})`,
                              color: `hsl(${colors.button_secondary_text})`,
                              borderColor: `hsl(${colors.border})`,
                              opacity: 0.7
                            }}
                          >
                            Bouton Secondaire
                          </button>
                          <button
                            disabled
                            className="px-4 py-2 rounded text-sm font-medium border-2"
                            style={{ 
                              backgroundColor: `hsl(${colors.destructive})`,
                              color: '#fff',
                              borderColor: `hsl(${colors.destructive})`,
                              opacity: 0.7
                            }}
                          >
                            Suppression
                          </button>
                          <button
                            disabled
                            className="px-4 py-2 rounded text-sm font-medium border-2"
                            style={{ 
                              backgroundColor: `hsl(${colors.success})`,
                              color: '#fff',
                              borderColor: `hsl(${colors.success})`,
                              opacity: 0.7
                            }}
                          >
                            Succès
                          </button>
                          <button
                            disabled
                            className="px-4 py-2 rounded text-sm font-medium border-2"
                            style={{ 
                              backgroundColor: `hsl(${colors.warning})`,
                              color: '#fff',
                              borderColor: `hsl(${colors.warning})`,
                              opacity: 0.7
                            }}
                          >
                            Avertissement
                          </button>
                        </div>
                        
                        {/* Selected Text Example */}
                        <div 
                          className="p-3 rounded text-sm"
                          style={{ 
                            backgroundColor: `hsl(${colors.selection})`,
                            color: `hsl(${colors.selection_foreground})`
                          }}
                        >
                          📌 Ceci est un exemple de texte sélectionné avec les couleurs de palette
                        </div>
                      </div>

                      {/* Input */}
                      <input
                        type="text"
                        placeholder="Champ de saisie..."
                        disabled
                        className="w-full px-3 py-2 rounded text-sm"
                        style={{ 
                          backgroundColor: `hsl(${colors.input})`,
                          borderColor: `hsl(${colors.border})`,
                          color: `hsl(${colors.foreground})`
                        }}
                      />

                      {/* Accent Box */}
                      <div
                        className="p-4 rounded-lg"
                        style={{ 
                          backgroundColor: `hsl(${colors.accent})`,
                          color: `hsl(${colors.sidebar_foreground})`
                        }}
                      >
                        <h4 className="font-medium text-sm">Zone Accent</h4>
                        <p className="text-xs mt-1">Utilisée pour les éléments importants</p>
                      </div>
                    </div>
                  </div>

                  {/* Sidebar Preview */}
                  <div
                    className="p-6 rounded-lg"
                    style={{ 
                      backgroundColor: `hsl(${colors.sidebar_background})`,
                      color: `hsl(${colors.sidebar_foreground})`
                    }}
                  >
                    <h3 className="font-semibold mb-3 text-lg">Barre Latérale</h3>
                    <div className="space-y-2">
                      <div
                        className="px-3 py-2 rounded"
                        style={{ 
                          backgroundColor: `hsl(${colors.accent})`,
                          opacity: 0.2
                        }}
                      >
                        <p className="text-sm">Élément actif</p>
                      </div>
                      <div className="px-3 py-2 rounded">
                        <p className="text-sm" style={{ color: `hsl(${colors.muted_foreground})` }}>
                          Élément inactif
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Color Reference */}
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
                    {['background', 'card', 'accent', 'border', 'selection', 'button_primary', 'button_secondary', 'destructive', 'success', 'warning'].map((colorName) => (
                      <div key={colorName} className="text-center">
                        <div
                          className="h-12 rounded border-2 mb-2"
                          style={{ 
                            backgroundColor: `hsl(${colors[colorName as ColorVariable]})`,
                            borderColor: `hsl(${colors.border})`
                          }}
                        />
                        <p className="text-xs font-mono truncate">{colorName.replace(/_/g, ' ')}</p>
                      </div>
                    ))}
                  </div>
                </TabsContent>
              );
            })}
          </Tabs>
        </CardContent>
      </Card>

      {/* Logo entreprise */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ImageIcon className="h-5 w-5" />
            Logo entreprise (CPH Agriculture)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-sm text-muted-foreground">
            <strong>Logo 1</strong> (blanc) et <strong>Logo 2</strong> (couleur CPH) : choisissez pour chacun le mode{' '}
            <strong>clair</strong> ou <strong>sombre</strong>. Le mode <strong>Standard</strong> affiche toujours le{' '}
            <strong>logo 2</strong> (header et connexion).
          </p>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-3 rounded-lg border p-4">
              <p className="font-medium text-sm">Logo 1 — blanc</p>
              <div className="flex h-24 items-center justify-center rounded-md bg-zinc-800 p-3">
                <img src={branding.logo1Url} alt="Logo 1" className="max-h-full max-w-full object-contain" />
              </div>
              <label className="text-sm font-medium">Afficher en</label>
              <Select
                value={branding.logo1For}
                onValueChange={(v) => updateBranding({ logo1For: v as LogoThemeSlot })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="light">{getLogoLabel('light')}</SelectItem>
                  <SelectItem value="dark">{getLogoLabel('dark')}</SelectItem>
                </SelectContent>
              </Select>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                className="text-xs w-full"
                onChange={(e) => handleLogoFile(1, e.target.files?.[0] ?? null)}
              />
            </div>

            <div className="space-y-3 rounded-lg border p-4 border-primary/30">
              <p className="font-medium text-sm">Logo 2 — couleur (mode Standard)</p>
              <div className="flex h-24 items-center justify-center rounded-md bg-zinc-100 p-3">
                <img src={branding.logo2Url} alt="Logo 2" className="max-h-full max-w-full object-contain" />
              </div>
              <label className="text-sm font-medium">Afficher en</label>
              <Select
                value={branding.logo2For}
                onValueChange={(v) => updateBranding({ logo2For: v as LogoThemeSlot })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="light">{getLogoLabel('light')}</SelectItem>
                  <SelectItem value="dark">{getLogoLabel('dark')}</SelectItem>
                </SelectContent>
              </Select>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                className="text-xs w-full"
                onChange={(e) => handleLogoFile(2, e.target.files?.[0] ?? null)}
              />
            </div>
          </div>

          <div className="rounded-lg border p-4 space-y-3">
            <p className="text-sm font-medium">Aperçu par mode</p>
            <div className="grid gap-3 sm:grid-cols-3">
              {(['light', 'standard', 'dark'] as const).map((mode) => (
                <div key={mode} className="space-y-1">
                  <p className="text-xs text-muted-foreground capitalize">
                    {mode === 'light' ? 'Clair' : mode === 'dark' ? 'Sombre' : 'Standard'}
                  </p>
                  <div
                    className="flex h-16 items-center justify-center rounded-md p-2"
                    style={{
                      backgroundColor:
                        mode === 'dark' ? 'hsl(222 47% 11%)' : 'hsl(0 0% 94%)',
                    }}
                  >
                    <img
                      src={resolveCompanyLogoUrl(mode, branding)}
                      alt=""
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={saveBranding}>
              Enregistrer les logos
            </Button>
            <Button type="button" variant="outline" onClick={swapLogos}>
              Échanger logo 1 ↔ 2
            </Button>
            <Button type="button" variant="outline" onClick={resetBranding}>
              Réinitialiser
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Paramètres UI */}
      <Card>
        <CardHeader>
          <CardTitle>Paramètres UI</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Palette Actuelle</label>
            <p className="text-sm text-muted-foreground">
              {customColors[selectedPalette]?.name || selectedPalette}
            </p>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Mode d'Apparence</label>
            <p className="text-sm text-muted-foreground">
              {appearanceMode === 'dark' ? 'Sombre' : appearanceMode === 'standard' ? 'Standard' : 'Clair'} (géré via le menu utilisateur)
            </p>
          </div>
          <Button
            onClick={() => applyPalette(selectedPalette)}
            className="w-full"
          >
            Appliquer et Enregistrer
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
