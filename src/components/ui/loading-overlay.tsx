import { Loader2 } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useEffect } from 'react';

interface LoadingOverlayProps {
  visible: boolean;
  message?: string;
}

export function LoadingOverlay({ visible, message = 'Chargement en cours...' }: LoadingOverlayProps) {
  const appearanceMode =
    typeof window !== 'undefined' ? localStorage.getItem('appearanceMode') || 'standard' : 'standard';

  const spinnerColor =
    appearanceMode === 'dark'
      ? '#ffffff'
      : appearanceMode === 'standard'
        ? 'hsl(var(--sidebar-background))'
        : '#111111';

  const textColor =
    appearanceMode === 'dark'
      ? '#ffffff'
      : appearanceMode === 'standard'
        ? 'hsl(var(--sidebar-background))'
        : '#111111';

  const spinnerShadow =
    appearanceMode === 'dark'
      ? '0 0 20px rgba(255,255,255,0.5)'
      : appearanceMode === 'standard'
        ? '0 0 20px hsl(var(--sidebar-background) / 0.45)'
        : '0 0 16px rgba(0,0,0,0.35)';

  const textShadow =
    appearanceMode === 'dark'
      ? '0 1px 8px rgba(255,255,255,0.35)'
      : appearanceMode === 'standard'
        ? '0 1px 10px hsl(var(--sidebar-background) / 0.35)'
        : '0 1px 8px rgba(0,0,0,0.28)';

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.body.classList.toggle('app-loading-active', visible);
    return () => document.body.classList.remove('app-loading-active');
  }, [visible]);

  if (!visible || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[2147483647] flex items-center justify-center loading-overlay-backdrop">
      <div className="flex flex-col items-center gap-4">
        <Loader2
          className="h-24 w-24 animate-spin"
          strokeWidth={2.7}
          style={{ color: spinnerColor, filter: `drop-shadow(${spinnerShadow})` }}
        />
        <p className="text-sm font-semibold tracking-wide" style={{ color: textColor, textShadow }}>
          {message}
        </p>
      </div>
    </div>
    ,
    document.body
  );
}

export default LoadingOverlay;
