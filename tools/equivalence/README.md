# Equivalence check

`npm run check:equivalence` proves that the current production build behaves
exactly like the original single-file game (git tag `baseline`).

It runs both versions headless in Node, inside a fake browser (`env.mjs`)
that records everything the game does through browser APIs:

- every WebGPU call, including the contents of every buffer upload and the
  full shader source,
- every WebAudio call (including the synthesized sound buffers),
- console warnings and errors,
- the whole DOM (menus, HUD, overlay) and the save data in `localStorage`.

Time (`requestAnimationFrame`, `performance.now`) and `Math.random` are
driven by the harness, so a run is bit-for-bit deterministic. Both versions
play the same scripted sessions (`scenarios.mjs`): the menus on a fresh save,
then every unlocked level with movement, mouse look, shooting, throwing,
picking up, jumping, restart, pause/resume, the debug keys and the overlay.
A hash of everything recorded is compared frame by frame; on a mismatch the
first differing call is printed.

The stylesheet and `<head>` are compared as text, because jsdom does not
render CSS.

Useful commands:

```sh
npm run check:equivalence                     # build, then compare
node tools/equivalence/check.mjs --no-build   # compare the existing dist/
# what a run exercises (call counts over the whole session):
node tools/equivalence/run.mjs tools/equivalence/.cache/baseline.html tools/equivalence/.cache/baseline.mjs levels --stats
# everything recorded in one frame:
node tools/equivalence/run.mjs tools/equivalence/.cache/baseline.html tools/equivalence/.cache/baseline.mjs levels 1300
```

## Limits

- No real GPU: it proves the same commands and data reach WebGPU, not the
  pixels the driver produces from them (same input → same pixels).
- Not covered by the scripted input: clearing a level (results screen and
  replay), the settings sliders, gamepads, window resizing, losing the GPU.
- Level 1-1 cannot be started from the menus at all (see BUGS.md), so it is
  only seen as the title-screen backdrop.
- The CDN copy of `wgpu-matrix` is downloaded once into `.cache/` because Node
  cannot import from `https:`.
