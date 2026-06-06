# Dépendances Lovable - Migrées vers CPH

## Contexte
Ce projet a été créé initialement avec Lovable (plate-forme de développement IA). 
Toutes les références à Lovable ont été supprimées et remplacées par CPH.

## Références Lovable Supprimées

### Code Source
- ✅ `src/pages/Index.tsx` - Suppression de `data-lovable-blank-page-placeholder`
- ✅ Remplacement du placeholder Lovable par logo CPH

### Assets
- ✅ `public/placeholder.svg` → remplacé par `public/cph-logo.svg`

## Dépendances Lovable (dans bun.lock)

Les dépendances npm suivantes utilisent le registre Lovable (lovable-core-prod):

```
- lovable-tagger: ^1.1.13
- @adobe/css-tools
- @babel/code-frame
- @babel/helper-validator-identifier
- @jridgewell/sourcemap-codec
- @playwright/test
- @supabase/auth-js
- @supabase/functions-js
- @supabase/phoenix
- @supabase/postgrest-js
- @supabase/realtime-js
- @supabase/storage-js
- @supabase/supabase-js
- @testing-library/dom
- @testing-library/jest-dom
- @testing-library/react
- @tootallnate/once
- @types/aria-query
- @types/chai
- @types/deep-eql
- @types/ws
```

**Note:** Ces dépendances proviennent du registre privé `lovable-core-prod` mais sont des packages publics standard.
Pour migrer vers des sources officielles, exécuter:

```bash
bun install --force
# ou
npm install --force
```

Cela régénérera `bun.lock` avec les registres NPM publics.

## Rebrand CPH

La page d'accueil affiche maintenant:
- Logo CPH (logo.svg)
- Branding CPH
- Interface sans référence à Lovable
