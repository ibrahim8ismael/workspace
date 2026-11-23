import type { WorkspaceRole } from '@gather/contracts';

export function workspaceRoleLabel(role: WorkspaceRole) {
  return role === 'owner' ? 'Owner' : role === 'admin' ? 'Admin' : 'Member';
}
