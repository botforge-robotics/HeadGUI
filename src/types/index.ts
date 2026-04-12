export interface RobotOrientation {
  roll: number;
  pitch: number;
  yaw: number;
}

export type TimelineItem =
  | {
      id: string;
      type: "pose";
      orientation: RobotOrientation;
      durationMs: number;
    }
  | { id: string; type: "delay"; durationMs: number }
  | { id: string; type: "setspeed"; speedPercent: number };

export interface Timeline {
  id: string;
  name: string;
  items: TimelineItem[];
  /** When true, playing this sequence repeats from the start. */
  loop?: boolean;
}

export interface SavedPose {
  id: string;
  name: string;
  orientation: RobotOrientation;
  createdAt?: number;
}

export interface SerialPort {
  path: string;
  manufacturer?: string;
  serialNumber?: string;
  productId?: string;
  vendorId?: string;
}

export interface SerialStatus {
  connected: boolean;
  port?: string;
  error?: string;
}

declare global {
  interface Window {
    /**
     * Browser-only transport send: Web Serial, or wireless bridge WebSocket (same contract as Electron `serial.send`).
     * Set by ConnectionPanel when a browser transport is active.
     */
    __webSerialSend?: (data: string) => void;
    electronAPI?: {
      serial: {
        listPorts: () => Promise<{ ports: SerialPort[]; error?: string }>;
        connect: (
          port: string,
        ) => Promise<{ success: boolean; error?: string }>;
        disconnect: () => Promise<{ success: boolean; error?: string }>;
        send: (data: string) => Promise<{ success: boolean; error?: string }>;
        onData: (callback: (data: string) => void) => void;
        onStatus: (callback: (status: SerialStatus) => void) => void;
      };
      network: {
        connect: (ip: string, port: number) => Promise<any>;
        disconnect: () => Promise<any>;
        send: (data: string) => Promise<any>;
      };
      store: {
        get: (key: string) => Promise<any>;
        set: (key: string, value: any) => Promise<void>;
      };
    };
  }
}
