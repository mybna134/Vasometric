# Vasometric

Isometric and perspective drawing toolkit for Figma, built with TypeScript and Bun. The interface follows Material 3 patterns: tonal surfaces, segmented controls, sliders, choice chips, and filled actions.

## Build

Install the development dependencies with Bun, then build both the Figma plugin code and the UI bundle:

```sh
bun install
bun run build
```

The build writes `dist/code.js` and the self-contained `dist/ui.html`. The `dist/` directory is ignored by Git.

In Figma, open **Plugins → Development → Import plugin from manifest…** and choose `manifest.json`. Keep `bun run watch` running while editing the plugin code; run `bun run build:ui` after changing the UI.

## Features

- Isometric preview with left, right, and top-facing directions, in-plane rotation, and depth control.
- Perspective controls for skew, 3D-style rotation, camera, extrusion, and drop shadow.
- Apply transforms and effects to the current Figma selection, or create an editable isometric grid.
- The plugin preview canvas displays raster previews exported from the real Figma selection. Controls transform those previews in the panel; **Apply to selection** commits the transform to Figma layers, while **Reset preview** resets the controls without changing the document.

Select one or more layers before adjusting controls. The generated `dist/ui.html` is self-contained so Figma loads the bundled TypeScript UI with the plugin.
