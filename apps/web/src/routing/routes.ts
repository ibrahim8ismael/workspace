export type AuthView = 'login' | 'register' | 'verify' | 'resend' | 'forgot' | 'reset';
export type OfficePage = 'entry' | 'office' | 'chat' | 'calendar' | 'activity' | 'invitations';
export const authPaths: Record<AuthView, string> = {
  login: '/login',
  register: '/register',
  verify: '/verify-email',
  resend: '/resend-verification',
  forgot: '/forgot-password',
  reset: '/reset-password',
};
export type AppRoute =
  | { kind: 'home' | 'companies' | 'security' | 'invitation' | 'not-found' }
  | { kind: 'auth'; view: AuthView }
  | { kind: 'company'; workspaceId: string }
  | { kind: 'office-alias'; workspaceId: string }
  | { kind: 'office'; workspaceId: string; officeId: string; page: OfficePage }
  | { kind: 'redirect'; to: string };
const id =
  '[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[1-8][a-fA-F0-9]{3}-[89abAB][a-fA-F0-9]{3}-[a-fA-F0-9]{12}';
export const companyPath = (workspaceId: string) => `/companies/${workspaceId}`;
export const officeAliasPath = (workspaceId: string) => `${companyPath(workspaceId)}/office`;
export const officePath = (workspaceId: string, officeId: string, page: OfficePage = 'office') =>
  `${companyPath(workspaceId)}/offices/${officeId}${page === 'office' ? '' : `/${page}`}`;
export function parseRoute(path: string): AppRoute {
  if (path === '/') return { kind: 'home' };
  if (path.endsWith('/')) return { kind: 'redirect', to: path.replace(/\/+$/, '') || '/' };
  for (const [view, url] of Object.entries(authPaths))
    if (path === url) return { kind: 'auth', view: view as AuthView };
  const aliases: Record<string, string> = {
    '/auth/login': '/login',
    '/auth/register': '/register',
    '/auth/verify-email': '/verify-email',
    '/auth/reset-password': '/reset-password',
    '/verify': '/verify-email',
    '/reset': '/reset-password',
    '/forgot': '/forgot-password',
  };
  if (aliases[path]) return { kind: 'redirect', to: aliases[path] };
  if (path === '/companies') return { kind: 'companies' };
  if (path === '/account/security') return { kind: 'security' };
  if (path === '/invitations/accept') return { kind: 'invitation' };
  const company = path.match(new RegExp(`^/companies/(${id})(/office)?$`));
  if (company) return { kind: company[2] ? 'office-alias' : 'company', workspaceId: company[1]! };
  const office = path.match(
    new RegExp(
      `^/companies/(${id})/offices/(${id})(?:/(entry|chat|calendar|activity|invitations))?$`,
    ),
  );
  if (office)
    return {
      kind: 'office',
      workspaceId: office[1]!,
      officeId: office[2]!,
      page: (office[3] ?? 'office') as OfficePage,
    };
  return { kind: 'not-found' };
}
export function isProtected(route: AppRoute) {
  return ['companies', 'company', 'office-alias', 'office', 'security', 'invitation'].includes(
    route.kind,
  );
}
/** Only known internal destinations may survive a login. Never redirect to another origin. */
export function safeReturnTo(value: string | null): string {
  if (
    !value ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('\\') ||
    [...value].some((char) => char.charCodeAt(0) < 32)
  )
    return '/companies';
  const url = new URL(value, 'https://app.invalid');
  return url.origin === 'https://app.invalid' && isProtected(parseRoute(url.pathname))
    ? url.pathname + url.search
    : '/companies';
}
