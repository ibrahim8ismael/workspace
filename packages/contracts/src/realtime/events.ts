import { z } from 'zod';
import {
  officeAccessEndedSchema,
  officeReadySchema,
  presenceUpdateEventSchema,
  seatSitEventSchema,
  seatStandEventSchema,
  worldDeltaSchema,
  worldInputEventSchema,
  worldResyncEventSchema,
  worldSnapshotSchema,
} from './office.js';
import {
  conversationLeaveEventSchema,
  conversationUpdateSchema,
  meetingInvitationSchema,
  meetingJoinEventSchema,
  meetingLeaveEventSchema,
  meetingInviteEventSchema,
  meetingInvitationResponseEventSchema,
  meetingInvitationCancelEventSchema,
  proximityOptInEventSchema,
} from './conversations.js';

export const officeClientEventNameSchema = z.enum([
  'world:input',
  'world:resync',
  'presence:update',
  'seat:sit',
  'seat:stand',
  'proximity:set-opt-in',
  'conversation:leave',
  'meeting:join',
  'meeting:leave',
  'meeting:invite',
  'meeting:invitation:respond',
  'meeting:invitation:cancel',
]);
export const officeClientEventSchemas = Object.freeze({
  'world:input': worldInputEventSchema,
  'world:resync': worldResyncEventSchema,
  'presence:update': presenceUpdateEventSchema,
  'seat:sit': seatSitEventSchema,
  'seat:stand': seatStandEventSchema,
  'proximity:set-opt-in': proximityOptInEventSchema,
  'conversation:leave': conversationLeaveEventSchema,
  'meeting:join': meetingJoinEventSchema,
  'meeting:leave': meetingLeaveEventSchema,
  'meeting:invite': meetingInviteEventSchema,
  'meeting:invitation:respond': meetingInvitationResponseEventSchema,
  'meeting:invitation:cancel': meetingInvitationCancelEventSchema,
});
export const officeServerEventSchemas = Object.freeze({
  'office:ready': officeReadySchema,
  'world:snapshot': worldSnapshotSchema,
  'world:delta': worldDeltaSchema,
  'office:access-ended': officeAccessEndedSchema,
  'conversation:update': conversationUpdateSchema,
  'meeting:invitation': meetingInvitationSchema,
});
