export const CONFIG = {
  initialFunds: 100_000,
  stationCosts: { A: 8_000, B: 8_000, D: 8_000, C: 8_000 },
  trackCosts: { AB: 12_000, BD: 8_000, BC: 6_000 },
  vehicles: {
    light: { price: 22_000, capacity: 24, dailyCost: 600, mileageFactor: 1 },
    large: { price: 38_000, capacity: 48, dailyCost: 1_000, mileageFactor: 1.6 },
  },
  fare: { base: 20, min: 10, max: 30 },
  demandAB: 360, patienceMinutes: 240, demolitionRefund: 0.5, vehicleRefund: 0.6,
  maintenance: { stationDaily: 80, trackPerSegmentDaily: 30 },
  clock: { stepSeconds: 0.05, minutesPerSecond: 2, dayMinutes: 1_440, startMinutes: 480 },
  journey: { abMinutes: 90, dwellMinutes: 10 },
  camera: { minDistance: 50, maxDistance: 285, minPolar: 0.24, maxPolar: 1.1, targetX: 95, targetZ: 70 },
} as const;
