use tauri::{AppHandle, Manager};

/// Enable / disable "game overlay" mode for the main window.
///
/// Overlay mode keeps the window always-on-top so it floats over RustClient.exe
/// (run Rust in Borderless / Windowed mode). The overlay stays fully
/// interactive — it is NOT click-through — so the user can use every panel
/// while it sits on top of the game.
#[tauri::command]
pub fn set_overlay_mode(app: AppHandle, enabled: bool) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "main window not found".to_string())?;

    window.set_always_on_top(enabled).map_err(|e| e.to_string())?;
    // Always interactive — never ignore cursor events.
    window.set_ignore_cursor_events(false).map_err(|e| e.to_string())?;

    Ok(())
}

/// Show or hide the main overlay window (used by the global hotkey toggle).
#[tauri::command]
pub fn set_overlay_visible(app: AppHandle, visible: bool) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "main window not found".to_string())?;
    if visible {
        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
    } else {
        window.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Returns whether the main window is currently visible.
#[tauri::command]
pub fn is_overlay_visible(app: AppHandle) -> Result<bool, String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "main window not found".to_string())?;
    window.is_visible().map_err(|e| e.to_string())
}


