export type StationId = 'A' | 'B' | 'C' | 'D';
export type TownId = 'town-shiokou' | 'town-aokawa' | 'town-kaede';
export type Point = readonly [number, number, number];
export const MAP = { id: 'coastal-valley', version: 1, seed: 72103 } as const;
export const TOWNS = [
  { id: 'town-shiokou', name: '汐港', subtitle: '海风始发的地方', kind: '港口主镇', position: [-53, 2, 9] as Point, color: '#c48754', population: 680 },
  { id: 'town-aokawa', name: '青溪', subtitle: '溪流与稻田之间', kind: '沿河居民镇', position: [-9, 2, -20] as Point, color: '#6d916c', population: 420 },
  { id: 'town-kaede', name: '枫泉', subtitle: '山谷深处的温暖', kind: '山间温泉乡', position: [58, 2, -24] as Point, color: '#b46f59', population: 180 },
] as const;
export const STATIONS = [
  { id: 'A', name: '汐港站', townId: 'town-shiokou', position: [-51, 2.2, 29] as Point, unlocked: true, optional: false, berths: 1, description: '面朝海湾的始发站。连接港口与主镇，让第一班地方列车从这里出发。' },
  { id: 'B', name: '青溪站', townId: 'town-aokawa', position: [-12, 2.2, 2] as Point, unlocked: true, optional: false, berths: 2, description: '居民镇的生活入口。预留两个会让泊位，为未来的双车交会做好准备。' },
  { id: 'D', name: '枫泉站', townId: 'town-kaede', position: [58, 2.2, -6] as Point, unlocked: false, optional: false, berths: 1, description: '山谷里的温泉小镇。将在第 7 阶段开放旅游支线，与 A—B 共用主线。' },
  { id: 'C', name: '河谷观景站', townId: null, position: [35, 2.2, 21] as Point, unlocked: false, optional: true, berths: 1, description: '可选的河谷观景支线。核心运营完成后，再考虑把列车开往这里。' },
] as const;
export const CANDIDATE_NODES = [
  { id: 'node-a', position: STATIONS[0].position },
  { id: 'node-coast', position: [-36, 2.2, 18] as Point },
  { id: 'node-valley', position: [-23, 2.2, 9] as Point },
  { id: 'node-b', position: STATIONS[1].position },
  { id: 'node-river', position: [13, 2.2, -4] as Point },
  { id: 'node-forest', position: [35, 2.2, -9] as Point },
  { id: 'node-d', position: STATIONS[2].position },
] as const;
export function seededRandom(seed: number) {
  let value = seed >>> 0;
  return () => { value = (1664525 * value + 1013904223) >>> 0; return value / 4294967296; };
}
