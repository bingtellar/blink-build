import { pipeline, env } from '@xenova/transformers';

env.allowLocalModels = false;
env.backends.onnx.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/';

let transcriber: any = null;

self.addEventListener('message', async (event) => {
  const { audioData } = event.data;

  try {
    if (!transcriber) {
      self.postMessage({ status: 'loading' });
      transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en', {
        progress_callback: (data: any) => {
          self.postMessage({ status: 'progress', data });
        }
      });
    }

    self.postMessage({ status: 'processing' });

    const output = await transcriber(audioData, {
      chunk_length_s: 30,
      stride_length_s: 5,
      language: 'english',
      task: 'transcribe',
    });

    // 🌟 THE FIX: Intercept silent audio outputs
    if (!output.text || output.text.trim() === "") {
        self.postMessage({ status: 'error', message: "No speech detected. Please try again." });
    } else {
        self.postMessage({ status: 'success', text: output.text });
    }
    
  } catch (error: any) {
    self.postMessage({ status: 'error', message: error.message });
  }
});