import { runCacheConformance } from '../testing';
import { MemoryCacheAdapter } from './memory-cache.adapter';

runCacheConformance('MemoryCacheAdapter', async () => {
  let nowMs = 1_000_000;
  return {
    adapter: new MemoryCacheAdapter(() => nowMs),
    advance: async (ms) => {
      nowMs += ms;
    },
  };
});
