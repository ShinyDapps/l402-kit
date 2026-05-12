export type SignalStrength = "hot" | "warm" | "cold";
export type Persona = "human" | "agent";

export type QueueKey =
  | "verity_radar:pending:human:hot"
  | "verity_radar:pending:human:warm"
  | "verity_radar:pending:agent:hot"
  | "verity_radar:pending:agent:warm";

export interface Lead {
  url: string;
  title: string;
  snippet: string;
  score: number;
  signal: SignalStrength;
  persona: Persona;
  framework?: string;
  foundAt: string;
  expiresAt: number;
}

export interface PartnerEntry {
  url: string;
  reliability: number;
  consecutiveFailures: number;
  unreliable: boolean;
  lastValidated: string;
}

export interface EcosystemReport {
  anomalies: string[];
  timestamp: string;
}

export interface SynthesisReport {
  timestamp: string;
  rings: {
    buyers:      { total: number; hot: number; warm: number };
    ecosystem:   EcosystemReport;
    competitors: unknown[];
    partners:    number;
  };
  topBuyers: Lead[];
  summary: {
    totalBuyers: number;
    hotBuyers:   number;
    hasAnomalies: boolean;
    newCompetitors: number;
  };
}
