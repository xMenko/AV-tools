import workletUrl from './recorder-worklet.js?url';

const loaded = new WeakSet<BaseAudioContext>();

/**
 * Records `seconds` of audio from `source` (mono, context sample rate).
 * `onStart` runs as soon as the recorder is connected – e.g. to start playback in sync.
 */
export async function record(source: AudioNode, seconds: number, onStart?: () => void): Promise<Float32Array> {
  const context = source.context as AudioContext;
  if (!loaded.has(context)) {
    await context.audioWorklet.addModule(workletUrl);
    loaded.add(context);
  }
  const total = Math.round(seconds * context.sampleRate);
  const out = new Float32Array(total);
  const node = new AudioWorkletNode(context, 'av-recorder', { numberOfInputs: 1, numberOfOutputs: 0 });
  source.connect(node);

  return new Promise((resolve) => {
    onStart?.();
    let written = 0;
    node.port.onmessage = (e: MessageEvent<Float32Array>) => {
      const block = e.data;
      const n = Math.min(block.length, total - written);
      out.set(block.subarray(0, n), written);
      written += n;
      if (written >= total) {
        node.port.postMessage('stop');
        node.port.onmessage = null;
        source.disconnect(node);
        resolve(out);
      }
    };
  });
}
