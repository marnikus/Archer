// "Inertialization": makes every state switch smooth without slowing the normal animation down.
//
// The animator builds its target pose from many discrete layers (gait, idle, bow, weapon, sit, ...). When a layer switches
// the raw target can jump (e.g. walking -> standing) and, with plain exponential smoothing, the joint starts moving at
// full speed in a single frame (a "pop"). Here every channel watches its own raw target; when the target's acceleration
// spikes (a jump or a velocity break) the jump is absorbed in an offset that keeps position AND velocity continuous and
// then fades to zero along a quintic curve (zero acceleration at both ends = ease-in / ease-out, no sharp start).
// While the raw target is smooth the offset is zero, so steady animation (walk cycles, breathing, ...) is untouched.

interface Ch {
  r: number; // previous raw (unwrapped for angles)
  rw: number; // previous raw as given (for unwrapping)
  rv: number; // previous raw velocity (units/s)
  y: number; // previous output
  yv: number; // previous output velocity
  off0: number;
  ov0: number;
  T: number;
  t: number;
  n: number;
}

const TAU = Math.PI * 2;

export class Inertia {
  private ch = new Map<string, Ch>();

  /**
   * @param thr   acceleration (units/s²) above which the raw target counts as a jump / velocity break
   * @param unit  a "big" jump for this channel (rad or px): bigger jumps take longer to fade
   * @param angle treat the value as an angle (shortest-way unwrapping)
   */
  apply(key: string, raw: number, dt: number, thr: number, unit: number, angle = false): number {
    let c = this.ch.get(key);
    if (!c) {
      c = { r: raw, rw: raw, rv: 0, y: raw, yv: 0, off0: 0, ov0: 0, T: 1, t: 1, n: 0 };
      this.ch.set(key, c);
      return raw;
    }
    if (dt <= 1e-5) return c.y;
    let r = raw;
    if (angle) {
      let d = (raw - c.rw) % TAU;
      if (d > Math.PI) d -= TAU;
      else if (d < -Math.PI) d += TAU;
      r = c.r + d;
    }
    const rv = (r - c.r) / dt;
    const acc = (rv - c.rv) / dt;
    if (c.n > 1 && Math.abs(acc) > thr) {
      // absorb: continue the previous output velocity, fade the difference out
      c.off0 = c.y + c.yv * dt - r;
      c.ov0 = c.yv - rv;
      c.T = 0.3 + 0.12 * Math.min(Math.abs(c.off0) / unit, 3);
      c.t = -dt; // this frame is evaluated at s = 0 (output continues the previous velocity exactly)
    }
    c.n++;
    let off = 0;
    if (c.t < c.T) {
      c.t += dt;
      const s = Math.min(1, c.t / c.T);
      const s2 = s * s;
      const s3 = s2 * s;
      const s4 = s3 * s;
      const s5 = s4 * s;
      const h0 = 1 - 10 * s3 + 15 * s4 - 6 * s5;
      const h1 = s - 6 * s3 + 8 * s4 - 3 * s5;
      off = c.off0 * h0 + c.ov0 * c.T * h1;
    }
    const y = r + off;
    c.yv = (y - c.y) / dt;
    c.y = y;
    c.r = r;
    c.rw = raw;
    c.rv = rv;
    return y;
  }

  reset() {
    this.ch.clear();
  }
}
