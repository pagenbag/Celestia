export enum CelestialType {
  STAR = 'STAR',
  NEBULA = 'NEBULA',
  BLACK_HOLE = 'BLACK_HOLE',
  GALAXY = 'GALAXY',
  ANOMALY = 'ANOMALY'
}

export interface CelestialBody {
  id: string;
  name: string;
  type: CelestialType;
  description: string;
  distanceLightYears: number;
  spectralClass?: string;
  temperatureK?: number;
  coordinates: { x: number; y: number }; // Normalized 0-1000
  color: string; // Hex
  discoveryDate: number;
  analyzed: boolean;
}

export interface GameResources {
  starlight: number; // Currency for upgrades
  data: number; // Currency for analysis
  focus: number; // Energy for scanning
}

export interface Upgrade {
  id: string;
  name: string;
  description: string;
  baseCost: number;
  costMultiplier: number;
  level: number;
  maxLevel: number;
  effect: (level: number) => string;
  type: 'lens' | 'sensor' | 'processor' | 'battery';
}

export interface LogEntry {
  id: string;
  timestamp: number;
  message: string;
  type: 'info' | 'discovery' | 'upgrade' | 'warning';
}
