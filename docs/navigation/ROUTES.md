# Application routes

The browser URL owns page selection. `AuthApp` mounts the existing `react-router`
BrowserRouter; route parsing, ID validation, canonical path builders and safe login
return destinations live in `apps/web/src/routing/routes.ts`.

| Page | Canonical path |
| --- | --- |
| Home | `/` redirects to `/login` or `/companies` after session resolution |
| Sign in | `/login` |
| Register | `/register` |
| Verify email | `/verify-email?token=…` (`code` also accepted) |
| Resend verification | `/resend-verification` |
| Request password reset | `/forgot-password` |
| Reset password | `/reset-password?token=…` (`code` also accepted) |
| Company list | `/companies` |
| Company overview | `/companies/:workspaceId` |
| Account security | `/account/security` |
| Accept invitation | `/invitations/accept?token=…` |
| Office entry | `/companies/:workspaceId/offices/:officeId/entry` |
| Office map | `/companies/:workspaceId/offices/:officeId` |
| Office chat | `/companies/:workspaceId/offices/:officeId/chat` |
| Office calendar | `/companies/:workspaceId/offices/:officeId/calendar` |
| Office activity | `/companies/:workspaceId/offices/:officeId/activity` |
| Office invitations (owners only) | `/companies/:workspaceId/offices/:officeId/invitations` |

The company-list Open office link uses `/companies/:workspaceId/office` because the
list response does not include an office ID. The server-authorized company detail
resolves it and replaces the alias with the canonical office entry URL.

Trailing slashes and `/auth/login`, `/auth/register`, `/auth/verify-email`,
`/auth/reset-password`, `/verify`, `/reset`, and `/forgot` redirect to canonical
routes while preserving query parameters. Root links continue working. Previous
email deliveries contained one-time codes and backend submission endpoint names,
not frontend deep links; those APIs and codes are unchanged. Tokens in frontend
links prefill forms and never submit automatically.

Company, security, invitation and office URLs require a server-verified account.
Signed-out users are sent to `/login?returnTo=…`; successful sign-in replaces that
entry with the intended known internal page. External URLs, unknown routes and
authentication loops are rejected as return destinations. Company metadata is
loaded from the API for every mounted company context, and requested office IDs
must match its authorized office. Invalid IDs never trigger a resource fetch.
Denied/missing resources show a generic unavailable state without redirecting to
another company's data. Owner-only office invitation pages also enforce the role
before rendering; API authorization remains authoritative.

Refreshing an office map or section reconnects the office socket, with microphone
off until explicitly enabled. Route changes between its sections reuse the client;
Back to entry closes it and releases media. Navigating away unmounts and cleans up
the office. A page refresh cannot preserve an active media stream or unsaved draft.

Create-company dialogs, manually opened join-by-code dialogs, confirmation dialogs,
and media permission/error states remain local. Calendar/activity have URLs but
remain unavailable features; routing does not invent data sources for them.

Destination controls are anchors with normal modifier-key/new-tab behavior.
Action controls (Join, mute, submit, retry, leave office) remain buttons. Route changes
update the document title and focus the destination heading. Async auth responses
are guarded so Back cannot let an old request navigate to a different form.

Vite's SPA fallback serves development URLs. Both local and deployed Caddy profiles
already serve `index.html` for unknown file paths after their API, socket and media
handlers. HTML receives no-store headers for nested URLs as well as `/`; asset
handling remains separate. Unknown frontend paths render an application 404 page.

## Verification — 2026-11-16

- `pnpm check`: passed, including 57 web tests, 96 API tests (1 skipped), and all builds.
- `pnpm test:e2e --workers=1`: 7 passed; 10 opt-in live-stack tests skipped.
- Five route browser cases cover public forms and token aliases, protected login
  return, refresh/history, invitations, unknown/invalid resources, role checks,
  mismatched API responses, and Back during an in-flight auth request.
- The office browser fixture covers entry/map URLs, Back, direct map refresh,
  chat refresh, navigation without socket churn, and capture cleanup.
- Three final live OrbStack cases passed: entry microphone/Join choices, talking
  animation on two clients, and native sign-in return/nested hosting/cache/authorization.
  Browser fake capture/WAV sources are used for media, with real API, guard and SFU.
- Both web configurations preserve API/socket/media handlers ahead of the SPA.
  The deployed Caddy configuration passed `caddy validate`; the local configuration
  served the integration tests. Nested HTML was no-store and hashed assets immutable.

Local verification layered compiled frontend output and the Caddy config onto the
existing local runtime image. It was not a clean Dockerfile build or a production deployment.
