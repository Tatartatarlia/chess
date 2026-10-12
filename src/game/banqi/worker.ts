import { chooseBanqiAction, type BanqiAiRequest, type BanqiAiResponse } from './ai.ts';

self.onmessage = (event: MessageEvent<BanqiAiRequest>) => {
  const { id, board, difficulty, aiSide, avoid } = event.data;
  const action = chooseBanqiAction(new Uint8Array(board), difficulty, Math.random, aiSide, avoid);
  const response: BanqiAiResponse = { id, action };
  self.postMessage(response);
};
