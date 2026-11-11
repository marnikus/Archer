// Generic, data-driven draw-order ("layer") system for characters.
//
// HOW TO ADD A NEW CHARACTER
//   1. describe its parts + default back→front orders and call registerCharacterLayers({...})
//   2. in its renderer build `{ partId: () => draw… }` and call drawLayered(ctx, id, context, parts)
//   3. (optional) registerPreview(id, fn) so the Settings → Layers editor can show it live
// The editor, saving, import/export and the dev preset file then work for it automatically.
//
// Orders are stored BACK → FRONT. The editor shows the front-most part at the top.
import filePreset from '../game/layerPreset.json';

export interface PartDef {
  id: string;
  label: string;
}
export interface ContextDef {
  id: string;
  label: string;
  hint: string;
}
export interface ScenarioDef {
  id: string;
  label: string;
  context: string; // which context this pose normally draws with
}
export interface CharacterLayers {
  id: string;
  name: string;
  parts: PartDef[];
  /** Different situations can have different orders (e.g. front arm hanging vs. in use). */
  contexts: ContextDef[];
  defaults: Record<string, string[]>;
  scenarios?: ScenarioDef[];
}
export type PreviewFn = (ctx: CanvasRenderingContext2D, scenario: string, dt: number) => void;
export type Preset = Record<string, Record<string, string[]>>;
export type SaveStatus = 'idle' | 'saved-local' | 'saved-file' | 'error';

const defs = new Map<string, CharacterLayers>();
const previews = new Map<string, PreviewFn>();

export function registerCharacterLayers(def: CharacterLayers) {
  defs.set(def.id, def);
  layerStore.invalidate();
}
export function registerPreview(id: string, fn: PreviewFn) {
  previews.set(id, fn);
}
export const listCharacters = () => Array.from(defs.values());
export const getCharacter = (id: string) => defs.get(id);
export const getPreview = (id: string) => previews.get(id);

/** Keep only known, unique ids; put parts the saved order does not know about at their default spot. */
function reconcile(def: CharacterLayers, ctxId: string, saved: string[] | undefined): string[] {
  const dflt = def.defaults[ctxId] ?? def.parts.map((p) => p.id);
  const known = new Set(def.parts.map((p) => p.id));
  const out: string[] = [];
  for (const id of saved ?? []) if (known.has(id) && !out.includes(id)) out.push(id);
  if (!saved) return dflt.filter((id) => known.has(id));
  for (let i = 0; i < dflt.length; i++) {
    const id = dflt[i];
    if (!known.has(id) || out.includes(id)) continue;
    // insert after the nearest preceding default part that is already placed
    let at = 0;
    for (let j = i - 1; j >= 0; j--) {
      const k = out.indexOf(dflt[j]);
      if (k >= 0) {
        at = k + 1;
        break;
      }
    }
    out.splice(at, 0, id);
  }
  return out;
}

function sanitize(raw: unknown): Preset {
  const out: Preset = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [cid, ctxs] of Object.entries(raw as Record<string, unknown>)) {
    if (!ctxs || typeof ctxs !== 'object') continue;
    for (const [ctxId, order] of Object.entries(ctxs as Record<string, unknown>)) {
      if (Array.isArray(order) && order.every((x) => typeof x === 'string')) (out[cid] ??= {})[ctxId] = order as string[];
    }
  }
  return out;
}

const LS_KEY = 'archer.layers.v1';

class LayerStore {
  /** Edits made by the user in this browser (persisted in localStorage). */
  private local: Preset = {};
  /** The project's shipped preset (src/game/layerPreset.json, written by the dev server). */
  private file: Preset = sanitize(filePreset);
  private cache = new Map<string, string[]>();
  private listeners = new Set<() => void>();
  status: SaveStatus = 'idle';
  /** Editor hover: draw every other part faded so the hovered one stands out. */
  highlight: { char: string; part: string } | null = null;
  /** Context the last drawLayered() call used, per character (for the editor). */
  lastContext = new Map<string, string>();

  constructor() {
    try {
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(LS_KEY) : null;
      if (raw) this.local = sanitize(JSON.parse(raw));
    } catch {
      /* ignore corrupt storage */
    }
  }

  invalidate() {
    this.cache.clear();
  }

  order(charId: string, ctxId: string): string[] {
    const key = charId + '/' + ctxId;
    let o = this.cache.get(key);
    if (!o) {
      const def = defs.get(charId);
      if (!def) return [];
      o = reconcile(def, ctxId, this.local[charId]?.[ctxId] ?? this.file[charId]?.[ctxId]);
      this.cache.set(key, o);
    }
    return o;
  }

  isCustom(charId: string, ctxId: string) {
    const def = defs.get(charId);
    if (!def) return false;
    const a = this.order(charId, ctxId);
    const b = reconcile(def, ctxId, undefined);
    return a.length !== b.length || a.some((id, i) => id !== b[i]);
  }

  set(charId: string, ctxId: string, order: string[]) {
    (this.local[charId] ??= {})[ctxId] = order.slice();
    this.cache.delete(charId + '/' + ctxId);
    this.persist();
  }

  reset(charId: string, ctxId?: string) {
    const def = defs.get(charId);
    if (!def) return;
    for (const c of ctxId ? [ctxId] : def.contexts.map((x) => x.id)) {
      (this.local[charId] ??= {})[c] = reconcile(def, c, undefined);
    }
    this.invalidate();
    this.persist();
  }

  /** The full effective preset (every registered character and context). */
  snapshot(): Preset {
    const out: Preset = {};
    for (const def of defs.values()) {
      for (const c of def.contexts) (out[def.id] ??= {})[c.id] = this.order(def.id, c.id).slice();
    }
    return out;
  }

  exportJson() {
    return JSON.stringify(this.snapshot(), null, 2) + '\n';
  }

  importJson(text: string): boolean {
    try {
      const p = sanitize(JSON.parse(text));
      if (!Object.keys(p).length) return false;
      this.local = p;
      this.invalidate();
      this.persist();
      return true;
    } catch {
      return false;
    }
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private emit() {
    for (const l of this.listeners) l();
  }

  private persist() {
    const json = this.exportJson();
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(this.snapshot()));
      this.status = 'saved-local';
    } catch {
      this.status = 'error';
    }
    this.emit();
    // dev server: also write the project preset file so it ships with the game
    const dev = (import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV;
    if (dev && typeof fetch !== 'undefined') {
      fetch('/__layers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: json })
        .then((r) => {
          this.status = r.ok ? 'saved-file' : 'saved-local';
          this.emit();
        })
        .catch(() => {
          /* keep the local-save status */
        });
    }
  }
}

export const layerStore = new LayerStore();

/** Draw `parts` in the user's (or default) order for this character + context. */
export function drawLayered(ctx: CanvasRenderingContext2D, charId: string, ctxId: string, parts: Record<string, () => void>) {
  layerStore.lastContext.set(charId, ctxId);
  const hl = layerStore.highlight && layerStore.highlight.char === charId ? layerStore.highlight.part : null;
  for (const id of layerStore.order(charId, ctxId)) {
    const draw = parts[id];
    if (!draw) continue;
    if (hl && id !== hl) {
      ctx.save();
      ctx.globalAlpha *= 0.22;
      draw();
      ctx.restore();
    } else draw();
  }
}
