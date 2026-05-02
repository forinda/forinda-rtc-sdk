/**
 * Perfect-negotiation orchestrator.
 *
 * Implements the W3C "perfect negotiation" pattern
 * (https://w3c.github.io/webrtc-pc/#perfect-negotiation-example) so the
 * Publisher and Viewer don't have to reinvent offer/answer choreography
 * each session.
 *
 * Inputs (constructor):
 * - `pc` — the underlying `RTCPeerConnection` (or a wrapped one's `.raw`).
 * - `polite` — the role tiebreaker for collisions. The polite peer rolls
 *   back its in-flight offer when an incoming offer collides; the impolite
 *   peer ignores the incoming offer and proceeds with its own.
 * - `localPeerId` / `remotePeerId` — used to populate the `from`/`to` fields
 *   of outgoing SDP messages.
 * - `send` — callback the orchestrator invokes to deliver an outbound SDP
 *   message via the transport. Stays decoupled from any specific transport.
 */

import type { SdpMessage } from "@/signaling/transport.ts";

/** Outbound message shape the negotiator hands to its `send` callback. */
export type SendFn = (message: SdpMessage) => void | Promise<void>;

export interface NegotiatorOptions {
  pc: RTCPeerConnection;
  /** Role tiebreaker. Two peers in a session must not both be polite or both impolite. */
  polite: boolean;
  localPeerId: string;
  remotePeerId: string;
  send: SendFn;
}

/**
 * Coordinates SDP exchange for one peer-to-peer connection.
 *
 * Consumers drive the orchestrator via {@link Negotiator.makeOffer},
 * {@link Negotiator.handleSdp}, and {@link Negotiator.handleIce}; the
 * orchestrator calls `send` for every outbound SDP message.
 *
 * Prefer {@link defineNegotiator} as the call style.
 */
export class Negotiator {
  private readonly pc: RTCPeerConnection;
  private readonly polite: boolean;
  private readonly localPeerId: string;
  private readonly remotePeerId: string;
  private readonly send: SendFn;
  private makingOffer = false;

  constructor(opts: NegotiatorOptions) {
    this.pc = opts.pc;
    this.polite = opts.polite;
    this.localPeerId = opts.localPeerId;
    this.remotePeerId = opts.remotePeerId;
    this.send = opts.send;
  }

  /** Build an offer, set it as local description, and send it. */
  async makeOffer(): Promise<void> {
    try {
      this.makingOffer = true;
      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);
      await this.send({
        type: "sdp",
        from: this.localPeerId,
        to: this.remotePeerId,
        sdp: { type: "offer", sdp: offer.sdp ?? "" },
      });
    } finally {
      this.makingOffer = false;
    }
  }

  /** Handle an inbound SDP (offer or answer). */
  async handleSdp(sdp: { type: "offer" | "answer"; sdp: string }): Promise<void> {
    const offerCollision =
      sdp.type === "offer" && (this.makingOffer || this.pc.signalingState !== "stable");

    if (offerCollision && !this.polite) {
      // Impolite peer ignores the incoming offer; its own offer wins.
      return;
    }

    await this.pc.setRemoteDescription({ type: sdp.type, sdp: sdp.sdp });

    if (sdp.type === "offer") {
      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);
      await this.send({
        type: "sdp",
        from: this.localPeerId,
        to: this.remotePeerId,
        sdp: { type: "answer", sdp: answer.sdp ?? "" },
      });
    }
  }

  /** Handle an inbound ICE candidate (or end-of-candidates marker). */
  async handleIce(candidate: RTCIceCandidateInit | null): Promise<void> {
    if (candidate === null) return;
    await this.pc.addIceCandidate(candidate);
  }
}

/**
 * Declarative factory for {@link Negotiator}.
 *
 * ```ts
 * const negotiator = defineNegotiator({ pc, polite: true, localPeerId, remotePeerId, send });
 * await negotiator.makeOffer();
 * ```
 */
export function defineNegotiator(opts: NegotiatorOptions): Negotiator {
  return new Negotiator(opts);
}
