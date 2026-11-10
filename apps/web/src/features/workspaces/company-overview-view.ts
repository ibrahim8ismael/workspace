import type { OfficeWorkspaceDetail } from '../../lib/api';

/** Only a loaded detail for this exact company can open the preview. */
export function canOpenOfficePreview(
  detail: OfficeWorkspaceDetail | null,
  workspaceId: string,
  loading: boolean,
  error: string,
) {
  return !loading && !error && detail?.id === workspaceId;
}
