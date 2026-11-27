/**
 * Peer-to-peer voice for one arena room.
 *
 * Colyseus only relays the WebRTC handshake; the audio itself flows directly
 * between browsers. The mesh is limited to the warriors who explicitly opt in
 * by allowing microphone access.
 */

export type VoiceState = "off" | "requesting" | "on" | "muted";

interface VoiceRoom {
  sessionId: string;
  send(type: string, data?: unknown): void;
  onMessage(type: string, handler: (message: any) => void): void;
}

interface VoicePeer {
  pc: RTCPeerConnection;
  audio: HTMLAudioElement;
  pendingCandidates: RTCIceCandidateInit[];
  hasRemote: boolean;
}

const ICE_SERVERS: RTCIceServer[] = [
  { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
];

export class VoiceChat {
  private readonly peers = new Map<string, VoicePeer>();
  private localStream: MediaStream | null = null;
  private state: VoiceState = "off";
  private active = false;
  private closed = false;

  constructor(
    private readonly room: VoiceRoom,
    private readonly onStateChange: (state: VoiceState) => void,
    private readonly notify: (text: string) => void,
  ) {
    this.room.onMessage("voice", (message) => this.receive(message));
  }

  getState(): VoiceState {
    return this.state;
  }

  async enable() {
    if (this.active || this.state === "requesting" || this.closed) { return; }

    if (!navigator.mediaDevices?.getUserMedia) {
      this.notify("voice needs a secure page and a microphone");
      return;
    }

    this.setState("requesting");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
    } catch (error) {
      console.warn("microphone unavailable", error);
      this.setState("off");
      this.notify("microphone permission denied");
      return;
    }

    // The player closed or left while the browser asked for permission.
    if (this.closed) {
      for (const track of stream.getTracks()) { track.stop(); }
      return;
    }

    this.localStream = stream;
    this.active = true;
    this.setState("on");
    this.room.send("voice", { kind: "join" });
    this.notify("voice chat on");
  }

  disable() {
    if (!this.active && this.state === "off") { return; }
    this.active = false;
    if (!this.closed) { this.room.send("voice", { kind: "leave" }); }
    this.teardown();
    this.setState("off");
    this.notify("voice chat off");
  }

  toggleMute() {
    if (!this.active || !this.localStream) { return; }
    const track = this.localStream.getAudioTracks()[0];
    if (!track) { return; }
    track.enabled = !track.enabled;
    this.setState(track.enabled ? "on" : "muted");
    this.notify(track.enabled ? "microphone on" : "microphone muted");
  }

  /** The room is gone: stop the microphone and drop every peer. */
  destroy() {
    this.closed = true;
    this.active = false;
    this.teardown();
    this.setState("off");
  }

  // --------------------------------------------------------------- signaling

  private receive(message: any) {
    if (!this.active || !message || typeof message !== "object") { return; }

    switch (message.kind) {
      case "peers":
        if (Array.isArray(message.peers)) {
          for (const sessionId of message.peers) {
            if (typeof sessionId === "string" && sessionId !== this.room.sessionId) {
              void this.offer(sessionId);
            }
          }
        }
        break;

      case "peer-joined":
        // The newcomer sends the offer. Build the connection now so our mic
        // track is attached before it arrives.
        if (typeof message.sessionId === "string") {
          this.ensurePeer(message.sessionId);
        }
        break;

      case "peer-left":
        if (typeof message.sessionId === "string") {
          this.removePeer(message.sessionId);
        }
        break;

      case "signal":
        if (typeof message.from === "string") {
          void this.handleSignal(message.from, message.data);
        }
        break;
    }
  }

  private sendSignal(to: string, data: unknown) {
    if (!this.active) { return; }
    this.room.send("voice", { kind: "signal", to, data });
  }

  private ensurePeer(sessionId: string): VoicePeer {
    const existing = this.peers.get(sessionId);
    if (existing) { return existing; }

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    const audio = new Audio();
    audio.autoplay = true;
    audio.setAttribute("playsinline", "");
    audio.style.display = "none";
    // Some browsers need the sink attached to the document to start playing.
    document.body.appendChild(audio);

    const peer: VoicePeer = { pc, audio, pendingCandidates: [], hasRemote: false };
    this.peers.set(sessionId, peer);

    pc.onicecandidate = (event) => {
      if (!event.candidate) { return; }
      this.sendSignal(sessionId, {
        type: "candidate",
        candidate: event.candidate.toJSON(),
      });
    };

    pc.ontrack = (event) => {
      peer.audio.srcObject = event.streams[0] ?? new MediaStream([event.track]);
      void peer.audio.play().catch(() => {});
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" || pc.connectionState === "closed") {
        this.removePeer(sessionId);
      }
    };

    if (this.localStream) {
      for (const track of this.localStream.getAudioTracks()) {
        pc.addTrack(track, this.localStream);
      }
    }

    return peer;
  }

  private async offer(sessionId: string) {
    const peer = this.ensurePeer(sessionId);
    try {
      const offer = await peer.pc.createOffer();
      await peer.pc.setLocalDescription(offer);
      this.sendSignal(sessionId, { type: "offer", sdp: peer.pc.localDescription?.sdp });
    } catch (error) {
      console.warn("voice offer failed", error);
      this.removePeer(sessionId);
    }
  }

  private async handleSignal(sessionId: string, data: any) {
    if (!data || typeof data !== "object") { return; }
    const peer = this.ensurePeer(sessionId);

    try {
      if (data.type === "offer") {
        await peer.pc.setRemoteDescription({ type: "offer", sdp: String(data.sdp ?? "") });
        peer.hasRemote = true;
        await this.flushCandidates(peer);

        const answer = await peer.pc.createAnswer();
        await peer.pc.setLocalDescription(answer);
        this.sendSignal(sessionId, {
          type: "answer",
          sdp: peer.pc.localDescription?.sdp,
        });
      } else if (data.type === "answer") {
        await peer.pc.setRemoteDescription({ type: "answer", sdp: String(data.sdp ?? "") });
        peer.hasRemote = true;
        await this.flushCandidates(peer);
      } else if (data.type === "candidate" && data.candidate) {
        if (peer.hasRemote) {
          await peer.pc.addIceCandidate(data.candidate);
        } else {
          peer.pendingCandidates.push(data.candidate);
        }
      }
    } catch (error) {
      console.warn("voice signal failed", error);
    }
  }

  private async flushCandidates(peer: VoicePeer) {
    const pending = peer.pendingCandidates;
    peer.pendingCandidates = [];
    for (const candidate of pending) {
      try {
        await peer.pc.addIceCandidate(candidate);
      } catch (error) {
        console.warn("voice candidate failed", error);
      }
    }
  }

  // ----------------------------------------------------------------- cleanup

  private removePeer(sessionId: string) {
    const peer = this.peers.get(sessionId);
    if (!peer) { return; }
    this.peers.delete(sessionId);

    peer.pc.onicecandidate = null;
    peer.pc.ontrack = null;
    peer.pc.onconnectionstatechange = null;
    try { peer.pc.close(); } catch { /* already closed */ }

    peer.audio.pause();
    peer.audio.srcObject = null;
    peer.audio.remove();
  }

  private teardown() {
    for (const sessionId of [...this.peers.keys()]) {
      this.removePeer(sessionId);
    }
    if (this.localStream) {
      for (const track of this.localStream.getTracks()) { track.stop(); }
      this.localStream = null;
    }
  }

  private setState(state: VoiceState) {
    if (this.state === state) { return; }
    this.state = state;
    this.onStateChange(state);
  }
}
