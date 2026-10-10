<script lang="ts">
  import type { Snippet } from 'svelte';
  import { readStored, writeStored } from './persisted.svelte';

  /** Bump when the text changes – users are asked again. */
  const DISCLAIMER_VERSION = 1;
  const KEY = 'disclaimer.acceptedVersion';

  let { children }: { children: Snippet } = $props();
  let accepted = $state(readStored<number>(KEY, 0) >= DISCLAIMER_VERSION);

  function accept() {
    writeStored(KEY, DISCLAIMER_VERSION);
    accepted = true;
  }
</script>

{#if accepted}
  {@render children()}
{:else}
  <div class="card gate">
    <h2>Nur Richtwerte</h2>
    <p>
      Die Ergebnisse dieses Tools sind Richtwerte für die Vorplanung. Es wird keine Gewähr für Richtigkeit oder
      Vollständigkeit übernommen. Die Verantwortung für Planung, Berechnung und Ausführung liegt beim Nutzer bzw. bei
      einer fachkundigen Person. Herstellerangaben und geltende Vorschriften haben immer Vorrang.
    </p>
    <button class="btn primary block big" onclick={accept}>Verstanden – ich übernehme die Verantwortung</button>
  </div>
{/if}

<style>
  .gate {
    padding: 16px;
  }
  .gate h2 {
    font-size: 22px;
    margin-bottom: 8px;
  }
</style>
