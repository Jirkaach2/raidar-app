//! Auto-update support backed by `tauri-plugin-updater`.
//!
//! On launch we check the configured GitHub release endpoint for a newer,
//! signed build. If one exists we emit progress events to the frontend (so the
//! UI can show a small "Updating…" banner) then download, install and relaunch
//! automatically. The frontend can also drive the flow manually via the two
//! commands below.

#[cfg(desktop)]
use serde::Serialize;
#[cfg(desktop)]
use tauri::{AppHandle, Emitter};
#[cfg(desktop)]
use tauri_plugin_updater::UpdaterExt;

#[cfg(desktop)]
#[derive(Clone, Serialize)]
pub struct UpdateInfo {
    pub version: String,
    pub current: String,
    pub notes: Option<String>,
}

#[cfg(desktop)]
#[derive(Clone, Serialize)]
struct DownloadProgress {
    downloaded: u64,
    total: Option<u64>,
}

/// Fire-and-forget update check on startup. Emits:
///   - `update://available` { version, current, notes }
///   - `update://progress`  { downloaded, total }
///   - `update://installing`
///   - `update://done`      (right before relaunch)
///   - `update://none`      (already up to date / check failed silently)
#[cfg(desktop)]
pub fn spawn_update_check(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        match run_update(&app, true).await {
            Ok(true) => {}
            Ok(false) => {
                let _ = app.emit("update://none", ());
            }
            Err(e) => {
                log::warn!("[updater] check failed: {}", e);
                let _ = app.emit("update://none", ());
            }
        }
    });
}

/// Shared check + (optionally) install routine.
/// Returns Ok(true) when an update was found and installed (app will relaunch).
#[cfg(desktop)]
async fn run_update(app: &AppHandle, auto_install: bool) -> Result<bool, String> {
    let updater = app.updater().map_err(|e| e.to_string())?;
    let update = updater.check().await.map_err(|e| e.to_string())?;

    let update = match update {
        Some(u) => u,
        None => return Ok(false),
    };

    let current = app.package_info().version.to_string();
    let _ = app.emit(
        "update://available",
        UpdateInfo {
            version: update.version.clone(),
            current,
            notes: update.body.clone(),
        },
    );

    if !auto_install {
        return Ok(false);
    }

    let mut downloaded: u64 = 0;
    let app_for_progress = app.clone();

    // Terminate the FCM sidecar before the installer runs — otherwise its
    // running exe stays locked and the NSIS update fails with
    // "Error opening file for writing: fcm-sidecar.exe".
    crate::kill_sidecar(app);

    update
        .download_and_install(
            move |chunk, total| {
                downloaded += chunk as u64;
                let _ = app_for_progress.emit(
                    "update://progress",
                    DownloadProgress { downloaded, total },
                );
            },
            move || {},
        )
        .await
        .map_err(|e| e.to_string())?;

    let _ = app.emit("update://installing", ());
    let _ = app.emit("update://done", ());

    // Relaunch into the freshly installed version.
    app.restart();
}

/// Manually check for an update without installing. Returns update info if one
/// is available, otherwise `None`.
#[cfg(desktop)]
#[tauri::command]
pub async fn check_for_update(app: AppHandle) -> Result<Option<UpdateInfo>, String> {
    let updater = app.updater().map_err(|e| e.to_string())?;
    let update = updater.check().await.map_err(|e| e.to_string())?;
    let current = app.package_info().version.to_string();
    Ok(update.map(|u| UpdateInfo {
        version: u.version.clone(),
        current,
        notes: u.body.clone(),
    }))
}

/// Manually download + install the available update, then relaunch.
#[cfg(desktop)]
#[tauri::command]
pub async fn install_update(app: AppHandle) -> Result<(), String> {
    run_update(&app, true).await.map(|_| ())
}

// ── Non-desktop (mobile) no-op stubs so the command handler still compiles ──
#[cfg(not(desktop))]
#[tauri::command]
pub async fn check_for_update() -> Result<Option<()>, String> {
    Ok(None)
}

#[cfg(not(desktop))]
#[tauri::command]
pub async fn install_update() -> Result<(), String> {
    Ok(())
}
