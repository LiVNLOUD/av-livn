// V2.4: the method card shared by the plan, the spot card and Sahadayım — primary and secondary method with their
// evidence-typed reasons, the rig scene (Nasıl bağlanır? / Nasıl kullanılır?), tap-to-name parts and the change ladder.
import { BAIT_TR, LADDER_MINUTES, SINK_NOTE, type MethodAdvice, type MethodId, type MethodPick, type ReasonKind } from '@av-livn/scoring';
import { rigScene, sinkerFor, type RigOptions } from './rigscene';

const KIND_TR: Record<ReasonKind, string> = { kosul: 'koşul', literatur: 'literatür', saha: 'saha gözlemi', hipotez: 'hipotez', varsayim: 'varsayım', envanter: 'envanter' };
const LADDER_KEY = 'av-livn-ladder-min';
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

/** V2.9: 'saha' only when the spot's depth component comes from an approved field depth (score source 'saha'). */
export function depthSourceOf(d: unknown): 'saha' | 'tahmin' {
  const comps = (d as { packed?: { meta?: { comps?: unknown[][] } } | null } | null)?.packed?.meta?.comps;
  const c = Array.isArray(comps) ? comps.find((x) => Array.isArray(x) && x[0] === 'derinlik') : undefined;
  return c && c[4] === 'saha' ? 'saha' : 'tahmin';
}

export const methodLine = (m: MethodPick) => `${m.name}${m.bait ? ` (${BAIT_TR[m.bait]})` : ''}`;

export function ladderMinutes(): number {
  try { const v = Number(localStorage.getItem(LADDER_KEY)); return v >= 5 && v <= 60 ? v : LADDER_MINUTES; } catch { return LADDER_MINUTES; }
}

export interface CardInput {
  advice: MethodAdvice;
  /** Sizes for the artificial methods from the tackle engine (jig g, lure cm, colour). */
  lure: Pick<RigOptions, 'jigG' | 'lureCm' | 'color' | 'hookNo'>;
  depthM: number;
  currentMs: number | null;
  /** Big drawing for Sahadayım. */
  big?: boolean;
}

/** Renders the card into el; returns a setter for the chosen method (Sahadayım uses it when the method changes). */
export function mountMethodCard(el: HTMLElement, c: CardInput): { show(id: MethodId): void } {
  const { advice } = c;
  const picks = [advice.primary, advice.secondary];
  let cur: MethodPick = advice.primary;
  let view: 'bagla' | 'kullan' = 'bagla';
  const sinkerG = sinkerFor(c.depthM, c.currentMs);
  const draw = () => {
    const scene = rigScene(cur.id, view, { ...c.lure, bait: cur.bait, sinkerG });
    const reasons = cur.reasons.map((r) => `<li><span class="mk mk-${r.kind}">${KIND_TR[r.kind]}</span> ${esc(r.text)}</li>`).join('');
    const min = ladderMinutes();
    el.innerHTML = `
      <div class="mc-pick" role="tablist" aria-label="Yöntem">${picks.map((p, i) => `<button type="button" role="tab" class="mc-tab" data-m="${p.id}" aria-selected="${p.id === cur.id}">${i === 0 ? 'Birincil' : 'İkincil'}: ${esc(methodLine(p))}${p.owned === false ? ' <span class="mk mk-envanter">elinde yok</span>' : ''}</button>`).join('')}</div>
      <ul class="mc-why">${reasons}</ul>
      <div class="mc-view" role="tablist" aria-label="Görünüm"><button type="button" role="tab" data-v="bagla" aria-selected="${view === 'bagla'}">Nasıl bağlanır?</button><button type="button" role="tab" data-v="kullan" aria-selected="${view === 'kullan'}">Nasıl kullanılır?</button></div>
      <div class="mc-scene${c.big ? ' big' : ''}">${scene.svg}<p class="mc-part" aria-live="polite">${view === 'bagla' ? 'Bir parçaya dokunun: adı ve ölçüsü burada.' : scene.steps.map((s, i) => `${i + 1}. ${esc(s)}`).join(' · ')}</p></div>
      ${scene.colorNote ? `<p class="mc-note">${esc(scene.colorNote)}</p>` : ''}
      <p class="mc-note">${esc(SINK_NOTE)} ${esc(advice.note)}</p>
      <details class="mc-ladder"><summary>Sonuç alınamazsa: kontrollü değişiklik (her adımda tek değişken)</summary>
        <p class="mc-note"><label>Adım süresi <input type="number" min="5" max="60" step="5" value="${min}" class="mc-min" aria-label="Adım süresi (dakika)"> dk</label> <span class="mk mk-varsayim">saha rehberi</span> bilimsel eşik değildir.</p>
        <ol>${advice.ladder.map((s) => `<li><b>${esc(s.change)}:</b> ${esc(s.detail)}</li>`).join('')}</ol></details>`;
    el.querySelectorAll<HTMLButtonElement>('.mc-tab').forEach((b) => b.addEventListener('click', () => { cur = picks.find((p) => p.id === b.dataset.m) ?? cur; draw(); }));
    el.querySelectorAll<HTMLButtonElement>('.mc-view button').forEach((b) => b.addEventListener('click', () => { view = b.dataset.v as typeof view; draw(); }));
    const label = el.querySelector<HTMLElement>('.mc-part')!;
    el.querySelectorAll<SVGGElement>('.rs-part').forEach((g) => {
      const say = () => { label.textContent = g.getAttribute('aria-label') ?? ''; el.querySelectorAll('.rs-part.on').forEach((x) => x.classList.remove('on')); g.classList.add('on'); };
      g.addEventListener('click', say);
      g.addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Enter' || (e as KeyboardEvent).key === ' ') { e.preventDefault(); say(); } });
    });
    el.querySelector<HTMLInputElement>('.mc-min')?.addEventListener('change', (e) => {
      const v = Number((e.target as HTMLInputElement).value);
      try { if (v >= 5 && v <= 60) localStorage.setItem(LADDER_KEY, String(v)); } catch {}
    });
  };
  draw();
  return { show(id) { const p = advice.ranked.find((m) => m.id === id); if (p) { cur = p; if (!picks.includes(p)) picks[1] = p; draw(); } } };
}
