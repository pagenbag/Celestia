import { Upgrade } from './types';

export const INITIAL_RESOURCES = {
  starlight: 0,
  data: 0,
  focus: 100,
};

export const MAX_FOCUS_BASE = 100;
export const FOCUS_REGEN_BASE = 1; // per tick
export const STARLIGHT_PASSIVE_BASE = 0;
export const BASE_GAZE_COOLDOWN_MS = 800; // Milliseconds between clicks allowed
export const SAVE_KEY = 'celestia_save_v1';

export const UPGRADES: Upgrade[] = [
  {
    id: 'lens_polishing',
    name: 'Lens Polishing',
    description: 'Improves light gathering efficiency per gaze.',
    baseCost: 15,
    costMultiplier: 1.5,
    level: 0,
    maxLevel: 50,
    type: 'lens',
    effect: (lvl) => `+${lvl} Starlight per gaze`,
  },
  {
    id: 'optical_servos',
    name: 'Optical Servos',
    description: 'Increases the observation speed (Gaze Rate).',
    baseCost: 100,
    costMultiplier: 1.4,
    level: 0,
    maxLevel: 30,
    type: 'lens',
    effect: (lvl) => `-${Math.floor((1 - Math.pow(0.9, lvl)) * 100)}% Cooldown`,
  },
  {
    id: 'sensor_array',
    name: 'Sensor Array',
    description: 'Passively gathers starlight over time.',
    baseCost: 50,
    costMultiplier: 1.4,
    level: 0,
    maxLevel: 20,
    type: 'sensor',
    effect: (lvl) => `+${lvl * 0.5}/s Starlight generation`,
  },
  {
    id: 'focus_condenser',
    name: 'Focus Condenser',
    description: 'Increases maximum focus capacity.',
    baseCost: 100,
    costMultiplier: 1.6,
    level: 0,
    maxLevel: 10,
    type: 'battery',
    effect: (lvl) => `+${lvl * 50} Max Focus`,
  },
  {
    id: 'stabilizers',
    name: 'Gravimetric Stabilizers',
    description: 'Improves focus regeneration rate.',
    baseCost: 300,
    costMultiplier: 1.7,
    level: 0,
    maxLevel: 10,
    type: 'battery',
    effect: (lvl) => `+${lvl} Focus/tick`
  },
  {
    id: 'scan_matrix',
    name: 'Deep Scan Matrix',
    description: 'Reduces time required for deep space scans.',
    baseCost: 500,
    costMultiplier: 2.0,
    level: 0,
    maxLevel: 5,
    type: 'processor',
    effect: (lvl) => `-${lvl * 15}% Scan Time`
  },
  {
    id: 'quantum_processor',
    name: 'Quantum Processor',
    description: 'Reduces data cost for deep analysis.',
    baseCost: 200,
    costMultiplier: 1.8,
    level: 0,
    maxLevel: 5,
    type: 'processor',
    effect: (lvl) => `-${lvl * 10}% Analysis Cost`,
  },
];