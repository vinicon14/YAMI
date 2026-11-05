import type { YamiBridge } from "@yami/contracts";

declare global {
  interface Window {
    yami?: YamiBridge;
  }
}

export {};
