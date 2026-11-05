import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  Interaction,
  CalendarEvent,
  Channel,
  ChatMessage,
  DirectoryUser,
  FocusRoom,
  Meetings,
  OfficeObject,
  Participant,
  Signal,
} from './types';

/** A stable identity per browser and name, so direct messages and unread markers survive reconnections
    while two people sharing one browser (two tabs, two names) stay distinct. */
function browserUserId(name: string) {
  const key = name.trim().toLowerCase() || 'invitado';
  try {
    const ids: Record<string, string> = JSON.parse(localStorage.getItem('office-user-ids') || '{}');
    if (ids[key] && /^[A-Za-z0-9_-]{8,64}$/.test(ids[key])) return ids[key];
    ids[key] = crypto.randomUUID();
    localStorage.setItem('office-user-ids', JSON.stringify(ids));
    return ids[key];
  } catch {
    return crypto.randomUUID();
  }
}
export function useOffice(
  room: string,
  profile: {
    name: string;
    color: string;
    avatar?: unknown;
    accessKey?: string;
    adminKey?: string;
    sessionToken?: string;
  } | null,
) {
  const socket = useRef<WebSocket | null>(null);
  const listeners = useRef(new Set<(signal: Signal) => void>());
  const [selfId, setSelfId] = useState<string | null>(null);
  const [role, setRole] = useState<'admin' | 'member'>('member');
  const [accessDenied, setAccessDenied] = useState(false);
  const [loginRequired, setLoginRequired] = useState(false);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [meetings, setMeetings] = useState<Meetings>({});
  const [mediaToken, setMediaToken] = useState<{
    url: string;
    token: string;
    room: string;
    areaId: string;
  } | null>(null);
  const [reactions, setReactions] = useState<
    { id: string; participantId: string; emoji: string }[]
  >([]);
  const [areaNames, setAreaNames] = useState<Record<string, string>>({});
  const [channels, setChannels] = useState<Channel[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [interactions, setInteractions] = useState<Record<string, Interaction>>({});
  const [users, setUsers] = useState<DirectoryUser[]>([]);
  const [desks, setDesks] = useState<Record<string, string>>({});
  const [focusRooms, setFocusRooms] = useState<Record<string, FocusRoom>>({});
  const [knocks, setKnocks] = useState<
    { areaId: string; from: { id: string; name: string }; at: number }[]
  >([]);
  const [focusClosed, setFocusClosed] = useState<{ areaId: string; at: number } | null>(null);
  const [admitted, setAdmitted] = useState<{ areaId: string; by: string; at: number } | null>(null);
  const [workspace, setWorkspace] = useState<{ slug: string; name: string } | null>(null);
  const userId = useMemo(() => browserUserId(profile?.name ?? ''), [profile?.name]);
  const [createdChannel, setCreatedChannel] = useState<{ id: string; nonce: number } | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [objects, setObjects] = useState<OfficeObject[]>([]);
  const [overrides, setOverrides] = useState<
    Record<string, { facing?: string; x?: number; y?: number; removed?: boolean }>
  >({});
  const [connection, setConnection] = useState<'idle' | 'connecting' | 'online' | 'offline'>(
    'idle',
  );
  const [error, setError] = useState('');
  const profileRef = useRef(profile);
  profileRef.current = profile;
  const selfRef = useRef<string | null>(null);
  const userIdRef = useRef(userId);
  userIdRef.current = userId;
  const enabled = !!profile;
  useEffect(() => {
    if (!enabled) {
      setConnection('idle');
      setSelfId(null);
      setParticipants([]);
      return;
    }
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    let retries = 0;
    function connect() {
      if (disposed) return;
      setConnection('connecting');
      const ws = new WebSocket(
        `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws?room=${encodeURIComponent(room)}`,
      );
      socket.current = ws;
      ws.onopen = () => {
        retries = 0;
        ws.send(JSON.stringify({ type: 'join', ...profileRef.current, userId: userIdRef.current }));
      };
      ws.onmessage = (event) => {
        let data;
        try {
          data = JSON.parse(event.data);
        } catch {
          return;
        }
        if (data.type === 'welcome') {
          selfRef.current = data.id;
          setSelfId(data.id);
          setRole(data.role === 'admin' ? 'admin' : 'member');
          setAccessDenied(false);
          setLoginRequired(false);
          if (data.workspace) setWorkspace(data.workspace);
          setDesks(data.desks ?? {});
          setParticipants(data.participants);
          setMeetings(data.meetings ?? {});
          setAreaNames(data.areaNames ?? {});
          setChannels(data.channels ?? []);
          setUsers(data.users ?? []);
          setEvents(data.events ?? []);
          setInteractions(data.interactions ?? {});
          setMessages(data.messages);
          setObjects(data.objects);
          setOverrides(data.overrides ?? {});
          setConnection('online');
          setError('');
        }
        if (data.type === 'participants') {
          setParticipants(data.participants);
          if (data.meetings) setMeetings(data.meetings);
          setFocusRooms(data.focusRooms ?? {});
        }
        if (data.type === 'focus:knock')
          setKnocks((list) => [
            ...list.filter((k) => k.from.id !== data.from.id),
            { areaId: data.areaId, from: data.from, at: Date.now() },
          ]);
        if (data.type === 'focus:admitted')
          setAdmitted({ areaId: data.areaId, by: data.by, at: Date.now() });
        if (data.type === 'areas') setAreaNames(data.areaNames ?? {});
        if (data.type === 'users') setUsers(data.users ?? []);
        if (data.type === 'desks') setDesks(data.desks ?? {});
        if (data.type === 'workspace' && data.workspace) setWorkspace(data.workspace);
        if (data.type === 'media:token')
          setMediaToken({ url: data.url, token: data.token, room: data.room, areaId: data.areaId });
        if (data.type === 'reaction') {
          const item = {
            id: `${data.participantId}-${data.at}-${Math.random()}`,
            participantId: data.participantId,
            emoji: data.emoji,
          };
          setReactions((old) => [...old, item].slice(-30));
          setTimeout(() => setReactions((old) => old.filter((r) => r.id !== item.id)), 3200);
        }
        if (data.type === 'events') setEvents(data.events ?? []);
        if (data.type === 'channels') {
          setChannels(data.channels ?? []);
          if (data.created && data.by === selfRef.current)
            setCreatedChannel({ id: data.created, nonce: Date.now() });
        }
        if (data.type === 'objects' && data.interactions) setInteractions(data.interactions);
        if (data.type === 'objects') {
          setObjects(data.objects);
          setOverrides(data.overrides ?? {});
        }
        if (data.type === 'chat') setMessages((old) => [...old, data.message].slice(-2000));
        if (data.type === 'signal') listeners.current.forEach((fn) => fn(data));
        if (data.type === 'error') {
          if (data.code === 'access_denied') {
            setAccessDenied(true);
            disposed = true;
          } else if (data.code === 'login_required') {
            setLoginRequired(true);
            disposed = true;
          } else if (data.code === 'focus_closed') {
            setFocusClosed({ areaId: data.areaId, at: Date.now() });
          } else setError(data.message);
        }
      };
      ws.onclose = () => {
        if (disposed) return;
        setConnection('offline');
        setParticipants([]);
        setSelfId(null);
        timer = setTimeout(connect, Math.min(1000 * 2 ** retries++, 10000));
      };
      ws.onerror = () => setError('No se pudo conectar con la oficina. Reintentando…');
    }
    connect();
    return () => {
      disposed = true;
      clearTimeout(timer);
      socket.current?.close();
      socket.current = null;
    };
  }, [enabled, room]);
  const send = useCallback((data: Record<string, unknown>) => {
    if (socket.current?.readyState === WebSocket.OPEN) socket.current.send(JSON.stringify(data));
  }, []);
  const subscribeSignal = useCallback((listener: (signal: Signal) => void) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);
  return {
    selfId,
    desks,
    workspace,
    focusRooms,
    knocks,
    setKnocks,
    focusClosed,
    setFocusClosed,
    admitted,
    mediaToken,
    interactions,
    reactions,
    role,
    accessDenied,
    loginRequired,
    userId,
    participants,
    meetings,
    areaNames,
    channels,
    users,
    events,
    createdChannel,
    messages,
    objects,
    overrides,
    connection,
    error,
    setError,
    send,
    subscribeSignal,
  };
}
