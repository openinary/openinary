# Media Library Component

Composant principal de la bibliothèque de médias optimisé et modulaire.

## Structure

- `index.tsx` - Composant principal MediaLibrary
- `types.ts` - Types TypeScript partagés
- `exports.ts` - Exports centralisés pour faciliter les imports
- `media-grid.tsx` - Vue en grille des médias
- `media-list.tsx` - Vue en liste des médias
- `media-context-menu.tsx` - Menu contextuel réutilisable
- `loading-skeleton.tsx` - États de chargement pour les deux vues

## Utilisation

```tsx
// Import via exports centralisés (recommandé)
import { MediaLibrary } from "@repo/ui/components/media-library/exports";

// Ou import direct
import MediaLibrary from "@repo/ui/components/media-library/index";
```

## Optimisations apportées

1. **Élimination des répétitions** :

   - Menu contextuel centralisé
   - Types partagés
   - Composants séparés pour chaque vue

2. **Structure modulaire** :

   - Chaque fonctionnalité dans son propre fichier
   - Exports centralisés
   - Types TypeScript partagés

3. **Réutilisabilité** :
   - Composants indépendants
   - Props bien définies
   - Logique métier séparée de l'affichage
