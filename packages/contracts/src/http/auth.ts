import { z } from 'zod';

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));
export const passwordSchema = z.string().min(15).max(128);
export const legacySecretSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const secretSchema = legacySecretSchema;
export const otpSchema = z.string().regex(/^[0-9]{6}$/);
export const invitationCodeSchema = z.preprocess(
  (value) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return /^[A-Za-z0-9_-]{43}$/.test(trimmed)
      ? trimmed
      : trimmed.replace(/\s+/g, '').toUpperCase();
  },
  z.union([z.string().regex(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/), legacySecretSchema]),
);
export const idSchema = z.uuid();
export const displayNameSchema = z.string().trim().min(2).max(80);
export const registerSchema = z
  .object({ email: emailSchema, password: passwordSchema, displayName: displayNameSchema })
  .strict();
export const loginSchema = z
  .object({ email: emailSchema, password: z.string().min(1).max(128) })
  .strict();
export const emailRequestSchema = z.object({ email: emailSchema }).strict();
export const verifyEmailSchema = z
  .object({
    email: emailSchema,
    token: z.union([otpSchema, legacySecretSchema]),
  })
  .strict();
export const resetPasswordSchema = z
  .object({
    email: emailSchema,
    token: z.union([otpSchema, legacySecretSchema]),
    newPassword: passwordSchema,
  })
  .strict();
export const changePasswordSchema = z
  .object({ currentPassword: z.string().min(1).max(128), newPassword: passwordSchema })
  .strict();
export const reauthenticateSchema = z.object({ password: z.string().min(1).max(128) }).strict();
export const emptyBodySchema = z.object({}).strict();
export const workspaceRoleSchema = z.enum(['owner', 'admin', 'member']);
export const workspaceMemberRoleSchema = z.enum(['admin', 'member']);
export type WorkspaceRole = z.infer<typeof workspaceRoleSchema>;
export type WorkspaceMemberRole = z.infer<typeof workspaceMemberRoleSchema>;
export const workspaceLayoutPresetSchema = z.enum([
  'repo-campus-hall',
  'repo-campus',
  'studio-expandable',
  'studio-orthogonal',
  'studio',
  'startup',
  'corporate',
]);
export type WorkspaceLayoutPreset = z.infer<typeof workspaceLayoutPresetSchema>;
export const createWorkspaceSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    slug: z
      .string()
      .min(3)
      .max(60)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    roomCount: z.number().int().min(1).max(100).optional(),
    officeTemplate: z.union([z.literal('svg'), workspaceLayoutPresetSchema]).optional(),
    privateOfficeCount: z.number().int().min(1).max(21).optional(),
  })
  .strict()
  .refine(({ roomCount, officeTemplate }) => roomCount === undefined || !officeTemplate, {
    path: ['roomCount'],
    message: 'Office templates and generated room counts are separate options.',
  })
  .refine(
    ({ privateOfficeCount, officeTemplate }) =>
      privateOfficeCount === undefined ||
      ((officeTemplate === 'studio' || officeTemplate === 'studio-orthogonal') &&
        privateOfficeCount <= 8) ||
      ((officeTemplate === 'repo-campus-hall' ||
        officeTemplate === 'repo-campus' ||
        officeTemplate === 'studio-expandable') &&
        privateOfficeCount <= 16) ||
      (officeTemplate === 'startup' && privateOfficeCount <= 13) ||
      officeTemplate === 'corporate',
    {
      path: ['privateOfficeCount'],
      message: 'Private office count must fit the selected floor plan.',
    },
  );
export type CreateWorkspaceInput = z.infer<typeof createWorkspaceSchema>;
export const renameWorkspaceSchema = z
  .object({ name: z.string().trim().min(2).max(80), expectedRevision: z.number().int().min(0) })
  .strict();
export const renameWorkspaceResponseSchema = z
  .object({
    message: z.string().min(1).max(256),
    name: z.string().min(2).max(80),
    revision: z.number().int().min(1),
  })
  .strict();
export const updateWorkspaceRoomCountSchema = z
  .object({
    roomCount: z.number().int().min(1).max(100),
    expectedRevision: z.number().int().min(0),
  })
  .strict();
export const updateWorkspaceRoomCountResponseSchema = z
  .object({
    message: z.string().min(1).max(256),
    roomCount: z.number().int().min(1).max(100),
    revision: z.number().int().min(1),
  })
  .strict();
export const createInvitationSchema = z.object({ email: emailSchema }).strict();
export const acceptInvitationSchema = z.object({ token: invitationCodeSchema }).strict();
export const transferOwnershipSchema = z.object({ userId: idSchema }).strict();
export const updateWorkspaceMemberRoleSchema = z
  .object({ role: workspaceMemberRoleSchema })
  .strict();
export interface AccountDto {
  id: string;
  email: string;
  displayName: string;
  verifiedAt: string;
}
export interface WorkspaceDto {
  id: string;
  name: string;
  slug: string;
  role: WorkspaceRole;
  memberCount: number;
}
