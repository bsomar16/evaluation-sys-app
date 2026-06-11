import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import {
  LayoutDashboard, ClipboardCheck, Users, GraduationCap, FileText, Shield,
  ChevronLeft, ChevronRight, Settings, LogOut, Menu, X, Building2, Briefcase,
  Moon, Sun, Palette, Monitor, Bell, Trash2, Lock
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { applyPaletteToDOM, getSelectedPaletteKey, saveSelectedPaletteKey, type PaletteKey } from '@/lib/palette-utils';
import { roleBadgeClassName } from '@/lib/role-colors';
import { supabase } from '@/integrations/supabase/client';
import { buildNavItems, isNavItemActive, type AppNavItem } from '@/lib/nav-items';
import {
  type SessionUser,
  repairSiteDeveloperSession,
  isSiteDeveloper,
  getSessionRoleBadge,
  getSessionHeaderSubtitle,
} from '@/lib/session-user';
import type { RoleRecord } from '@/lib/role-tree';
import LoadingOverlay from '@/components/ui/loading-overlay';
import { APP_LOADING_EVENT } from '@/lib/loading-overlay';
import { APP_LOADING_EVENT } from '@/lib/loading-overlay';
import {
  isEvaluationPeriodOpen,
  subscribeEvaluationPeriodChange,
} from '@/lib/evaluation-period-storage';
import {
  canAccessEvaluationManagement,
  canAccessEvaluationPage,
  hasEvaluationModuleAccess,
  shouldLockEvaluationNav,
} from '@/lib/evaluation-access';
import { useRolePermissions } from '@/hooks/useRolePermissions';
import { useToast } from '@/hooks/use-toast';
import { fetchEvaluations } from '@/lib/evaluation-storage';
import { fetchTrainingRequests } from '@/lib/training-storage';
import { hasTrainingModuleAccess } from '@/lib/training-access';
import { CompanyLogo } from '@/components/CompanyLogo';

type AppearanceMode = 'light' | 'dark' | 'standard';
type ConnectionBannerState = 'offline' | 'online';

const EVALUATION_PATH = '/evaluation';
const EVALUATION_MANAGEMENT_PATH = '/admin/evaluations';
const TRAINING_PATH = '/training';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isDeveloper, canRead, canWrite } = useRolePermissions();
  const canReadEvaluations = canRead('evaluations');
  const canWriteEvaluations = canWrite('evaluations');
  const canReadEvaluationsManagement = canRead('evaluations_management');
  const canReadTraining = canRead('training');
  const canWriteTraining = canWrite('training');
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [navItems, setNavItems] = useState<AppNavItem[]>([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState([
    { id: 1, message: 'Nouvelle évaluation en attente', time: 'Il y a 2h' },
    { id: 2, message: 'Formation assignée avec succès', time: 'Il y a 5h' },
    { id: 3, message: 'Rapport complété', time: 'Hier' },
  ]);
  const [appearanceMode, setAppearanceMode] = useState<AppearanceMode>('standard');
  const [isLoading, setIsLoading] = useState(true);
  const [overlayTokens, setOverlayTokens] = useState<string[]>([]);
  const [overlayMessage, setOverlayMessage] = useState('Chargement en cours...');
  const navTokenRef = useRef<string | null>(null);
  const overlayTimeoutsRef = useRef<Map<string, number>>(new Map());
  const [connectionBanner, setConnectionBanner] = useState<ConnectionBannerState | null>(() => {
    if (typeof navigator === 'undefined') return null;
    return navigator.onLine ? null : 'offline';
  });
  const connectionBannerTimeoutRef = useRef<number | null>(null);
  const [evaluationPeriodOpen, setEvaluationPeriodOpen] = useState(() => isEvaluationPeriodOpen());
  const [pendingEvaluationsCount, setPendingEvaluationsCount] = useState(0);
  const [pendingTrainingCount, setPendingTrainingCount] = useState(0);
  const INITIAL_LOAD_TOKEN = 'app-initial-load';
  const initialLoadHandledRef = useRef(false);
  const initialLoadTimeoutRef = useRef<number | null>(null);

  // Show loading overlay on app startup
  useEffect(() => {
    // Mark this useEffect execution immediately
    window.localStorage.setItem('debug_msg', 'useEffect executed at ' + Date.now());
    
    // Add initial load token if not already present
    setOverlayTokens((prev) => {
      if (!prev.includes(INITIAL_LOAD_TOKEN)) {
        console.log('[DEBUG] Adding initial load token');
        window.localStorage.setItem('debug_msg', 'Initial token added at ' + Date.now());
        return [...prev, INITIAL_LOAD_TOKEN];
      }
      return prev;
    });
    
    // Set timeout to auto-remove initial token after 15 seconds
    const timeoutId = window.setTimeout(() => {
      console.log('[DEBUG] Timeout fired - removing initial load token');
      window.localStorage.setItem('debug_msg', 'Timeout fired at ' + Date.now());
      setOverlayTokens((current) => {
        console.log('[DEBUG] Before filter:', current);
        const filtered = current.filter((t) => t !== INITIAL_LOAD_TOKEN);
        console.log('[DEBUG] After filter:', filtered);
        window.localStorage.setItem('debug_msg', 'Token removed at ' + Date.now());
        return filtered;
      });
      overlayTimeoutsRef.current.delete(INITIAL_LOAD_TOKEN);
    }, 15000);
    
    console.log('[DEBUG] Initial load effect: timeout set with ID', timeoutId);
    window.localStorage.setItem('debug_msg_timeout', 'ID: ' + timeoutId);
    
    initialLoadTimeoutRef.current = timeoutId;
    overlayTimeoutsRef.current.set(INITIAL_LOAD_TOKEN, timeoutId);
    
    return () => {
      console.log('[DEBUG] Cleaning up timeout');
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, []);

  useEffect(() => {
    const loadSessionAndNav = async () => {
      try {
        const userData = localStorage.getItem("user");
        const userRole = localStorage.getItem("userRole");
        if (!userData) {
          setIsLoading(false);
          return;
        }

        let session = repairSiteDeveloperSession() ?? (JSON.parse(userData) as SessionUser);

        if (!isSiteDeveloper(session)) {
          session = { ...session, role: userRole ?? session.role };
        }

        const { data: rolesData } = await supabase
          .from('roles')
          .select('id, name, code, color, level, child_roles, parent_role_id');

        setUser(session);
        setNavItems(buildNavItems(session, (rolesData || []) as RoleRecord[]));

        // Load appearance from DB for this user
        try {
          const { data: userAppearanceData } = await supabase
            .from('users')
            .select('appearance_mode')
            .eq('id', session.id)
            .single();
          
          if (userAppearanceData?.appearance_mode) {
            const mode = userAppearanceData.appearance_mode as AppearanceMode;
            setAppearanceMode(mode);
            localStorage.setItem('appearanceMode', mode);
          } else {
            // If no mode in DB, use standard as default
            setAppearanceMode('standard');
            localStorage.setItem('appearanceMode', 'standard');
          }
        } catch (error) {
          console.error('Failed to load appearance from DB:', error);
          // Fallback to standard
          setAppearanceMode('standard');
          localStorage.setItem('appearanceMode', 'standard');
        }
      } finally {
        setIsLoading(false);
      }
    };

    loadSessionAndNav();
  }, []);

  useEffect(() => {
    // Apply theme immediately on load
    if (appearanceMode === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }

    let paletteKey = getSelectedPaletteKey();
    
    if (appearanceMode === 'standard') {
      paletteKey = 'corporate';
      saveSelectedPaletteKey(paletteKey);
      document.documentElement.style.setProperty('--header-bg', '0 0% 94%');
    } else if (appearanceMode === 'light' && paletteKey === 'corporate') {
      document.documentElement.style.setProperty('--header-bg', '0 0% 94%');
    } else {
      document.documentElement.style.setProperty('--header-bg', 'var(--card)');
    }

    applyPaletteToDOM(paletteKey, appearanceMode);
    window.dispatchEvent(new CustomEvent('appearanceModeChange', { detail: appearanceMode }));
  }, [appearanceMode]);

  useEffect(() => {
    localStorage.setItem('appearanceMode', appearanceMode);
    
    // Save appearance to DB if user is logged in
    if (user && !isLoading) {
      supabase
        .from('users')
        .update({ appearance_mode: appearanceMode })
        .eq('id', user.id)
        .then(() => {
          console.log('Appearance saved to DB:', appearanceMode);
        })
        .catch((error) => {
          console.error('Failed to save appearance to DB:', error);
        });
    }
  }, [appearanceMode, user, isLoading]);

  // Listen for palette changes from UIStudio or other components
  // BUT: ignore palette changes in standard mode (standard is independent)
  useEffect(() => {
    const handlePaletteChange = (event: Event) => {
      // Standard mode is independent from UIStudio - ignore palette changes
      if (appearanceMode === 'standard') return;

      const customEvent = event as CustomEvent<{ paletteKey: PaletteKey }>;
      if (customEvent.detail?.paletteKey) {
        applyPaletteToDOM(customEvent.detail.paletteKey, appearanceMode);
      }
    };

    window.addEventListener('paletteChange', handlePaletteChange);
    return () => window.removeEventListener('paletteChange', handlePaletteChange);
  }, [appearanceMode]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (dropdownOpen && !target.closest('[data-dropdown-trigger]') && !target.closest('[data-dropdown-menu]')) {
        setDropdownOpen(false);
      }
      if (notificationsOpen && !target.closest('[data-notification-trigger]') && !target.closest('[data-notification-menu]')) {
        setNotificationsOpen(false);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [dropdownOpen]);

  useEffect(() => {
    setEvaluationPeriodOpen(isEvaluationPeriodOpen());
    return subscribeEvaluationPeriodChange(setEvaluationPeriodOpen);
  }, []);

  const loadPendingEvaluationsCount = useCallback(async () => {
    if (!hasEvaluationModuleAccess(isDeveloper, canReadEvaluations, canWriteEvaluations)) {
      setPendingEvaluationsCount(0);
      return;
    }

    try {
      let totalCount = 0;

      // Get current user's role with child_roles
      if (user?.role_id) {
        const { data: roleData } = await supabase
          .from('roles')
          .select('child_roles')
          .eq('id', user.role_id)
          .single();
        
        let childRoleIds: string[] = [];
        if (roleData?.child_roles) {
          // Parse child_roles (could be JSON array or comma-separated string)
          if (Array.isArray(roleData.child_roles)) {
            childRoleIds = roleData.child_roles;
          } else if (typeof roleData.child_roles === 'string') {
            try {
              childRoleIds = JSON.parse(roleData.child_roles);
            } catch {
              childRoleIds = roleData.child_roles.split(',').map(id => id.trim()).filter(id => id);
            }
          }
        }

        // Get users with child roles
        if (childRoleIds.length > 0) {
          const { data: childUsers } = await supabase
            .from('users')
            .select('id')
            .in('role_id', childRoleIds);

          const childUserIds = childUsers?.map(u => u.id) ?? [];

          // Count pending evaluations for child role users
          if (childUserIds.length > 0) {
            const { count: childCount, error: childError } = await supabase
              .from('evaluations')
              .select('id', { count: 'exact', head: true })
              .in('status', ['submitted', 'pending'])
              .in('evaluated_user_id', childUserIds);

            if (!childError) {
              totalCount = childCount ?? 0;
            }
          }
        }
      }

      // Also get current user's pending evaluations
      const { count, error } = await supabase
        .from('evaluations')
        .select('id', { count: 'exact', head: true })
        .in('status', ['submitted', 'pending']);

      if (error) throw error;
      totalCount += (count ?? 0);
      
      setPendingEvaluationsCount(totalCount);
    } catch {
      // fallback local (mode compat table/colonne manquante)
      try {
        const rows = await fetchEvaluations();
        setPendingEvaluationsCount(
          rows.filter((e) => e.status === 'submitted' || e.status === 'pending').length
        );
      } catch {
        setPendingEvaluationsCount(0);
      }
    }
  }, [isDeveloper, canReadEvaluations, canWriteEvaluations, user?.role_id]);

  useEffect(() => {
    void loadPendingEvaluationsCount();

    const intervalId = window.setInterval(() => {
      void loadPendingEvaluationsCount();
    }, 30000);

    const channel = supabase
      .channel('sidebar-evaluations-pending-count')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'evaluations' },
        () => {
          void loadPendingEvaluationsCount();
        }
      )
      .subscribe();

    return () => {
      window.clearInterval(intervalId);
      void supabase.removeChannel(channel);
    };
  }, [loadPendingEvaluationsCount]);

  const loadPendingTrainingCount = useCallback(async () => {
    if (!hasTrainingModuleAccess(isDeveloper, canReadTraining, canWriteTraining)) {
      setPendingTrainingCount(0);
      return;
    }

    let count = 0;

    try {
      const { count: dbCount, error } = await supabase
        .from('training_requests')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending');

      if (!error) count = dbCount ?? 0;
    } catch {
      /* fallback ci-dessous */
    }

    try {
      const rows = await fetchTrainingRequests({ scope: 'all' });
      const localPending = rows.filter((r) => r.status === 'pending').length;
      count = Math.max(count, localPending);
    } catch {
      /* garder count BDD si dispo */
    }

    setPendingTrainingCount(count);
  }, [isDeveloper, canReadTraining, canWriteTraining]);

  useEffect(() => {
    void loadPendingTrainingCount();

    const intervalId = window.setInterval(() => {
      void loadPendingTrainingCount();
    }, 30000);

    const channel = supabase
      .channel('sidebar-training-pending-count')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'training_requests' },
        () => {
          void loadPendingTrainingCount();
        }
      )
      .subscribe();

    const onTrainingChanged = () => {
      void loadPendingTrainingCount();
    };
    window.addEventListener('training-requests-changed', onTrainingChanged);

    return () => {
      window.clearInterval(intervalId);
      void supabase.removeChannel(channel);
      window.removeEventListener('training-requests-changed', onTrainingChanged);
    };
  }, [loadPendingTrainingCount]);

  useEffect(() => {
    if (location.pathname === TRAINING_PATH) {
      void loadPendingTrainingCount();
    }
  }, [location.pathname, loadPendingTrainingCount]);

  useEffect(() => {
    const clearOnlineBannerTimeout = () => {
      if (connectionBannerTimeoutRef.current) {
        window.clearTimeout(connectionBannerTimeoutRef.current);
        connectionBannerTimeoutRef.current = null;
      }
    };

    const handleOffline = () => {
      clearOnlineBannerTimeout();
      setConnectionBanner('offline');
    };

    const handleOnline = () => {
      clearOnlineBannerTimeout();
      setConnectionBanner('online');
      connectionBannerTimeoutRef.current = window.setTimeout(() => {
        setConnectionBanner(null);
        connectionBannerTimeoutRef.current = null;
      }, 3000);
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
      clearOnlineBannerTimeout();
    };
  }, []);

  useEffect(() => {
    const handleOverlayEvent = (event: Event) => {
      const detail = (event as CustomEvent<{ action?: 'show' | 'hide' | 'remove-initial'; token?: string; message?: string }>).detail;
      if (!detail?.action) return;

      if (detail.action === 'show') {
        if (detail.message) setOverlayMessage(detail.message);
        if (detail.token) {
          setOverlayTokens((prev) => (prev.includes(detail.token!) ? prev : [...prev, detail.token!]));
          const timeoutId = window.setTimeout(() => {
            setOverlayTokens((prev) => prev.filter((token) => token !== detail.token));
            overlayTimeoutsRef.current.delete(detail.token!);
          }, 8000);
          overlayTimeoutsRef.current.set(detail.token, timeoutId);
        }
        return;
      }

      if (detail.action === 'remove-initial') {
        setOverlayTokens((prev) => prev.filter((token) => token !== 'app-initial-load'));
        return;
      }

      if (detail.token) {
        const timeoutId = overlayTimeoutsRef.current.get(detail.token);
        if (timeoutId) {
          window.clearTimeout(timeoutId);
          overlayTimeoutsRef.current.delete(detail.token);
        }
        setOverlayTokens((prev) => prev.filter((token) => token !== detail.token));
      } else {
        overlayTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
        overlayTimeoutsRef.current.clear();
        setOverlayTokens([]);
      }
    };

    window.addEventListener(APP_LOADING_EVENT, handleOverlayEvent);
    return () => {
      window.removeEventListener(APP_LOADING_EVENT, handleOverlayEvent);
      overlayTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
      overlayTimeoutsRef.current.clear();
    };
  }, []);

  useEffect(() => {
    if (!navTokenRef.current) return;
    const currentToken = navTokenRef.current;
    const timer = window.setTimeout(() => {
      hideLoadingOverlay(currentToken);
      if (navTokenRef.current === currentToken) {
        navTokenRef.current = null;
      }
    }, 120);

    return () => window.clearTimeout(timer);
  }, [location.pathname]);

  const handleNavClick = (path: string) => {
    if (path === EVALUATION_PATH) {
      if (
        !canAccessEvaluationPage(
          isDeveloper,
          canReadEvaluations,
          canWriteEvaluations,
          evaluationPeriodOpen
        )
      ) {
        toast({
          variant: 'destructive',
          title: 'Évaluation verrouillée',
          description: "Aucune période d'évaluation active.",
        });
        setMobileOpen(false);
        return;
      }
    }

    if (path === EVALUATION_MANAGEMENT_PATH) {
      if (!canAccessEvaluationManagement(isDeveloper, canReadEvaluationsManagement)) {
        toast({ variant: 'destructive', title: 'Accès refusé', description: 'Permission lecture requise.' });
        setMobileOpen(false);
        return;
      }
    }

    if (path === location.pathname) {
      setMobileOpen(false);
      return;
    }

    if (navTokenRef.current) {
      hideLoadingOverlay(navTokenRef.current);
    }

    navTokenRef.current = showLoadingOverlay('Chargement...');
    setMobileOpen(false);
    navigate(path);
  };

  const handleLogout = () => {
    localStorage.removeItem("user");
    localStorage.removeItem("userRole");
    navigate("/login");
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      <LoadingOverlay
        visible={overlayTokens.length > 0}
        message={overlayMessage}
      />
      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-foreground/40 md:hidden" onClick={() => setMobileOpen(false)} />
      )}

      {/* Header - Full Width */}
      <header 
        className="flex items-center justify-between h-16 px-4 md:px-6 border-b border-border shrink-0"
        style={{
          backgroundColor: appearanceMode === 'standard' ? 'hsl(0 0% 94%)' : 'hsl(var(--card))'
        }}
      >
        <button onClick={() => setMobileOpen(true)} className="md:hidden mr-3 text-muted-foreground">
          <Menu size={22} />
        </button>
        
        <CompanyLogo height={56} appearanceMode={appearanceMode} />
        
        <div className="flex-1" />
        
        <div className="flex items-center gap-3 relative">
          <div className="text-right hidden sm:block">
            {user ? (
              (() => {
                const badge = getSessionRoleBadge(user);
                return (
                  <div className={roleBadgeClassName} style={badge.style}>
                    {badge.label}
                  </div>
                );
              })()
            ) : (
              <div className="px-1.5 py-0 rounded-full border-2 border-muted-foreground bg-muted text-muted-foreground font-semibold text-xs inline-block">
                User
              </div>
            )}
            <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
              <p>{user ? getSessionHeaderSubtitle(user) : '—'}</p>
            </div>
          </div>
          
          {/* Notification Button */}
          <button
            onClick={() => setNotificationsOpen(!notificationsOpen)}
            className="relative w-7 h-7 rounded-full bg-muted hover:bg-accent/20 flex items-center justify-center text-foreground transition-colors cursor-pointer"
            data-notification-trigger
          >
            <Bell size={16} />
            {notifications.length > 0 && (
              <span className="absolute top-0 right-0 w-2 h-2 bg-destructive rounded-full"></span>
            )}
          </button>

          {/* Notifications Dropdown */}
          {notificationsOpen && (
            <div 
              className="absolute right-14 top-14 bg-card border border-border rounded-lg shadow-lg z-50 w-80"
              onClick={(e) => e.stopPropagation()}
              data-notification-menu
            >
              <div className="p-3 border-b border-border flex items-center justify-between">
                <p className="text-sm font-semibold">Notifications</p>
                <span className="text-xs bg-accent/20 text-accent px-2 py-1 rounded">{notifications.length}</span>
              </div>

              <div className="max-h-80 overflow-y-auto">
                {notifications.length > 0 ? (
                  <div className="p-2 space-y-2">
                    {notifications.map((notif) => (
                      <div 
                        key={notif.id}
                        className="p-3 rounded-md bg-muted/30 hover:bg-muted/50 transition-colors flex items-start justify-between group"
                      >
                        <div className="flex-1">
                          <p className="text-sm text-foreground">{notif.message}</p>
                          <p className="text-xs text-muted-foreground mt-1">{notif.time}</p>
                        </div>
                        <button
                          onClick={() => setNotifications(notifications.filter(n => n.id !== notif.id))}
                          className="ml-2 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-8 text-center">
                    <Bell size={32} className="mx-auto text-muted-foreground/30 mb-2" />
                    <p className="text-sm text-muted-foreground">Aucune notification</p>
                  </div>
                )}
              </div>
            </div>
          )}

          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-sm font-semibold hover:opacity-90 transition-opacity cursor-pointer"
            data-dropdown-trigger
          >
            {user ? getInitials(user.name) : "U"}
          </button>

          {/* Dropdown Menu */}
          {dropdownOpen && (
            <div 
              className="absolute right-0 top-14 bg-card border border-border rounded-lg shadow-lg z-50 min-w-[200px]"
              onClick={(e) => e.stopPropagation()}
              data-dropdown-menu
            >
              <div className="p-4 border-b border-border">
                <p className="text-sm font-medium">{user?.name || "User"}</p>
                <p className="text-xs text-muted-foreground">{user?.email || user?.username}</p>
              </div>

              <div className="p-2 space-y-1">
                <Link
                  to="/settings"
                  onClick={() => setDropdownOpen(false)}
                  className="flex items-center gap-2 px-3 py-2 text-sm rounded-md hover:bg-accent transition-colors"
                >
                  <Settings size={16} />
                  Paramètres
                </Link>

                <div className="flex items-center justify-between px-3 py-2">
                  <div className="flex items-center gap-2">
                    <Palette size={16} />
                    <span className="text-sm font-medium">Apparence</span>
                  </div>
                  <div className="relative w-12 h-6 bg-muted rounded-full cursor-pointer" onClick={(e) => e.stopPropagation()}>
                    {/* Slider track */}
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full h-1 bg-muted rounded-full"></div>
                    </div>
                    
                    {/* Slider thumb with icon */}
                    <div
                      className="absolute top-1/2 transform -translate-y-1/2 w-6 h-6 bg-accent rounded-full flex items-center justify-center transition-all duration-200"
                      style={{
                        left: appearanceMode === 'light' ? '0px' : appearanceMode === 'standard' ? 'calc(50% - 12px)' : 'calc(100% - 24px)',
                      }}
                    >
                      {appearanceMode === 'light' && <Sun size={14} className="text-white" />}
                      {appearanceMode === 'standard' && <Monitor size={14} className="text-white" />}
                      {appearanceMode === 'dark' && <Moon size={14} className="text-white" />}
                    </div>

                    {/* Hidden input for interaction */}
                    <input 
                      type="range" 
                      min="0" 
                      max="2" 
                      step="1"
                      value={appearanceMode === 'light' ? 0 : appearanceMode === 'standard' ? 1 : 2}
                      onChange={(e) => {
                        const modes: AppearanceMode[] = ['light', 'standard', 'dark'];
                        setAppearanceMode(modes[parseInt(e.target.value)]);
                      }}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                  </div>
                </div>

                <button
                  onClick={() => {
                    setDropdownOpen(false);
                    handleLogout();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md hover:bg-destructive/10 text-destructive transition-colors"
                >
                  <LogOut size={16} />
                  Déconnexion
                </button>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Content Container */}
      {connectionBanner && (
        <div
          className={cn(
            "w-full px-4 md:px-6 py-2 text-sm font-semibold border-b",
            connectionBanner === 'offline'
              ? "bg-destructive text-destructive-foreground border-destructive/70"
              : "bg-green-600 text-white border-green-700"
          )}
        >
          {connectionBanner === 'offline'
            ? 'Connexion perdue. Vérifiez votre réseau.'
            : 'Connexion rétablie.'}
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside
          className={cn(
            "flex flex-col bg-sidebar text-sidebar-foreground transition-all duration-300 border-r-2 border-sidebar-border relative",
            "fixed inset-y-14 left-0 z-50 md:relative md:inset-auto",
            collapsed ? "w-[72px]" : "w-64",
            mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
          )}
        >
          {/* Nav */}
          <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
            {navItems.map((item) => {
              const active = isNavItemActive(location.pathname, item.path);
              const evaluationLocked =
                item.path === EVALUATION_PATH &&
                shouldLockEvaluationNav(isDeveloper, evaluationPeriodOpen);
              return (
                <button
                  type="button"
                  key={item.path}
                  aria-disabled={evaluationLocked}
                  onClick={() => handleNavClick(item.path)}
                  className={cn(
                    "w-full appearance-none border-0 bg-transparent flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 relative text-left",
                    active && !evaluationLocked
                      ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-md border-l-4 border-sidebar-accent"
                      : "text-sidebar-foreground/75",
                    evaluationLocked
                      ? "opacity-55 cursor-not-allowed"
                      : "hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
                  )}
                >
                  <item.icon size={20} className={active && !evaluationLocked ? "text-sidebar-accent-foreground" : ""} />
                  {!collapsed && (
                    <span className={cn("flex-1", active && !evaluationLocked ? "font-semibold" : "")}>
                      {item.label}
                    </span>
                  )}
                  {item.path === EVALUATION_PATH && pendingEvaluationsCount > 0 && (
                    <span
                      className={cn(
                        'ml-auto shrink-0 rounded-full bg-destructive text-destructive-foreground text-[10px] font-semibold min-w-5 h-5 px-1 flex items-center justify-center',
                        collapsed ? 'absolute right-2 top-1.5 min-w-4 h-4 text-[9px]' : ''
                      )}
                      title={`${pendingEvaluationsCount} évaluation(s) en attente`}
                    >
                      {pendingEvaluationsCount > 99 ? '99+' : pendingEvaluationsCount}
                    </span>
                  )}
                  {item.path === TRAINING_PATH && pendingTrainingCount > 0 && (
                    <span
                      className={cn(
                        'ml-auto shrink-0 rounded-full bg-destructive text-destructive-foreground text-[10px] font-semibold min-w-5 h-5 px-1 flex items-center justify-center',
                        collapsed ? 'absolute right-2 top-1.5 min-w-4 h-4 text-[9px]' : ''
                      )}
                      title={`${pendingTrainingCount} formation(s) en attente`}
                    >
                      {pendingTrainingCount > 99 ? '99+' : pendingTrainingCount}
                    </span>
                  )}
                  {evaluationLocked && (
                    <Lock size={16} className="shrink-0 ml-auto text-sidebar-foreground/80" aria-hidden />
                  )}
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Toggle Button - Outside Sidebar */}
        <button 
          onClick={() => setCollapsed(!collapsed)} 
          className="hidden md:flex absolute top-1/2 -translate-y-1/2 flex-col items-center justify-center w-4 h-14 bg-sidebar-accent hover:bg-sidebar-accent/80 rounded-r-lg transition-all duration-300 text-sidebar-accent-foreground shadow-lg border-2 border-sidebar-accent z-40"
          style={{
            left: collapsed ? '72px' : '256px'
          }}
          title={collapsed ? "Étendre sidebar" : "Réduire sidebar"}
        >
          <div className="flex flex-col gap-0.5">
            {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </div>
        </button>

        {/* Main Content */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {/* Content Area */}
          <div className="flex-1 overflow-auto p-4 md:p-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
