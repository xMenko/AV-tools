import { type Point3D, distance, isFinitePoint } from '../geometry/point3d';
import { type Result, ok, err } from '../result';
import { isPlausibleTemperature, speedOfSound } from '../units/speedOfSound';

/** How the delay of a line is derived. */
export type DelayMode =
  /** Δt = |main → delay| / c */
  | { kind: 'sourceToSource' }
  /** Δt = (|main → listener| − |delay → listener|) / c */
  | { kind: 'listener'; listener: Point3D };

/** One loudspeaker position within a delay line ("Feld"). Origin = main PA at floor level. */
export interface DelayField {
  readonly id: string;
  readonly name: string;
  readonly position: Point3D;
}

export interface DelayLine {
  readonly id: string;
  readonly name: string;
  readonly mode: DelayMode;
  readonly fields: readonly DelayField[];
  /** Overrides `DelaySettings.offset` for this line, seconds. */
  readonly offsetOverride?: number;
}

export interface DelaySettings {
  /** °C */
  readonly temperatureCelsius: number;
  /** Manual speed of sound in m/s; overrides the temperature when set. */
  readonly speedOfSoundOverride?: number;
  /** Height of the main PA's acoustic centre, m. The main sits at x = 0, y = 0. */
  readonly mainHeight: number;
  /** Extra delay for every field (Haas offset), seconds. */
  readonly offset: number;
  /** Latency already in the delay path (DSP/network), subtracted, seconds. */
  readonly systemLatency: number;
}

export type DelayWarning =
  /** Listener mode: listener is not acoustically behind the delay → delay would be ≤ 0. */
  | 'listenerNotBehindDelay'
  /** System latency is larger than the required delay. */
  | 'latencyExceedsDelay';

export interface DelayFieldResult {
  readonly fieldId: string;
  /** Source-to-source: distance main → delay. Listener mode: path difference. m. */
  readonly distance: number;
  /** Seconds; undefined when a warning prevents a usable value. */
  readonly delay?: number;
  readonly warning?: DelayWarning;
}

export interface DelaySummary {
  readonly minimum: number;
  readonly maximum: number;
  readonly mean: number;
  /** maximum − minimum */
  readonly spread: number;
}

export interface DelayLineResult {
  readonly lineId: string;
  readonly speedOfSound: number;
  readonly fields: readonly DelayFieldResult[];
  /** Statistics over all fields with a delay; undefined if none. */
  readonly summary?: DelaySummary;
}

export type DelayError = 'invalidSpeedOfSound' | 'temperatureOutOfRange' | 'nonFiniteInput';

export function effectiveSpeedOfSound(s: DelaySettings): number {
  return s.speedOfSoundOverride ?? speedOfSound(s.temperatureCelsius);
}

function validate(s: DelaySettings): DelayError | undefined {
  if (![s.mainHeight, s.offset, s.systemLatency, s.temperatureCelsius].every(Number.isFinite)) {
    return 'nonFiniteInput';
  }
  if (s.speedOfSoundOverride !== undefined) {
    if (!Number.isFinite(s.speedOfSoundOverride) || s.speedOfSoundOverride <= 0) return 'invalidSpeedOfSound';
  } else if (!isPlausibleTemperature(s.temperatureCelsius)) {
    return 'temperatureOutOfRange';
  }
  return undefined;
}

function summarize(delays: number[]): DelaySummary | undefined {
  if (delays.length === 0) return undefined;
  const minimum = Math.min(...delays);
  const maximum = Math.max(...delays);
  const mean = delays.reduce((a, b) => a + b, 0) / delays.length;
  return { minimum, maximum, mean, spread: maximum - minimum };
}

export function calculateDelayLine(line: DelayLine, settings: DelaySettings): Result<DelayLineResult, DelayError> {
  const invalid = validate(settings);
  if (invalid) return err(invalid);

  const c = effectiveSpeedOfSound(settings);
  const main: Point3D = { x: 0, y: 0, z: settings.mainHeight };
  const offset = line.offsetOverride ?? settings.offset;
  if (!Number.isFinite(offset)) return err('nonFiniteInput');

  const listener = line.mode.kind === 'listener' ? line.mode.listener : undefined;
  if (listener && !isFinitePoint(listener)) return err('nonFiniteInput');

  const fields: DelayFieldResult[] = [];
  for (const field of line.fields) {
    if (!isFinitePoint(field.position)) return err('nonFiniteInput');

    let dist: number;
    if (listener) {
      dist = distance(main, listener) - distance(field.position, listener);
      if (dist <= 0) {
        fields.push({ fieldId: field.id, distance: dist, warning: 'listenerNotBehindDelay' });
        continue;
      }
    } else {
      dist = distance(main, field.position);
    }

    const delay = dist / c + offset - settings.systemLatency;
    fields.push(
      delay < 0
        ? { fieldId: field.id, distance: dist, warning: 'latencyExceedsDelay' }
        : { fieldId: field.id, distance: dist, delay },
    );
  }

  const delays = fields.flatMap((f) => (f.delay === undefined ? [] : [f.delay]));
  return ok({ lineId: line.id, speedOfSound: c, fields, summary: summarize(delays) });
}
