<script lang="ts">
  import ResultRow from '../lib/ui/ResultRow.svelte';
  import { clearAllStored } from '../lib/ui/persisted.svelte';

  let cleared = $state(false);
  const standalone =
    typeof window !== 'undefined' &&
    (window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);
</script>

<section class="card">
  <h2>App</h2>
  <ResultRow label="Version" value={__APP_VERSION__} />
  <ResultRow label="Installiert" value={standalone ? 'Ja' : 'Nein (Browser)'} />
</section>

{#if !standalone}
  <section class="card">
    <h2>Als App installieren</h2>
    <p class="small">
      <strong>iPhone/iPad (Safari):</strong> Teilen-Symbol → „Zum Home-Bildschirm“.<br />
      <strong>Android (Chrome):</strong> Menü ⋮ → „App installieren“.<br />
      Danach startet AV Tools im Vollbild und funktioniert komplett offline.
    </p>
  </section>
{/if}

<section class="card">
  <h2>Datenschutz</h2>
  <p class="small">
    AV Tools erhebt, speichert und überträgt keine personenbezogenen Daten. Die App stellt nach dem Laden keine
    Verbindung zu anderen Servern her und enthält keine Analyse-, Tracking- oder Werbedienste. Mikrofonsignale werden nur
    im Arbeitsspeicher deines Geräts ausgewertet und weder gespeichert noch übertragen. Deine letzten Eingaben werden
    lokal im Browser gespeichert.
  </p>
  <p class="small"><a href="./datenschutz.html">Vollständige Datenschutzerklärung</a></p>
  {#if cleared}
    <p class="small muted">Gespeicherte Eingaben gelöscht.</p>
  {:else}
    <button
      class="link-btn danger"
      onclick={() => {
        clearAllStored();
        cleared = true;
      }}>Gespeicherte Eingaben löschen</button
    >
  {/if}
</section>

<section class="card">
  <h2>Hinweis</h2>
  <p class="small">
    Alle Berechnungen erfolgen nach bestem Wissen, jedoch ohne Gewähr. Ergebnisse vor dem Einsatz immer plausibilisieren.
    Messungen mit Smartphone-Mikrofonen sind unkalibriert und nur als Orientierung geeignet.
  </p>
</section>

<section class="card">
  <h2>Lizenzen</h2>
  <p class="small">AV Tools ist Open Source unter der MIT-Lizenz.</p>
</section>
