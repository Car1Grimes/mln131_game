export interface ProxyConditions {
  latencyMs: number;
  jitterMs: number;
  bytesPerSecond: number;
  frozen: boolean;
  dropDownstream: boolean;
}
export interface NetProxy {
  port: number;
  stats: { connections: number; upBytes: number; downBytes: number; droppedDownBytes: number };
  readonly conditions: ProxyConditions;
  set(next: Partial<ProxyConditions>): void;
  cut(): void;
  close(): Promise<void>;
}
export function createProxy(targetPort: number, initial?: Partial<ProxyConditions>): Promise<NetProxy>;
