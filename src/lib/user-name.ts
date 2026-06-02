/** Découpe / recompose le champ users.name (NOM + prénom(s)) */

export function splitFullName(fullName: string): { nom: string; prenom: string } {
  const trimmed = (fullName || '').trim();
  if (!trimmed) return { nom: '', prenom: '' };
  const parts = trimmed.split(/\s+/);
  return {
    nom: parts[0] ?? '',
    prenom: parts.slice(1).join(' '),
  };
}

export function buildFullName(nom: string, prenom: string): string {
  const n = nom.trim();
  const p = prenom.trim();
  if (!n && !p) return '';
  if (!p) return n;
  if (!n) return p;
  return `${n} ${p}`;
}
