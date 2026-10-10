<script lang="ts">
  import { onMount } from 'svelte';
  import { artNetAddress, type ArtNetBase } from '../../lib/core/dmx/artnet';
  import { DEFAULT_DIP_PROFILE, dipOnSwitches } from '../../lib/core/dmx/dip';
  import { fixtureAt, searchFixtures, type Fixture } from '../../lib/core/dmx/fixtureDb';
  import {
    alignUp,
    calculatePatch,
    type GroupIssue,
    type PatchConflict,
    type PatchError,
    type PatchGroup,
    type Placement,
  } from '../../lib/core/dmx/patch';
  import { loadFixtureDatabase, type LoadedDatabase } from '../../lib/dmx/database';
  import FormulaBox from '../../lib/ui/FormulaBox.svelte';
  import Icon from '../../lib/ui/Icon.svelte';
  import NumberField from '../../lib/ui/NumberField.svelte';
  import ResultRow from '../../lib/ui/ResultRow.svelte';
  import Segmented from '../../lib/ui/Segmented.svelte';
  import ToggleRow from '../../lib/ui/ToggleRow.svelte';
  import { persisted } from '../../lib/ui/persisted.svelte';
  import { uid } from '../../lib/ui/uid';

  /** Fixture chosen from the database; channel names are kept so the patch works before the DB loads. */
  interface FixtureRef {
    id: string;
    label: string;
    mode: string;
    channelNames: string[];
  }
  interface GroupDraft {
    id: string;
    name: string;
    fixture?: FixtureRef;
    /** used without database fixture */
    manualChannels: number;
    count: number;
    universe: number;
    fixedStart: boolean;
    start: number;
    gap: number;
    /** undefined = not asked yet */
    keepTogether?: boolean;
  }
  interface ReservedDraft {
    id: string;
    universe: number;
    from: number;
    to: number;
  }

  const newGroup = (universe = 1): GroupDraft => ({
    id: uid(),
    name: '',
    manualChannels: 8,
    count: 1,
    universe,
    fixedStart: false,
    start: 1,
    gap: 0,
  });

  const store = persisted('tool.dmx', {
    groups: [] as GroupDraft[],
    placement: 'contiguous' as Placement,
    align: 'none' as 'none' | 'ten' | 'custom',
    alignCustom: 16,
    alignScope: 'device' as 'device' | 'group',
    artNetBase: 0 as ArtNetBase,
    reserved: [] as ReservedDraft[],
  });
  const s = $derived(store.value);

  // --- Database -------------------------------------------------------------------------------
  let loaded = $state<LoadedDatabase>();
  let dbFailed = $state(false);
  onMount(() => {
    loadFixtureDatabase().then((l) => {
      loaded = l;
      dbFailed = !l;
    });
  });
  const fixtureById = (id: string): Fixture | undefined => {
    const i = loaded?.byId.get(id);
    return loaded && i !== undefined ? fixtureAt(loaded.db, i) : undefined;
  };

  // --- Picker ---------------------------------------------------------------------------------
  let pickerFor = $state<string>();
  let query = $state('');
  const MAX_HITS = 30;
  // one more than shown, to know whether there are more
  const found = $derived(loaded && query.trim() ? searchFixtures(loaded.index, query, MAX_HITS + 1) : []);
  const hits = $derived(found.slice(0, MAX_HITS));

  function choose(g: GroupDraft, f: Fixture, modeName?: string) {
    const mode = f.modes.find((m) => m.name === modeName) ?? f.modes[0]!;
    const label = `${f.manufacturer} ${f.name}`;
    if (!g.name || g.name === g.fixture?.label) g.name = label;
    g.fixture = { id: f.id, label, mode: mode.name, channelNames: [...mode.channels] };
    pickerFor = undefined;
    query = '';
  }

  /** Saved channel list differs from the database (mode renamed or changed by an OFL update). */
  const isStale = (ref: FixtureRef, f: Fixture) => {
    const mode = f.modes.find((m) => m.name === ref.mode);
    return !mode || mode.channels.length !== ref.channelNames.length || mode.channels.some((c, i) => c !== ref.channelNames[i]);
  };

  // --- Patch ----------------------------------------------------------------------------------
  const channelsOf = (g: GroupDraft) => (g.fixture ? g.fixture.channelNames.length : g.manualChannels);
  const groupLabel = (g: GroupDraft, i: number) => g.name.trim() || g.fixture?.label || `Gruppe ${i + 1}`;
  const alignStep = $derived(s.align === 'none' ? 1 : s.align === 'ten' ? 10 : s.alignCustom);

  const patch = $derived(
    calculatePatch(
      s.groups.map(
        (g): PatchGroup => ({
          id: g.id,
          channels: channelsOf(g),
          count: g.count,
          universe: g.universe,
          startAddress: g.fixedStart ? g.start : undefined,
          gap: g.gap,
          keepTogether: g.keepTogether,
        }),
      ),
      {
        alignStep,
        alignScope: s.alignScope,
        placement: s.placement,
        reserved: s.reserved.map(({ universe, from, to }) => ({ universe, from, to })),
        artNetBase: s.artNetBase,
      },
    ),
  );
  const result = $derived(patch.ok ? patch.value : undefined);
  const groupResult = (id: string) => result?.groups.find((r) => r.groupId === id);
  const nameOf = (id: string) => {
    const i = s.groups.findIndex((g) => g.id === id);
    return i >= 0 ? groupLabel(s.groups[i]!, i) : '?';
  };
  const conflictsOf = (id: string) => result?.conflicts.filter((c) => c.groupId === id || (c.with.kind === 'group' && c.with.groupId === id)) ?? [];

  const ISSUE_TEXT: Record<GroupIssue, string> = {
    invalidInput: 'Eingaben prüfen (ganze Zahlen): Kanäle 1–512, Anzahl 1–10 000, Universe ab 1, Startadresse 1–512, Lücke 0–511.',
    startTooHigh: 'Startadresse zu hoch: Das erste Gerät würde über Adresse 512 hinausgehen.',
    noUniverseLeft: 'Kein Universe mehr frei (Art-Net-Grenze erreicht).',
  };
  const ERROR_TEXT: Record<PatchError, string> = {
    invalidOptions: 'Raster muss eine ganze Zahl von 1 bis 512 sein.',
    invalidReservedRange: 'Reservierter Bereich ungültig: Universe ≥ 1, Adressen 1–512, „von“ ≤ „bis“.',
  };
  function conflictText(c: PatchConflict, ownId: string): string {
    const r = c.with.kind === 'reserved' ? s.reserved[c.with.index] : undefined;
    const other = c.with.kind === 'group'
      ? nameOf(c.groupId === ownId ? c.with.groupId : c.groupId)
      : `dem reservierten Bereich ${r ? `${r.from}–${r.to}` : ''}`.trim();
    return `Überschneidung mit ${other} in Universe ${c.universe}, im Bereich ${c.from}–${c.to}.`;
  }

  /** Number of contiguous runs (next fixture directly after previous + gap, grid-aligned, same universe). */
  function blockCount(list: readonly { universe: number; start: number; end: number }[], gap: number): number {
    const inner = s.alignScope === 'device' ? alignStep : 1;
    let blocks = list.length ? 1 : 0;
    for (let i = 1; i < list.length; i++) {
      const prev = list[i - 1]!;
      const cur = list[i]!;
      if (cur.universe === prev.universe && cur.start !== alignUp(prev.end + 1 + gap, inner)) blocks++;
    }
    return blocks;
  }

  const artNet = (u: number) => {
    const a = artNetAddress(u, s.artNetBase);
    return a.ok ? `${a.value.net}:${a.value.subnet}:${a.value.universe}` : '–';
  };
  const dip = (address: number) => {
    const r = dipOnSwitches(address, DEFAULT_DIP_PROFILE);
    return r.ok ? r.value.join('·') : 'nicht einstellbar (> 511)';
  };

  const fixtures = $derived(
    result
      ? result.groups.flatMap((gr) => {
          const i = s.groups.findIndex((g) => g.id === gr.groupId);
          return gr.fixtures.map((f) => ({ ...f, label: `${groupLabel(s.groups[i]!, i)} · ${f.index}` }));
        })
      : [],
  );
  const MAX_ROWS = 1000;

  const placements: { value: Placement; label: string; hint: string }[] = [
    { value: 'contiguous', label: 'Erste Lücke für die ganze Gruppe', hint: 'Gruppe zusammenhängend an der ersten passenden Stelle.' },
    { value: 'afterLast', label: 'Hinter dem letzten Gerät', hint: 'Lücken davor bleiben frei.' },
    { value: 'fill', label: 'Jedes Gerät einzeln', hint: 'Am dichtesten, eine Gruppe kann in Blöcke zerfallen.' },
  ];
  const aligns = [
    { value: 'none', label: 'Keine' },
    { value: 'ten', label: 'x01, x11 …' },
    { value: 'custom', label: 'Raster N' },
  ] as const;
  const scopes = [
    { value: 'device', label: 'Jedes Gerät' },
    { value: 'group', label: 'Erstes der Gruppe' },
  ] as const;
  const bases = [
    { value: 0, label: 'U1 = 0:0:0' },
    { value: 1, label: 'U1 = 0:0:1' },
  ] as const;
