<script lang="ts">
  // Reference implementation for tool views: UI state in UI units (ms), calculation in src/lib/core.
  import { calculateDelayLine, effectiveSpeedOfSound, type DelayError, type DelayLine, type DelaySettings, type DelayWarning } from '../../lib/core/audio/delay';
  import FormulaBox from '../../lib/ui/FormulaBox.svelte';
  import Icon from '../../lib/ui/Icon.svelte';
  import NumberField from '../../lib/ui/NumberField.svelte';
  import ResultRow from '../../lib/ui/ResultRow.svelte';
  import ToggleRow from '../../lib/ui/ToggleRow.svelte';
  import { fmt, ms } from '../../lib/ui/format';
  import { persisted } from '../../lib/ui/persisted.svelte';
  import { uid } from '../../lib/ui/uid';

  interface FieldDraft { id: string; name: string; x: number; y: number; z: number }
  interface LineDraft {
    id: string;
    name: string;
    useListener: boolean;
    listener: { x: number; y: number; z: number };
    hasOffset: boolean;
    offsetMs: number;
    fields: FieldDraft[];
  }

  const newField = (n: number, x = 30, z = 6): FieldDraft => ({ id: uid(), name: `Feld ${n}`, x, y: 0, z });
  const newLine = (n: number): LineDraft => ({
    id: uid(),
    name: `Delay-Linie ${n}`,
    useListener: false,
    listener: { x: n * 30 + 20, y: 0, z: 1.7 },
    hasOffset: false,
    offsetMs: 0,
    fields: [newField(1, n * 30)],
  });

  const store = persisted('tool.delay', {
    temperature: 20,
    manualSpeed: false,
    speed: 343,
    mainHeight: 8,
    offsetMs: 0,
    latencyMs: 0,
    lines: [newLine(1)] as LineDraft[],
  });
  const s = $derived(store.value);

  const settings = $derived<DelaySettings>({
    temperatureCelsius: s.temperature,
    speedOfSoundOverride: s.manualSpeed ? s.speed : undefined,
    mainHeight: s.mainHeight,
    offset: s.offsetMs / 1000,
    systemLatency: s.latencyMs / 1000,
  });

  const toLine = (d: LineDraft): DelayLine => ({
    id: d.id,
    name: d.name,
    mode: d.useListener ? { kind: 'listener', listener: d.listener } : { kind: 'sourceToSource' },
    fields: d.fields.map((f) => ({ id: f.id, name: f.name, position: { x: f.x, y: f.y, z: f.z } })),
    offsetOverride: d.hasOffset ? d.offsetMs / 1000 : undefined,
  });

  const results = $derived(s.lines.map((d) => calculateDelayLine(toLine(d), settings)));

  const ERROR_TEXT: Record<DelayError, string> = {
    invalidSpeedOfSound: 'Schallgeschwindigkeit muss größer als 0 sein.',
    temperatureOutOfRange: 'Temperatur außerhalb von −40 bis 60 °C.',
    nonFiniteInput: 'Ungültige Eingabe.',
  };
  const WARNING_TEXT: Record<DelayWarning, string> = {
    listenerNotBehindDelay: 'Hörpunkt liegt nicht hinter dem Delay – kein sinnvoller Wert.',
    latencyExceedsDelay: 'Systemlatenz ist größer als das benötigte Delay.',
  };
</script>

