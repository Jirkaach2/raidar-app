import { useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { register, unregisterAll } from '@tauri-apps/plugin-global-shortcut';
import { useSettingsStore } from '../stores/settings-store';

/**
 * Drives "game overlay" mode for floating over RustClient.exe:
 *  - Keeps the window always-on-top so it sits over the game while staying
 *    fully interactive (NOT click-through).
 *  - Registers a global hotkey (works even while the game has focus) that
 *    toggles the overlay window show/hide on each press.
 *
 * Run RustClient.exe in Borderless / Windowed mode for the overlay to show
 * on top (exclusive fullscreen will cover any overlay).
 */
export function useOverlayMode() {
  const overlayMode = useSettingsStore((s) => s.overlayMode);
  const overlayHotkey = useSettingsStore((s) => s.overlayHotkey);

  // Apply / clear always-on-top whenever the toggle changes.
  useEffect(() => {
    invoke('set_overlay_mode', { enabled: overlayMode }).catch(() => {});
  }, [overlayMode]);

  // Register the global show/hide hotkey while active.
  useEffect(() => {
    let cancelled = false;

    const setup = async () => {
      try {
        await unregisterAll();
        if (cancelled) return;

        if (overlayMode && overlayHotkey) {
          await register(overlayHotkey, async (event) => {
            if (event.state && event.state !== 'Pressed') return;
            try {
              const visible = await invoke<boolean>('is_overlay_visible');
              await invoke('set_overlay_visible', { visible: !visible });
            } catch {}
          });
        }
      } catch (e) {
        console.error('Failed to register global shortcuts:', e);
      }
    };
    setup();

    return () => {
      cancelled = true;
      unregisterAll().catch(() => {});
    };
  }, [overlayMode, overlayHotkey]);
}
