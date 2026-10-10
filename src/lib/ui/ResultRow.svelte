<script lang="ts">
  interface Props {
    label: string;
    value: string;
    unit?: string;
    emphasized?: boolean;
  }
  let { label, value, unit = '', emphasized = false }: Props = $props();
</script>

<div class="row" class:emphasized>
  <span class="label">{label}</span>
  <span class="value">{value}{#if unit}<span class="unit">&nbsp;{unit}</span>{/if}</span>
</div>

<style>
  .emphasized .value {
    font-weight: 700;
    font-size: 20px;
  }
  .unit {
    color: var(--muted);
    font-weight: 400;
    font-size: 15px;
  }
</style>
