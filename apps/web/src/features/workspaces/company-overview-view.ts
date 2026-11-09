import type { OfficeWorkspaceDetail } from '../../lib/api';

export type CompanyOverviewView = 'details' | 'preview';

export type CompanyOverviewViewAction = 'open-preview' | 'back-to-details' | 'reset';

/** A company preview is local UI only; it never implies office admission. */
export function companyOverviewViewReducer(
  view: CompanyOverviewView,
  action: CompanyOverviewViewAction,
): CompanyOverviewView {
  if (action === 'open-preview') return view === 'details' ? 'preview' : view;
  return 'details';
}

/** Only a loaded detail for this exact company can open the preview. */
export function canOpenOfficePreview(
  detail: OfficeWorkspaceDetail | null,
  workspaceId: string,
  loading: boolean,
  error: string,
) {
  return !loading && !error && detail?.id === workspaceId;
}
