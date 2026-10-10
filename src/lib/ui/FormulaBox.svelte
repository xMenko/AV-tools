<script lang="ts">
  import type { Snippet } from 'svelte';
  let { children, title = 'Formel & Annahmen' }: { children: Snippet; title?: string } = $props();
</script>

<details class="card formula">
  <summary>{title}</summary>
  <div class="content small">
    {@render children()}
  </div>
</details>

<style>
  summary {
    min-height: var(--tap);
    display: flex;
    align-items: center;
    cursor: pointer;
    color: var(--accent);
  }
  .content {
    padding-bottom: 12px;
  }
  .content :global(p) {
    margin: 6px 0;
  }
  .content :global(code) {
    font-family: var(--mono);
    font-size: 14px;
  }
</style>
