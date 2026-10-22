# Wand Web Panel

Local mobile-friendly web panel for Wand.

## Commands

```bash
pnpm install
pnpm dev
pnpm build && pnpm bridge:demo           # production bridge + fixture trainer on :3223
pnpm build && pnpm bridge:demo --vrchat  # also simulate VRChat on UDP 9000/9001
```

The demo bridge is the real `dist/bridge.cjs` (OSC bot included) seeded with
`fixtures/demo-session.json`. Its OSC profile is kept in the OS temp folder.

Hosted access on the local machine:

- `http://localhost:4173/`

Hosted access on the LAN:

```bash
pnpm run dev:host
```

Then open the machine IP on port `4173`.

Use `?ws=ws://host:port/remote/ws` to override the bridge URL. The fixture bridge is dev-only;
production is bundled to `dist/bridge.cjs`.
