import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, MouseEvent } from 'react';
import {
  WORKSPACE_LAYOUT_PRESETS,
  WORKSPACE_LAYOUT_TEMPLATES,
  TILE_SIZE_PX,
  addWorkspaceLayoutPlacement,
  generateWorkspaceLayoutPreset,
  getWorkspaceLayoutTemplate,
  getWorkspaceLayoutProfile,
  usesSquareStudioOffices,
  moveWorkspaceLayoutPlacement,
  resizeWorkspaceLayoutPrivateOffices,
  validWorkspaceLayoutOrigins,
  validateWorkspaceLayout,
  workspaceLayoutPlacementLabel,
} from '@gather/world';
import type { TilePoint, WorkspaceLayoutPresetId } from '@gather/world';
import { WorkspaceMapLayer } from '../../../commons-preview/WorkspaceMapLayer';
import { ApiClient, ApiError, type OfficeWorkspaceDetail } from '../../lib/api';
import { SubmissionKey } from '../../lib/idempotency';
import { messageForApi } from '../auth/messages';
import { AppLink } from '../../routing/AppLink';
import { officeAliasPath } from '../../routing/routes';
import './workspace-map-editor.css';

type Snapshot = Awaited<ReturnType<ApiClient['workspaceLayout']>>;
type Placement = Snapshot['placements'][number];
type EditableTemplate = Exclude<Placement['templateId'], 'reception' | 'team-studio'>;
const compactTemplates = ['small', 'large', 'desks'] as const;
const presetTemplates = [...compactTemplates, 'private-office', 'lounge', 'garden'] as const;
const tileSize = TILE_SIZE_PX;
const keyFor = ({ tx, ty }: TilePoint) => `${tx},${ty}`;
const coordinates = ({ tx, ty }: TilePoint) => ({ x: tx * tileSize, y: ty * tileSize });

type Props = {
  api: ApiClient;
  workspace: OfficeWorkspaceDetail;
  onPublished: () => void;
};

