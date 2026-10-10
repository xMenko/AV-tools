import { aggregateBands, dbToPowerInto, makeBands, type Band, type BandFraction, type BandLevel } from '../core/dsp/octaveBands';
import { rmsDbfs } from '../core/dsp/levels';
import { ANALYSER_POWER_TO_FULL_SCALE } from '../core/dsp/analyser';

/** Real-time analyser on top of AnalyserNode: FFT → fractional-octave band levels. */
export class Rta {
  readonly analyser: AnalyserNode;
  private readonly db: Float32Array<ArrayBuffer>;
  private readonly power: Float64Array;
  private readonly time: Float32Array<ArrayBuffer>;
  private bands: Band[];
  private readonly source: AudioNode;

  constructor(source: AudioNode, fraction: BandFraction, fftSize = 16384) {
    this.source = source;
    this.analyser = source.context.createAnalyser();
    this.analyser.fftSize = fftSize;
    this.analyser.minDecibels = -140;
    this.analyser.maxDecibels = 0;
    source.connect(this.analyser);
    this.db = new Float32Array(this.analyser.frequencyBinCount);
    this.power = new Float64Array(this.analyser.frequencyBinCount);
    this.time = new Float32Array(fftSize);
    this.bands = makeBands(fraction);
  }

  setFraction(fraction: BandFraction): void {
    this.bands = makeBands(fraction);
  }

  /** 0 = no averaging … 0.95 = slow */
  setSmoothing(value: number): void {
    this.analyser.smoothingTimeConstant = value;
  }

  /** Band levels; `power` is relative to a full-scale sine → 10·log10(power) = dBFS (AES17). */
  readBands(): BandLevel[] {
    this.analyser.getFloatFrequencyData(this.db);
    dbToPowerInto(this.db, this.power);
    for (let i = 0; i < this.power.length; i++) this.power[i] = this.power[i]! * ANALYSER_POWER_TO_FULL_SCALE;
    return aggregateBands(this.power, this.analyser.context.sampleRate / this.analyser.fftSize, this.bands);
  }

  /** Broadband RMS level of the current block, dBFS (AES17). */
  readLevel(): number {
    this.analyser.getFloatTimeDomainData(this.time);
    return rmsDbfs(this.time);
  }

  dispose(): void {
    this.source.disconnect(this.analyser);
  }
}
