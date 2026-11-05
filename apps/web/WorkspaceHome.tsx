import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  Check,
  Copy,
  LayoutGrid,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { locale, t } from './i18n';
import { loadConfig, storedKey } from './config';
import {
  createWorkspace,
  deleteWorkspace,
  fetchWorkspace,
  forgetWorkspace,
  knownWorkspaces,
  listWorkspaces,
  rememberWorkspace,
  renameWorkspace,
  visitedLabel,
  type ServerWorkspace,
  workspaceUrl,
  type KnownWorkspace,
  type Template,
  type OfficeMap,
} from './workspaces';

const THUMBNAIL: Record<Template, string> = {
  office: '/thumbnails/office.jpg',
  empty: '/thumbnails/empty.jpg',
};
const MAP_OPTIONS: { id: OfficeMap; name: string; detail: string }[] = [
  {
    id: 'studio',
    name: 'Estudio',
    detail:
      'Para equipos pequeños, en una calle de ciudad: 6 escritorios, una sala de reuniones, jardín, plaza con fuente, tráfico y un parque enfrente.',
  },
  {
    id: 'vivo',
    name: 'Oficina',
    detail:
      'La oficina principal con su decoración: 10 escritorios, 5 salas de reunión y 4 oficinas de concentración.',
  },
  {
    id: 'campus',
    name: 'Campus',
    detail:
      'Para equipos grandes: dos edificios unidos por un paseo y una plaza, con 20 escritorios, 10 salas de reunión, 8 oficinas de concentración y una playa larga.',
  },
];