export function WorkspaceMapEditor({ api, workspace, onPublished }: Props) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [placements, setPlacements] = useState<readonly Placement[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [preset, setPreset] = useState<WorkspaceLayoutPresetId>();
  const [presetChoice, setPresetChoice] = useState<WorkspaceLayoutPresetId>('repo-campus-hall');
  const [countInput, setCountInput] = useState('');
  const [moduleName, setModuleName] = useState<string>();
  const [confirmReplacement, setConfirmReplacement] = useState(false);
  const [replacement, setReplacement] = useState<{
    placements: readonly Placement[];
    preset: WorkspaceLayoutPresetId;
    message: string;
  } | null>(null);
  const [cursor, setCursor] = useState<TilePoint | null>(null);
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const map = useRef<SVGSVGElement>(null);
  const scrollMap = useRef<HTMLDivElement>(null);
  const dragMap = useRef<{ x: number; y: number; active: boolean }>(null);
  const [mapZoom, setMapZoom] = useState(1);
  const saveKey = useRef(new SubmissionKey());
  const publishKey = useRef(new SubmissionKey());
  const { id, officeId } = workspace;
  const selected = placements.find((placement) => placement.id === selectedId);
  const visiblePreset = replacement?.preset ?? preset;
  const { size } = getWorkspaceLayoutProfile(visiblePreset, replacement?.placements ?? placements);
  const width = size.width * tileSize;
  const height = size.height * tileSize;
  const officeCount = placements.filter(({ templateId }) => templateId === 'private-office').length;
  const editableTemplates =
    preset === 'studio-expandable' || preset === 'repo-campus' || preset === 'repo-campus-hall'
      ? (['private-office'] as const)
      : preset
        ? presetTemplates
        : compactTemplates;
  const selectedFixed = usesSquareStudioOffices(preset) && selected?.id === 'large';
  const moving =
    cursor &&
    selected &&
    selected.templateId !== 'reception' &&
    selected.templateId !== 'team-studio' &&
    !selectedFixed;
  const anchors = moving
    ? validWorkspaceLayoutOrigins(
        placements,
        selected.templateId as EditableTemplate,
        selected.id,
        preset,
      )
    : [];
  const mapVisible = snapshot !== null;
  useEffect(() => {
    const viewport = scrollMap.current;
    if (!viewport) return;
    const onWheel = (event: WheelEvent) => {
      if (event.shiftKey || event.deltaX) return;
      event.preventDefault();
      setMapZoom((current) => Math.min(3, Math.max(1, current * Math.exp(-event.deltaY * 0.0015))));
    };
    viewport.addEventListener('wheel', onWheel, { passive: false });
    return () => viewport.removeEventListener('wheel', onWheel);
  }, [mapVisible]);
  const dirty =
    snapshot !== null && (placements !== snapshot.placements || preset !== snapshot.preset);

  useEffect(() => {
    const controller = new AbortController();
    void api
      .workspaceLayout(id, officeId, controller.signal)
      .then((next) => {
        if (controller.signal.aborted) return;
        setSnapshot(next);
        setPlacements(next.placements);
        setPreset(next.preset);
        setPresetChoice('repo-campus-hall');
        setCountInput('');
        setModuleName(undefined);
        setReplacement(null);
        setConfirmReplacement(false);
        setSelectedId(
          next.placements.find(
            (placement) =>
              placement.templateId !== 'reception' && placement.templateId !== 'team-studio',
          )?.id ?? '',
        );
        setError('');
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted) setError(messageForApi(caught));
      });
    return () => controller.abort();
  }, [api, id, officeId, reload]);

  function apply(candidate: readonly Placement[], selected: Placement, action: string) {
    const invalid = validateWorkspaceLayout(candidate, preset);
    setError(invalid ?? '');
    if (invalid) return;
    setPlacements(candidate);
    setSelectedId(selected.id);
    setModuleName(undefined);
    setCursor(null);
    setStatus(`${workspaceLayoutPlacementLabel(selected)} ${action}.`);
  }

  function add(templateId: EditableTemplate) {
    if (
      (preset === 'studio-expandable' ||
        preset === 'repo-campus' ||
        preset === 'repo-campus-hall') &&
      templateId === 'private-office'
    ) {
      changeCount(officeCount + 1);
      return;
    }
    const [origin] = validWorkspaceLayoutOrigins(placements, templateId, undefined, preset);
    if (!origin) {
      setError('There is no open space for that module along the corridor.');
      return;
    }
    const candidate = addWorkspaceLayoutPlacement(placements, templateId, origin);
    apply(candidate, candidate[candidate.length - 1]!, 'added');
  }

  function place(origin: TilePoint) {
    if (!moving) return;
    if (!anchors.some((anchor) => keyFor(anchor) === keyFor(origin))) {
      setError('Choose a green tile so the doorway connects and modules do not overlap.');
      setCursor(origin);
      return;
    }
    if (keyFor(origin) === keyFor(selected.origin)) {
      setCursor(null);
      setError('');
      setStatus('The module stayed in its current position.');
      return;
    }
    apply(moveWorkspaceLayoutPlacement(placements, selected.id, origin, preset), selected, 'moved');
  }

  function tileAt(event: MouseEvent<SVGSVGElement>) {
    const transform = event.currentTarget.getScreenCTM();
    if (!transform) return null;
    const { x, y } = new DOMPoint(event.clientX, event.clientY).matrixTransform(
      transform.inverse(),
    );
    if (x < 0 || y < 0 || x >= width || y >= height) return null;
    return { tx: Math.floor(x / tileSize), ty: Math.floor(y / tileSize) };
  }

  function clickMap(event: MouseEvent<SVGSVGElement>) {
    if (busy || replacement) return;
    if (moving) {
      const origin = tileAt(event);
      if (origin) place(origin);
      return;
    }
    const target = (event.target as Element)
      .closest('[data-placement-id]')
      ?.getAttribute('data-placement-id');
    const clicked = placements.find((placement) => placement.id === target);
    if (!clicked || clicked.templateId === 'reception' || clicked.templateId === 'team-studio')
      return;
    setSelectedId(clicked.id);
    setModuleName(undefined);
    setError('');
  }

  function pressMap(event: KeyboardEvent<SVGSVGElement>) {
    if (!cursor || busy || replacement) return;
    if (event.key === 'Escape') {
      setCursor(null);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      place(cursor);
      return;
    }
    const steps: Record<string, TilePoint> = {
      ArrowLeft: { tx: -1, ty: 0 },
      ArrowRight: { tx: 1, ty: 0 },
      ArrowUp: { tx: 0, ty: -1 },
      ArrowDown: { tx: 0, ty: 1 },
    };
    const step = steps[event.key];
    if (!step) return;
    event.preventDefault();
    setCursor({
      tx: Math.max(0, Math.min(width / tileSize - 1, cursor.tx + step.tx)),
      ty: Math.max(0, Math.min(height / tileSize - 1, cursor.ty + step.ty)),
    });
  }

  function changeCount(count = Number(countInput || officeCount)) {
    if (!preset) return;
    if (count === officeCount) return;
    const candidate = resizeWorkspaceLayoutPrivateOffices(placements, count, preset);
    if (!candidate) {
      setError(
        `Choose a count from 1 to ${WORKSPACE_LAYOUT_PRESETS[preset].maxPrivateOffices} that fits the available space.`,
      );
      return;
    }
    if (count < officeCount) {
      const removed = placements.filter((room) => !candidate.some(({ id }) => id === room.id));
      setReplacement({
        placements: candidate,
        preset,
        message: `Remove ${removed.map(workspaceLayoutPlacementLabel).join(', ')} from this draft? The live layout will update only after you publish.`,
      });
      return;
    }
    setPlacements(candidate);
    setCountInput('');
    setError('');
    setStatus(`Draft now has ${count} private offices.`);
  }

  function preparePreset() {
    const choice = WORKSPACE_LAYOUT_PRESETS[presetChoice];
    setReplacement({
      placements: generateWorkspaceLayoutPreset(presetChoice),
      preset: presetChoice,
      message: `Replace this draft with the ${choice.label} floor plan? Existing room names and placements in the draft will be replaced. The live map changes when you publish.`,
    });
  }

  function replaceDraft() {
    if (!replacement) return;
    setPreset(replacement.preset);
    setPlacements(replacement.placements);
    setSelectedId(
      replacement.placements.find(
        ({ templateId }) => templateId !== 'reception' && templateId !== 'team-studio',
      )?.id ?? '',
    );
    setModuleName(undefined);
    setCountInput('');
    setCursor(null);
    setConfirmReplacement(true);
    setReplacement(null);
    setError('');
    setStatus('Draft updated. Save it when you are ready.');
  }

  function renameModule() {
    if (!selected) return;
    const name = moduleName?.trim();
    const { name: oldName, ...placement } = selected;
    if (name === oldName || (!name && !oldName)) return;
    const updated = { ...placement, ...(name && { name }) };
    apply(
      placements.map((room) => (room.id === selected.id ? updated : room)),
      updated,
      'renamed',
    );
  }

  async function submit(publish: boolean) {
    if (!snapshot || busy) return;
    const payload = { expectedRevision: snapshot.revision };
    const draft = {
      ...payload,
      placements,
      ...(preset && { preset }),
      ...(confirmReplacement && { confirmReplacement: true }),
    };
    const submission = publish ? publishKey.current : saveKey.current;
    const key = submission.forPayload(publish ? payload : draft);
    setBusy(true);
    setStatus('');
    setError('');
    try {
      const next = publish
        ? await api.publishWorkspaceLayout(id, officeId, payload, key)
        : await api.saveWorkspaceLayout(id, officeId, draft, key);
      submission.clear();
      setSnapshot(next);
      setPlacements(next.placements);
      setPreset(next.preset);
      setConfirmReplacement(false);
      setCursor(null);
      setStatus(publish ? 'Map published. Open the office to explore it.' : 'Draft saved.');
      if (publish) onPublished();
    } catch (caught) {
      if (!(caught instanceof ApiError && caught.outcomeUnknown)) submission.clear();
      setError(
        caught instanceof ApiError && caught.code === 'office_in_use'
          ? 'Everyone must leave the office before you publish. Your draft is still saved.'
          : caught instanceof ApiError && caught.code === 'revision_conflict'
            ? 'The draft changed in another session. Reload the saved draft to continue.'
            : caught instanceof ApiError && caught.code === 'office_layout_confirmation_required'
              ? 'Confirm the layout replacement before saving.'
              : messageForApi(caught),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="workspace-map-editor" aria-label="Office map editor">
      <div className="workspace-map-header">
        <h2>Office map editor</h2>
        <AppLink className="dashboard-secondary" to={officeAliasPath(id)}>
          Open office
        </AppLink>
      </div>
      {!snapshot ? (
        error ? (
          <>
            <p role="alert">{error}</p>
            <button
              type="button"
              className="dashboard-secondary"
              onClick={() => {
                setError('');
                setReload((value) => value + 1);
              }}
            >
              Retry
            </button>
          </>
        ) : (
          <p role="status">Loading map draft…</p>
        )
      ) : (
        <>
          <div className="workspace-map-config">
            <label className="dashboard-label">
              Replace with preset
              <select
                value={presetChoice}
                disabled={busy}
                onChange={(event) => setPresetChoice(event.target.value as WorkspaceLayoutPresetId)}
              >
                <option value="repo-campus-hall">Office Campus · open hall</option>
                <option value="repo-campus">Office Campus · original layout</option>
                <option value="studio-expandable">Studio · expandable floor plan</option>
                <option value="studio-orthogonal">Studio · fixed floor plan</option>
                <option value="studio">Classic Studio · central team office</option>
                <option value="startup">Startup · two wings</option>
                <option value="corporate">Corporate · three wings</option>
              </select>
            </label>
            <button
              type="button"
              className="dashboard-secondary"
              disabled={busy}
              onClick={preparePreset}
            >
              Preview replacement
            </button>
            {preset && (
              <>
                <label className="dashboard-label">
                  Private offices
                  <input
                    type="number"
                    min={1}
                    max={WORKSPACE_LAYOUT_PRESETS[preset].maxPrivateOffices}
                    value={countInput || String(officeCount)}
                    disabled={busy}
                    onChange={(event) => setCountInput(event.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className="dashboard-secondary"
                  disabled={busy || !countInput || Number(countInput) === officeCount}
                  onClick={() => changeCount()}
                >
                  Apply count
                </button>
              </>
            )}
          </div>
          {replacement && (
            <div
              className="workspace-map-confirmation"
              role="group"
              aria-label="Confirm layout replacement"
            >
              <p>{replacement.message}</p>
              <button type="button" className="dashboard-create" onClick={replaceDraft}>
                Confirm replacement
              </button>
              <button
                type="button"
                className="dashboard-secondary"
                onClick={() => setReplacement(null)}
              >
                Cancel replacement
              </button>
            </div>
          )}
          <div className="workspace-map-body">
            <div
              ref={scrollMap}
              className="workspace-map-viewport"
              onPointerDown={(event) => {
                dragMap.current =
                  mapZoom > 1 ? { x: event.clientX, y: event.clientY, active: false } : null;
              }}
              onPointerMove={(event) => {
                const drag = dragMap.current;
                if (!drag || !event.buttons) return;
                const dx = drag.x - event.clientX;
                const dy = drag.y - event.clientY;
                if (!drag.active && Math.hypot(dx, dy) < 5) return;
                drag.active = true;
                event.currentTarget.scrollBy(dx, dy);
                drag.x = event.clientX;
                drag.y = event.clientY;
              }}
              onClickCapture={(event) => {
                if (dragMap.current?.active) event.stopPropagation();
                dragMap.current = null;
              }}
            >
              <svg
                ref={map}
                className="workspace-map-canvas"
                style={{ width: `${mapZoom * 100}%` }}
                data-map-zoom={mapZoom.toFixed(2)}
                viewBox={`0 0 ${width} ${height}`}
                aria-label={
                  replacement ? 'Proposed office floor plan' : 'Editable office floor plan'
                }
                role="group"
                tabIndex={0}
                onClick={clickMap}
                onKeyDown={pressMap}
                onPointerMove={(event) => {
                  const tile = moving && tileAt(event);
                  if (tile) setCursor(tile);
                }}
              >
                <WorkspaceMapLayer
                  placements={replacement?.placements ?? placements}
                  preset={visiblePreset}
                  selectedId={replacement ? undefined : selected?.id}
                />
                {!replacement && moving && cursor && selected && (
                  <g pointerEvents="none">
                    {anchors.map((anchor) => (
                      <rect
                        key={keyFor(anchor)}
                        className="workspace-map-anchor"
                        x={anchor.tx * tileSize + 4}
                        y={anchor.ty * tileSize + 4}
                        rx="3"
                        width={tileSize - 8}
                        height={tileSize - 8}
                      />
                    ))}
                    <rect
                      className={
                        anchors.some((anchor) => keyFor(anchor) === keyFor(cursor))
                          ? 'workspace-map-selection'
                          : 'workspace-map-invalid'
                      }
                      {...coordinates(cursor)}
                      width={
                        getWorkspaceLayoutTemplate(selected.templateId, preset).width * tileSize
                      }
                      height={
                        getWorkspaceLayoutTemplate(selected.templateId, preset).height * tileSize
                      }
                    />
                  </g>
                )}
              </svg>
            </div>
            <div className="workspace-map-tools">
              <h3>Add a module</h3>
              {editableTemplates.map((type) => (
                <button
                  key={type}
                  type="button"
                  className="dashboard-secondary"
                  onClick={() => add(type)}
                  disabled={busy}
                >
                  Add {WORKSPACE_LAYOUT_TEMPLATES[type].label.toLowerCase()}
                </button>
              ))}
              <label className="dashboard-label">
                Module to move
                <select
                  value={selectedId}
                  onChange={(event) => {
                    setSelectedId(event.target.value);
                    setModuleName(undefined);
                    setCursor(null);
                    setError('');
                  }}
                  disabled={busy}
                >
                  {placements
                    .filter(
                      (placement) =>
                        placement.templateId !== 'reception' &&
                        placement.templateId !== 'team-studio',
                    )
                    .map((placement) => (
                      <option value={placement.id} key={placement.id}>
                        {workspaceLayoutPlacementLabel(placement)}
                      </option>
                    ))}
                </select>
              </label>
              {selected && (
                <>
                  <label className="dashboard-label">
                    Module name
                    <input
                      value={moduleName ?? selected.name ?? ''}
                      placeholder={WORKSPACE_LAYOUT_TEMPLATES[selected.templateId].label}
                      maxLength={60}
                      disabled={busy}
                      onChange={(event) => setModuleName(event.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    className="dashboard-secondary"
                    disabled={busy || moduleName === undefined}
                    onClick={renameModule}
                  >
                    Apply name
                  </button>
                </>
              )}
              <button
                type="button"
                className="dashboard-secondary"
                disabled={!selected || busy || selectedFixed}
                onClick={() => {
                  if (moving) setCursor(null);
                  else if (selected) {
                    setCursor(selected.origin);
                    setStatus('Choose a green tile or use the arrow keys and Enter.');
                    setError('');
                    map.current?.focus();
                  }
                }}
              >
                {moving ? 'Cancel move' : 'Move on map'}
              </button>
            </div>
          </div>
          <p className="space-settings-note">
            Save your draft, then publish it when everyone has left the office. Publishing replaces
            the active floor plan.
          </p>
          <div className="workspace-map-actions">
            <button
              type="button"
              className="dashboard-secondary"
              disabled={!dirty || busy || !!replacement}
              onClick={() => void submit(false)}
            >
              Save draft
            </button>
            <button
              type="button"
              className="dashboard-create"
              disabled={dirty || !snapshot.hasUnpublishedChanges || busy || !!replacement}
              onClick={() => void submit(true)}
            >
              Publish map
            </button>
            {error && (
              <button
                type="button"
                className="dashboard-secondary"
                disabled={busy}
                onClick={() => setReload((value) => value + 1)}
              >
                Reload saved draft
              </button>
            )}
          </div>
          {status && (
            <p className="account-message" role="status">
              {status}
            </p>
          )}
          {error && (
            <p className="account-message is-error" role="alert">
              {error}
            </p>
          )}
        </>
      )}
    </section>
  );
}
