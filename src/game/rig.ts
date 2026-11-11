/** Shared pose geometry for the renderer and the rig inspector. Coordinates are SVG units. */
export type Gait = 'idle' | 'walk' | 'run';
export interface Point { x: number; y: number }
export interface Leg { hip: Point; knee: Point; ankle: Point; toe: Point; lifted: boolean }

export function legRig(phase: number, gait: Gait, bob: number): Leg[] {
  return [420, 538].map((x, i) => {
    const cycle = phase + i * Math.PI;
    const stride = gait === 'run' ? 52 : gait === 'walk' ? 34 : 0;
    const lift = gait === 'run' ? 30 : gait === 'walk' ? 17 : 0;
    // The foot travels back during contact and rises only on the return stroke.
    const swing = Math.sin(cycle);
    const raised = gait === 'idle' ? 0 : Math.max(0, Math.cos(cycle));
    const hip = { x, y: 582 - bob };
    const ankle = { x: x - swing * stride, y: 622 - raised * lift };
    const knee = { x: (hip.x + ankle.x) / 2 + 9 + raised * (gait === 'run' ? 17 : 9), y: (hip.y + ankle.y) / 2 - raised * 5 };
    return { hip, knee, ankle, toe: { x: ankle.x - 21, y: ankle.y + 8 }, lifted: raised > 0.01 };
  });
}
