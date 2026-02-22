import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { telemetry } from '../observability/index.js';

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

export interface ICECandidateMetrics {
  candidateId: string;
  candidateType: 'host' | 'srflx' | 'prflx' | 'relay';
  priority: number;
  foundation: string;
  protocol: 'udp' | 'tcp';
  ipAddress: string;
  port: number;
  relatedAddress?: string;
  relatedPort?: number;
  tcpType?: string;
  collectedAt: number;
}

export interface NetworkQualityMetrics {
  rtt: number; // Round trip time in ms
  packetLoss: number; // Percentage 0-100
  jitter: number; // Jitter in ms
  bandwidth: number; // Available bandwidth in bps
  quality: 'excellent' | 'good' | 'fair' | 'poor' | 'unknown';
  timestamp: number;
}

export interface ICEConnectionDiagnostics {
  connectionId: string;
  status: 'checking' | 'connected' | 'failed' | 'disconnected';
  selectedCandidatePair: {
    local: ICECandidateMetrics;
    remote: ICECandidateMetrics;
  } | null;
  hostCandidates: ICECandidateMetrics[];
  srflxCandidates: ICECandidateMetrics[];
  prflxCandidates: ICECandidateMetrics[];
  relayCandidates: ICECandidateMetrics[];
  networkQuality: NetworkQualityMetrics | null;
  timestamp: number;
}

// ═══════════════════════════════════════════════════════════
// ICE MANAGER
// ═══════════════════════════════════════════════════════════

export class ICEManager extends EventEmitter {
  private iceId: string = uuidv4();
  private peerConnection: RTCPeerConnection;
  private candidateMetrics: Map<string, ICECandidateMetrics> = new Map();
  private statsMonitorInterval: NodeJS.Timeout | null = null;
  private qualityCheckInterval: NodeJS.Timeout | null = null;
  private selectedCandidatePair: {
    local: ICECandidateMetrics;
    remote: ICECandidateMetrics;
  } | null = null;
  private connectionQuality: NetworkQualityMetrics | null = null;
  private candidateCollection: {
    hostCandidates: ICECandidateMetrics[];
    srflxCandidates: ICECandidateMetrics[];
    prflxCandidates: ICECandidateMetrics[];
    relayCandidates: ICECandidateMetrics[];
  } = {
      hostCandidates: [],
      srflxCandidates: [],
      prflxCandidates: [],
      relayCandidates: [],
    };

  constructor(peerConnection: RTCPeerConnection) {
    super();
    this.peerConnection = peerConnection;

    telemetry.emit('webrtc:ice_manager_created', {
      iceId: this.iceId,
    });
  }

  /**
   * Start monitoring ICE connection
   */
  startMonitoring(): void {
    // Monitor stats every 500ms
    this.statsMonitorInterval = setInterval(() => {
      this.updateCandidateMetrics();
      this.updateConnectionQuality();
    }, 500);

    // Check quality every 5 seconds
    this.qualityCheckInterval = setInterval(() => {
      this.evaluateNetworkQuality();
    }, 5000);

    telemetry.emit('webrtc:ice_monitoring_started', {
      iceId: this.iceId,
    });
  }

  /**
   * Stop monitoring ICE connection
   */
  stopMonitoring(): void {
    if (this.statsMonitorInterval) {
      clearInterval(this.statsMonitorInterval);
    }

    if (this.qualityCheckInterval) {
      clearInterval(this.qualityCheckInterval);
    }

    telemetry.emit('webrtc:ice_monitoring_stopped', {
      iceId: this.iceId,
    });
  }

  /**
   * Process ICE candidate
   */
  processCandidateString(candidateString: string): ICECandidateMetrics | null {
    try {
      const metrics = this.parseCandidateString(candidateString);
      if (metrics) {
        this.candidateMetrics.set(metrics.candidateId, metrics);
        this.categorizeCandidate(metrics);

        telemetry.emit('webrtc:ice_candidate_processed', {
          iceId: this.iceId,
          candidateId: metrics.candidateId,
          type: metrics.candidateType,
          priority: metrics.priority,
        });

        return metrics;
      }
    } catch (error) {
      telemetry.emit('webrtc:ice_candidate_parse_error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        iceId: this.iceId,
      });
    }

