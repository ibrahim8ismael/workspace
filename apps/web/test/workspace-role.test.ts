import { describe, expect, it } from 'vitest';
import { workspaceRoleLabel } from '../src/features/workspaces/workspace-role';

describe('workspace role labels', () => {
  it('keeps Owner, Admin and Member distinct', () => {
    expect(workspaceRoleLabel('owner')).toBe('Owner');
    expect(workspaceRoleLabel('admin')).toBe('Admin');
    expect(workspaceRoleLabel('member')).toBe('Member');
  });
});
