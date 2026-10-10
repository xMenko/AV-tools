<script lang="ts">
  import { onDestroy } from 'svelte';
  import { playOnce } from '../../lib/audio/generator';
  import { MICROPHONE_ERROR_TEXT, openMicrophone, type Microphone } from '../../lib/audio/microphone';
  import { record } from '../../lib/audio/recorder';
  import { applyMicReference, detectPolarity, type PolarityResult, type PolarityStatus } from '../../lib/core/dsp/polarity';
  import {
    POLARITY_BANDS,
    POLARITY_CAPTURE_SECONDS,
    POLARITY_SWEEP_SECONDS,
    polarityReference,
    type PolarityBand,
  } from '../../lib/core/dsp/polaritySignal';
  import FormulaBox from '../../lib/ui/FormulaBox.svelte';
  import NumberField from '../../lib/ui/NumberField.svelte';
  import Segmented from '../../lib/ui/Segmented.svelte';
  import { fmt } from '../../lib/ui/format';
  import { persisted } from '../../lib/ui/persisted.svelte';

  type Mode = 'self' | 'receive';

  const store = persisted('tool.polarity', {
    mode: 'self' as Mode,
    band: 'midHigh' as PolarityBand,
    levelDb: -12,
    /** raw result of the reference loudspeaker per band (mic polarity calibration) */
    reference: {} as Partial<Record<PolarityBand, 'positive' | 'negative'>>,
  });
  const s = $derived(store.value);

  let busy = $state(false);
  let continuous = $state(false);
  let error = $state('');
  let raw = $state<PolarityResult>();
  let mic: Microphone | undefined;

  const modes = [
    { value: 'self', label: 'Senden & messen' },
    { value: 'receive', label: 'Nur messen' },
  ] as const;
  const bands = [
    { value: 'midHigh', label: 'Mitte/Hoch' },
    { value: 'low', label: 'Sub/Low' },
  ] as const;

  const shown = $derived<PolarityStatus | undefined>(raw ? applyMicReference(raw.status, s.reference[s.band]) : undefined);
  const hasReference = $derived(s.reference[s.band] !== undefined);

  const status = $derived.by(() => {
    const ref = hasReference;
    const table: Record<PolarityStatus, { symbol: string; text: string; cls: string }> = {
      positive: ref
        ? { symbol: '+', text: 'Wie Referenz – korrekt', cls: 'good' }
        : { symbol: '+', text: 'Positiv (ohne Referenz)', cls: '' },
      negative: ref
        ? { symbol: '−', text: 'Verdreht gegenüber Referenz', cls: 'bad' }
        : { symbol: '−', text: 'Negativ (ohne Referenz)', cls: '' },
      unclear: { symbol: '?', text: 'Nicht eindeutig', cls: 'warn' },
      noSignal: { symbol: '∅', text: 'Kein Signal erkannt', cls: 'warn' },
    };
    return table;
  });

  async function ensureMic(): Promise<Microphone | undefined> {
    if (mic) return mic;
    const r = await openMicrophone();
    if (!r.ok) {
      error = MICROPHONE_ERROR_TEXT[r.error];
      return undefined;
    }
    mic = r.mic;
    return mic;
  }

  async function measureOnce(): Promise<void> {
    const m = await ensureMic();
    if (!m) return;
    const fs = m.context.sampleRate;
    const reference = polarityReference(s.band, fs);
    let recording: Float32Array;
    if (s.mode === 'self') {
      // Start playback as soon as the recorder runs; capture sweep + device latency.
      recording = await record(m.source, POLARITY_SWEEP_SECONDS + 0.8, () => void playOnce(reference, s.levelDb));
    } else {
      recording = await record(m.source, POLARITY_CAPTURE_SECONDS);
    }
    raw = detectPolarity(recording, reference, { sampleRate: fs, lowestFrequency: POLARITY_BANDS[s.band].start });
  }

  async function measure() {
    error = '';
    busy = true;
    try {
      do {
        await measureOnce();
      } while (continuous && mic);
    } catch {
      error = 'Messung fehlgeschlagen.';
    } finally {
      busy = false;
      if (!continuous) closeMic();
    }
  }

  function stopContinuous() {
    continuous = false;
  }

  function closeMic() {
    mic?.close();
    mic = undefined;
  }

  function saveReference() {
    if (!raw || (raw.status !== 'positive' && raw.status !== 'negative')) return;
    s.reference[s.band] = raw.status;
  }

  function clearReference() {
    delete s.reference[s.band];
  }

  function onVisibility() {
    if (document.hidden) {
      continuous = false;
      closeMic();
    }
  }
  onDestroy(() => {
    continuous = false;
    closeMic();
  });
</script>

