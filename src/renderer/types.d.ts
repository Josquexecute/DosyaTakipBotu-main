import type { HasarbotuApi } from '../shared/ipc-contract';

declare global {
  interface Window {
    hasarbotu: HasarbotuApi;
  }
}

export {};
