import { z } from 'zod';

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));
export const passwordSchema = z.string().min(15).max(128);
export const secretSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
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
  .object({ token: secretSchema, password: z.string().min(1).max(128) })
  .strict();
export const resetPasswordSchema = z
  .object({ token: secretSchema, newPassword: passwordSchema })
  .strict();
export const changePasswordSchema = z
  .object({ currentPassword: z.string().min(1).max(128), newPassword: passwordSchema })
  .strict();
export const reauthenticateSchema = z.object({ password: z.string().min(1).max(128) }).strict();
export const emptyBodySchema = z.object({}).strict();
export const workspaceRoleSchema = z.enum(['owner', 'member']);
export const createWorkspaceSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    slug: z
      .string()
      .min(3)
      .max(60)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  })
  .strict();
export const createInvitationSchema = z.object({ email: emailSchema }).strict();
export const acceptInvitationSchema = z.object({ token: secretSchema }).strict();
export const transferOwnershipSchema = z.object({ userId: idSchema }).strict();
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
  role: 'owner' | 'member';
  memberCount: number;
}
