import type { Component } from 'svelte';
import type { IconName } from '../lib/ui/Icon.svelte';

export type Category = 'audio' | 'measure' | 'lighting' | 'video' | 'network' | 'power' | 'rigging';

export const CATEGORIES: readonly { id: Category; title: string }[] = [
  { id: 'audio', title: 'Audio' },
  { id: 'measure', title: 'Messen' },
  { id: 'lighting', title: 'Licht' },
  { id: 'video', title: 'Video' },
  { id: 'network', title: 'Netzwerk' },
  { id: 'power', title: 'Strom' },
  { id: 'rigging', title: 'Rigging' },
];

export interface ToolDef {
  /** Stable id, used in the URL (#/tool/<id>) and for stored inputs. Never change once released. */
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
  /** extra search terms */
  readonly keywords: string;
  readonly category: Category;
  readonly icon: IconName;
  /** Rigging/power: show the disclaimer gate first */
  readonly requiresDisclaimer?: boolean;
  readonly load: () => Promise<{ default: Component }>;
}

/** Single place where tools are registered – one entry per tool. */
export const TOOLS: readonly ToolDef[] = [
  {
    id: 'delay',
    title: 'Delay-Rechner',
    subtitle: 'Delay-Linien aus Abstand und Höhe',
    keywords: 'delay verzögerung linie tower haas laufzeit',
    category: 'audio',
    icon: 'delay',
    load: () => import('./delay/DelayTool.svelte'),
  },
  {
    id: 'subs',
    title: 'Zahnlücken-Rechner',
    subtitle: 'Sub-Abstand und Arc-Delay',
    keywords: 'sub subwoofer bass abstand zahnlücke arc array lücke',
    category: 'audio',
    icon: 'subs',
    load: () => import('./subs/SubSpacingTool.svelte'),
  },
  {
    id: 'generator',
    title: 'Signalgenerator',
    subtitle: 'Sinus, Rauschen, Sweep, Polaritätssignal',
    keywords: 'generator sinus rosa rauschen pink noise sweep ton',
    category: 'measure',
    icon: 'generator',
    load: () => import('./generator/GeneratorTool.svelte'),
  },
  {
    id: 'rta',
    title: 'RTA',
    subtitle: 'Frequenzanalyse über das Mikrofon',
    keywords: 'rta analyser spektrum terz oktav fft mikrofon',
    category: 'measure',
    icon: 'rta',
    load: () => import('./rta/RtaTool.svelte'),
  },
  {
    id: 'polarity',
    title: 'Polaritätscheck',
    subtitle: 'Polarität von Lautsprechern prüfen',
    keywords: 'polarität phase verpolt polarity check',
    category: 'measure',
    icon: 'polarity',
    load: () => import('./polarity/PolarityTool.svelte'),
  },
  {
    id: 'dip',
    title: 'DIP-Schalter-Rechner',
    subtitle: 'DMX-Adresse ↔ Schalterstellung',
    keywords: 'dip schalter dmx adresse switch adressierung',
    category: 'lighting',
    icon: 'dip',
    load: () => import('./dip/DipTool.svelte'),
  },
];

/** Shown as "demnächst" on the home screen. */
export const PLANNED: readonly string[] = ['DMX-Adressrechner'];

export const toolById = (id: string) => TOOLS.find((t) => t.id === id);
