<script lang="ts">
  import {
    calculateSubArc,
    calculateSubSpacing,
    type CabinetOrientation,
    type SubArrayError,
  } from '../../lib/core/audio/subArray';
  import { isPlausibleTemperature, speedOfSound } from '../../lib/core/units/speedOfSound';
  import FormulaBox from '../../lib/ui/FormulaBox.svelte';
  import NumberField from '../../lib/ui/NumberField.svelte';
  import ResultRow from '../../lib/ui/ResultRow.svelte';
  import Segmented from '../../lib/ui/Segmented.svelte';
  import ToggleRow from '../../lib/ui/ToggleRow.svelte';
  import { fmt, ms } from '../../lib/ui/format';
  import { persisted } from '../../lib/ui/persisted.svelte';

  const store = persisted('tool.subs', {
    temperature: 20,
    crossover: 100,
    width: 0.6,
    height: 0.8,
    depth: 0.9,
    orientation: 'width' as CabinetOrientation,
    divisor: 4,
    arcEnabled: true,
    count: 6,
    angle: 60,
    useRecommended: true,
    spacing: 1.2,
  });
  const s = $derived(store.value);

  const c = $derived(isPlausibleTemperature(s.temperature) ? speedOfSound(s.temperature) : NaN);
  const spacing = $derived(
    calculateSubSpacing({
      cabinet: { width: s.width, height: s.height, depth: s.depth },
      orientation: s.orientation,
      crossoverFrequency: s.crossover,
      speedOfSound: c,
      recommendedFraction: 1 / s.divisor,
    }),
  );
  const arcSpacing = $derived(s.useRecommended && spacing.ok ? spacing.value.recommendedSpacing : s.spacing);
  const arc = $derived(
    calculateSubArc({ count: Math.round(s.count), spacing: arcSpacing, openingAngleDegrees: s.angle, speedOfSound: c }),
  );

  const ERROR_TEXT: Record<SubArrayError, string> = {
    invalidFrequency: 'Übergangsfrequenz muss größer als 0 sein.',
    invalidSpeedOfSound: 'Temperatur außerhalb von −40 bis 60 °C.',
    invalidDimensions: 'Gehäusemaße müssen größer als 0 sein.',
    invalidFraction: 'Teiler N muss mindestens 2 sein (λ/2 ist das Maximum).',
    invalidCount: 'Mindestens 2 Subs.',
    invalidSpacing: 'Abstand muss größer als 0 sein.',
    invalidAngle: 'Öffnungswinkel zwischen 0 und 180°.',
  };

  const orientations = [
    { value: 'width', label: 'Breite' },
    { value: 'depth', label: 'Tiefe' },
    { value: 'height', label: 'Höhe' },
  ] as const;

  // --- Sketch: subs on the line, virtual arc, delay labels -----------------------------------
  const sketch = $derived.by(() => {
    if (!arc.ok) return undefined;
    const { elements, radius, centreDistance } = arc.value;
    const half = arc.value.lineLength / 2;
    const w = 320;
    const pad = 24;
    const scale = (w - 2 * pad) / Math.max(2 * half, 0.001);
    const bulge = (radius - centreDistance) * scale; // arc apex above the line (towards the audience)
    const lineY = 12 + bulge;
    const cx = w / 2;
    const cy = lineY + centreDistance * scale; // virtual source below the line (behind the subs)
    const r = radius * scale;
    const theta = (s.angle * Math.PI) / 360;
    const arcStart = { x: cx - r * Math.sin(theta), y: cy - r * Math.cos(theta) };
    const arcEnd = { x: cx + r * Math.sin(theta), y: cy - r * Math.cos(theta) };
    const box = Math.max(4, Math.min(18, arcSpacing * scale * 0.8));
    return {
      w,
      h: lineY + 40,
      lineY,
      path: `M ${arcStart.x} ${arcStart.y} A ${r} ${r} 0 0 1 ${arcEnd.x} ${arcEnd.y}`,
      subs: elements.map((e) => ({ x: cx + e.position * scale, box, label: ms(e.delay, 1) })),
    };
  });
</script>

<section class="card">
  <h2>Gehäuse &amp; Frequenz</h2>
  <NumberField label="Breite" bind:value={s.width} unit="m" />
  <NumberField label="Höhe" bind:value={s.height} unit="m" />
  <NumberField label="Tiefe" bind:value={s.depth} unit="m" />
  <div class="row"><span class="label">Maß entlang der Linie</span></div>
  <Segmented label="Maß entlang der Linie" options={orientations} bind:value={s.orientation} />
  <NumberField label="Übergangsfrequenz" bind:value={s.crossover} unit="Hz" digits={1} />
  <NumberField label="Temperatur" bind:value={s.temperature} unit="°C" digits={1} allowNegative />
  <NumberField label="Empfohlen: λ / N" hint="Standard N = 4" bind:value={s.divisor} unit="" digits={2} min={2} />
</section>

