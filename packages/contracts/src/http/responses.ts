import { z } from 'zod';
import { displayNameSchema, idSchema, secretSchema, workspaceRoleSchema } from './auth.js';

/** Public projections only; never accept an internal persistence record here. */
export const accountDtoSchema = z
  .object({
    id: idSchema,
    email: z.email().max(254),
    displayName: displayNameSchema,
    verifiedAt: z.iso.datetime(),
  })
  .strict();

export const workspaceDtoSchema = z
  .object({
    id: idSchema,
    name: z.string().min(2).max(80),
    slug: z
      .string()
      .min(3)
      .max(60)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    role: workspaceRoleSchema,
    memberCount: z.number().int().min(1),
  })
  .strict();

export const csrfResponseSchema = z.object({ csrfToken: secretSchema }).strict();
export const accountResponseSchema = z.object({ account: accountDtoSchema }).strict();
export const authenticatedResponseSchema = z
  .object({ account: accountDtoSchema, csrfToken: secretSchema })
  .strict();
export const messageResponseSchema = z.object({ message: z.string().min(1).max(256) }).strict();
export const workspaceResponseSchema = z.object({ workspace: workspaceDtoSchema }).strict();
export const workspacesResponseSchema = z
  .object({ workspaces: z.array(workspaceDtoSchema).max(100) })
  .strict();

export const sessionDtoSchema = z
  .object({
    id: idSchema,
    current: z.boolean(),
    createdAt: z.iso.datetime(),
    absoluteExpiresAt: z.iso.datetime(),
    idleExpiresAt: z.iso.datetime(),
  })
  .strict();
export const sessionsResponseSchema = z
  .object({ sessions: z.array(sessionDtoSchema).max(100) })
  .strict();
export const extendSessionResponseSchema = z.object({ idleExpiresAt: z.iso.datetime() }).strict();

export const memberDtoSchema = z
  .object({
    userId: idSchema,
    displayName: z.string().min(1).max(80),
    role: workspaceRoleSchema,
    joinedAt: z.iso.datetime(),
  })
  .strict();
export const membersResponseSchema = z
  .object({ members: z.array(memberDtoSchema).max(30) })
  .strict();

export const invitationDtoSchema = z
  .object({ id: idSchema, email: z.email().max(254), expiresAt: z.iso.datetime() })
  .strict();
export const invitationResponseSchema = z.object({ invitation: invitationDtoSchema }).strict();
export const invitationsResponseSchema = z
  .object({
    invitations: z
      .array(
        invitationDtoSchema
          .extend({ status: z.enum(['pending', 'accepted', 'revoked', 'expired']) })
          .strict(),
      )
      .max(100),
  })
  .strict();