/** Start page, laid out like the reference dashboard: recent and created workspaces as map cards, and a create dialog. */
export default function WorkspaceHome() {
  const [list, setList] = useState(knownWorkspaces);
  const [tab, setTab] = useState<'recent' | 'created' | 'all'>('recent');
  const [server, setServer] = useState<ServerWorkspace[]>([]);
  const [confirmDelete, setConfirmDelete] = useState<{
    slug: string;
    name: string;
    error?: string;
  } | null>(null);
  const refreshServer = () =>
    void listWorkspaces(storedKey('key', 'mi-oficina')).then((found) => {
      if (found) setServer(found);
    });
  useEffect(refreshServer, []);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(() => new URLSearchParams(location.search).has('new'));
  const [menu, setMenu] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ slug: string; name: string; error?: string } | null>(
    null,
  );
  async function saveName() {
    if (!renaming || renaming.name.trim().length < 2) return;
    const result = await renameWorkspace(
      renaming.slug,
      renaming.name.trim(),
      storedKey('key', renaming.slug),
      storedKey('admin', renaming.slug),
    );
    if ('error' in result) {
      setRenaming({
        ...renaming,
        error:
          result.error === 'forbidden'
            ? t('Solo los administradores pueden cambiar el nombre.')
            : t('No se pudo cambiar el nombre.'),
      });
      return;
    }
    const item = list.find((entry) => entry.slug === renaming.slug);
    if (item) rememberWorkspaceQuietly(item, result.name, item.template ?? 'office');
    setList(knownWorkspaces());
    setRenaming(null);
  }

  useEffect(() => {
    document.title = t('Tus espacios de trabajo · Open Office');
  }, []);
  // Learn the template (map thumbnail) and current name of spaces we only visited.
  useEffect(() => {
    for (const item of list.filter((entry) => !entry.template || !entry.map))
      void fetchWorkspace(item.slug).then((found) => {
        if (!found) return;
        rememberWorkspaceQuietly(item, found.name, found.template, found.map);
        setList(knownWorkspaces());
      });
  }, []);
  useEffect(() => {
    const close = () => setMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  const shown = useMemo(
    () =>
      (tab === 'all'
        ? server.map((entry) => ({
            ...(list.find((item) => item.slug === entry.slug) ?? {
              visitedAt: 0,
              template: 'office' as const,
            }),
            slug: entry.slug,
            name: entry.name,
            map: entry.map,
            createdAt: entry.createdAt ? Date.parse(entry.createdAt) : undefined,
          }))
        : list
      )
        .filter((item) => tab !== 'created' || item.createdAt)
        .filter(
          (item) =>
            !query || `${item.name} ${item.slug}`.toLowerCase().includes(query.toLowerCase()),
        )
        .sort((a, b) =>
          tab === 'all'
            ? a.name.localeCompare(b.name, locale())
            : tab === 'created'
              ? (b.createdAt ?? 0) - (a.createdAt ?? 0)
              : b.visitedAt - a.visitedAt,
        ),
    [list, tab, query, server],
  );

  async function copyLink(slug: string) {
    try {
      await navigator.clipboard.writeText(workspaceUrl(slug));
      setCopied(slug);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <div className="dashboard">
      <header className="dashboard-bar">
        <a className="dashboard-brand" href="/">
          <span className="workspace-logo">
            <LayoutGrid size={18} />
          </span>
          <strong>{t('Open Office')}</strong>
        </a>
        <button type="button" className="dashboard-create" onClick={() => setCreating(true)}>
          <Plus size={17} />
          {t('Crear espacio')}
        </button>
      </header>
      <main className="dashboard-body">
        <div className="dashboard-toolbar">
          <div className="dashboard-tabs" role="tablist">
            <button
              role="tab"
              aria-selected={tab === 'recent'}
              className={tab === 'recent' ? 'active' : ''}
              onClick={() => setTab('recent')}
            >
              {t('Visitados recientemente')}
            </button>
            <button
              role="tab"
              aria-selected={tab === 'created'}
              className={tab === 'created' ? 'active' : ''}
              onClick={() => setTab('created')}
            >
              {t('Creados por ti')}
            </button>
            <button
              role="tab"
              aria-selected={tab === 'all'}
              className={tab === 'all' ? 'active' : ''}
              onClick={() => {
                setTab('all');
                refreshServer();
              }}
            >
              {t('Todos los espacios')}
            </button>
          </div>
          <label className="dashboard-search">
            <Search size={15} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('Buscar')}
              aria-label={t('Buscar espacios')}
            />
          </label>
        </div>
        {shown.length > 0 ? (
          <div className="dashboard-grid">
            {shown.map((item) => (
              <article className="space-card" key={item.slug}>
                <a
                  className="space-thumb"
                  href={workspaceUrl(item.slug)}
                  onClick={() => rememberWorkspace(item.slug, item.name)}
                >
                  <img
                    src={
                      item.map && item.map !== 'vivo'
                        ? `/thumbnails/${item.map}.jpg`
                        : THUMBNAIL[item.template ?? 'office']
                    }
                    alt=""
                    loading="lazy"
                  />
                </a>
                <div className="space-meta">
                  {renaming?.slug === item.slug ? (
                    <form
                      className="space-rename"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void saveName();
                      }}
                    >
                      <input
                        autoFocus
                        value={renaming.name}
                        onChange={(e) =>
                          setRenaming({ ...renaming, name: e.target.value, error: undefined })
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') setRenaming(null);
                        }}
                        maxLength={60}
                        aria-label={t('Nombre del espacio')}
                      />
                      <button type="submit" aria-label={t('Guardar')}>
                        <Check size={15} />
                      </button>
                      {renaming.error && <small role="alert">{renaming.error}</small>}
                    </form>
                  ) : (
                    <a
                      href={workspaceUrl(item.slug)}
                      onClick={() => rememberWorkspace(item.slug, item.name)}
                    >
                      <strong>{item.name}</strong>
                    </a>
                  )}
                  {(() => {
                    const online = server.find((entry) => entry.slug === item.slug)?.online ?? 0;
                    return online > 0 ? (
                      <span className="space-online">
                        <Users size={13} />
                        {online}
                      </span>
                    ) : null;
                  })()}
                  <span>
                    {tab === 'created' && item.createdAt
                      ? visitedLabel(item.createdAt, locale())
                      : visitedLabel(item.visitedAt, locale())}
                  </span>
                  <div className="space-menu-wrap">
                    <button
                      type="button"
                      className="space-menu-button"
                      aria-label={t('Opciones de {name}', { name: item.name })}
                      aria-expanded={menu === item.slug}
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenu(menu === item.slug ? null : item.slug);
                      }}
                    >
                      <MoreVertical size={16} />
                    </button>
                    {menu === item.slug && (
                      <div className="space-menu" role="menu" onClick={(e) => e.stopPropagation()}>
                        <button
                          role="menuitem"
                          onClick={() => {
                            setRenaming({ slug: item.slug, name: item.name });
                            setMenu(null);
                          }}
                        >
                          <Pencil size={14} />
                          {t('Cambiar nombre')}
                        </button>
                        <button role="menuitem" onClick={() => void copyLink(item.slug)}>
                          {copied === item.slug ? <Check size={14} /> : <Copy size={14} />}
                          {copied === item.slug ? t('Enlace copiado') : t('Copiar enlace')}
                        </button>
                        {tab !== 'all' && (
                          <button
                            role="menuitem"
                            onClick={() => {
                              forgetWorkspace(item.slug);
                              setList(knownWorkspaces());
                              setMenu(null);
                            }}
                          >
                            <X size={14} />
                            {t('Quitar de esta lista')}
                          </button>
                        )}
                        {!server.find((entry) => entry.slug === item.slug)?.main && (
                          <button
                            role="menuitem"
                            className="danger"
                            onClick={() => {
                              setConfirmDelete({ slug: item.slug, name: item.name });
                              setMenu(null);
                            }}
                          >
                            <Trash2 size={14} />
                            {t('Eliminar espacio')}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="dashboard-empty">
            <p>
              {tab === 'created'
                ? t('Aún no has creado ningún espacio.')
                : query
                  ? t('No hay espacios con ese nombre.')
                  : t('Todavía no has entrado a ningún espacio.')}
            </p>
            <button type="button" className="dashboard-create" onClick={() => setCreating(true)}>
              <Plus size={17} />
              {t('Crear espacio')}
            </button>
          </div>
        )}
      </main>
      {confirmDelete && (
        <div className="dashboard-backdrop" onClick={() => setConfirmDelete(null)}>
          <div
            className="dashboard-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="delete-title">{t('¿Eliminar «{name}»?', { name: confirmDelete.name })}</h2>
            <p className="dashboard-dialog-lead">
              {t(
                'Se borran su mapa, su chat, su calendario y sus escritorios para todo el equipo. No se puede deshacer.',
              )}
            </p>
            {confirmDelete.error && (
              <p className="form-error" role="alert">
                {confirmDelete.error}
              </p>
            )}
            <div className="dashboard-dialog-actions">
              <button
                type="button"
                className="dashboard-secondary"
                onClick={() => setConfirmDelete(null)}
              >
                {t('Cancelar')}
              </button>
              <button
                type="button"
                className="dashboard-danger"
                onClick={async () => {
                  const result = await deleteWorkspace(
                    confirmDelete.slug,
                    storedKey('key', confirmDelete.slug),
                    storedKey('admin', confirmDelete.slug),
                  );
                  if ('error' in result) {
                    setConfirmDelete({
                      ...confirmDelete,
                      error:
                        result.error === 'occupied'
                          ? t('Hay personas dentro. Espera a que salgan.')
                          : result.error === 'forbidden'
                            ? t('Solo los administradores pueden eliminar espacios.')
                            : t('No se pudo eliminar el espacio.'),
                    });
                    return;
                  }
                  forgetWorkspace(confirmDelete.slug);
                  setList(knownWorkspaces());
                  refreshServer();
                  setConfirmDelete(null);
                }}
              >
                {t('Eliminar')}
              </button>
            </div>
          </div>
        </div>
      )}
      {creating && (
        <CreateDialog
          onClose={() => {
            setCreating(false);
            if (location.search.includes('new')) history.replaceState(null, '', '/');
          }}
        />
      )}
    </div>
  );
}

function rememberWorkspaceQuietly(
  item: KnownWorkspace,
  name: string,
  template: Template,
  map?: string,
) {
  // Keep the visit time: only the name and the map type are refreshed.
  try {
    const all = knownWorkspaces().map((entry) =>
      entry.slug === item.slug ? { ...entry, name, template, ...(map ? { map } : {}) } : entry,
    );
    localStorage.setItem('office-workspaces', JSON.stringify(all));
  } catch {
    /* storage unavailable */
  }
}

function CreateDialog({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');
  const template: Template = 'office'; // furnished; the main office's map also copies its current decoration
  const [map, setMap] = useState<OfficeMap>('vivo');
  const [key, setKey] = useState('');
  const [keyRequired, setKeyRequired] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus();
    void loadConfig().then((config) => setKeyRequired(config.accessRequired));
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || name.trim().length < 2) return;
    setBusy(true);
    setError('');
    const result = await createWorkspace(
      name.trim(),
      template,
      key || storedKey('key', 'mi-oficina'),
      map,
    );
    setBusy(false);
    if ('error' in result) {
      setError(
        result.error === 'access_denied'
          ? t('La clave de invitación no es válida.')
          : result.error === 'too_many_attempts'
            ? t('Demasiados intentos. Espera un momento.')
            : result.error === 'invalid_name'
              ? t('El nombre necesita entre 2 y 60 caracteres.')
              : t('No se pudo crear el espacio. Inténtalo de nuevo.'),
      );
      return;
    }
    rememberWorkspace(result.slug, result.name, { created: true, template, map });
    location.href = workspaceUrl(result.slug) + (key ? `&key=${encodeURIComponent(key)}` : '');
  }

  return (
    <div className="dashboard-backdrop" onClick={onClose}>
      <form
        className="dashboard-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-title"
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="dashboard-dialog-close"
          aria-label={t('Cerrar ventana')}
          onClick={onClose}
        >
          <X size={18} />
        </button>
        <h2 id="create-title">{t('Crear un espacio de trabajo')}</h2>
        <p className="dashboard-dialog-lead">
          {t('Cada espacio tiene su propio mapa, sus personas, su chat y su calendario.')}
        </p>
        <span className="dashboard-label">{t('Elige el tamaño de la oficina')}</span>
        <div className="template-grid map-grid">
          {MAP_OPTIONS.map((option) => (
            <button
              type="button"
              key={option.id}
              className={`template-card${map === option.id ? ' selected' : ''}`}
              aria-pressed={map === option.id}
              onClick={() => setMap(option.id)}
            >
              <img src={`/thumbnails/${option.id}.jpg`} alt="" />
              <strong>{t(option.name)}</strong>
              <small>{t(option.detail)}</small>
              {map === option.id && (
                <span className="template-check">
                  <Check size={14} />
                </span>
              )}
            </button>
          ))}
        </div>
        <label className="dashboard-label">
          {t('Nombre del espacio')}
          <input
            ref={input}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('p. ej. Equipo de diseño')}
            minLength={2}
            maxLength={60}
            required
          />
        </label>
        {keyRequired && (
          <label className="dashboard-label">
            {t('Clave de invitación')}
            <input
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              autoComplete="off"
              maxLength={200}
            />
          </label>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="dashboard-dialog-actions">
          <button type="button" className="dashboard-secondary" onClick={onClose}>
            {t('Cancelar')}
          </button>
          <button
            className="dashboard-create"
            type="submit"
            disabled={busy || name.trim().length < 2}
          >
            {busy ? t('Creando…') : t('Crear espacio')}
          </button>
        </div>
      </form>
    </div>
  );
}
