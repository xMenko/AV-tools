// AudioWorklet that forwards input blocks to the main thread while recording.
// Plain JavaScript on purpose: loaded via addModule() without a build step.
class RecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.active = true;
    this.port.onmessage = (e) => {
      if (e.data === 'stop') this.active = false;
    };
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel) this.port.postMessage(channel.slice(0));
    return this.active;
  }
}

registerProcessor('av-recorder', RecorderProcessor);
