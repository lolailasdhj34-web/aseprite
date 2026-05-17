# PixiCraft: 2D Minecraft with Pixi.js

PixiCraft is a small browser sandbox inspired by Minecraft's block editing loop. It uses Pixi.js for rendering and ships as a static example, so it can be served by any local HTTP server.

## Features

- Procedurally generated 2D terrain with hills, caves, ores, trees, sand, and water.
- Player movement with gravity, jumping, camera follow, and tile collision.
- Mouse-based mining and block placement with a hotbar.
- Keyboard shortcuts for movement, block selection, and world regeneration.
- Pixel-art style rendering, day/night sky tint, and a lightweight HUD.

## Running locally

From this directory, start a static web server:

```sh
python3 -m http.server 4173
```

Then open <http://localhost:4173/> in a browser.

Pixi.js is imported from jsDelivr in `src/main.js`, so the browser needs network access the first time the page is loaded.
