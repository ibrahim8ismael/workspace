export type Status = 'available' | 'busy' | 'away' | 'focus';
export type Facing = 'north' | 'east' | 'south' | 'west';
export type AvatarLookData = {
  body?: number;
  skin: number;
  hair: number;
  top: number;
  bottom: number;
  shoes: number;
  glasses: number;
  hat: number;
};
export type Participant = {
  id: string;
  userId?: string;
  /** Set while the server keeps this person in focus inside a focus office. */ focusZone?: string;
  avatar?: AvatarLookData;
  statusText?: string;
  handRaised?: boolean;
  role?: 'admin' | 'member';
  name: string;
  color: string;
  x: number;
  y: number;
  facing?: Facing;
  seatId?: string;
  status: Status;
  mic?: boolean;
  camera?: boolean;
  screen?: boolean;
};
export type OfficeObject = {
  id: string;
  kind: string;
  color?: string;
  facing?: string;
  x: number;
  y: number;
  free?: boolean;
};
export type EditItem = { kind: string; color: string; facing: string };
export type ChatMessage = {
  id: string;
  participantId: string;
  userId?: string;
  name: string;
  text: string;
  channel: 'channel' | 'dm' | 'nearby' | 'meeting';
  channelId?: string;
  dmKey?: string;
  to?: string;
  areaId?: string;
  system?: boolean;
  createdAt: string;
};
export type Channel = { id: string; name: string; topic: string };
export type DirectoryUser = { userId: string; name: string; color: string };
export type MeetingState = {
  active: boolean;
  locked: boolean;
  participants: number;
  startedAt?: number;
  music?: { startedAt: number; by: string };
  recordingBy?: string;
};
export type Meetings = Record<string, MeetingState>;
export type Send = (message: Record<string, unknown>) => void;
export type Signal = {
  from: string;
  data: { description?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit };
};
export type Interaction =
  { type: 'link'; url: string; title?: string } | { type: 'note'; text: string; title?: string };
export type CalendarEvent = {
  id: string;
  title: string;
  description: string;
  start: string;
  end: string;
  areaId: string | null;
  organizer: string;
  organizerId: string;
};
/** An occupied focus office: its door stays closed unless opened or the person was let in. */
export type FocusRoom = { occupied: boolean; open: boolean; guests: string[]; people: string[] };
