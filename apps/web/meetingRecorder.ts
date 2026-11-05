/** Records a meeting's audio (everyone's microphone mixed together) in the browser and saves it as a .webm file.
    Everyone in the room is told that a recording is running before any audio is captured. */
export class MeetingRecorder {
  private context: AudioContext | null = null;
  private destination: MediaStreamAudioDestinationNode | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private sources = new Map<string, MediaStreamAudioSourceNode>();

  get recording() {
    return this.recorder?.state === 'recording';
  }

  start(streams: MediaStream[]) {
    if (this.recording) return;
    this.context = new AudioContext();
    this.destination = this.context.createMediaStreamDestination();
    this.update(streams);
    const type = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg'].find((candidate) =>
      MediaRecorder.isTypeSupported(candidate),
    );
    this.recorder = new MediaRecorder(
      this.destination.stream,
      type ? { mimeType: type } : undefined,
    );
    this.chunks = [];
    this.recorder.ondataavailable = (event) => {
      if (event.data.size) this.chunks.push(event.data);
    };
    this.recorder.start(1000);
  }

  /** Follows people joining and leaving, and microphones turning on and off. */
  update(streams: MediaStream[]) {
    if (!this.context || !this.destination) return;
    const tracks = new Map(
      streams.flatMap((stream) => stream.getAudioTracks()).map((track) => [track.id, track]),
    );
    for (const [id, source] of this.sources)
      if (!tracks.has(id)) {
        source.disconnect();
        this.sources.delete(id);
      }
    for (const [id, track] of tracks)
      if (!this.sources.has(id)) {
        const source = this.context.createMediaStreamSource(new MediaStream([track]));
        source.connect(this.destination);
        this.sources.set(id, source);
      }
  }

  stop(fileName: string): Promise<void> {
    const recorder = this.recorder;
    if (!recorder) return Promise.resolve();
    return new Promise((resolve) => {
      recorder.onstop = () => {
        const blob = new Blob(this.chunks, { type: recorder.mimeType || 'audio/webm' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = fileName;
        link.click();
        setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
        for (const source of this.sources.values()) source.disconnect();
        this.sources.clear();
        void this.context?.close();
        this.context = null;
        this.destination = null;
        this.recorder = null;
        this.chunks = [];
        resolve();
      };
      recorder.stop();
    });
  }
}
