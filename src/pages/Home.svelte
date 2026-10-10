<script lang="ts">
  import Icon from '../lib/ui/Icon.svelte';
  import { href } from '../lib/router.svelte';
  import { CATEGORIES, PLANNED, TOOLS } from '../tools/registry';

  let query = $state('');

  const filtered = $derived.by(() => {
    const q = query.trim().toLowerCase();
    if (!q) return TOOLS;
    return TOOLS.filter((t) => `${t.title} ${t.subtitle} ${t.keywords}`.toLowerCase().includes(q));
  });
  const groups = $derived(
    CATEGORIES.map((c) => ({ ...c, tools: filtered.filter((t) => t.category === c.id) })).filter((g) => g.tools.length > 0),
  );
</script>

<label class="search">
  <Icon name="search" size={20} />
  <input type="search" placeholder="Tool suchen" bind:value={query} aria-label="Tool suchen" />
</label>

{#each groups as group (group.id)}
  <section class="card">
    <h2>{group.title}</h2>
    {#each group.tools as tool (tool.id)}
      <a class="tool row" href={href.tool(tool.id)}>
        <span class="icon"><Icon name={tool.icon} /></span>
        <span class="label">
          <span class="title">{tool.title}</span>
          <span class="subtitle">{tool.subtitle}</span>
        </span>
        <span class="chevron" aria-hidden="true">›</span>
      </a>
    {/each}
  </section>
{:else}
  <p class="muted">Kein Tool gefunden.</p>
{/each}

{#if !query && PLANNED.length}
  <p class="muted small planned">Demnächst: {PLANNED.join(', ')}</p>
{/if}

<style>
  .search {
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--surface);
    border-radius: 10px;
    padding: 0 12px;
    margin-bottom: var(--gap);
    color: var(--muted);
  }
  .search input {
    flex: 1;
    min-height: var(--tap);
    border: 0;
    background: transparent;
    outline: none;
    color: var(--text);
  }
  .tool {
    text-decoration: none;
    color: inherit;
    justify-content: flex-start;
  }
  .icon {
    width: 36px;
    height: 36px;
    border-radius: 9px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: var(--surface-2);
    color: var(--accent);
    flex: 0 0 auto;
  }
  .label {
    display: flex;
    flex-direction: column;
  }
  .title {
    font-weight: 600;
  }
  .subtitle {
    font-size: 14px;
    color: var(--muted);
  }
  .chevron {
    color: var(--muted);
    font-size: 24px;
  }
  .planned {
    text-align: center;
  }
</style>