<section class="card">
  <h2>Abstand (Mitte–Mitte)</h2>
  {#if spacing.ok}
    {@const v = spacing.value}
    <ResultRow label="Wellenlänge λ" value={fmt(v.wavelength)} unit="m" />
    <ResultRow label="Maximum (λ/2)" value={fmt(v.maximumSpacing)} unit="m" emphasized />
    <ResultRow label="Lücke bei Maximum" value={fmt(v.maximumGap)} unit="m" />
    <ResultRow label="Empfohlen (λ/{fmt(s.divisor, 2).replace(/,00$/, '')})" value={fmt(v.recommendedSpacing)} unit="m" emphasized />
    <ResultRow label="Lücke bei Empfehlung" value={fmt(v.recommendedGap)} unit="m" />
    {#if v.cabinetTooLarge}
      <p class="warning">
        Das Gehäuse ist größer als der maximale Abstand – die Übergangsfrequenz ist für diese Gehäuse in einer Reihe zu hoch.
      </p>
    {:else if v.recommendedGap < 0}
      <p class="warning">
        Die Empfehlung ist kleiner als das Gehäuse – Gehäuse Kante an Kante stellen (Abstand = {fmt(v.cabinetSize)} m).
      </p>
    {/if}
  {:else}
    <p class="warning">{ERROR_TEXT[spacing.error]}</p>
  {/if}
</section>

<section class="card">
  <h2>Arc-Delay</h2>
  <ToggleRow label="Arc-Delay berechnen" bind:checked={s.arcEnabled} />
  {#if s.arcEnabled}
    <NumberField label="Anzahl Subs" bind:value={s.count} unit="Stk." digits={0} min={2} />
    <NumberField label="Öffnungswinkel" bind:value={s.angle} unit="°" digits={1} />
    <ToggleRow label="Empfohlenen Abstand verwenden" bind:checked={s.useRecommended} />
    {#if !s.useRecommended}
      <NumberField label="Abstand Mitte–Mitte" bind:value={s.spacing} unit="m" />
    {/if}

    {#if arc.ok}
      {#if sketch}
        <svg class="sketch" viewBox="0 0 {sketch.w} {sketch.h}" role="img" aria-label="Skizze der Sub-Linie mit virtuellem Bogen">
          <path d={sketch.path} class="arc" />
          <line x1="8" x2={sketch.w - 8} y1={sketch.lineY} y2={sketch.lineY} class="axis" />
          {#each sketch.subs as sub, i (i)}
            <rect x={sub.x - sub.box / 2} y={sketch.lineY - sub.box / 2} width={sub.box} height={sub.box} rx="2" class="sub" />
            {#if sketch.subs.length <= 12}
              <text x={sub.x} y={sketch.lineY + 26} text-anchor="middle" class="lbl">{sub.label}</text>
            {/if}
          {/each}
        </svg>
      {/if}
      <table class="data">
        <thead><tr><th>Sub</th><th>Position</th><th>Delay</th></tr></thead>
        <tbody>
          {#each arc.value.elements as e (e.index)}
            <tr><td>{e.index}</td><td>{fmt(e.position)} m</td><td><strong>{ms(e.delay)}</strong> ms</td></tr>
          {/each}
        </tbody>
      </table>
      <ResultRow label="Linienlänge (Mitte–Mitte)" value={fmt(arc.value.lineLength)} unit="m" />
      <ResultRow label="Radius virtueller Bogen" value={fmt(arc.value.radius)} unit="m" />
      {#if spacing.ok && arcSpacing > spacing.value.maximumSpacing}
        <p class="warning">Abstand größer als λ/2 – Nebenkeulen unterhalb der Übergangsfrequenz.</p>
      {/if}
    {:else}
      <p class="warning">{ERROR_TEXT[arc.error]}</p>
    {/if}
  {/if}
</section>

<FormulaBox>
  <p>Alle Abstände beziehen sich auf die <strong>Mitte der Gehäuse</strong> (akustisches Zentrum).</p>
  <p><code>λ = c / f</code>, Maximum <code>λ/2</code> (fest), Empfehlung <code>λ/N</code> (Standard N = 4).</p>
  <p>Lücke (Kante–Kante) = Abstand − Gehäusemaß entlang der Linie.</p>
  <p>
    <strong>Arc-Delay:</strong> virtuelle Punktquelle hinter der Linie, Bogen durch die äußeren Subs.<br />
    <code>x_o = (n−1)/2 · d</code>, <code>h = x_o / tan(θ/2)</code>, <code>R = x_o / sin(θ/2)</code><br />
    <code>t_i = (√(x_i² + h²) − h) / c</code>, normiert auf den frühesten Sub → Mitte T0, nach außen steigend.
  </p>
  <p class="muted">Annahmen: Freifeld, identische Subs in einer geraden Reihe, Temperatur gleichmäßig.</p>
</FormulaBox>

<style>
  .sketch {
    width: 100%;
    height: auto;
    margin: 8px 0;
  }
  .arc {
    fill: none;
    stroke: var(--muted);
    stroke-dasharray: 4 4;
  }
  .axis {
    stroke: var(--line);
  }
  .sub {
    fill: var(--accent);
  }
  .lbl {
    font-size: 10px;
    fill: var(--text);
    font-variant-numeric: tabular-nums;
  }
</style>