<svelte:document onvisibilitychange={onVisibility} />

<section class="card result" aria-live="polite">
  {#if shown}
    {@const st = status[shown]}
    <div class="symbol {st.cls}">{st.symbol}</div>
    <div class="status">{st.text}</div>
    {#if raw && (shown === 'positive' || shown === 'negative' || shown === 'unclear')}
      <div class="small muted num">Signalabstand {fmt(raw.snrDb, 0)} dB · Eindeutigkeit {fmt(Math.min(raw.dominance, 99), 1)}</div>
    {/if}
    {#if !hasReference && (shown === 'positive' || shown === 'negative')}
      <p class="warning small">
        Ohne Referenz: Die Polarität des Handy-Mikrofons ist unbekannt. Erst einen korrekt angeschlossenen Lautsprecher
        messen und als Referenz speichern.
      </p>
    {/if}
  {:else}
    <div class="symbol muted">·</div>
    <div class="status muted">Noch keine Messung</div>
  {/if}
</section>

{#if busy && continuous}
  <button class="btn block big danger" onclick={stopContinuous}>Dauermessung stoppen</button>
{:else}
  <button class="btn block big primary" disabled={busy} onclick={measure}>{busy ? 'Misst …' : 'Messen'}</button>
  <button
    class="btn block"
    disabled={busy}
    onclick={() => {
      continuous = true;
      void measure();
    }}>Dauermessung</button
  >
{/if}
{#if error}<p class="warning">{error}</p>{/if}

<section class="card">
  <h2>Einstellungen</h2>
  <Segmented label="Modus" options={modes} bind:value={s.mode} />
  <p class="small muted">
    {#if s.mode === 'self'}
      Dieses Gerät spielt das Testsignal (z. B. per Kabel ins Pult) und misst mit dem eigenen Mikrofon. Kein Bluetooth verwenden.
    {:else}
      Ein zweites Gerät spielt im Signalgenerator „Polarität“ mit demselben Band; dieses Gerät misst nur.
    {/if}
  </p>
  <Segmented label="Band" options={bands} bind:value={s.band} />
  <p class="small muted">{POLARITY_BANDS[s.band].label}</p>
  {#if s.mode === 'self'}
    <NumberField label="Sendepegel" bind:value={s.levelDb} unit="dBFS" digits={1} allowNegative max={0} />
  {/if}
</section>

<section class="card">
  <h2>Mikrofon-Referenz ({s.band === 'low' ? 'Sub/Low' : 'Mitte/Hoch'})</h2>
  <p class="small">
    {#if hasReference}
      Referenz gespeichert. Ergebnisse werden relativ zum Referenz-Lautsprecher angezeigt.
    {:else}
      Keine Referenz. Einen bekannt korrekt angeschlossenen Lautsprecher gleichen Typs messen, dann speichern.
    {/if}
  </p>
  <button
    class="btn block"
    disabled={!raw || (raw.status !== 'positive' && raw.status !== 'negative')}
    onclick={saveReference}>Letzte Messung als Referenz speichern</button
  >
  {#if hasReference}
    <button class="link-btn danger" onclick={clearReference}>Referenz löschen</button>
  {/if}
</section>

<FormulaBox title="So funktioniert's">
  <p>Gesendet wird ein 0,5-s-Sweep. Das Mikrofonsignal wird mit dem bekannten Sweep kreuzkorreliert (Matched Filter); das Vorzeichen der stärksten Spitze ist die Polarität des dominanten Anteils.</p>
  <p><strong>Tipps:</strong> Mikrofon ca. 1 m vor den Lautsprecher, auf Höhe des Hochtöners. Ruhige Umgebung. Pro Messung nur einen Lautsprecher spielen lassen. Bei Mehrwegesystemen zeigt Mitte/Hoch vor allem den Hochtöner.</p>
  <p><strong>Grenzen:</strong> Frequenzweichen, Phasendrehungen und Subwoofer mit Tiefpass können das Ergebnis verfälschen – dann zeigt die App „Nicht eindeutig“. Immer mit einem baugleichen, korrekt angeschlossenen Lautsprecher vergleichen.</p>
  <p>Das Mikrofonsignal wird nur im Arbeitsspeicher ausgewertet, nicht gespeichert und nicht übertragen.</p>
</FormulaBox>

<style>
  .result {
    text-align: center;
    padding: 16px;
  }
  .symbol {
    font-size: 96px;
    font-weight: 700;
    line-height: 1;
  }
  .symbol.good {
    color: var(--good);
  }
  .symbol.bad {
    color: var(--bad);
  }
  .symbol.warn {
    color: var(--warn);
  }
  .status {
    font-size: 22px;
    font-weight: 600;
    margin: 4px 0;
  }
</style>
