# Image Processing Module

Ce module a été refactorisé pour améliorer la maintenabilité du code en divisant les fonctionnalités en sous-modules spécialisés.

## Structure

```
src/utils/image/
├── index.ts           # Point d'entrée principal et orchestration
├── types.ts           # Types et interfaces TypeScript
├── gravity.ts         # Gestion du positionnement et de la gravité
├── background.ts      # Gestion des couleurs de fond
├── aspect-ratio.ts    # Transformation du ratio d'aspect
├── resize.ts          # Redimensionnement et modes de crop
├── rotation.ts        # Rotation des images
└── quality.ts         # Gestion de la qualité
```

## Modules

### `types.ts`
Définit tous les types TypeScript utilisés dans le module :
- `CropMode` : Modes de recadrage ('fill', 'fit', 'scale', 'crop', 'pad')
- `GravityMode` : Modes de positionnement ('center', 'north', 'south', etc.)
- `BackgroundColor` : Interface pour les couleurs de fond
- `TransformParams` : Interface pour les paramètres de transformation

### `gravity.ts`
Gère la conversion des modes de gravité vers les positions Sharp :
- `getSharpPosition()` : Convertit les modes de gravité en positions Sharp

### `background.ts`
Gère l'analyse et la conversion des couleurs de fond :
- `parseBackgroundColor()` : Parse les couleurs hex et le mot-clé "transparent"

### `aspect-ratio.ts`
Gère les transformations de ratio d'aspect :
- `applyAspectRatio()` : Applique une transformation de ratio d'aspect

### `resize.ts`
Gère le redimensionnement avec différents modes :
- `applyResize()` : Applique le redimensionnement selon le mode spécifié

### `rotation.ts`
Gère la rotation des images :
- `applyRotation()` : Applique la rotation (angle ou auto)

### `quality.ts`
Gère les paramètres de qualité :
- `applyQuality()` : Applique les paramètres de qualité JPEG

### `index.ts`
Point d'entrée principal qui :
- Orchestre toutes les transformations
- Maintient la compatibilité avec l'API existante
- Réexporte tous les types pour la compatibilité

## Compatibilité

Le fichier `image.ts` original réexporte maintenant toutes les fonctionnalités du nouveau module modulaire, garantissant une compatibilité totale avec le code existant.

## Avantages

1. **Maintenabilité** : Chaque fonctionnalité est isolée dans son propre fichier
2. **Testabilité** : Chaque module peut être testé indépendamment
3. **Réutilisabilité** : Les modules peuvent être importés individuellement
4. **Lisibilité** : Le code est plus facile à comprendre et à naviguer
5. **Extensibilité** : Nouvelles fonctionnalités peuvent être ajoutées facilement