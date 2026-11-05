# Web starter

React/Vite shell with routing/query providers and feature folders. Phaser, Socket.IO client and LiveKit client are installed for upcoming adapters; they are not eagerly loaded by this shell. No auth token is stored in browser storage.

`pnpm dev:web` starts Vite only. `/api` and `/socket.io` proxy to the loopback API for same-origin local development. These proxy routes are not authentication or production ingress. Private service secrets must never use the `VITE_` prefix.
