import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  ArrowLeft,
  Bell,
  CalendarDays,
  LayoutGrid,
  Map,
  MessageCircle,
  Settings2,
} from 'lucide-react';
import type { OfficeWorkspaceDetail, SessionDto } from '../../lib/api';
import { ApiClient } from '../../lib/api';
import { CommonsScene } from '../../../commons-preview/CommonsScene';
import { LiveCommonsScene } from '../../../commons-preview/LiveCommonsScene';
import { OfficePreviewChat } from './OfficePreviewChat';
import { OfficeClient } from '../office/office-client';
import { SessionLifetimeNotice } from '../auth/SessionLifetimeNotice';
import './office-preview.css';

type Props = {
  api: ApiClient;
  detail: OfficeWorkspaceDetail;
  onBack: () => void;
  onOpenSecurity: () => void;
  currentSession: SessionDto | null;
  sessionsLoading: boolean;
  sessionsError: string;
  sessionActionStatus: string;
  sessionActionError: string;
  mutationPending: boolean;
  onRefreshSessions: () => void;
  onKeepWorking: () => void;
  onSessionExpire: () => void;
};

export function CompanyOfficePreview({
  api,
  detail,
  onBack,
  onOpenSecurity,
  currentSession,
  sessionsLoading,
  sessionsError,
  sessionActionStatus,
  sessionActionError,
  mutationPending,
  onRefreshSessions,
  onKeepWorking,
  onSessionExpire,
}: Props) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const client = useMemo(
    () => new OfficeClient(api, detail.id, detail.officeId),
    [api, detail.id, detail.officeId],
  );
  const state = useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);
  const [officeActionError, setOfficeActionError] = useState('');
  const [officeActionPending, setOfficeActionPending] = useState(false);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  useEffect(() => () => client.close(), [client]);

  const connected = state.status === 'connected';
  const participantCount = state.snapshot?.participants.length ?? 0;
  const self = state.snapshot?.participants.find(
    (participant) => participant.participationId === state.ready?.participationId,
  );

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

  return (
    <div className="app-shell office-shell" data-workspace-id={detail.id}>
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
            aria-label="Back to company details"
            title="Back to company details"
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
            <span>Commons office</span>
            <span className="office-preview-badge">Office</span>
          </div>

          <p className="office-sidebar-summary">
            Company slug: {detail.slug}. Text chat is unavailable in this release.
          </p>

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
              {officeActionError && (
                <p className="office-action-error" role="alert">
                  {officeActionError}
                </p>
              )}
            </div>
          ) : (
            <p className="empty-small">Enter the office to update your status or use a seat.</p>
          )}

          <SessionLifetimeNotice
            session={currentSession}
            loading={sessionsLoading}
            error={sessionsError}
            actionStatus={sessionActionStatus}
            actionError={sessionActionError}
            mutationPending={mutationPending}
            onRefresh={onRefreshSessions}
            onExtend={onKeepWorking}
            onExpire={onSessionExpire}
          />

          <OfficePreviewChat
            companyName={detail.name}
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
            <span>Commons</span>
          </div>
        </aside>

        <main className="map-area office-shell-map" aria-label="Approved Commons office map">
          <div className="office-map-heading">
            <strong>{connected ? 'Live Commons office' : 'Commons office'}</strong>
            <span className="office-preview-badge">{connected ? 'Live' : 'Read only'}</span>
          </div>
          <div className="office-map-stage">
            {connected && state.bootstrap && state.ready && state.snapshot ? (
              <LiveCommonsScene
                bootstrap={state.bootstrap}
                snapshot={state.snapshot}
                localParticipationId={state.ready.participationId}
                onMovement={(dx, dy) => client.move(dx, dy)}
              />
            ) : (
              <CommonsScene />
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
