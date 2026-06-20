import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface SmartDevice {
  entityId: number;
  entityType: number; // 1=Switch, 2=Alarm, 3=StorageMonitor
  entityName: string;
  customName?: string; // user-defined override
  value?: boolean;
  capacity?: number;
  hasProtection?: boolean;
  protectionExpiry?: number;
  lastUpdated?: number;
  /** Detected destroyed/no-longer-exists (entity returns not_found). */
  destroyed?: boolean;
  /** Consecutive failed lookups, used to confirm destruction. */
  missCount?: number;
  // Cross-server identity — which server this device was paired on.
  serverId?: string;     // `ip:port`
  serverName?: string;   // display name of the originating server
  pairedAt?: number;
}

interface DeviceState {
  devices: Record<number, SmartDevice>;
  addDevice: (device: SmartDevice) => void;
  removeDevice: (id: number) => void;
  updateDevice: (id: number, data: Partial<SmartDevice>) => void;
  renameDevice: (id: number, name: string) => void;
  reset: () => void;
}

export const useDeviceStore = create<DeviceState>()(
  persist(
    (set) => ({
      devices: {},
      addDevice: (d) => set((s) => ({
        devices: { ...s.devices, [d.entityId]: { ...d, entityType: Number(d.entityType), entityId: Number(d.entityId) } }
      })),
      removeDevice: (id) => set((s) => {
        const next = { ...s.devices };
        delete next[id];
        return { devices: next };
      }),
      updateDevice: (id, data) => set((s) => {
        if (!s.devices[id]) return s;
        return {
          devices: {
            ...s.devices,
            [id]: { ...s.devices[id], ...data, lastUpdated: Date.now() }
          }
        };
      }),
      renameDevice: (id, name) => set((s) => {
        if (!s.devices[id]) return s;
        const trimmed = name.trim();
        return {
          devices: {
            ...s.devices,
            [id]: { ...s.devices[id], customName: trimmed || undefined }
          }
        };
      }),
      reset: () => set({ devices: {} })
    }),
    {
      name: 'rust-devices',
      version: 1,
      // Older builds persisted entityType/entityId as strings (from the FCM
      // sidecar). Coerce everything to numbers so type checks (=== 1/2/3) work.
      migrate: (persisted: any) => {
        if (persisted && persisted.devices) {
          const fixed: Record<number, SmartDevice> = {};
          Object.values(persisted.devices).forEach((d: any) => {
            const id = Number(d.entityId);
            fixed[id] = { ...d, entityId: id, entityType: Number(d.entityType) };
          });
          persisted.devices = fixed;
        }
        return persisted;
      },
      // Normalize on every rehydrate too, in case version bump is skipped.
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        const fixed: Record<number, SmartDevice> = {};
        Object.values(state.devices).forEach((d) => {
          const id = Number(d.entityId);
          fixed[id] = { ...d, entityId: id, entityType: Number(d.entityType) };
        });
        state.devices = fixed;
      },
    }
  )
);
