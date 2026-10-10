<script lang="ts">
  import {
    ADDRESS_SWITCHES,
    DEFAULT_DIP_PROFILE,
    dipPositions,
    dipRange,
    dipToAddress,
    switchValue,
    type DipProfile,
  } from '../../lib/core/dmx/dip';
  import FormulaBox from '../../lib/ui/FormulaBox.svelte';
  import NumberField from '../../lib/ui/NumberField.svelte';
  import ResultRow from '../../lib/ui/ResultRow.svelte';
  import Segmented from '../../lib/ui/Segmented.svelte';
  import ToggleRow from '../../lib/ui/ToggleRow.svelte';
  import { persisted } from '../../lib/ui/persisted.svelte';

  type EditableProfile = { -readonly [K in keyof DipProfile]: DipProfile[K] };
  const store = persisted('tool.dip', {
    address: 1,
    functionSwitch: false,
    profile: { ...DEFAULT_DIP_PROFILE } as EditableProfile,
  });
  const s = $derived(store.value);

  const range = $derived(dipRange(s.profile));
  const positions = $derived(dipPositions(s.address, s.profile));
  const switchNumbers = $derived(Array.from({ length: s.profile.switches }, (_, i) => i + 1));
  /** address switches whose bit is set (independent of inverted logic) */
  const bitsSet = $derived(
    positions ? switchNumbers.filter((n) => n <= ADDRESS_SWITCHES && positions[n - 1] !== s.profile.inverted) : [],
  );
  const onSwitches = $derived(positions ? switchNumbers.filter((n) => n <= ADDRESS_SWITCHES && positions[n - 1]) : []);

  const warning = $derived.by(() => {
    if (!Number.isInteger(s.address)) return 'Nur ganze Adressen.';
    if (s.address === 0) return 'Adresse 0 ist keine gültige DMX-Adresse (1–512).';
    if (s.address > range.max) return `Mit diesem Profil sind höchstens Adressen bis ${range.max} einstellbar.`;
    return '';
  });

  function toggle(n: number) {
    if (n > ADDRESS_SWITCHES) {
      s.functionSwitch = !s.functionSwitch;
      return;
    }
    // Start from the current switches; if the address cannot be shown, from "all bits off".
    const current = positions ?? dipPositions(s.profile.offset, s.profile)!;
    const next = current.map((on, i) => (i === n - 1 ? !on : on));
    s.address = dipToAddress(next, s.profile);
  }

  const isOn = (n: number) => (n > ADDRESS_SWITCHES ? s.functionSwitch : (positions?.[n - 1] ?? false));

  const sumText = $derived.by(() => {
    if (!positions) return '–';
    const values = bitsSet.map((n) => switchValue(n, s.profile)).sort((a, b) => a - b);
    const terms = values.length ? values.join(' + ') : '0';
    return s.profile.offset ? `${terms} + 1 (Offset) = ${s.address}` : values.length > 1 ? `${terms} = ${s.address}` : terms;
  });

  const orders = [
    { value: 'lsb', label: 'Schalter 1 = 1' },
    { value: 'msb', label: 'Schalter 1 = 256' },
  ] as const;
  const offsets = [
    { value: 0, label: 'Summe' },
    { value: 1, label: 'Summe + 1' },
  ] as const;
  const counts = [
    { value: 9, label: '9 Schalter' },
    { value: 10, label: '10 (10 = Funktion)' },
  ] as const;

</script>

