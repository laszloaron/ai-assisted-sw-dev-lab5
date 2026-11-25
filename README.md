# STILLFRAME

A first-person action game in WebGPU where **time moves only when you move**.

**Play it:** https://laszloaron.github.io/ai-assisted-sw-dev-lab5/
(needs a browser with WebGPU: recent Chrome or Edge, Safari 26+, or Firefox
with WebGPU enabled)

**Controls:** WASD to move, the mouse to look, left click to fire, punch or
throw, right click to throw, E to pick up, Space to jump, R to restart, Esc to
pause.

## Development

```sh
npm install
npm run dev          # dev server on http://localhost:5173
npm run build        # type check + production build into dist/
npm run repro        # headless bug reproductions (see BUGS.md)
```

In VS Code, press **F5** to start the dev server or the production build
with the debugger attached.

Every push to `main` is built and published to GitHub Pages by
[.github/workflows/deploy.yml](.github/workflows/deploy.yml).

## Documents

- [PART1.md](PART1.md): how the game and the original code work
- [PART2.md](PART2.md): the module structure and how the refactor was
  verified
- [BUGS.md](BUGS.md): every bug fixed, with steps, root cause, fix and
  verification
