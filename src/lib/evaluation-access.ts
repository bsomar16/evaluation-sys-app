/**
 * Règles d'accès Évaluation / Gestion des évaluations
 * - Développeur : accès complet, ignore le verrou période
 * - Lecture (evaluations) : page Évaluation si période active
 * - Lecture (evaluations_management) : Gestion des évaluations (hors sidebar)
 * - Sans lecture : aucun accès
 */

/** Lecture ou écriture sur le module Évaluation + période ouverte */
export function canAccessEvaluationPage(
  isDeveloper: boolean,
  canReadEvaluations: boolean,
  canWriteEvaluations: boolean,
  periodOpen: boolean
): boolean {
  if (isDeveloper) return true;
  const hasAccess = canReadEvaluations || canWriteEvaluations;
  return hasAccess && periodOpen;
}

export function hasEvaluationModuleAccess(
  isDeveloper: boolean,
  canReadEvaluations: boolean,
  canWriteEvaluations: boolean
): boolean {
  if (isDeveloper) return true;
  return canReadEvaluations || canWriteEvaluations;
}

export function canAccessEvaluationManagement(
  isDeveloper: boolean,
  canReadEvaluationsManagement: boolean
): boolean {
  if (isDeveloper) return true;
  return canReadEvaluationsManagement;
}

export function shouldLockEvaluationNav(isDeveloper: boolean, periodOpen: boolean): boolean {
  return !isDeveloper && !periodOpen;
}

/** Bouton « Gestion des évaluations » (pas d’entrée sidebar). */
export function showEvaluationManageButton(
  isDeveloper: boolean,
  canReadEvaluationsManagement: boolean
): boolean {
  return isDeveloper || canReadEvaluationsManagement;
}
