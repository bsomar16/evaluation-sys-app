/** Accès Formation / Planification (hors sidebar pour la gestion) */

export function hasTrainingModuleAccess(
  isDeveloper: boolean,
  canReadTraining: boolean,
  canWriteTraining: boolean
): boolean {
  if (isDeveloper) return true;
  return canReadTraining || canWriteTraining;
}

export function showTrainingPlanningButton(
  isDeveloper: boolean,
  canReadTrainingManagement: boolean
): boolean {
  return isDeveloper || canReadTrainingManagement;
}

export function canAccessTrainingPlanning(
  isDeveloper: boolean,
  canReadTrainingManagement: boolean
): boolean {
  if (isDeveloper) return true;
  return canReadTrainingManagement;
}

export function canAccessTrainingAnalytics(
  isDeveloper: boolean,
  canReadTrainingManagement: boolean,
  canReadTraining: boolean
): boolean {
  if (isDeveloper) return true;
  return canReadTrainingManagement || canReadTraining;
}
