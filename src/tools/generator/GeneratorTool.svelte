<script lang="ts">
  import { onDestroy } from 'svelte';
  import { SignalGenerator, maxLevelFor, type GeneratorSettings, type OutputChannel, type SignalKind } from '../../lib/audio/generator';
  import { isAudioSupported } from '../../lib/audio/context';
  import { POLARITY_BANDS, type PolarityBand } from '../../lib/core/dsp/polaritySignal';
  import FormulaBox from '../../lib/ui/FormulaBox.svelte';
  import NumberField from '../../lib/ui/NumberField.svelte';
  import Segmented from '../../lib/ui/Segmented.svelte';
  import { fmt } from '../../lib/ui/format';
  import { persisted } from '../../lib/ui/persisted.svelte';

  const store = persisted<GeneratorSettings>('tool.generator', {
    kind: 'pink',
    frequency: 1000,
    levelDb: -20,
    channel: 'both',
    sweepSeconds: 5,
    polarityBand: 'midHigh',
  });
  const s = $derived(store.value);

  const generator = new SignalGenerator();
  let running = $state(false);
  let error = $state('');

  const kinds = [
    { value: 'sine', label: 'Sinus' },
    { value: 'pink', label: 'Rosa' },
    { value: 'white', label: 'Weiß' },
    { value: 'sweep', label: 'Sweep' },
    { value: 'polarity', label: 'Polarität' },
  ] as const satisfies readonly { value: SignalKind; label: string }[];
  const channels = [
    { value: 'left', label: 'Links' },
    { value: 'both', label: 'Beide' },
    { value: 'right', label: 'Rechts' },
  ] as const satisfies readonly { value: OutputChannel; label: string }[];
  const sweepLengths = [
    { value: 1, label: '1 s' },
    { value: 5, label: '5 s' },
    { value: 10, label: '10 s' },
  ] as const;
  const bands = (Object.keys(POLARITY_BANDS) as PolarityBand[]).map((b) => ({ value: b, label: b === 'low' ? 'Sub/Low' : 'Mitte/Hoch' }));
  const presets = [31.5, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

  // Slider is logarithmic for the frequency.
  const fMin = 20;
  const fMax = 20000;
  const sliderPos = $derived(Math.log(s.frequency / fMin) / Math.log(fMax / fMin));
  function setFromSlider(pos: number) {
    const f = fMin * (fMax / fMin) ** pos;
    s.frequency = f < 100 ? Math.round(f * 10) / 10 : Math.round(f);
  }

  const maxLevel = $derived(maxLevelFor(s.kind));
  const clipping = $derived(s.levelDb > maxLevel + 0.01);

  async function toggle() {
    error = '';
    if (running) {
      generator.stop();
      running = false;
      return;
    }
    try {
      await generator.start($state.snapshot(s));
      running = true;
    } catch {
      error = 'Audio konnte nicht gestartet werden.';
    }
  }

  // Apply changes live while running.
  $effect(() => {
    const snapshot = $state.snapshot(s);
    if (running) void generator.update(snapshot);
  });

  // Never keep playing in the background.
  function onVisibility() {
    if (document.hidden && running) {
      generator.stop();
      running = false;
    }
  }
  onDestroy(() => generator.stop());
</script>

<svelte:document onvisibilitychange={onVisibility} />

{#if !isAudioSupported()}
  <p class="warning">Dieser Browser unterstützt keine Audio-Ausgabe.</p>
{:else}
  <section class="card">
    <h2>Signal</h2>
    <Segmented label="Signalart" options={kinds} bind:value={s.kind} />

    {#if s.kind === 'sine'}
      <NumberField label="Frequenz" bind:value={s.frequency} unit="Hz" digits={1} min={1} max={24000} />
      <input
        type="range"
        min="0"
        max="1"
        step="0.001"
        value={sliderPos}
        oninput={(e) => setFromSlider(Number(e.currentTarget.value))}
        aria-label="Frequenz (logarithmisch)"
      />
      <div class="chips">
        {#each presets as f (f)}
          <button class="chip" class:active={s.frequency === f} onclick={() => (s.frequency = f)}>
            {f >= 1000 ? `${f / 1000}k` : f}
          </button>
        {/each}
      </div>
    {:else if s.kind === 'sweep'}
      <p class="small muted">Logarithmischer Sweep 20 Hz – 20 kHz mit 0,5 s Pause, in Schleife.</p>
      <Segmented label="Sweep-Länge" options={sweepLengths} bind:value={s.sweepSeconds} />
    {:else if s.kind === 'polarity'}
      <p class="small muted">
        Sendesignal für den Polaritätscheck auf einem zweiten Gerät: 0,5 s Sweep, jede Sekunde. Am Messgerät dasselbe Band wählen.
      </p>
      <Segmented label="Band" options={bands} bind:value={s.polarityBand} />
      <p class="small muted">{POLARITY_BANDS[s.polarityBand].label}</p>
    {:else}
      <p class="small muted">
        {s.kind === 'pink' ? 'Rosa Rauschen: gleiche Energie pro Oktave (−3 dB/Oktave).' : 'Weißes Rauschen: gleiche Energie pro Hz.'}
      </p>
    {/if}
  </section>

  <section class="card">
    <h2>Pegel &amp; Ausgang</h2>
    <NumberField label="Pegel" hint="RMS nach AES17" bind:value={s.levelDb} unit="dBFS" digits={1} allowNegative max={0} />
    <input type="range" min="-60" max="0" step="0.5" bind:value={s.levelDb} aria-label="Pegel" />
    {#if clipping}
      <p class="warning">Übersteuerung: Dieses Signal clippt oberhalb von {fmt(maxLevel, 1)} dBFS.</p>
    {/if}
    <Segmented label="Ausgangskanal" options={channels} bind:value={s.channel} />
  </section>

  <button class="btn block big {running ? 'danger' : 'primary'}" onclick={toggle} aria-pressed={running}>
    {running ? 'Stopp' : 'Start'}
  </button>
  {#if error}<p class="warning">{error}</p>{/if}

  <p class="warning small">
    Vorsicht bei hohen Pegeln: Rauschen und Sweeps können Hochtöner beschädigen und das Gehör schädigen. Mit niedrigem
    Pegel beginnen. Bluetooth-Kopfhörer und -Lautsprecher verzögern das Signal.
  </p>

  <FormulaBox title="Technische Details">
    <p>Pegel nach AES17: 0 dBFS = Effektivwert eines voll ausgesteuerten Sinus. Rauschen wird auf denselben Effektivwert normiert und hat höhere Spitzen (Crestfaktor).</p>
    <p>Rosa Rauschen: Filter nach Paul Kellet (±0,05 dB). Sweep: exponentiell (Farina) mit weicher Ein-/Ausblendung.</p>
    <p>Das Signal wird beim Wechsel in den Hintergrund automatisch gestoppt. Auf dem iPhone spielt der Ton auch bei aktiviertem Stummschalter.</p>
  </FormulaBox>
{/if}

<style>
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 4px 0 12px;
  }
  .chip {
    min-height: 36px;
    min-width: 48px;
    border-radius: 18px;
    border: 0;
    background: var(--surface-2);
    cursor: pointer;
    font-variant-numeric: tabular-nums;
  }
  .chip.active {
    background: var(--accent);
    color: var(--accent-text);
  }
</style>