<section class="card">
  <h2>Allgemein</h2>
  <NumberField label="Höhe Main" hint="akustische Mitte" bind:value={s.mainHeight} unit="m" />
  <ToggleRow label="Schallgeschwindigkeit manuell" bind:checked={s.manualSpeed} />
  {#if s.manualSpeed}
    <NumberField label="Schallgeschwindigkeit" bind:value={s.speed} unit="m/s" digits={1} min={1} />
  {:else}
    <NumberField label="Temperatur" bind:value={s.temperature} unit="°C" digits={1} allowNegative />
  {/if}
  <NumberField label="Offset (Haas)" bind:value={s.offsetMs} unit="ms" digits={2} allowNegative />
  <NumberField label="Systemlatenz abziehen" bind:value={s.latencyMs} unit="ms" digits={2} />
  <p class="small muted">c = {fmt(effectiveSpeedOfSound(settings), 1)} m/s</p>
</section>

{#each s.lines as line, li (line.id)}
  {@const result = results[li]}
  <section class="card">
    <input class="text-input line-name" bind:value={line.name} aria-label="Name der Linie" />
    <ToggleRow label="Bezug auf Hörposition" bind:checked={line.useListener} />
    {#if line.useListener}
      <NumberField label="Hörpunkt Abstand" bind:value={line.listener.x} unit="m" />
      <NumberField label="Hörpunkt Versatz" bind:value={line.listener.y} unit="m" allowNegative />
      <NumberField label="Ohrhöhe" bind:value={line.listener.z} unit="m" />
    {/if}
    <ToggleRow label="Eigener Offset" bind:checked={line.hasOffset} />
    {#if line.hasOffset}
      <NumberField label="Offset Linie" bind:value={line.offsetMs} unit="ms" digits={2} allowNegative />
    {/if}

    {#each line.fields as field, fi (field.id)}
      {@const fr = result?.ok ? result.value.fields[fi] : undefined}
      <div class="field-block">
        <div class="field-head">
          <input class="text-input" bind:value={field.name} aria-label="Name des Feldes" />
          {#if line.fields.length > 1}
            <button class="icon-del" aria-label="{field.name} löschen" onclick={() => line.fields.splice(fi, 1)}>
              <Icon name="trash" size={20} />
            </button>
          {/if}
        </div>
        <NumberField label="Abstand zur Main" bind:value={field.x} unit="m" />
        <NumberField label="Höhe" bind:value={field.z} unit="m" />
        <NumberField label="Seitl. Versatz" bind:value={field.y} unit="m" allowNegative />
        {#if fr?.delay !== undefined}
          <ResultRow label="Delay" value={ms(fr.delay)} unit="ms" emphasized />
          <ResultRow label={line.useListener ? 'Wegdifferenz' : 'Distanz'} value={fmt(fr.distance)} unit="m" />
        {:else if fr?.warning}
          <p class="warning">{WARNING_TEXT[fr.warning]}</p>
        {/if}
      </div>
    {/each}

    <button
      class="link-btn"
      onclick={() => {
        const last = line.fields.at(-1);
        line.fields.push(newField(line.fields.length + 1, last?.x, last?.z));
      }}>+ Feld hinzufügen</button
    >

    {#if result && !result.ok}
      <p class="warning">{ERROR_TEXT[result.error]}</p>
    {:else if result?.ok && result.value.summary && line.fields.length > 1}
      {@const sum = result.value.summary}
      <div class="summary">
        <ResultRow label="Minimum" value={ms(sum.minimum)} unit="ms" />
        <ResultRow label="Maximum" value={ms(sum.maximum)} unit="ms" />
        <ResultRow label="Mittelwert" value={ms(sum.mean)} unit="ms" emphasized />
        <ResultRow label="Spreizung" value={ms(sum.spread)} unit="ms" />
      </div>
    {/if}

    {#if s.lines.length > 1}
      <button class="link-btn danger" onclick={() => s.lines.splice(li, 1)}>Linie löschen</button>
    {/if}
  </section>
{/each}

<button class="btn block" onclick={() => s.lines.push(newLine(s.lines.length + 1))}>
  <Icon name="plus" size={20} /> Delay-Linie hinzufügen
</button>

<FormulaBox>
  <p><strong>Quelle → Quelle:</strong> <code>Δt = |Main → Delay| / c + Offset − Latenz</code></p>
  <p><strong>Hörposition:</strong> <code>Δt = (|Main → Hörpunkt| − |Delay → Hörpunkt|) / c + Offset − Latenz</code></p>
  <p><code>c = 331,3 · √(1 + T / 273,15)</code> m/s</p>
  <p>Distanzen dreidimensional aus Abstand, seitlichem Versatz und Höhe. Die Main-PA liegt bei Abstand 0 und Versatz 0.</p>
  <p class="muted">Annahmen: Freifeld, trockene Luft, kein Wind. Systemlatenzen nur, wenn eingetragen.</p>
</FormulaBox>

<style>
  .line-name {
    font-size: 19px;
    padding-top: 8px;
  }
  .field-block {
    border-top: 2px solid var(--line);
    margin-top: 4px;
  }
  .field-head {
    display: flex;
    align-items: center;
  }
  .icon-del {
    width: var(--tap);
    height: var(--tap);
    border: 0;
    background: none;
    color: var(--bad);
    cursor: pointer;
  }
  .summary {
    border-top: 2px solid var(--line);
  }
</style>
