<script lang="ts">
  import { onDestroy } from 'svelte';
  import { MICROPHONE_ERROR_TEXT, openMicrophone, type Microphone } from '../../lib/audio/microphone';
  import { Rta } from '../../lib/audio/rta';
  import { powerToDb } from '../../lib/core/dsp/levels';
  import { makeBands, octaveAxisTicks, type AxisTick, type BandFraction, type BandLevel } from '../../lib/core/dsp/octaveBands';
  import FormulaBox from '../../lib/ui/FormulaBox.svelte';
  import Segmented from '../../lib/ui/Segmented.svelte';
  import ToggleRow from '../../lib/ui/ToggleRow.svelte';
  import { fmt } from '../../lib/ui/format';
  import { persisted } from '../../lib/ui/persisted.svelte';

  const store = persisted('tool.rta', {
    fraction: 3 as BandFraction,
    speed: 'slow' as 'fast' | 'slow',
    peakHold: true,
    range: 80,
  });
  const s = $derived(store.value);

  let mic: Microphone | undefined;
  let rta: Rta | undefined;
  let running = $state(false);
  let error = $state('');
  let level = $state(-Infinity);
  let canvas = $state<HTMLCanvasElement>();
  let frame = 0;
  let peaks: number[] = [];
  let lastLevelUpdate = 0;
  // last measured spectrum, kept on screen after stopping
  let lastLevels: BandLevel[] | undefined;

  const fractions = [
    { value: 1, label: '1/1' },
    { value: 3, label: '1/3' },
    { value: 6, label: '1/6' },
  ] as const;
  const speeds = [
    { value: 'fast', label: 'Schnell' },
    { value: 'slow', label: 'Langsam' },
  ] as const;

  // Read the settings before `rta?.` – optional chaining would skip the read while idle and the
  // effect would never subscribe to the setting.
  $effect(() => {
    const fraction = s.fraction;
    rta?.setFraction(fraction);
    peaks = [];
  });
  $effect(() => {
    const smoothing = s.speed === 'fast' ? 0.5 : 0.85;
    rta?.setSmoothing(smoothing);
  });
  // While idle the draw loop is not running: show the grid and bands of the selected fraction.
  $effect(() => {
    const fraction = s.fraction;
    void s.range;
    void s.peakHold;
    if (running || !canvas) return;
    const bands = makeBands(fraction);
    const same = lastLevels?.length === bands.length && lastLevels[0]?.band.center === bands[0]?.center;
    const shown = same ? lastLevels : undefined;
    render(shown ?? bands.map((band) => ({ band, power: 0, binsCovered: 1 })));
  });

  async function start() {
    error = '';
    const r = await openMicrophone();
    if (!r.ok) {
      error = MICROPHONE_ERROR_TEXT[r.error];
      return;
    }
    mic = r.mic;
    rta = new Rta(mic.source, s.fraction);
    rta.setSmoothing(s.speed === 'fast' ? 0.5 : 0.85);
    peaks = [];
    running = true;
    frame = requestAnimationFrame(draw);
  }

  function stop() {
    cancelAnimationFrame(frame);
    rta?.dispose();
    mic?.close();
    rta = undefined;
    mic = undefined;
    running = false;
  }

  function draw(t: number) {
    if (!rta || !canvas) return;
    const levels = rta.readBands();
    lastLevels = levels;
    if (t - lastLevelUpdate > 250) {
      level = rta.readLevel();
      lastLevelUpdate = t;
    }
    render(levels);
    frame = requestAnimationFrame(draw);
  }

  function render(levels: BandLevel[]) {
    const c = canvas!;
    const dpr = window.devicePixelRatio || 1;
    const cssW = c.clientWidth;
    const cssH = c.clientHeight;
    if (c.width !== Math.round(cssW * dpr) || c.height !== Math.round(cssH * dpr)) {
      c.width = Math.round(cssW * dpr);
      c.height = Math.round(cssH * dpr);
    }
    const g = c.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const css = getComputedStyle(c);
    const colBar = css.getPropertyValue('--bar').trim();
    const colPeak = css.getPropertyValue('--bar-peak').trim();
    const colGrid = css.getPropertyValue('--line').trim();
    const colText = css.getPropertyValue('--muted').trim();

    const left = 34;
    const bottom = 18;
    const w = cssW - left - 4;
    const h = cssH - bottom - 4;
    const top = 0;
    const rangeDb = s.range;
    const y = (db: number) => 4 + h * Math.min(1, Math.max(0, (top - db) / rangeDb));

    g.clearRect(0, 0, cssW, cssH);
    g.font = '10px ' + getComputedStyle(document.body).fontFamily;
    g.fillStyle = colText;
    g.strokeStyle = colGrid;
    g.lineWidth = 1;
    for (let db = 0; db >= -rangeDb; db -= 10) {
      const yy = Math.round(y(db)) + 0.5;
      g.beginPath();
      g.moveTo(left, yy);
      g.lineTo(left + w, yy);
      g.stroke();
      g.textAlign = 'right';
      g.fillText(String(db), left - 4, yy + 3);
    }

    const n = levels.length;
    const slot = w / n;
    const barW = Math.max(1, slot * 0.8);
    if (peaks.length !== n) peaks = new Array(n).fill(-Infinity);

    levels.forEach((l, i) => {
      const db = powerToDb(l.power); // −∞ for 0
      const x = left + i * slot + (slot - barW) / 2;
      const yy = y(db);
      g.fillStyle = colBar;
      g.globalAlpha = l.binsCovered < 1 ? 0.45 : 1; // below FFT resolution
      g.fillRect(x, yy, barW, 4 + h - yy);
      g.globalAlpha = 1;
      if (s.peakHold) {
        peaks[i] = Math.max(peaks[i] ?? -Infinity, db);
        if (Number.isFinite(peaks[i])) {
          g.fillStyle = colPeak;
          g.fillRect(x, y(peaks[i]!) - 1, barW, 2);
        }
      }
    });

    g.fillStyle = colText;
    g.textAlign = 'center';
    for (const t of axisTicks(levels)) {
      const half = g.measureText(t.label).width / 2;
      const tx = Math.min(cssW - half, Math.max(half, left + t.position * slot)); // keep 20 / 20k inside
      g.fillText(t.label, tx, cssH - 4);
    }
  }

  // Recomputed only when the band set changes (new Band objects on every fraction change).
  let tickCache: { first: BandLevel['band']; ticks: AxisTick[] } | undefined;
  function axisTicks(levels: BandLevel[]): AxisTick[] {
    const first = levels[0]?.band;
    if (!first) return [];
    if (tickCache?.first !== first) tickCache = { first, ticks: octaveAxisTicks(levels.map((l) => l.band)) };
    return tickCache.ticks;
  }

  function onVisibility() {
    if (document.hidden && running) stop();
  }
  onDestroy(stop);
