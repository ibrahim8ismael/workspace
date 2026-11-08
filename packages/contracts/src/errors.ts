import { z } from 'zod';
import { idSchema } from './http/auth.js';

/** Existing HTTP error codes; office/media codes belong to their own protocol. */
export const httpErrorCodeSchema = z.enum([
  'already_member',
  'conflict',
  'credentials_changed',
  'csrf_rejected',
  'forbidden',
  'idempotency_conflict',
  'idempotency_key_required',
  'invalid_credentials',
  'invalid_invitation',
  'invalid_json',
  'invalid_target',
  'invalid_token',
  'invalid_workspace_id',
  'invitation_quota',
  'json_required',
  'membership_conflict',
  'membership_required',
  'not_found',
  'origin_rejected',
  'owner_transfer_required',
  'password_work_limited',
  'payload_too_large',
  'rate_limited',
  'reauthentication_required',
  'request_failed',
  'service_unavailable',
  'target_unavailable_or_quota',
  'unauthorized',
  'validation_failed',
  'verified_member_required',
  'weak_password',
  'workspace_full_or_unavailable',
  'workspace_quota',
  'workspace_unavailable',
]);

export const apiErrorResponseSchema = z
  .object({
    error: z
      .object({ code: httpErrorCodeSchema, message: httpErrorCodeSchema, requestId: idSchema })
      .strict()
      .refine((value) => value.code === value.message, 'Public messages must match safe codes'),
  })
  .strict();

export type HttpErrorCode = z.infer<typeof httpErrorCodeSchema>;
