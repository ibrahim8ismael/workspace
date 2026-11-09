import { useEffect, useRef } from 'react';
import type { OfficeWorkspaceDetail } from '../../lib/api';
import { CommonsScene } from '../../../commons-preview/CommonsScene';
import { OfficePreviewChat } from './OfficePreviewChat';
import './office-preview.css';

type Props = {
  detail: OfficeWorkspaceDetail;
  onBack: () => void;
};

export function CompanyOfficePreview({ detail, onBack }: Props) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const emptyState = detail.memberCount === 1 ? 'member' : 'members';

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  return (
    <section className="company-office-preview" aria-labelledby="company-office-preview-title">
      <header className="company-office-preview-heading">
        <div>
          <p className="account-eyebrow">OFFICE PREVIEW</p>
          <div className="company-office-preview-title-row">
            <h1 id="company-office-preview-title" ref={titleRef} tabIndex={-1}>
              {detail.name}
            </h1>
            <span className="office-preview-badge">Offline preview</span>
          </div>
          <p className="workspace-lead">gather/{detail.slug}</p>
        </div>
        <button className="account-secondary" type="button" onClick={onBack}>
          Back to company details
        </button>
      </header>

      <p className="office-preview-notice" role="note">
        <strong>This is a local UI preview.</strong> It does not request an office join ticket,
        connect Socket.IO or LiveKit, or load live participants and messages. It is not office
        entry, and no chat can be sent from this page.
      </p>

      <div className="company-office-preview-layout">
        <section
          className="office-preview-panel office-preview-map"
          aria-labelledby="preview-map-title"
        >
          <div className="office-preview-panel-heading">
            <p className="account-eyebrow">APPROVED COMMONS MAP</p>
            <h2 id="preview-map-title">Office map</h2>
            <p>Read-only local renderer using the approved Commons geometry and art.</p>
          </div>
          <CommonsScene />
        </section>

        <OfficePreviewChat companyName={detail.name} />
      </div>

      <p className="office-preview-company-meta">
        {detail.memberCount} {emptyState} in this company. Company details and session controls
        remain available from this preview.
      </p>
    </section>
  );
}