</script>

{#if s.groups.length === 0}
  <section class="card">
    <p class="small muted intro">
      Gruppen gleicher Geräte anlegen (Gerät und Modus aus der Datenbank oder Kanalzahl). Die Adressen werden
      automatisch über die Universes verteilt.
    </p>
  </section>
{/if}

{#each s.groups as g, gi (g.id)}
  {@const gr = groupResult(g.id)}
  {@const conflicts = conflictsOf(g.id)}
  {@const dbFixture = g.fixture ? fixtureById(g.fixture.id) : undefined}
  <section class="card group">
    <div class="group-head">
      <input class="text-input" bind:value={g.name} placeholder="Gruppe {gi + 1}" aria-label="Name der Gruppe" />
      <button class="icon-del" aria-label="{groupLabel(g, gi)} löschen" onclick={() => s.groups.splice(gi, 1)}>
        <Icon name="trash" size={20} />
      </button>
    </div>

    {#if pickerFor === g.id}
      <div class="picker">
        <!-- svelte-ignore a11y_autofocus -->
        <input class="search" type="search" bind:value={query} placeholder="Hersteller oder Modell" aria-label="Gerät suchen" autofocus />
        {#if dbFailed}
          <p class="warning">Gerätedatenbank konnte nicht geladen werden. Kanalzahl manuell eingeben.</p>
        {:else if !loaded}
          <p class="small muted">Datenbank wird geladen …</p>
        {:else if query.trim() && hits.length === 0}
          <p class="small muted">Kein Gerät gefunden.</p>
        {/if}
        <ul class="hits">
          {#each hits as h (h)}
            {@const f = fixtureAt(loaded!.db, h)!}
            <li>
              <button class="hit" onclick={() => choose(g, f)}>
                <span class="muted small">{f.manufacturer}</span>
                <span>{f.name}</span>
              </button>
            </li>
          {/each}
        </ul>
        {#if found.length > MAX_HITS}
          <p class="small muted">Weitere Treffer – Suche genauer eingeben (z. B. Hersteller und Modell).</p>
        {/if}
        <div class="picker-actions">
          <button
            class="link-btn"
            onclick={() => {
              if (g.fixture) g.manualChannels = g.fixture.channelNames.length;
              g.fixture = undefined;
              pickerFor = undefined;
            }}>Ohne Datenbank (Kanalzahl)</button
          >
          <button class="link-btn" onclick={() => (pickerFor = undefined)}>Abbrechen</button>
        </div>
      </div>
    {:else}
      <div class="row">
        <span class="label">Gerät</span>
        <button class="link-btn device" onclick={() => { pickerFor = g.id; query = ''; }}>
          {g.fixture ? g.fixture.label : 'Aus Datenbank wählen …'}
        </button>
      </div>
    {/if}

    {#if g.fixture}
      {#if dbFixture && dbFixture.modes.length > 1}
        <div class="row stack">
          <label class="label" for="mode-{g.id}">Modus</label>
          <select id="mode-{g.id}" value={g.fixture.mode} onchange={(e) => choose(g, dbFixture, e.currentTarget.value)}>
            {#each dbFixture.modes as m, mi (mi)}
              <option value={m.name}>{m.name} ({m.channels.length} Kanäle)</option>
            {/each}
          </select>
        </div>
      {:else}
        <ResultRow label="Modus" value={g.fixture.mode} />
      {/if}
      <ResultRow label="Kanäle pro Gerät" value={String(g.fixture.channelNames.length)} />
      {#if loaded && !dbFixture}
        <p class="warning">Gerät nicht mehr in der Datenbank – gespeicherte Kanalliste wird verwendet.</p>
      {:else if dbFixture && isStale(g.fixture, dbFixture)}
        <div class="warning stale">
          <span>Die Datenbank hat für diesen Modus eine andere Kanalliste als gespeichert (z. B. nach einem App-Update). Gerechnet wird mit der gespeicherten.</span>
          <button class="btn" onclick={() => choose(g, dbFixture, g.fixture!.mode)}>Aus Datenbank übernehmen</button>
        </div>
      {/if}
    {:else}
      <NumberField label="Kanäle pro Gerät" bind:value={g.manualChannels} digits={0} integer min={1} max={512} />
    {/if}

    <NumberField label="Anzahl" bind:value={g.count} digits={0} integer min={1} />
    <NumberField label="Universe" bind:value={g.universe} digits={0} integer min={1} />
    <ToggleRow label="Feste Startadresse" bind:checked={g.fixedStart} />
    {#if g.fixedStart}
      <NumberField label="Startadresse" bind:value={g.start} digits={0} integer min={1} max={512} />
    {/if}
    <NumberField label="Lücke zwischen Geräten" bind:value={g.gap} digits={0} integer min={0} max={511} unit="Kanäle" />

    {#if gr?.split && !g.fixedStart && g.keepTogether === undefined}
      <div class="question" role="group" aria-label="Gruppe verteilt">
        <p>
          Die Gruppe passt nicht mehr komplett in Universe {gr.fixtures[0]?.universe} und wird auf mehrere Universes
          verteilt. So lassen?
        </p>
        <div class="question-actions">
          <button class="btn" onclick={() => (g.keepTogether = false)}>Aufteilen</button>
          <button class="btn primary" onclick={() => (g.keepTogether = true)}>Zusammenhalten</button>
        </div>
      </div>
    {:else if g.keepTogether !== undefined && !g.fixedStart}
      <ToggleRow label="Gruppe zusammenhalten" bind:checked={g.keepTogether} />
    {/if}
    {#if gr?.split && g.fixedStart}
      <p class="warning">Ab der festen Startadresse passt die Gruppe nicht in ein Universe – der Rest liegt im nächsten.</p>
    {/if}
    {#if gr?.split && g.keepTogether && !g.fixedStart}
      <p class="small muted">Größer als ein Universe – wird trotzdem aufgeteilt.</p>
    {/if}

    {#if gr?.issue}
      <p class="warning">{ISSUE_TEXT[gr.issue]}{gr.unplaced ? ` ${gr.unplaced} Gerät(e) nicht gepatcht.` : ''}</p>
    {/if}
    {#each conflicts as c (c.universe + c.groupId + JSON.stringify(c.with))}
      <p class="warning">{conflictText(c, g.id)}</p>
    {/each}

    {#if gr && gr.fixtures.length}
      {@const first = gr.fixtures[0]!}
      {@const last = gr.fixtures.at(-1)!}
      {@const blocks = blockCount(gr.fixtures, g.gap)}
      <ResultRow
        label="Adressen"
        value={first.universe === last.universe
          ? `U${first.universe} · ${first.start}–${last.end}`
          : `U${first.universe}.${first.start} – U${last.universe}.${last.end}`}
        emphasized
      />
      {#if blocks > 1}
        <p class="small muted">In {blocks} Blöcken – dazwischen liegen andere Geräte oder reservierte Bereiche. Einzelne Adressen in der Patch-Liste.</p>
      {/if}
    {/if}

    {#if g.fixture}
      <details class="channels">
        <summary>Kanalbelegung</summary>
        <ol>
          {#each g.fixture.channelNames as name, ci (ci)}
            <li><span class="num ch">{ci + 1}</span> {name || '(ungenutzt)'}</li>
          {/each}
        </ol>
      </details>
    {/if}
  </section>
{/each}

<button class="btn block" onclick={() => s.groups.push(newGroup(s.groups.at(-1)?.universe ?? 1))}>
  <Icon name="plus" size={20} /> Gruppe hinzufügen
</button>

<section class="card">
  <h2>Optionen</h2>
  <div class="row stack">
    <label class="label" for="placement">Platzierung</label>
    <select id="placement" bind:value={s.placement}>
      {#each placements as p (p.value)}
        <option value={p.value}>{p.label}</option>
      {/each}
    </select>
  </div>
  <p class="small muted">{placements.find((p) => p.value === s.placement)?.hint}</p>
  <Segmented label="Ausrichtung der Startadressen" options={aligns} bind:value={s.align} />
  {#if s.align === 'custom'}
    <NumberField label="Raster N" hint="Startadressen 1, 1+N, 1+2N …" bind:value={s.alignCustom} digits={0} integer min={1} max={512} />
  {/if}
  {#if s.align !== 'none'}
    <Segmented label="Ausrichtung gilt für" options={scopes} bind:value={s.alignScope} />
  {/if}
  <Segmented label="Art-Net-Zählung" options={bases} bind:value={s.artNetBase} />

  <h3 class="sub">Reservierte Bereiche</h3>
  {#each s.reserved as r, ri (r.id)}
    <div class="reserved">
      <NumberField label="Universe" bind:value={r.universe} digits={0} integer min={1} />
      <NumberField label="Von" bind:value={r.from} digits={0} integer min={1} max={512} />
      <NumberField label="Bis" bind:value={r.to} digits={0} integer min={1} max={512} />
      <button class="link-btn danger" onclick={() => s.reserved.splice(ri, 1)}>Bereich entfernen</button>
    </div>
  {/each}
  <button class="link-btn" onclick={() => s.reserved.push({ id: uid(), universe: 1, from: 1, to: 20 })}>
    + Reservierten Bereich hinzufügen
  </button>
</section>

{#if !patch.ok}
  <p class="warning">{ERROR_TEXT[patch.error]}</p>
{:else if result && result.universes.length}
  <section class="card">
    <h2>Belegung</h2>
    {#each result.universes as u (u.universe)}
      <div class="usage">
        <div class="usage-head">
          <strong>Universe {u.universe}</strong>
          <span class="small muted">Art-Net {artNet(u.universe)}</span>
        </div>
        <div class="bar" aria-hidden="true">
          <span class="used" style:flex-grow={u.used}></span>
          <span class="gaps" style:flex-grow={u.gaps}></span>
          <span class="res" style:flex-grow={u.reserved}></span>
          <span class="free" style:flex-grow={u.free}></span>
        </div>
        <p class="small">
          {u.used} belegt{u.gaps ? ` · ${u.gaps} Lücken` : ''}{u.reserved ? ` · ${u.reserved} reserviert` : ''} · {u.free} frei
        </p>
      </div>
    {/each}
  </section>

  {#if fixtures.length}
    <section class="card">
      <h2>Patch ({fixtures.length} Geräte)</h2>
      <ul class="patch">
        {#each fixtures.slice(0, MAX_ROWS) as f (f.number)}
          <li>
            <div class="patch-main">
              <span><span class="muted num">#{f.number}</span> {f.label}</span>
              <strong class="num">U{f.universe} · {f.start}–{f.end}</strong>
            </div>
            <div class="small muted patch-sub">
              <span>DIP {dip(f.start)}</span>
              <span>Art-Net {artNet(f.universe)}</span>
            </div>
          </li>
        {/each}
      </ul>
      {#if fixtures.length > MAX_ROWS}
        <p class="small muted">Die ersten {MAX_ROWS} von {fixtures.length} Geräten werden angezeigt.</p>
      {/if}
    </section>
  {/if}
{/if}

<FormulaBox title="Regeln & Annahmen">
  <p>Ein Gerät überschreitet nie die Universe-Grenze: Startadresse + Kanäle − 1 ≤ 512.</p>
  <p>Gruppen mit fester Startadresse werden genau so gesetzt. Überschneidungen mit anderen festen Gruppen oder reservierten Bereichen werden angezeigt, nicht verschoben.</p>
  <p>Gruppen ohne Startadresse werden danach in Listenreihenfolge platziert und umgehen reservierte Bereiche, Lücken und bereits gepatchte Geräte. Passt ein Gerät nicht mehr, geht es ins nächste Universe; bei Aufteilung fragt die App nach.</p>
  <p>Raster N: Startadressen 1, 1 + N, 1 + 2N … (N = 10 → x01, x11, x21 …).</p>
  <p>DIP-Schalter (Kurzform): Schalter auf ON nach Standardprofil (Schalter 1 = 1, ON = 1, Adresse = Summe). Abweichende Geräte im DIP-Schalter-Rechner prüfen.</p>
  <p>Art-Net: Net:Sub-Net:Universe aus der 15-Bit-Port-Address. Ob Universe 1 als 0:0:0 oder 0:0:1 gezählt wird, hängt vom Pult ab.</p>
  <p>Gerätedaten: Open Fixture Library (MIT). Angaben ohne Gewähr – Kanalzahl im Zweifel mit der Bedienungsanleitung abgleichen.</p>
</FormulaBox>

<style>
  .intro {
    padding: 12px 0;
  }
  .group-head {
    display: flex;
    align-items: center;
    gap: 8px;
    border-bottom: 1px solid var(--line);
  }
  .icon-del {
    min-width: var(--tap);
    min-height: var(--tap);
    border: 0;
    background: none;
    color: var(--bad);
    cursor: pointer;
  }
  .device {
    text-align: right;
    max-width: 65%;
  }
  .stack {
    flex-direction: column;
    align-items: stretch;
    gap: 4px;
  }
  select {
    min-height: var(--tap);
    width: 100%;
    border: 0;
    border-radius: 8px;
    background: var(--surface-2);
    padding: 0 8px;
  }
  .picker {
    padding: 8px 0;
    border-bottom: 1px solid var(--line);
  }
  .search {
    width: 100%;
    min-height: var(--tap);
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--bg);
    padding: 0 12px;
    font-size: 17px;
  }
  .hits {
    list-style: none;
    margin: 4px 0 0;
    padding: 0;
    max-height: 50vh;
    overflow-y: auto;
  }
  .hit {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    width: 100%;
    min-height: var(--tap);
    padding: 6px 4px;
    border: 0;
    border-bottom: 1px solid var(--line);
    background: none;
    text-align: left;
    cursor: pointer;
  }
  .picker-actions {
    display: flex;
    justify-content: space-between;
    gap: 12px;
  }
  .stale {
    flex-direction: column;
    align-items: stretch;
  }
  .question {
    background: var(--warn-bg);
    color: var(--warn);
    border-radius: 10px;
    padding: 10px 12px;
    margin: 8px 0;
  }
  .question p {
    margin: 0 0 8px;
  }
  .question-actions {
    display: flex;
    gap: 8px;
  }
  .question-actions .btn {
    flex: 1;
  }
  .channels summary {
    min-height: var(--tap);
    display: flex;
    align-items: center;
    color: var(--accent);
    cursor: pointer;
  }
  .channels ol {
    list-style: none;
    margin: 0 0 8px;
    padding: 0;
    font-size: 15px;
  }
  .ch {
    display: inline-block;
    min-width: 2.5em;
    color: var(--muted);
  }
  .sub {
    font-size: 15px;
    padding: 12px 0 0;
  }
  .reserved {
    border-bottom: 1px solid var(--line);
  }
  .usage {
    padding: 8px 0;
    border-bottom: 1px solid var(--line);
  }
  .usage:last-child {
    border-bottom: 0;
  }
  .usage-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }
  .usage p {
    margin: 4px 0 0;
  }
  .bar {
    display: flex;
    height: 12px;
    margin-top: 6px;
    border-radius: 6px;
    overflow: hidden;
    background: var(--surface-2);
  }
  .bar span {
    flex-basis: 0;
  }
  .used {
    background: var(--accent);
  }
  .gaps {
    background: var(--line);
  }
  .res {
    background: var(--warn);
  }
  .free {
    background: var(--surface-2);
  }
  .patch {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .patch li {
    padding: 8px 0;
    border-bottom: 1px solid var(--line);
  }
  .patch li:last-child {
    border-bottom: 0;
  }
  .patch-main,
  .patch-sub {
    display: flex;
    justify-content: space-between;
    gap: 12px;
  }
  .patch-main strong {
    white-space: nowrap;
  }
</style>
