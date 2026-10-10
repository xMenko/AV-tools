<script lang="ts" generics="T extends string | number">
  interface Props {
    options: readonly { value: T; label: string }[];
    value: T;
    label: string;
  }
  let { options, value = $bindable(), label }: Props = $props();
</script>

<div class="segmented" role="radiogroup" aria-label={label}>
  {#each options as option (option.value)}
    <button
      type="button"
      role="radio"
      aria-checked={value === option.value}
      class:active={value === option.value}
      onclick={() => (value = option.value)}
    >
      {option.label}
    </button>
  {/each}
</div>

<style>
  .segmented {
    display: flex;
    background: var(--surface-2);
    border-radius: 10px;
    padding: 3px;
    gap: 3px;
    margin: 8px 0;
  }
  button {
    flex: 1 1 0;
    min-height: 38px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    cursor: pointer;
    font-size: 15px;
    padding: 0 6px;
  }
  button.active {
    background: var(--surface);
    font-weight: 600;
    box-shadow: 0 1px 3px rgb(0 0 0 / 0.15);
  }
</style>
