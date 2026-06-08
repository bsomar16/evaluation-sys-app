export const formatNom = (text: string) => text.toUpperCase();

/** Majuscule sur chaque mot (ex. "hadj hammed" → "Hadj Hammed") */
export const formatPrenom = (text: string) =>
  text.replace(/\S+/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());

export function buildUsernameFromName(last: string, first: string): string {
  const base = `${last} ${first}`.trim();
  if (!base) return '';

  const cleanLast = last
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

  const cleanFirst = first
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, '');

  return [cleanLast, cleanFirst]
    .filter(Boolean)
    .join('-')
    .replace(/[^a-z0-9._-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');
}

export interface EmployeeUserFormValues {
  code: string;
  first_name: string;
  last_name: string;
  username: string;
  password: string;
  branch: string;
  department: string;
  role: string;
  is_agent_without_account: boolean;
}

export function emptyEmployeeUserForm(defaultRoleId = ''): EmployeeUserFormValues {
  return {
    code: '',
    first_name: '',
    last_name: '',
    username: '',
    password: '',
    branch: '',
    department: '',
    role: defaultRoleId,
    is_agent_without_account: false,
  };
}
