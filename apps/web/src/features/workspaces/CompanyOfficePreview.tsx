import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { OfficeWorkspaceDetail } from '../../lib/api';
import { ApiClient } from '../../lib/api';
import { CommonsScene } from '../../../commons-preview/CommonsScene';
import { LiveCommonsScene } from '../../../commons-preview/LiveCommonsScene';
import { OfficePreviewChat } from './OfficePreviewChat';
import { OfficeClient } from '../office/office-client';
import './office-preview.css';

type Props = {
  api: ApiClient;
  detail: OfficeWorkspaceDetail;
  onBack: () => void;
};

export function CompanyOfficePreview({ api, detail, onBack }: Props) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const emptyState = detail.memberCount === 1 ? 'member' : 'members';
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

  return (
    <section className="company-office-preview" aria-labelledby="company-office-preview-title">
      <header className="company-office-preview-heading">
        <div>
          <p className="account-eyebrow">OFFICE PREVIEW</p>
          <div className="company-office-preview-title-row">
            <h1 id="company-office-preview-title" ref={titleRef} tabIndex={-1}>
              {detail.name}
            </h1>
            <span className="office-preview-badge">
              {connected ? 'Office connected' : 'Company-scoped office'}
            </span>
          </div>
          <p className="workspace-lead">gather/{detail.slug}</p>
        </div>
        <button className="account-secondary" type="button" onClick={onBack}>
          Back to company details
        </button>
      </header>

      <div className="office-session-controls" aria-label="Office connection controls">
        <p className="office-session-status" role="status" aria-live="polite">
          <span className={`status-dot ${connected ? 'available' : 'away'}`} aria-hidden="true" />
          {state.status === 'connected'
            ? `${state.snapshot?.participants.length ?? 0} people in the office`
            : state.status === 'connecting'
              ? 'Connecting to the office…'
              : state.status === 'ended'
                ? state.message
                : state.status === 'error'
                  ? state.message
                  : state.status === 'disconnected'
                    ? state.message
                    : 'Not connected to the office.'}
        </p>
        {connected ? (
          <button className="account-secondary" type="button" onClick={() => client.close()}>
            Leave office
          </button>
        ) : (
          <button
            className="account-primary"
            type="button"
            disabled={state.status === 'connecting'}
            onClick={() => void client.connect()}
          >
            {state.status === 'connecting' ? 'Connecting…' : 'Enter office'}
          </button>
        )}
      </div>

      <div className="company-office-preview-layout">
        <section
          className="office-preview-panel office-preview-map"
          aria-labelledby="preview-map-title"
        >
          <div className="office-preview-panel-heading">
            <p className="account-eyebrow">APPROVED COMMONS MAP</p>
            <h2 id="preview-map-title">{connected ? 'Map renderer sample' : 'Office map'}</h2>
            <p>
              {connected
                ? 'The office connection is live; this room image is still a static rendering sample.'
                : 'Read-only local renderer using the approved Commons geometry and art.'}
            </p>
          </div>
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
          {connected && state.snapshot && self && (
            <div className="office-world-controls" aria-label="Office controls">
              <div>
                <h3>Your availability</h3>
                <div className="office-world-control-row">
                  {(['available', 'busy', 'away'] as const).map((availability) => (
                    <button
                      key={availability}
                      className="account-secondary"
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
              <div>
                <h3>Seats</h3>
                <div className="office-world-control-row">
                  {self.seatId ? (
                    <button
                      className="account-secondary"
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
                          className="account-secondary"
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
          )}
        </section>

        <OfficePreviewChat
          companyName={detail.name}
          connected={connected}
          participants={state.snapshot?.participants ?? []}
        />
      </div>

      <p className="office-preview-company-meta">
        {detail.memberCount} {emptyState} in this company. Company details and session controls
        remain available from this preview.
      </p>
    </section>
  );
}
