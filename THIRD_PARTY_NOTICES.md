# Third-party notices

agent-floor includes or adapts the following third-party work.

## Hermes3D

- Source: https://github.com/iamlukethedev/Hermes3D
- Licence: MIT
- Used in: `public/office/` (the 3D office). The office layout, furniture footprints,
  procedural textures, environment (floor, walls, pictures, lawn, trees) and the
  procedural furniture and machines are ported from Hermes3D's
  `src/features/retro-office/` and rewritten as plain three.js. Each ported file
  credits Hermes3D in its header.

```
MIT License

Copyright (c) 2026 Luke The Dev

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## three.js

- Source: https://threejs.org (npm package `three`, r186)
- Licence: MIT, Copyright © 2010-2026 three.js authors
- Used in: `public/vendor/` (`three.module.min.js` and the addons under `public/vendor/addons/`).
- Full licence text: [`public/vendor/three.LICENSE.txt`](public/vendor/three.LICENSE.txt)

## Kenney Furniture Kit

- Source: https://kenney.nl/assets/furniture-kit (Furniture Kit 2.0 by Kenney, www.kenney.nl)
- Licence: Creative Commons Zero (CC0 1.0), http://creativecommons.org/publicdomain/zero/1.0/
- Used in: `public/office/models/*.glb` (a subset of the kit's GLTF models, unmodified).
- Licence text as shipped with the kit: [`public/office/models/LICENSE.txt`](public/office/models/LICENSE.txt)
