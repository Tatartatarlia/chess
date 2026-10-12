import { chooseMove } from './ai.ts';
import type { AiRequest, AiResponse } from './types.ts';

self.onmessage = (event: MessageEvent<AiRequest>) => {
  const { id, board, difficulty, ai } = event.data;
  const move = chooseMove(new Uint8Array(board), difficulty, Math.random, ai);
  const response: AiResponse = { id, x: move.x, y: move.y };
  self.postMessage(response);
};
