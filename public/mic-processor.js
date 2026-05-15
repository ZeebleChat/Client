// AudioWorklet processor — buffers mic PCM into 960-sample (20ms @ 48kHz) frames
// and posts each frame to the main thread for Opus encoding.
class MicProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buf = [];
    this._frameSize = 960; // 20ms at 48kHz
  }

  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!channel) return true;

    for (let i = 0; i < channel.length; i++) {
      this._buf.push(channel[i]);
    }

    while (this._buf.length >= this._frameSize) {
      const frame = new Float32Array(this._buf.splice(0, this._frameSize));
      this.port.postMessage(frame, [frame.buffer]);
    }

    return true;
  }
}

registerProcessor('mic-processor', MicProcessor);
