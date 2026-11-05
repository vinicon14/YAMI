import { contextBridge, ipcRenderer } from "electron";
import type { Agent, YamiBridge, YamiEvent } from "@yami/contracts";

const bridge: YamiBridge = {
  version: "0.1.0",
  agents: {
    list: () => ipcRenderer.invoke("yami:agents:list") as Promise<Agent[]>,
    create: (input) => ipcRenderer.invoke("yami:agents:create", input) as Promise<Agent>,
  },
  events: {
    recent: (limit) => ipcRenderer.invoke("yami:events:recent", limit) as Promise<YamiEvent[]>,
  },
};

contextBridge.exposeInMainWorld("yami", bridge);