</script>

<svelte:document onvisibilitychange={onVisibility} />

<section class="card plot">
  <canvas bind:this={canvas} aria-label="Spektrum in {s.fraction === 1 ? 'Oktav' : s.fraction === 3 ? 'Terz' : 'Sechstel-Oktav'}-Bändern"></canvas>
  <div class="readout small">
    <span>Gesamt: <strong class="num">{running && Number.isFinite(level) ? fmt(level, 1) : '–'}</strong> dBFS</span>
    <span class="muted">unkalibriert</span>
  </div>
</section>

{#if running}
  <button class="btn block big danger" onclick={stop}>Stopp</button>
{:else}
  <button class="btn block big primary" onclick={start}>Mikrofon starten</button>
{/if}
{#if error}<p class="warning">{error}</p>{/if}

<section class="card">
  <h2>Anzeige</h2>
  <Segmented label="Bandbreite" options={fractions} bind:value={s.fraction} />
  <Segmented label="Mittelung" options={speeds} bind:value={s.speed} />
  <ToggleRow label="Spitzenwert halten" bind:checked={s.peakHold} />
  {#if s.peakHold}
    <button class="link-btn" onclick={() => (peaks = [])}>Spitzenwerte zurücksetzen</button>
  {/if}
</section>

<FormulaBox title="Hinweise">
  <p>Analyse per FFT (16384 Punkte), zusammengefasst in Oktav-, Terz- oder Sechstel-Oktavbänder nach IEC 61260 (Basis 10).</p>
  <p>Pegel in dBFS relativ zur Vollaussteuerung des Mikrofons – <strong>nicht kalibriert</strong>, kein Schalldruckpegel. Smartphone-Mikrofone haben keinen linearen Frequenzgang, besonders unter 100 Hz und über 10 kHz.</p>
  <p>Blasse Balken: Band schmaler als die FFT-Auflösung (nur bei tiefen Frequenzen in 1/6-Oktave).</p>
  <p>Das Mikrofonsignal wird nur im Arbeitsspeicher ausgewertet, nicht gespeichert und nicht übertragen.</p>
</FormulaBox>

<style>
  .plot {
    padding: 12px;
  }
  canvas {
    width: 100%;
    height: 240px;
    display: block;
  }
  .readout {
    display: flex;
    justify-content: space-between;
    padding-top: 6px;
  }
</style>
