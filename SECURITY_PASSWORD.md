# 🔐 Sécurité des Mots de Passe

## Vue d'ensemble
Le système utilise **bcrypt avec coût 12** pour le hachage des mots de passe, implémenté via **pgcrypto** de PostgreSQL. Cela garantit une sécurité maximale.

## Architecture de sécurité

### 1. **Hachage Bcrypt (Coût 12)**
- **Algorithm**: bcrypt
- **Cost**: 12 (itérations exponentielles pour ralentir les attaques brute-force)
- **Salt**: Généré automatiquement par PostgreSQL
- **Hash Length**: 60 caractères (format: `$2a$12$...`)

### 2. **Fonctions RPC PostgreSQL**
Toutes les opérations de mot de passe utilisent des fonctions RPC (Remote Procedure Call) exécutées côté serveur:

#### `hash_password(password varchar) -> varchar`
- Hache un mot de passe avec bcrypt (coût 12)
- Utilisé par le trigger automatique
- Utilisé par `create_user_with_password` et `update_user_password`

#### `verify_password(password varchar, hash varchar) -> boolean`
- Vérifie un mot de passe contre son hash bcrypt
- Retourne `true` si valide, `false` sinon

#### `create_user_with_password(...)`
- Crée un utilisateur avec mot de passe haché automatiquement
- Reçoit le mot de passe en clair, hache côté serveur
- Utilisé par HRPanel et UsersPage

#### `update_user_password(user_id uuid, new_password varchar)`
- Met à jour le mot de passe d'un utilisateur
- Hache le nouveau mot de passe automatiquement
- Utilisé par Settings et UsersPage

### 3. **Trigger Automatique**
Un trigger PostgreSQL `trigger_hash_password_users` s'exécute automatiquement:
- **Moment**: BEFORE INSERT OR UPDATE sur la table users
- **Action**: Détecte si le mot de passe change et n'est pas déjà haché
- **Détection**: Vérifie si le mot de passe commence par `$2a$`, `$2b$` ou `$2y$` (format bcrypt)
- **Hachage**: Si ce n'est pas déjà un hash, le hache avec bcrypt

### 4. **Validation de Force du Mot de Passe**
Le service `passwordService.validatePasswordStrength()` vérifie:

**Critères obligatoires**:
- ✅ Au minimum 8 caractères
- ✅ Au moins une minuscule (a-z)
- ✅ Au moins une majuscule (A-Z)
- ✅ Au moins un chiffre (0-9)
- ✅ Au moins un caractère spécial (!@#$%^&*_-+=)

**Critères supplémentaires**:
- ✅ Plus de 12 caractères = bonus de sécurité
- ❌ Pas de caractères répétés (aaa, bbb)
- ❌ Pas de nombres au début ou à la fin

### 5. **Génération de Mot de Passe Temporaire**
`passwordService.generateTemporaryPassword(length)` génère des mots de passe sécurisés:
- Longueur minimum: 12 caractères
- Garantit: au moins 1 majuscule, 1 minuscule, 1 chiffre, 1 caractère spécial
- Format: Mélangé aléatoirement

Exemple: `K#9mPxLv4@Qr`

## Utilisation

### Créer un utilisateur avec mot de passe haché
```typescript
import { passwordService } from '@/services/passwordService';

const result = await passwordService.createUserWithPassword(
  'user@example.com',
  'Jean Dupont',
  'SecurePassword123!',
  {
    branch_id: '123e4567-e89b-12d3-a456-426614174000',
    role_id: '987f6543-e89b-12d3-a456-426614174000',
    role: 'employee'
  }
);

if (result.success) {
  console.log('Utilisateur créé:', result.data.user_id);
}
```

### Mettre à jour le mot de passe
```typescript
const result = await passwordService.updateUserPassword(
  userId,
  'NewSecurePassword123!'
);

if (result.success) {
  console.log('Mot de passe mis à jour avec succès');
}
```

### Générer un mot de passe temporaire
```typescript
const tempPassword = passwordService.generateTemporaryPassword(12);
// Résultat: K#9mPxLv4@Qr
```

### Valider la force du mot de passe
```typescript
const validation = passwordService.validatePasswordStrength('MyPassword123!');

console.log(validation.valid);         // true
console.log(validation.strength);      // 'strong'
console.log(validation.suggestions);   // []
```

## Scripts de configuration

### Setup des fonctions de hachage
```bash
npm run setup-password-hashing
```
Crée les fonctions RPC et le trigger PostgreSQL. À exécuter une fois après la création de la BD.

## Sécurité au niveau base de données

### Permissions RPC
Les fonctions RPC sont accessibles par:
- ✅ Utilisateurs authentifiés (`authenticated`)
- ✅ Utilisateurs anonymes (`anon`) - pour la création de compte
- ❌ Pas d'accès direct à `crypt()` PostgreSQL

### Trigger Protection
Le trigger garantit que:
- ✅ Les mots de passe ne sont jamais stockés en clair
- ✅ Même les mises à jour directes sont hachées
- ✅ Les hashes existants ne sont pas re-hachés

## Points de sécurité

| Point | Mesure |
|-------|--------|
| **Stockage** | Bcrypt (coût 12) |
| **Transmission** | HTTPS (Supabase) |
| **Traitement** | Côté serveur (PostgreSQL RPC) |
| **Validation** | Minimum 8 caractères + force requise |
| **Génération** | Aléatoire 12+ caractères avec symboles |
| **Vérification** | Bcrypt native (timing-safe) |

## Schéma de migration

Fichier: `supabase/migrations/20260526_add_password_hashing.sql`

Contient:
- ✅ Extension pgcrypto
- ✅ Fonction `hash_password()`
- ✅ Fonction `verify_password()`
- ✅ Fonction `create_user_with_password()`
- ✅ Fonction `update_user_password()`
- ✅ Trigger automatique `trigger_hash_password_users`
- ✅ Index sur colonne password
- ✅ Commentaires de documentation

## Références

- **Bcrypt**: https://en.wikipedia.org/wiki/Bcrypt
- **PostgreSQL pgcrypto**: https://www.postgresql.org/docs/current/pgcrypto.html
- **OWASP Password**: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