    return null;
  }

  /**
   * Get network quality assessment
   */
  getNetworkQuality(): NetworkQualityMetrics | null {
    return this.connectionQuality;
  }

  /**
   * Get ICE diagnostics
   */
  getDiagnostics(): ICEConnectionDiagnostics {
    return {
      connectionId: this.iceId,
      status: this.getConnectionStatus(),
      selectedCandidatePair: this.selectedCandidatePair,
      hostCandidates: this.candidateCollection.hostCandidates,
      srflxCandidates: this.candidateCollection.srflxCandidates,
      prflxCandidates: this.candidateCollection.prflxCandidates,
      relayCandidates: this.candidateCollection.relayCandidates,
      networkQuality: this.connectionQuality,
      timestamp: Date.now(),
    };
  }

  /**
   * Get all collected candidates
   */
  getAllCandidates(): ICECandidateMetrics[] {
    return Array.from(this.candidateMetrics.values());
  }

  /**
   * Get candidate by type
   */
  getCandidatesByType(
    type: 'host' | 'srflx' | 'prflx' | 'relay'
  ): ICECandidateMetrics[] {
    return Array.from(this.candidateMetrics.values()).filter(
      (c) => c.candidateType === type
    );
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ═══════════════════════════════════════════════════════════

  private parseCandidateString(candidateString: string): ICECandidateMetrics | null {
    try {
      // Format: candidate:foundation component priority transport ip port [type prflx|host|srflx|relay ...rest]
      const parts = candidateString.split(' ');
      if (parts.length < 8) {
        return null;
      }

      const foundationIdx = 0;
      const componentIdx = 1;
      const protocolIdx = 2;
      const priorityIdx = 3;
      const ipIdx = 4;
      const portIdx = 5;
      const typeIdx = 7;

      const foundation = parts[foundationIdx].replace('candidate:', '');
      const protocol = parts[protocolIdx].toLowerCase() as 'udp' | 'tcp';
      const priority = parseInt(parts[priorityIdx], 10);
      const ipAddress = parts[ipIdx];
      const port = parseInt(parts[portIdx], 10);

      let candidateType: 'host' | 'srflx' | 'prflx' | 'relay' = 'host';
      if (parts[typeIdx]) {
        const typeStr = parts[typeIdx].toLowerCase();
        if (
          typeStr === 'host' ||
          typeStr === 'srflx' ||
          typeStr === 'prflx' ||
          typeStr === 'relay'
        ) {
          candidateType = typeStr;
        }
      }

      // Parse related address and port for reflexive/relay candidates
      let relatedAddress: string | undefined;
      let relatedPort: number | undefined;
      for (let i = 8; i < parts.length - 1; i++) {
        if (parts[i] === 'raddr') {
          relatedAddress = parts[i + 1];
        }
        if (parts[i] === 'rport') {
          relatedPort = parseInt(parts[i + 1], 10);
        }
      }

      const candidateId = `${foundation}-${componentIdx}-${protocol}-${priority}`;

      return {
        candidateId,
        candidateType,
        priority,
        foundation,
        protocol,
        ipAddress,
        port,
        relatedAddress,
        relatedPort,
        collectedAt: Date.now(),
      };
    } catch (error) {
      telemetry.emit('webrtc:ice_parse_error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        candidateString: candidateString.substring(0, 100),
      });
      return null;
    }
  }

  private categorizeCandidate(metrics: ICECandidateMetrics): void {
    const { candidateType } = metrics;

    switch (candidateType) {
      case 'host':
        this.candidateCollection.hostCandidates.push(metrics);
        break;
      case 'srflx':
        this.candidateCollection.srflxCandidates.push(metrics);
        break;
      case 'prflx':
        this.candidateCollection.prflxCandidates.push(metrics);
        break;
      case 'relay':
        this.candidateCollection.relayCandidates.push(metrics);
        break;
    }
  }

  private async updateCandidateMetrics(): Promise<void> {
    try {
      const stats = await this.peerConnection.getStats();
      const candidatePair = Array.from((stats as any).values()).find(
        (report: any) => report.type === 'candidate-pair' && report.state === 'succeeded'
      ) as any;

      if (candidatePair) {
        // Update selected candidate pair
        const localCandidateId = candidatePair.localCandidateId;
        const remoteCandidateId = candidatePair.remoteCandidateId;

        const localCandidate = Array.from((stats as any).values()).find(
          (report: any) => report.type === 'local-candidate' && report.id === localCandidateId
        );
        const remoteCandidate = Array.from((stats as any).values()).find(
          (report: any) => report.type === 'remote-candidate' && report.id === remoteCandidateId
        );

        if (localCandidate && remoteCandidate) {
          this.selectedCandidatePair = {
            local: this.convertStatsToMetrics(localCandidate, 'local'),
            remote: this.convertStatsToMetrics(remoteCandidate, 'remote'),
          };
        }
      }
    } catch (error) {
      telemetry.emit('webrtc:ice_stats_update_error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        iceId: this.iceId,
      });
    }
  }

  private convertStatsToMetrics(
    statsReport: any,
    direction: 'local' | 'remote'
  ): ICECandidateMetrics {
    const type = statsReport.candidateType as
      | 'host'
      | 'srflx'
      | 'prflx'
      | 'relay';

    return {
      candidateId: `${direction}-${statsReport.id}`,
      candidateType: type || 'host',
      priority: statsReport.priority || 0,
      foundation: statsReport.foundation || '',
      protocol: (statsReport.protocol || 'udp').toLowerCase() as 'udp' | 'tcp',
      ipAddress: statsReport.address || '',
      port: statsReport.port || 0,
      relatedAddress: statsReport.relatedAddress,
      relatedPort: statsReport.relatedPort,
      collectedAt: Date.now(),
    };
  }

  private async updateConnectionQuality(): Promise<void> {
    try {
      const stats = await this.peerConnection.getStats();
      const inboundRtp = Array.from((stats as any).values()).find(
        (report: any) => report.type === 'inbound-rtp'
      ) as any;

      if (inboundRtp) {
        const rtt = inboundRtp.currentRoundTripTime
          ? inboundRtp.currentRoundTripTime * 1000
          : 0;
        const packetsLost = inboundRtp.packetsLost || 0;
        const packetsReceived = inboundRtp.packetsReceived || 0;
        const jitter = inboundRtp.jitter ? inboundRtp.jitter * 1000 : 0;
        const bytesReceived = inboundRtp.bytesReceived || 0;

        const packetLossPercent =
          packetsReceived > 0
            ? (packetsLost / (packetsLost + packetsReceived)) * 100
            : 0;
        const bandwidth = inboundRtp.availableOutgoingBitrate || 0;

        this.connectionQuality = {
          rtt,
          packetLoss: packetLossPercent,
          jitter,
          bandwidth,
          quality: this.assessQuality(
            rtt,
            packetLossPercent,
            jitter,
            bandwidth
          ),
          timestamp: Date.now(),
        };
      }
    } catch (error) {
      telemetry.emit('webrtc:ice_quality_update_error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        iceId: this.iceId,
      });
    }
  }

  private assessQuality(
    rtt: number,
    packetLoss: number,
    jitter: number,
    _bandwidth: number
  ): 'excellent' | 'good' | 'fair' | 'poor' | 'unknown' {
    // Scoring algorithm based on network metrics
    let score = 100;

    // RTT scoring (lower is better)
    if (rtt > 150) score -= 25;
    else if (rtt > 100) score -= 15;
    else if (rtt > 50) score -= 5;

    // Packet loss scoring (lower is better)
    if (packetLoss > 5) score -= 30;
    else if (packetLoss > 2) score -= 20;
    else if (packetLoss > 1) score -= 10;

    // Jitter scoring (lower is better)
    if (jitter > 50) score -= 20;
    else if (jitter > 30) score -= 10;
    else if (jitter > 10) score -= 5;

    if (score >= 90) return 'excellent';
    if (score >= 75) return 'good';
    if (score >= 60) return 'fair';
    if (score >= 40) return 'poor';

    return 'unknown';
  }

  private evaluateNetworkQuality(): void {
    if (this.connectionQuality) {
      telemetry.emit('webrtc:network_quality_evaluated', {
        iceId: this.iceId,
        quality: this.connectionQuality.quality,
        rtt: Math.round(this.connectionQuality.rtt),
        packetLoss: Math.round(this.connectionQuality.packetLoss * 10) / 10,
        jitter: Math.round(this.connectionQuality.jitter),
      });

      this.emit('quality-change', this.connectionQuality);
    }
  }

  private getConnectionStatus(): 'checking' | 'connected' | 'failed' | 'disconnected' {
    const state = this.peerConnection.iceConnectionState;
    switch (state) {
      case 'checking':
        return 'checking';
      case 'connected':
      case 'completed':
        return 'connected';
      case 'failed':
        return 'failed';
      case 'disconnected':
        return 'disconnected';
      default:
        return 'checking';
    }
  }

  /**
   * Get ICE manager ID
   */
  getICEId(): string {
    return this.iceId;
  }
}

// ═══════════════════════════════════════════════════════════
// FACTORY FUNCTION
// ═══════════════════════════════════════════════════════════

export function createICEManager(
  peerConnection: RTCPeerConnection
): ICEManager {
  return new ICEManager(peerConnection);
}
