<script lang="ts">
  import { onMount } from 'svelte';
  import { registerSW } from 'virtual:pwa-register';
  import Icon from './lib/ui/Icon.svelte';
  import DisclaimerGate from './lib/ui/DisclaimerGate.svelte';
  import { readStored, writeStored } from './lib/ui/persisted.svelte';
  import { router, href } from './lib/router.svelte';
  import { toolById } from './tools/registry';
  import Home from './pages/Home.svelte';
  import About from './pages/About.svelte';

  type Theme = 'auto' | 'night';
  let theme = $state<Theme>(readStored<Theme>('theme', 'auto'));
  $effect(() => {
    if (theme === 'auto') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'night' ? '#000000' : '#111113');
    writeStored('theme', theme);
  });

  let needRefresh = $state(false);
  let offlineReady = $state(false);
  let updateSW: ((reload?: boolean) => Promise<void>) | undefined;

  onMount(() => {
    updateSW = registerSW({
      onNeedRefresh: () => (needRefresh = true),
      onOfflineReady: () => {
        offlineReady = true;
        setTimeout(() => (offlineReady = false), 4000);
      },
    });
  });

  const route = $derived(router.route);
  const tool = $derived(route.name === 'tool' ? toolById(route.id) : undefined);
  const title = $derived(route.name === 'about' ? 'Über' : (tool?.title ?? 'AV Tools'));

  $effect(() => {
    document.title = route.name === 'home' ? 'AV Tools' : `${title} – AV Tools`;
  });
</script>

<header class="topbar">
  <div class="inner">
    {#if route.name !== 'home'}
      <a class="icon-btn" href={href.home} aria-label="Zurück zur Übersicht"><Icon name="back" /></a>
    {:else}
      <span class="icon-btn spacer" aria-hidden="true"></span>
    {/if}
    <h1>{title}</h1>
    <button
      class="icon-btn"
      onclick={() => (theme = theme === 'night' ? 'auto' : 'night')}
      aria-label={theme === 'night' ? 'Nachtmodus aus' : 'Nachtmodus an'}
      aria-pressed={theme === 'night'}
    >
      <Icon name="theme" />
    </button>
    {#if route.name === 'home'}
      <a class="icon-btn" href={href.about} aria-label="Über die App"><Icon name="info" /></a>
    {/if}
  </div>
</header>

{#if needRefresh}
  <div class="banner" role="status">
    <span>Neue Version verfügbar.</span>
    <button class="btn primary" onclick={() => updateSW?.(true)}>Neu laden</button>
  </div>
{:else if offlineReady}
  <div class="banner" role="status"><span>Offline bereit – die App funktioniert jetzt ohne Netz.</span></div>
{/if}

<main class="page">
  {#if route.name === 'home'}
    <Home />
  {:else if route.name === 'about'}
    <About />
  {:else if tool}
    {#await tool.load()}
      <p class="muted">Lädt …</p>
    {:then mod}
      {#if tool.requiresDisclaimer}
        <DisclaimerGate><mod.default /></DisclaimerGate>
      {:else}
        <mod.default />
      {/if}
    {:catch}
      <p class="warning">Tool konnte nicht geladen werden.</p>
    {/await}
  {:else}
    <p class="muted">Tool nicht gefunden. <a href={href.home}>Zur Übersicht</a></p>
  {/if}
</main>

<style>
  .topbar {
    position: sticky;
    top: 0;
    z-index: 10;
    background: color-mix(in srgb, var(--bg) 88%, transparent);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border-bottom: 1px solid var(--line);
    padding-top: env(safe-area-inset-top);
  }
  .inner {
    max-width: 720px;
    margin: 0 auto;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 0 8px;
    min-height: 52px;
  }
  h1 {
    flex: 1 1 auto;
    font-size: 18px;
    font-weight: 600;
    text-align: center;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .icon-btn {
    width: var(--tap);
    height: var(--tap);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 0;
    background: none;
    color: var(--accent);
    border-radius: 10px;
    cursor: pointer;
    flex: 0 0 auto;
  }
  .banner {
    max-width: 720px;
    margin: 8px auto 0;
    padding: 8px 16px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    background: var(--surface);
    border-radius: var(--radius);
  }
</style>
