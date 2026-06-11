const APP_LOADING_EVENT = 'app-loading-overlay';

type LoadingOverlayAction = 'show' | 'hide';

interface LoadingOverlayEventDetail {
  action: LoadingOverlayAction;
  token?: string;
  message?: string;
}

function emitLoadingOverlayEvent(detail: LoadingOverlayEventDetail): void {
  window.dispatchEvent(new CustomEvent(APP_LOADING_EVENT, { detail }));
}

function createToken(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function showLoadingOverlay(message = 'Chargement en cours...'): string {
  const token = createToken();
  emitLoadingOverlayEvent({ action: 'show', token, message });
  return token;
}

export function hideLoadingOverlay(token?: string): void {
  emitLoadingOverlayEvent({ action: 'hide', token });
}

export async function runWithLoadingOverlay<T>(
  work: () => Promise<T>,
  message = 'Chargement en cours...'
): Promise<T> {
  const token = showLoadingOverlay(message);
  try {
    return await work();
  } finally {
    hideLoadingOverlay(token);
  }
}

export { APP_LOADING_EVENT };
