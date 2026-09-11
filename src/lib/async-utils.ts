/**
 * Réessaie une fois après un court délai avant d'abandonner — les échecs réseau
 * (ex. limite de requêtes momentanée côté serveur) sont souvent transitoires et
 * se résolvent seuls, plutôt que de laisser l'utilisateur bloqué sur des
 * données obsolètes ou une page vide en exigeant un rechargement manuel.
 */
export async function withRetry<T>(fn: () => Promise<T>, delayMs = 3000): Promise<T> {
  try {
    return await fn();
  } catch {
    await new Promise((resolve) => window.setTimeout(resolve, delayMs));
    return fn();
  }
}
