// AudioWorklet processor — buffers mic PCM into 960-sample (20ms @ 48kHz) frames
// and posts each frame to the main thread for Opus encoding.
// Uses a pre-allocated Float32Array ring buffer to avoid GC pressure on the audio thread.
class MicProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._frameSize = 960; // 20ms at 48kHz
    // Ring buffer: hold up to 8 frames worth to absorb bursts without allocation
    this._bufSize = this._frameSize * 8;
    this._buf = new Float32Array(this._bufSize);
    this._write = 0;
    this._count = 0;
  }

  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!channel) return true;

    // Write incoming samples into the ring buffer
    for (let i = 0; i < channel.length; i++) {
      this._buf[this._write] = channel[i];
      this._write = (this._write + 1) % this._bufSize;
      this._count++;
    }

    // Emit complete frames
    while (this._count >= this._frameSize) {
      const frame = new Float32Array(this._frameSize);
      const readStart = (this._write - this._count + this._bufSize) % this._bufSize;
      for (let i = 0; i < this._frameSize; i++) {
        frame[i] = this._buf[(readStart + i) % this._bufSize];
      }
      this._count -= this._frameSize;
      this.port.postMessage(frame, [frame.buffer]);
    }

    return true;
  }
}

registerProcessor('mic-processor', MicProcessor);