<section class="card">
  <NumberField label="DMX-Adresse" bind:value={s.address} digits={0} min={0} max={512} />
  {#if warning}<p class="warning">{warning}</p>{/if}

  <div class="dip" role="group" aria-label="DIP-Schalter, antippen zum Umschalten">
    <span class="on-label" aria-hidden="true">ON ↑</span>
    {#each switchNumbers as n (n)}
      {@const on = isOn(n)}
      {@const fn = n > ADDRESS_SWITCHES}
      <button
        type="button"
        class="switch"
        class:fn
        aria-pressed={on}
        aria-label={fn
          ? `Schalter 10, Funktion, nicht Teil der Adresse, ${on ? 'ON' : 'OFF'}`
          : `Schalter ${n}, Wert ${switchValue(n, s.profile)}, ${on ? 'ON' : 'OFF'}`}
        onclick={() => toggle(n)}
      >
        <span class="slot"><span class="knob" class:on></span></span>
        <span class="num">{n}</span>
        <span class="val">{fn ? 'F' : switchValue(n, s.profile)}</span>
      </button>
    {/each}
  </div>
</section>

<section class="card">
  <h2>Ergebnis</h2>
  <ResultRow label="Schalter auf ON" value={positions ? (onSwitches.length ? onSwitches.join(' · ') : 'keiner') : '–'} emphasized />
  <div class="row sum">
    <span class="label">Wertigkeiten</span>
    <span class="value num">{sumText}</span>
  </div>
</section>

<section class="card">
  <h2>Geräteprofil</h2>
  <Segmented
    label="Reihenfolge"
    options={orders}
    bind:value={() => (s.profile.msbFirst ? 'msb' : 'lsb'), (v) => (s.profile.msbFirst = v === 'msb')}
  />
  <Segmented label="Adresse" options={offsets} bind:value={s.profile.offset} />
  <Segmented label="Anzahl Schalter" options={counts} bind:value={s.profile.switches} />
  <ToggleRow label="Invertiert (ON = 0)" bind:checked={s.profile.inverted} />
  <button class="link-btn" onclick={() => (s.profile = { ...DEFAULT_DIP_PROFILE })}>Standardprofil</button>
</section>

<FormulaBox>
  <p>Adresse = Summe der Wertigkeiten aller Schalter auf ON (bei „Summe + 1“ zusätzlich + 1). Wertigkeiten 1, 2, 4 … 256 (9 Schalter), damit sind die Adressen 1–511 einstellbar, mit „Summe + 1“ 1–512.</p>
  <p>Invertiert: Ein Schalter auf ON zählt als 0, auf OFF als seine Wertigkeit.</p>
  <p>Bei 10 Schaltern ist Schalter 10 meist eine Gerätefunktion (z. B. Stand-alone, Master/Slave) und zählt nicht zur Adresse.</p>
  <p>Standardprofil: Schalter 1 = 1, ON = 1, Adresse = Summe, 10 Schalter. Die Belegung unterscheidet sich je nach Hersteller – im Zweifel Bedienungsanleitung prüfen.</p>
</FormulaBox>

<style>
  .dip {
    position: relative;
    display: flex;
    margin: 8px -12px 12px;
    padding: 22px 4px 4px;
    background: var(--surface-2);
    border-radius: 10px;
  }
  .on-label {
    position: absolute;
    top: 4px;
    left: 10px;
    font-size: 11px;
    font-weight: 700;
    color: var(--muted);
  }
  .switch {
    flex: 1 1 0;
    min-width: 0;
    min-height: 88px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 0 0 4px;
    border: 0;
    background: transparent;
    color: var(--text);
    cursor: pointer;
    touch-action: manipulation;
  }
  .slot {
    position: relative;
    width: 22px;
    height: 48px;
    border-radius: 4px;
    background: var(--bg);
    border: 1px solid var(--line);
  }
  .knob {
    position: absolute;
    left: 2px;
    right: 2px;
    bottom: 2px;
    height: 20px;
    border-radius: 3px;
    background: var(--muted);
    transition: bottom 0.12s;
  }
  .knob.on {
    bottom: 24px;
    background: var(--accent);
  }
  .num {
    font-size: 14px;
    font-weight: 600;
  }
  .val {
    font-size: 11px;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .fn .num,
  .fn .val {
    color: var(--muted);
  }
  .sum {
    flex-wrap: wrap;
  }
  .sum .value {
    flex: 1 1 auto;
    text-align: right;
    white-space: normal;
  }
  .switch:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
    border-radius: 6px;
  }
</style>
