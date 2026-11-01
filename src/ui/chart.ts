/** Interactive elevation profile (uPlot) synchronised with the map. */
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import type { RouteAnalysis } from '../core/analysis';
import { KIND_COLORS } from './map';

export interface ProfileChart {
  setAnalysis(a: RouteAnalysis | null): void;
  setCursor(index: number): void;
  highlightRange(i: number, j: number): void;
  onHover(fn: (index: number) => void): void;
  destroy(): void;
}

export function createProfileChart(container: HTMLElement): ProfileChart {
  let plot: uPlot | null = null;
  let current: RouteAnalysis | null = null;
  let range: [number, number] | null = null;
  const hoverHandlers: ((i: number) => void)[] = [];

  const build = (): void => {
    plot?.destroy();
    plot = null;
    container.innerHTML = '';
    if (!current || current.points.length < 2) {
      container.innerHTML = '<p class="muted">Aucun tracé.</p>';
      return;
    }
    const a = current;
    const xs = a.points.map((p) => p.d / 1000);
    const ys = a.eles.map((e) => (Number.isFinite(e) ? e : null));
    const width = container.clientWidth || 360;
    const opts: uPlot.Options = {
      width,
      height: 150,
      cursor: { x: true, y: false, drag: { x: false, y: false } },
      legend: { show: false },
      scales: { x: { time: false } },
      axes: [
        { label: '', values: (_u, vals) => vals.map((v) => `${v} km`), size: 24, font: '10px sans-serif' },
        { size: 36, font: '10px sans-serif', values: (_u, vals) => vals.map((v) => `${v}`) },
      ],
      series: [{}, { stroke: '#1d3557', width: 1.5, fill: 'rgba(29,53,87,0.08)', points: { show: false } }],
      hooks: {
        setCursor: [
          (u) => {
            const idx = u.cursor.idx;
            if (idx != null) for (const h of hoverHandlers) h(idx);
          },
        ],
        draw: [
          (u) => {
            // Colour bands by segment kind under the curve + highlighted climb.
            const ctx = u.ctx;
            const { top, height } = u.bbox;
            ctx.save();
            for (const s of a.merged) {
              const x0 = u.valToPos(xs[s.i]!, 'x', true);
              const x1 = u.valToPos(xs[s.j]!, 'x', true);
              ctx.fillStyle = KIND_COLORS[s.kind];
              ctx.globalAlpha = s.kind === 'stairs_up' || s.kind === 'stairs_down' ? 0.45 : 0.22;
              ctx.fillRect(x0, top, Math.max(1, x1 - x0), height);
            }
            if (range) {
              const x0 = u.valToPos(xs[range[0]]!, 'x', true);
              const x1 = u.valToPos(xs[range[1]]!, 'x', true);
              ctx.globalAlpha = 0.35;
              ctx.fillStyle = '#ffd60a';
              ctx.fillRect(x0, top, Math.max(2, x1 - x0), height);
            }
            ctx.restore();
          },
        ],
      },
    };
    plot = new uPlot(opts, [xs, ys], container);
  };

  const ro = new ResizeObserver(() => {
    if (plot && container.clientWidth > 0) plot.setSize({ width: container.clientWidth, height: 150 });
  });
  ro.observe(container);

  return {
    setAnalysis(a) {
      current = a;
      range = null;
      build();
    },
    setCursor(index) {
      if (!plot || index < 0) return;
      plot.setCursor({ left: plot.valToPos(plot.data[0]![index]!, 'x'), top: 10 });
    },
    highlightRange(i, j) {
      range = i >= 0 && j > i ? [i, j] : null;
      plot?.redraw();
    },
    onHover(fn) {
      hoverHandlers.push(fn);
    },
    destroy() {
      ro.disconnect();
      plot?.destroy();
    },
  };
}
