import { lazy, Suspense, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  ArrowLeft,
  Bell,
  CalendarDays,
  ChevronDown,
  LayoutGrid,
  Map,
  MicOff,
  MessageCircle,
  Settings2,
  VideoOff,
} from 'lucide-react';
import type { AccountDto } from '@gather/contracts';
import type { OfficeWorkspaceDetail } from '../../lib/api';
import { ApiClient } from '../../lib/api';
import VivoScene from '../../../VivoScene';
import type { Participant } from '../../../types';
import type { Overrides } from '../../../../shared/office-objects.js';
import { OfficeChatStatus } from './OfficeChatStatus';
import { OfficeClient } from '../office/office-client';
import './office-preview.css';

const CommonsScene = lazy(() =>
  import('../../../commons-preview/CommonsScene').then((module) => ({
    default: module.CommonsScene,
  })),
);
const LiveCommonsScene = lazy(() =>
  import('../../../commons-preview/LiveCommonsScene').then((module) => ({
    default: module.LiveCommonsScene,
  })),
);

type Props = {
  account: AccountDto;
  api: ApiClient;
  detail: OfficeWorkspaceDetail;
  onBack: () => void;
  onOpenSecurity: () => void;
};

export function CompanyOfficePreview({ account, api, detail, onBack, onOpenSecurity }: Props) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const client = useMemo(
    () => new OfficeClient(api, detail.id, detail.officeId),
    [api, detail.id, detail.officeId],
  );
  const state = useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);
  const connected = state.status === 'connected';
  const [officeActionError, setOfficeActionError] = useState('');
  const [officeActionPending, setOfficeActionPending] = useState(false);
  const [zoom, setZoom] = useState(1.35);

  useEffect(() => {
    titleRef.current?.focus();
  }, [connected]);

  useEffect(() => () => client.close(), [client]);

  const mapId = state.bootstrap?.manifest.mapId ?? 'vivo';
  const participantCount = state.snapshot?.participants.length ?? 0;
  const self = state.snapshot?.participants.find(
    (participant) => participant.participationId === state.ready?.participationId,
  );
  const sceneParticipants: Participant[] = (state.snapshot?.participants ?? []).map(
    (participant) => ({
      id: participant.participationId,
      name: participant.displayName,
      color: '#f6c08f',
      x: participant.position.x,
      y: participant.position.y,
      facing: participant.facing,
      ...(participant.seatId ? { seatId: participant.seatId } : {}),
      status: participant.availability,
      mic: false,
      camera: false,
      screen: false,
    }),
  );
  const noOverrides: Overrides = {};

  async function runOfficeAction(action: () => Promise<void>) {
    setOfficeActionError('');
    setOfficeActionPending(true);
    try {
      await action();
    } catch (error) {
      setOfficeActionError(
        error instanceof Error
          ? `Office action failed (${error.message}).`
          : 'Office action failed.',
      );
    } finally {
      setOfficeActionPending(false);
    }
  }

  const connectionMessage =
    state.status === 'connected'
      ? participantCount === 1
        ? '1 person in the office'
        : `${participantCount} people in the office`
      : state.status === 'connecting'
        ? 'Connecting to the office…'
        : state.status === 'ended' || state.status === 'error' || state.status === 'disconnected'
          ? state.message
          : 'Not connected to the office.';

  if (!connected) {
    return (
      <main className="office-prejoin" data-workspace-id={detail.id}>
        <a className="skip-link" href="#join-office-form">
          Skip to office entry
        </a>
        <header className="office-prejoin-header">
          <button
            className="office-prejoin-brand"
            type="button"
            aria-label="Back to companies"
            onClick={onBack}
          >
            <span className="office-prejoin-logo" aria-hidden="true">
              <LayoutGrid size={19} />
            </span>
            <strong>{detail.name}</strong>
          </button>
          <div className="office-prejoin-account" title={account.email}>
            <span aria-hidden="true">{account.displayName.slice(0, 1).toUpperCase()}</span>
            <span>{account.email}</span>
          </div>
        </header>

        <section className="office-prejoin-content" aria-label="Join the office">
          <div className="office-prejoin-camera" aria-label="Camera preview">
            <p>Your camera is off</p>
            <div className="office-prejoin-device-controls" aria-label="Media controls">
              <button
                type="button"
                aria-label="Microphone unavailable in this release"
                title="Microphone unavailable in this release"
                disabled
              >
                <MicOff size={17} />
                <ChevronDown size={12} />
              </button>
              <button
                type="button"
                aria-label="Camera unavailable in this release"
                title="Camera unavailable in this release"
                disabled
              >
                <VideoOff size={17} />
                <ChevronDown size={12} />
              </button>
            </div>
          </div>

          <div className="office-prejoin-form-wrap">
            <h1 id="company-office-preview-title" ref={titleRef} tabIndex={-1}>
              Welcome to {detail.name}
            </h1>
            <form
              id="join-office-form"
              className="office-prejoin-form"
              onSubmit={(event) => {
                event.preventDefault();
                void client.connect();
              }}
            >
              <input
                id="office-display-name"
                type="text"
                value={account.displayName}
                readOnly
                aria-label="Display name"
                aria-readonly="true"
                autoComplete="name"
              />
              {state.message && state.status !== 'connecting' && (
                <p className="office-prejoin-error" role="alert">
                  {state.message}
                </p>
              )}
              {state.status === 'connecting' && (
                <p className="office-prejoin-connecting" role="status" aria-live="polite">
                  Connecting to the office…
                </p>
              )}
              <button className="primary" type="submit" disabled={state.status === 'connecting'}>
                {state.status === 'connecting' ? 'Joining…' : 'Join'}
              </button>
            </form>
          </div>
        </section>
      </main>
    );
  }

  return (
    <div className="app-shell office-shell" data-workspace-id={detail.id}>
      <a className="skip-link" href="#office-map">
        Skip to office map
      </a>
      <nav className="rail" aria-label="Office navigation">
        <div className="brand" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </div>
        <div className="rail-main">
          <button
            className="nav-item current"
            type="button"
            aria-label="Office"
            aria-pressed="true"
            title="Office"
          >
            <Map size={22} />
          </button>
          <button
            className="nav-item"
            type="button"
            aria-label="Text chat is unavailable"
            title="Text chat is unavailable"
            disabled
          >
            <MessageCircle size={22} />
          </button>
          <button
            className="nav-item"
            type="button"
            aria-label="Calendar is unavailable"
            title="Calendar is unavailable"
            disabled
          >
            <CalendarDays size={22} />
          </button>
          <button
            className="nav-item"
            type="button"
            aria-label="Activity is unavailable"
            title="Activity is unavailable"
            disabled
          >
            <Bell size={22} />
          </button>
        </div>
        <div className="rail-bottom">
          <button
            className="icon-button"
            type="button"
            aria-label="Back to companies"
            title="Back to companies"
            onClick={onBack}
          >
            <ArrowLeft size={19} />
          </button>
          <button
            className="icon-button"
            type="button"
            aria-label="Account security"
            title="Account security"
            onClick={onOpenSecurity}
          >
            <Settings2 size={19} />
          </button>
        </div>
      </nav>

      <div className="workspace">
        <aside className="side-panel panel-people office-shell-sidebar" aria-label="Office details">
          <div className="panel-heading">
            <h1 id="company-office-preview-title" ref={titleRef} tabIndex={-1}>
              {detail.name}
            </h1>
          </div>

          <div className="floor-selector">
            <LayoutGrid size={15} />
            <span>{mapId === 'vivo' ? 'Vivo office' : 'Commons office'}</span>
            <span className="office-preview-badge">Office</span>
          </div>

          <p className="office-sidebar-summary">Text chat is unavailable in this release.</p>

          {connected && state.snapshot && self ? (
            <div className="office-world-controls" role="group" aria-label="Office controls">
              <div role="group" aria-labelledby="office-availability-title">
                <h3 id="office-availability-title">Your availability</h3>
                <div className="office-world-control-row">
                  {(['available', 'busy', 'away'] as const).map((availability) => (
                    <button
                      key={availability}
                      className="dashboard-secondary"
                      type="button"
                      aria-pressed={self.availability === availability}
                      disabled={officeActionPending || self.availability === availability}
                      onClick={() =>
                        void runOfficeAction(() => client.setAvailability(availability))
                      }
                    >
                      {availability[0]?.toUpperCase()}
                      {availability.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
              {mapId === 'commons' && (
                <div role="group" aria-labelledby="office-seats-title">
                  <h3 id="office-seats-title">Seats</h3>
                  <div className="office-world-control-row">
                    {self.seatId ? (
                      <button
                        className="dashboard-secondary"
                        type="button"
                        disabled={officeActionPending}
                        onClick={() => void runOfficeAction(() => client.stand())}
                      >
                        Stand up
                      </button>
                    ) : (
                      state.snapshot.seats
                        .filter((seat) => seat.occupantParticipationId === null)
                        .map((seat) => (
                          <button
                            className="dashboard-secondary"
                            type="button"
                            key={seat.seatId}
                            disabled={officeActionPending}
                            onClick={() => void runOfficeAction(() => client.sit(seat.seatId))}
                          >
                            Sit · {seat.seatId}
                          </button>
                        ))
                    )}
                  </div>
                </div>
              )}
              <p className="office-scene-help">
                {mapId === 'vivo'
                  ? 'Use the arrow keys or WASD to move. Click a chair or press E to sit.'
                  : 'Use the arrow keys or WASD to move. Choose an available seat here.'}
              </p>
              {officeActionError && (
                <p className="office-action-error" role="alert">
                  {officeActionError}
                </p>
              )}
            </div>
          ) : (
            <p className="empty-small">Enter the office to update your status or use a seat.</p>
          )}

          <OfficeChatStatus
            connected={connected}
            participants={state.snapshot?.participants ?? []}
          />

          <div className="sidebar-foot">
            <span className={`connection ${connected ? 'connected' : ''}`}>
              <i />
              {connected
                ? 'Connected'
                : state.status === 'connecting'
                  ? 'Connecting…'
                  : 'Not connected'}
            </span>
            <span>{mapId === 'vivo' ? 'Vivo' : 'Commons'}</span>
          </div>
        </aside>

        <main
          id="office-map"
          className="map-area office-shell-map"
          tabIndex={-1}
          aria-label={`OpenOfficeForAll ${mapId === 'vivo' ? 'Vivo' : 'Commons'} office map`}
        >
          <div className="office-map-heading">
            <strong>
              {connected
                ? `Live ${mapId === 'vivo' ? 'Vivo' : 'Commons'} office`
                : `${mapId === 'vivo' ? 'Vivo' : 'Commons'} office`}
            </strong>
            <span className="office-preview-badge">{connected ? 'Live' : 'Read only'}</span>
          </div>
          <div className="office-map-stage">
            {mapId === 'vivo' ? (
              <VivoScene
                participants={sceneParticipants}
                selfId={connected ? (state.ready?.participationId ?? null) : null}
                objects={[]}
                zoom={zoom}
                simplified={false}
                editItem={null}
                selectedObject={null}
                editorOpen={false}
                overrides={noOverrides}
                onMove={() => {}}
                onMovementIntent={(dx, dy) => client.move(dx, dy)}
                onPlace={() => {}}
                onSelect={() => {}}
                onSelectObject={() => {}}
                onMoveObject={() => {}}
                onRemove={() => {}}
                onSit={(seatId) => void runOfficeAction(() => client.sit(seatId))}
                onStand={() => void runOfficeAction(() => client.stand())}
                meetings={{}}
                areaNames={{}}
                onZoom={setZoom}
                onAreaClick={() => {}}
              />
            ) : connected && state.bootstrap && state.ready && state.snapshot ? (
              <Suspense fallback={<p role="status">Loading office map…</p>}>
                <LiveCommonsScene
                  bootstrap={state.bootstrap}
                  snapshot={state.snapshot}
                  localParticipationId={state.ready.participationId}
                  onMovement={(dx, dy) => client.move(dx, dy)}
                />
              </Suspense>
            ) : (
              <Suspense fallback={<p role="status">Loading office map…</p>}>
                <CommonsScene />
              </Suspense>
            )}
          </div>
          <div
            className="controlbar office-controlbar"
            role="group"
            aria-label="Office connection controls"
          >
            <span className={`status-dot ${connected ? 'available' : 'away'}`} aria-hidden="true" />
            <span className="office-control-status" role="status" aria-live="polite">
              <span>{connectionMessage}</span>
              <small>
                {connected
                  ? 'Use arrow keys or WASD to move.'
                  : 'Enter the office to move and interact.'}
              </small>
            </span>
            <span className="control-separator" />
            {connected ? (
              <button
                className="icon-button leave-meeting"
                type="button"
                aria-label="Leave office"
                title="Leave office"
                onClick={() => client.close()}
              >
                <ArrowLeft size={19} />
              </button>
            ) : (
              <button
                className="primary enter-button"
                type="button"
                disabled={state.status === 'connecting'}
                onClick={() => void client.connect()}
              >
                {state.status === 'connecting' ? 'Connecting…' : 'Enter office'}
              </button>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
