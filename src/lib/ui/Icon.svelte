<script lang="ts" module>
  export type IconName =
    | 'delay' | 'subs' | 'generator' | 'rta' | 'polarity' | 'info' | 'back' | 'theme' | 'search' | 'plus' | 'trash' | 'mic' | 'dmx' | 'dip';
</script>

<script lang="ts">
  let { name, size = 24 }: { name: IconName; size?: number } = $props();
</script>

<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
  stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  {#if name === 'delay'}
    <circle cx="12" cy="13" r="8" /><path d="M12 9v4l3 2M9 2h6" />
  {:else if name === 'subs'}
    <rect x="2" y="8" width="5" height="8" rx="1" /><rect x="9.5" y="8" width="5" height="8" rx="1" /><rect x="17" y="8" width="5" height="8" rx="1" /><path d="M3 20q9 -4 18 0" />
  {:else if name === 'generator'}
    <path d="M2 12c2-6 4-6 6 0s4 6 6 0 4-6 6 0" /><path d="M22 12h-2" />
  {:else if name === 'rta'}
    <path d="M4 20V14M8 20V9M12 20V12M16 20V6M20 20V11" />
  {:else if name === 'polarity'}
    <path d="M4 12h4l2-7 4 14 2-7h4" /><path d="M18 4h4M20 2v4" />
  {:else if name === 'info'}
    <circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5v.5" />
  {:else if name === 'back'}
    <path d="M15 18l-6-6 6-6" />
  {:else if name === 'theme'}
    <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
  {:else if name === 'search'}
    <circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" />
  {:else if name === 'plus'}
    <path d="M12 5v14M5 12h14" />
  {:else if name === 'trash'}
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
  {:else if name === 'mic'}
    <rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
  {:else if name === 'dmx'}
    <circle cx="12" cy="12" r="9" /><circle cx="8" cy="10" r="1" /><circle cx="16" cy="10" r="1" /><circle cx="10" cy="15" r="1" /><circle cx="14" cy="15" r="1" />
  {:else if name === 'dip'}
    <rect x="3" y="6" width="18" height="12" rx="2" /><path d="M7 9v3M11 12v3M15 9v3M19 12v0" />
  {/if}
</svg>
