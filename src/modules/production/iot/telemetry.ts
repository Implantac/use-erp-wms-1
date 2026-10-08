export interface MachTelemetry {
  temperature: number;
  vibration: number;
  power: number;
  rpm: number;
  connected: boolean;
  healthScore: number;
  mtbf: number;
  mttr: number;
  predictiveAlert: string | null;
  energyEfficiency: number;
  hoursToMaintenance: number;
}

export interface HistoricalPoint {
  time: string;
  avgTemp: number;
  avgPower: number;
  totalPower: number;
  avgVibration: number;
  machinesRunning: number;
  avgHealth: number;
}

export function getHealthColor(score: number) {
  if (score >= 80) return 'text-success';
  if (score >= 50) return 'text-warning';
  return 'text-destructive';
}

