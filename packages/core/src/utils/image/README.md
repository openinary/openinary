# Image Processing Module

This module has been refactored to improve code maintainability by dividing functionality into specialized sub-modules.

## Structure

```
src/utils/image/
├── index.ts           # Main entry point and orchestration
├── types.ts           # TypeScript types and interfaces
├── gravity.ts         # Position and gravity management
├── background.ts      # Background color management
├── aspect-ratio.ts    # Aspect ratio transformation
├── resize.ts          # Resizing and crop modes
├── rotation.ts        # Image rotation
└── quality.ts         # Quality management
```

## Modules

### `types.ts`
Defines all TypeScript types used in the module:
- `CropMode`: Crop modes ('fill', 'fit', 'scale', 'crop', 'pad')
- `GravityMode`: Positioning modes ('center', 'north', 'south', etc.)
- `BackgroundColor`: Interface for background colors
- `TransformParams`: Interface for transformation parameters

### `gravity.ts`
Handles conversion of gravity modes to Sharp positions:
- `getSharpPosition()`: Converts gravity modes to Sharp positions

### `background.ts`
Handles analysis and conversion of background colors:
- `parseBackgroundColor()`: Parses hex colors and the "transparent" keyword

### `aspect-ratio.ts`
Handles aspect ratio transformations:
- `applyAspectRatio()`: Applies an aspect ratio transformation

### `resize.ts`
Handles resizing with different modes:
- `applyResize()`: Applies resizing according to the specified mode

### `rotation.ts`
Handles image rotation:
- `applyRotation()`: Applies rotation (angle or auto)

### `quality.ts`
Handles quality parameters:
- `applyQuality()`: Applies JPEG quality parameters

### `index.ts`
Main entry point that:
- Orchestrates all transformations
- Maintains compatibility with the existing API
- Re-exports all types for compatibility

## Compatibility

The original `image.ts` file now re-exports all functionality from the new modular module, ensuring full compatibility with existing code.

## Benefits

1. **Maintainability**: Each functionality is isolated in its own file
2. **Testability**: Each module can be tested independently
3. **Reusability**: Modules can be imported individually
4. **Readability**: Code is easier to understand and navigate
5. **Extensibility**: New features can be added easily