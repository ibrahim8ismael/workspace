import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import type { OfficeWorkspaceDetail } from '../../lib/api';
import { ApiClient } from '../../lib/api';
import { CommonsScene } from '../../../commons-preview/CommonsScene';
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

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  useEffect(() => () => client.close(), [client]);

  const connected = state.status === 'connected';

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
          <CommonsScene />
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
