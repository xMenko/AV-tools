<script lang="ts">
  import { fmtInput, parseNumber } from './format';
  import { uid } from './uid';

  interface Props {
    label: string;
    value: number;
    unit?: string;
    /** max decimals shown while editing */
    digits?: number;
    allowNegative?: boolean;
    min?: number;
    max?: number;
    hint?: string;
    /** only whole numbers are accepted (e.g. addresses, counts) */
    integer?: boolean;
  }

  let { label, value = $bindable(), unit = '', digits = 3, allowNegative = false, min, max, hint, integer = false }: Props = $props();

  const id = uid();
  let focused = $state(false);
  let text = $state('');
  let invalid = $state(false);

  // Keep the text in sync with external changes while the field is not being edited.
  $effect(() => {
    if (!focused) text = fmtInput(value, digits);
  });

  function onInput(e: Event & { currentTarget: HTMLInputElement }) {
    text = e.currentTarget.value;
    let n = parseNumber(text);
    if (n !== undefined && !allowNegative && n < 0) n = undefined;
    if (n !== undefined && min !== undefined && n < min) n = undefined;
    if (n !== undefined && max !== undefined && n > max) n = undefined;
    if (n !== undefined && integer && !Number.isInteger(n)) n = undefined;
    invalid = n === undefined && text.trim() !== '';
    if (n !== undefined) value = n;
  }

  function onBlur() {
    focused = false;
    invalid = false;
    text = fmtInput(value, digits);
  }
</script>

<div class="row field">
  <label class="label" for={id}>
    {label}
    {#if hint}<span class="hint">{hint}</span>{/if}
  </label>
  <span class="input-group">
    {#if allowNegative}
      <button type="button" class="sign" onclick={() => (value = -value)} aria-label="Vorzeichen von {label} umkehren">±</button>
    {/if}
    <input
      {id}
      type="text"
      inputmode="decimal"
      autocomplete="off"
      enterkeyhint="done"
      class:invalid
      value={text}
      oninput={onInput}
      onfocus={(e) => {
        focused = true;
        e.currentTarget.select();
      }}
      onblur={onBlur}
      aria-invalid={invalid}
    />
    {#if unit}<span class="unit" aria-hidden="true">{unit}</span>{/if}
  </span>
</div>

<style>
  .field .label {
    display: flex;
    flex-direction: column;
  }
  .hint {
    font-size: 13px;
    color: var(--muted);
  }
  .input-group {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 0 0 auto;
  }
  input {
    width: 6.5em;
    min-height: var(--tap);
    text-align: right;
    font-variant-numeric: tabular-nums;
    background: var(--surface-2);
    border: 1px solid transparent;
    border-radius: 8px;
    padding: 0 10px;
  }
  input:focus {
    outline: none;
    border-color: var(--accent);
  }
  input.invalid {
    border-color: var(--bad);
  }
  .unit {
    min-width: 2.2em;
    color: var(--muted);
  }
  .sign {
    width: var(--tap);
    height: var(--tap);
    border-radius: 8px;
    border: 0;
    background: var(--surface-2);
    cursor: pointer;
  }
</style>
