import type { RoommateOrderItem } from '../types/orders';

export type MqttConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'offline';

export const DEFAULT_ROOM_CODE = 'sakan-orders-2026-v3';
export const MQTT_BROKER_URL = 'wss://broker.emqx.io:8084/mqtt';

interface MqttClientLike {
  on: (event: string, cb: (...args: unknown[]) => void) => void;
  subscribe: (topic: string | string[], opts: { qos: 0 | 1 | 2 }, cb?: (err?: unknown) => void) => void;
  unsubscribe: (topic: string | string[]) => void;
  publish: (
    topic: string,
    message: string,
    opts: { retain: boolean; qos: 0 | 1 | 2 },
    cb?: (err?: unknown) => void
  ) => void;
  end: (force?: boolean) => void;
}

declare global {
  interface Window {
    mqtt?: {
      connect: (url: string, opts?: Record<string, unknown>) => MqttClientLike;
    };
  }
}

export function getOrderTopic(roomCode: string, orderId: string): string {
  const cleanRoom = (roomCode || DEFAULT_ROOM_CODE).trim();
  return `sakan_app/${cleanRoom}/orders/${orderId}`;
}

export function getOrdersWildcardTopic(roomCode: string): string {
  const cleanRoom = (roomCode || DEFAULT_ROOM_CODE).trim();
  return `sakan_app/${cleanRoom}/orders/+`;
}

export function getLockStatusTopic(roomCode: string): string {
  const cleanRoom = (roomCode || DEFAULT_ROOM_CODE).trim();
  return `sakan_app/${cleanRoom}/status/locked`;
}

export function getPushSubTopic(roomCode: string, deviceId: string): string {
  const cleanRoom = (roomCode || DEFAULT_ROOM_CODE).trim();
  return `sakan_app/${cleanRoom}/push_subs/${deviceId}`;
}

export function getPushSubsWildcardTopic(roomCode: string): string {
  const cleanRoom = (roomCode || DEFAULT_ROOM_CODE).trim();
  return `sakan_app/${cleanRoom}/push_subs/+`;
}

export class SakanMqttSync {
  private client: MqttClientLike | null = null;
  private roomCode: string;
  private onOrderReceived: (orderId: string, order: RoommateOrderItem | null) => void;
  private onStatusChange: (status: MqttConnectionStatus) => void;
  private onLockStatusChange?: (locked: boolean) => void;
  private onPushSubscriptionReceived?: (deviceId: string, sub: PushSubscriptionJSON) => void;

  constructor(params: {
    roomCode: string;
    onOrderReceived: (orderId: string, order: RoommateOrderItem | null) => void;
    onStatusChange: (status: MqttConnectionStatus) => void;
    onLockStatusChange?: (locked: boolean) => void;
    onPushSubscriptionReceived?: (deviceId: string, sub: PushSubscriptionJSON) => void;
  }) {
    this.roomCode = params.roomCode || DEFAULT_ROOM_CODE;
    this.onOrderReceived = params.onOrderReceived;
    this.onStatusChange = params.onStatusChange;
    this.onLockStatusChange = params.onLockStatusChange;
    this.onPushSubscriptionReceived = params.onPushSubscriptionReceived;
  }

  public connect(): void {
    if (typeof window === 'undefined' || !window.mqtt) {
      this.onStatusChange('offline');
      return;
    }

    this.onStatusChange('connecting');

    try {
      const clientId = `sakan_client_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
      const client = window.mqtt.connect(MQTT_BROKER_URL, {
        clientId,
        clean: true,
        connectTimeout: 8000,
        reconnectPeriod: 3000,
      });

      this.client = client;

      client.on('connect', () => {
        this.onStatusChange('connected');
        client.subscribe(
          [
            getOrdersWildcardTopic(this.roomCode),
            getLockStatusTopic(this.roomCode),
            getPushSubsWildcardTopic(this.roomCode),
          ],
          { qos: 1 }
        );
      });

      client.on('reconnect', () => {
        this.onStatusChange('reconnecting');
      });

      client.on('offline', () => {
        this.onStatusChange('offline');
      });

      client.on('error', () => {
        this.onStatusChange('offline');
      });

      client.on('message', (topicRaw: unknown, payloadRaw: unknown) => {
        const topic = String(topicRaw || '');
        const payloadStr =
          payloadRaw && typeof (payloadRaw as { toString?: () => string }).toString === 'function'
            ? (payloadRaw as { toString: () => string }).toString().trim()
            : '';

        const lockTopic = getLockStatusTopic(this.roomCode);
        if (topic === lockTopic) {
          if (!payloadStr) {
            this.onLockStatusChange?.(false);
            return;
          }
          try {
            const parsed = JSON.parse(payloadStr) as { locked?: boolean };
            this.onLockStatusChange?.(Boolean(parsed?.locked));
          } catch {
            this.onLockStatusChange?.(payloadStr === 'true');
          }
          return;
        }

        const pushPrefix = `sakan_app/${this.roomCode}/push_subs/`;
        if (topic.startsWith(pushPrefix)) {
          const subDeviceId = topic.slice(pushPrefix.length);
          if (!subDeviceId || !payloadStr) return;
          try {
            const parsed = JSON.parse(payloadStr) as PushSubscriptionJSON;
            if (parsed && typeof parsed.endpoint === 'string' && parsed.endpoint.startsWith('http')) {
              this.onPushSubscriptionReceived?.(subDeviceId, parsed);
            }
          } catch {
            // ignore
          }
          return;
        }

        const orderPrefix = `sakan_app/${this.roomCode}/orders/`;
        if (topic.startsWith(orderPrefix)) {
          const orderId = topic.slice(orderPrefix.length);
          if (!orderId) return;

          if (!payloadStr) {
            this.onOrderReceived(orderId, null);
            return;
          }

          try {
            const parsed = JSON.parse(payloadStr) as RoommateOrderItem;
            if (parsed && parsed.id && parsed.itemName && parsed.roommateName) {
              this.onOrderReceived(orderId, parsed);
            }
          } catch {
            // ignore malformed JSON
          }
        }
      });
    } catch {
      this.onStatusChange('offline');
    }
  }

  public publishOrder(order: RoommateOrderItem): void {
    if (!this.client) return;
    const topic = getOrderTopic(this.roomCode, order.id);
    this.client.publish(topic, JSON.stringify(order), { retain: true, qos: 1 });
  }

  public publishLockStatus(locked: boolean): void {
    if (!this.client) return;
    const topic = getLockStatusTopic(this.roomCode);
    this.client.publish(
      topic,
      JSON.stringify({ locked, updatedAt: new Date().toISOString() }),
      { retain: true, qos: 1 }
    );
  }

  public publishPushSubscription(deviceId: string, sub: PushSubscriptionJSON): void {
    if (!this.client || !sub || !sub.endpoint) return;
    const topic = getPushSubTopic(this.roomCode, deviceId);
    this.client.publish(topic, JSON.stringify(sub), { retain: true, qos: 1 });
  }

  public deleteOrder(orderId: string): void {
    if (!this.client) return;
    const topic = getOrderTopic(this.roomCode, orderId);
    this.client.publish(topic, '', { retain: true, qos: 1 });
  }

  public clearAllOrders(orderIds: string[]): void {
    if (!this.client) return;
    for (const id of orderIds) {
      const topic = getOrderTopic(this.roomCode, id);
      this.client.publish(topic, '', { retain: true, qos: 1 });
    }
  }

  public disconnect(): void {
    if (this.client) {
      try {
        this.client.end(true);
      } catch {
        // ignore
      }
      this.client = null;
    }
  }
}
