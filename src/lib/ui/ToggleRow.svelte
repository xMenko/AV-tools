<script lang="ts">
  import { uid } from './uid';
  let { label, checked = $bindable() }: { label: string; checked: boolean } = $props();
  const id = uid();
</script>

<div class="row">
  <label class="label" for={id}>{label}</label>
  <input {id} type="checkbox" role="switch" bind:checked />
</div>

<style>
  input {
    appearance: none;
    width: 51px;
    height: 31px;
    border-radius: 16px;
    background: var(--surface-2);
    position: relative;
    cursor: pointer;
    flex: 0 0 auto;
    transition: background 0.15s;
  }
  input::after {
    content: '';
    position: absolute;
    top: 2px;
    left: 2px;
    width: 27px;
    height: 27px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 1px 3px rgb(0 0 0 / 0.3);
    transition: transform 0.15s;
  }
  input:checked {
    background: var(--accent);
  }
  input:checked::after {
    transform: translateX(20px);
  }
</style>
