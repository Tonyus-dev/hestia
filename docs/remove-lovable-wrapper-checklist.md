# Checklist de remoção do Lovable

- `vite.config.ts` não importa `@lovable.dev/*`.
- `package.json` não declara `@lovable.dev/vite-tanstack-config`.
- `bun.lock` herdado do ambiente Lovable foi removido.
- Backend, organizer, systemd e UI não foram alterados.
