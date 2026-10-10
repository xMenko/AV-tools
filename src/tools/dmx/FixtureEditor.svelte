<script lang="ts">
  import { untrack } from 'svelte';
  import {
    CUSTOM_ID_PREFIX,
    channelNamesFromText,
    countNameLines,
    validateCustomFixture,
    type CustomFixtureError,
  } from '../../lib/core/dmx/customFixtures';
  import type { Fixture } from '../../lib/core/dmx/fixtureDb';
  import Icon from '../../lib/ui/Icon.svelte';
  import NumberField from '../../lib/ui/NumberField.svelte';
  import { uid } from '../../lib/ui/uid';

  interface Props {
    /** fixture to edit (custom) or to start from (database copy); undefined = new */
    initial?: Fixture;
    /** keep the id of `initial` (editing) or create a new one (new / copy) */
    keepId?: boolean;
    /** prefill for a new fixture, e.g. the search text */
    suggestedName?: string;
    onsave: (f: Fixture) => void;
    oncancel: () => void;
  }
  let { initial, keepId = false, suggestedName = '', onsave, oncancel }: Props = $props();

  interface ModeDraft {
    key: string;
    name: string;
    count: number;
    text: string;
  }
  const toDraft = (name: string, channels: readonly string[]): ModeDraft => ({
    key: uid(),
    name,
    count: channels.length,
    text: channels.join('\n'),
  });

  // Snapshot of the props at open time; the editor works on its own copy.
  const start = untrack(() => ({ initial, suggestedName }));
  let manufacturer = $state(start.initial?.manufacturer ?? '');
  let name = $state(start.initial?.name ?? start.suggestedName);
  let modes = $state<ModeDraft[]>(
    start.initial ? start.initial.modes.map((m) => toDraft(m.name, m.channels)) : [{ ...toDraft('Standard', []), count: 1 }],
  );
  let error = $state('');

  const ERROR_TEXT: Record<CustomFixtureError, string> = {
    missingName: 'Bitte einen Modellnamen eingeben.',
    noModes: 'Mindestens ein Modus.',
    tooManyModes: 'Höchstens 50 Modi.',
    missingModeName: 'Jeder Modus braucht einen Namen.',
    duplicateModeName: 'Modusnamen müssen verschieden sein.',
    invalidChannelCount: 'Kanalzahl pro Modus: 1–512.',
    textTooLong: 'Namen höchstens 120 Zeichen.',
  };

  function save() {
    const r = validateCustomFixture({
      id: keepId && initial ? initial.id : `${CUSTOM_ID_PREFIX}${uid()}`,
      manufacturer,
      name,
      modes: modes.map((m) => ({ name: m.name, channels: Number.isInteger(m.count) ? channelNamesFromText(m.count, m.text) : [] })),
    });
    if (!r.ok) {
      error = ERROR_TEXT[r.error];
      return;
    }
    onsave(r.value);
  }
</script>

<div class="editor">
  <h3>{keepId ? 'Eigenes Gerät bearbeiten' : 'Eigenes Gerät anlegen'}</h3>
  <label class="field">
    <span class="small muted">Hersteller</span>
    <input class="input" bind:value={manufacturer} maxlength="120" autocomplete="off" />
  </label>
  <label class="field">
    <span class="small muted">Modell</span>
    <input class="input" bind:value={name} maxlength="120" autocomplete="off" />
  </label>

  {#each modes as m, mi (m.key)}
    {@const lines = countNameLines(m.text)}
    <div class="mode">
      <div class="mode-head">
        <input class="input" bind:value={m.name} maxlength="120" aria-label="Name des Modus" placeholder="Modus, z. B. 16ch" />
        {#if modes.length > 1}
          <button class="icon-del" aria-label="Modus {m.name} löschen" onclick={() => modes.splice(mi, 1)}>
            <Icon name="trash" size={20} />
          </button>
        {/if}
      </div>
      <NumberField label="Kanäle" bind:value={m.count} digits={0} integer min={1} max={512} />
      <label class="field">
        <span class="small muted">Kanalnamen, eine Zeile pro Kanal (optional, z. B. aus der Anleitung einfügen)</span>
        <textarea class="input" rows="5" bind:value={m.text}></textarea>
      </label>
      {#if lines > 0 && lines !== m.count}
        <button class="link-btn" onclick={() => (m.count = lines)}>Kanalzahl auf {lines} setzen (Anzahl Zeilen)</button>
      {/if}
    </div>
  {/each}
  <button class="link-btn" onclick={() => modes.push({ ...toDraft(`Modus ${modes.length + 1}`, []), count: 1 })}>+ Modus hinzufügen</button>

  {#if error}<p class="warning">{error}</p>{/if}
  <div class="actions">
    <button class="btn" onclick={oncancel}>Abbrechen</button>
    <button class="btn primary" onclick={save}>Speichern</button>
  </div>
</div>

<style>
  .editor {
    padding: 8px 0;
  }
  h3 {
    font-size: 17px;
    padding: 4px 0 8px;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 6px 0;
  }
  .input {
    width: 100%;
    min-height: var(--tap);
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--bg);
    padding: 8px 12px;
    font-size: 17px;
  }
  textarea.input {
    resize: vertical;
    line-height: 1.4;
  }
  .mode {
    border-top: 1px solid var(--line);
    margin-top: 8px;
    padding-top: 8px;
  }
  .mode-head {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .icon-del {
    min-width: var(--tap);
    min-height: var(--tap);
    border: 0;
    background: none;
    color: var(--bad);
    cursor: pointer;
  }
  .actions {
    display: flex;
    gap: 8px;
    padding-top: 8px;
  }
  .actions .btn {
    flex: 1;
  }
</style>
