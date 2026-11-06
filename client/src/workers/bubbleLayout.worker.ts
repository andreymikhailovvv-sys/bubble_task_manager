import { computeBubbleLayout, type BubbleLayoutRequest, type BubbleLayoutResponse } from '../lib/bubbleLayoutCompute';

self.onmessage = (event: MessageEvent<BubbleLayoutRequest>) => {
  const { revision, modes, ...input } = event.data;
  for (const mode of modes) {
    try {
      const snapshot = computeBubbleLayout(input, mode);
      const message: BubbleLayoutResponse = { revision, mode, snapshot };
      self.postMessage(message);
    } catch (error) {
      const message: BubbleLayoutResponse = {
        revision, mode, error: error instanceof Error ? error.message : String(error)
      };
      self.postMessage(message);
    }
  }
};
