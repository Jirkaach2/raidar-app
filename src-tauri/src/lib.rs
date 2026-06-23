pub mod commands;
pub mod db;
pub mod rustplus;

mod generated {
    include!("generated/rustplus.rs");
}

use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use tokio::sync::Mutex;

/// Shared application state accessible from Tauri commands.
pub struct AppState {
    pub connection: Arc<Mutex<Option<rustplus::connection::RustPlusConnection>>>,
    pub db: Arc<Mutex<db::Database>>,
    /// True once the user has signed in with their Raidar (Appwrite) account.
    pub authed: Arc<AtomicBool>,
    /// A Steam/Rust+ pairing login URL queued until the user is authed.
    pub pending_login: Arc<Mutex<Option<String>>>,
    /// Last deep-link URL received, consumed by the frontend via polling.
    pub pending_deep_link: Arc<std::sync::Mutex<Option<String>>>,
}

use tauri::{Manager, Emitter};

/// Append a line to a deep-link debug log in the app data dir, so issues can be
/// diagnosed from an installed build without a console.
fn dlog(app: &tauri::AppHandle, msg: &str) {
    use std::io::Write;
    if let Ok(dir) = app.path().app_data_dir() {
        let _ = std::fs::create_dir_all(&dir);
        if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(dir.join("deeplink.log")) {
            let _ = writeln!(f, "[{}] {}", chrono::Local::now().format("%Y-%m-%d %H:%M:%S"), msg);
        }
    }
}

/// Opens the Steam/Rust+ pairing login window for the given URL.
fn open_steam_login_window(app_handle: &tauri::AppHandle, url: String) {
    let _ = app_handle.emit("open-steam-login", url);
}

#[tauri::command]
async fn set_app_authenticated(app: tauri::AppHandle, state: tauri::State<'_, AppState>, authed: bool) -> Result<(), String> {
    state.authed.store(authed, Ordering::Relaxed);
    if authed {
        let url = { state.pending_login.lock().await.clone() };
        if let Some(url) = url {
            open_steam_login_window(&app, url);
        }
    }
    Ok(())
}

#[tauri::command]
async fn has_pending_steam_login(state: tauri::State<'_, AppState>) -> Result<bool, String> {
    let pending = state.pending_login.lock().await;
    Ok(pending.is_some())
}

#[tauri::command]
async fn reopen_steam_login(app: tauri::AppHandle, state: tauri::State<'_, AppState>) -> Result<(), String> {
    let url = {
        let pending = state.pending_login.lock().await;
        pending.clone()
    };
    if let Some(url) = url {
        open_steam_login_window(&app, url);
        Ok(())
    } else {
        Err("No pairing URL is currently pending. Please click 'Pair with Server' in Rust in-game settings.".to_string())
    }
}

/// Frontend polls this to consume the latest deep-link URL (reliable handoff
/// that doesn't depend on JS event-listener timing).
#[tauri::command]
fn take_pending_deep_link(state: tauri::State<'_, AppState>) -> Option<String> {
    state.pending_deep_link.lock().ok().and_then(|mut g| g.take())
}

/// Holds the FCM sidecar child so we can terminate it on app exit. Stored as
/// managed state and killed explicitly from the run-event handler — relying on
/// `Drop` is unreliable on Windows (the process exits without unwinding), which
/// left `fcm-sidecar.exe` running and locking the binary during updates.
struct SidecarKiller(std::sync::Mutex<Option<tauri_plugin_shell::process::CommandChild>>);

/// Terminate the FCM sidecar. Tries the tracked child first, then falls back to
/// a hard taskkill on Windows so no orphan can lock the file during an update.
fn kill_sidecar(app: &tauri::AppHandle) {
    use tauri::Manager;
    if let Some(killer) = app.try_state::<SidecarKiller>() {
        if let Ok(mut lock) = killer.0.lock() {
            if let Some(child) = lock.take() {
                let _ = child.kill();
            }
        }
    }
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        let _ = std::process::Command::new("taskkill")
            .args(["/F", "/IM", "fcm-sidecar.exe", "/T"])
            .creation_flags(CREATE_NO_WINDOW)
            .output();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();

    let db = db::Database::new().expect("Failed to initialize database");

    let state = AppState {
        connection: Arc::new(Mutex::new(None)),
        db: Arc::new(Mutex::new(db)),
        authed: Arc::new(AtomicBool::new(false)),
        pending_login: Arc::new(Mutex::new(None)),
        pending_deep_link: Arc::new(std::sync::Mutex::new(None)),
    };

    tauri::Builder::default()
        // Single-instance must be the FIRST plugin. With the deep-link feature
        // it forwards `raidar://` links to the already-running instance.
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            use tauri::Manager;
            use tauri::Emitter;
            dlog(app, &format!("single-instance fired, argv={:?}", argv));
            // On Windows the deep link arrives as a launch argument of the
            // second instance — pull it out and hand it to the running app.
            if let Some(url) = argv.iter().find(|a| a.starts_with("raidar://")) {
                dlog(app, &format!("forwarding deep link: {}", url));
                if let Ok(mut g) = app.state::<AppState>().pending_deep_link.lock() { *g = Some(url.clone()); }
                let _ = app.emit("deep-link-received", url.clone());
            } else {
                dlog(app, "no raidar:// arg found in argv");
            }
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.set_focus();
                let _ = w.show();
            }
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_sql::Builder::new().build())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|app| {
            dlog(&app.handle().clone(), "app setup started");
            // Register the raidar:// scheme at runtime (needed for dev on
            // Windows/Linux; production registration is handled by the bundler).
            #[cfg(any(windows, target_os = "linux"))]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                let _ = app.deep_link().register_all();
            }
            // Official Rust-side deep-link handler — fires for cold-start and
            // forwarded URLs. Logs and re-emits to the frontend.
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                let h = app.handle().clone();
                app.deep_link().on_open_url(move |event| {
                    let urls: Vec<String> = event.urls().iter().map(|u| u.to_string()).collect();
                    dlog(&h, &format!("on_open_url: {:?}", urls));
                    if let Some(u) = urls.first() {
                        if let Ok(mut g) = h.state::<AppState>().pending_deep_link.lock() { *g = Some(u.clone()); }
                    }
                    for u in &urls { let _ = h.emit("deep-link-received", u.clone()); }
                });
            }
            // Auto-updater (desktop only). Checks GitHub releases on launch and,
            // if a newer signed build exists, downloads + installs it, then relaunches.
            #[cfg(desktop)]
            {
                let handle = app.handle().clone();
                handle.plugin(tauri_plugin_updater::Builder::new().build())?;
                handle.plugin(tauri_plugin_process::init())?;
                crate::commands::updater::spawn_update_check(handle);
            }

            use tauri_plugin_shell::ShellExt;
            use tauri_plugin_shell::process::CommandEvent;

            let app_data_path = app.path().app_data_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));
            let app_data_str = app_data_path.to_string_lossy().to_string();

            let sidecar = app.shell().sidecar("fcm-sidecar");
            if let Ok(sidecar_command) = sidecar {
                let sidecar_command = sidecar_command.args(&[app_data_str]);
                let (mut rx, child) = sidecar_command.spawn().expect("Failed to spawn sidecar");

                app.manage(SidecarKiller(std::sync::Mutex::new(Some(child))));

                let app_handle = app.handle().clone();

                let app_handle_auto = app_handle.clone();
                tauri::async_runtime::spawn(async move {
                    let state = app_handle_auto.state::<AppState>();
                    let profiles = {
                        let db_guard = state.db.lock().await;
                        db_guard.get_server_profiles().unwrap_or_default()
                    };
                    if let Some(profile) = profiles.first() {
                        log::info!("Found saved profile, auto-connecting to {}:{}...", profile.ip, profile.port);
                        if let Ok(_) = crate::commands::connection::connect(app_handle_auto.clone(), state.clone(), profile.ip.clone(), profile.port as u16, profile.player_id.to_string(), profile.player_token as i32).await {
                            log::info!("Auto-connected to last server successfully!");
                            app_handle_auto.emit("connection-success", ()).ok();
                        }
                    }
                });

                tauri::async_runtime::spawn(async move {
                    while let Some(event) = rx.recv().await {
                        if let CommandEvent::Stdout(line) = event {
                            let line_str = String::from_utf8_lossy(&line);
                            log::info!("Sidecar: {}", line_str);
                            
                            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&line_str) {
                                if parsed.get("type").and_then(|t| t.as_str()) == Some("pairing") {
                                    let ip = parsed.get("ip").unwrap().as_str().unwrap().to_string();
                                    let port = parsed.get("port").unwrap().as_i64().unwrap() as u16;
                                    let player_id = parsed.get("playerId").unwrap().as_str().unwrap().to_string();
                                    let player_token = parsed.get("playerToken").unwrap().as_i64().unwrap() as i32;
                                    
                                    let app_handle_clone = app_handle.clone();
                                    tauri::async_runtime::spawn(async move {
                                        let state = app_handle_clone.state::<AppState>();
                                        match crate::commands::connection::connect(app_handle_clone.clone(), state, ip.clone(), port, player_id, player_token).await {
                                            Ok(_) => {
                                                log::info!("Auto-connected via pairing!");
                                                app_handle_clone.emit("connection-success", ()).ok();
                                            },
                                            Err(e) => log::error!("Auto-connect failed: {}", e)
                                        }
                                    });
                                } else if parsed.get("type").and_then(|t| t.as_str()) == Some("entity_pairing") {
                                    app_handle.emit("entity-paired", parsed).ok();
                                } else if parsed.get("type").and_then(|t| t.as_str()) == Some("alarm") {
                                    app_handle.emit("smart-alarm", parsed).ok();
                                } else if parsed.get("type").and_then(|t| t.as_str()) == Some("death") {
                                    // Player death push — delivered even while offline / on
                                    // another server. Forwarded to the frontend to notify.
                                    app_handle.emit("player-death", parsed).ok();
                                } else if parsed.get("type").and_then(|t| t.as_str()) == Some("open_login") {
                                    let url = parsed.get("url").unwrap().as_str().unwrap().to_string();
                                    let state = app_handle.state::<AppState>();
                                    {
                                        let mut pending = state.pending_login.lock().await;
                                        *pending = Some(url.clone());
                                    }
                                    if state.authed.load(std::sync::atomic::Ordering::Relaxed) {
                                        // Already signed in to Raidar — open the pairing login now.
                                        open_steam_login_window(&app_handle, url);
                                    } else {
                                        // Hold the Steam pairing login until the user signs in with Raidar.
                                        log::info!("Deferring Steam login until Raidar sign-in");
                                    }
                                } else if parsed.get("type").and_then(|t| t.as_str()) == Some("login_success") {
                                    let state = app_handle.state::<AppState>();
                                    {
                                        let mut pending = state.pending_login.lock().await;
                                        *pending = None;
                                    }
                                    if let Some(w) = app_handle.get_webview("steam-login") {
                                        let _ = w.close();
                                    }
                                    if let Some(window) = app_handle.get_webview_window("steam-login") {
                                        window.close().ok();
                                    }
                                    app_handle.emit("steam-login-success", ()).ok();
                                } else if parsed.get("status").is_some() {
                                    app_handle.emit("fcm-status", parsed).ok();
                                }
                            }
                        } else if let CommandEvent::Stderr(line) = event {
                            log::error!("Sidecar Error: {}", String::from_utf8_lossy(&line));
                        }
                    }
                });
            } else {
                log::warn!("Could not find fcm-sidecar binary. Is it bundled?");
            }

            Ok(())
        })
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            set_app_authenticated,
            take_pending_deep_link,
            has_pending_steam_login,
            reopen_steam_login,
            commands::connection::connect,
            commands::connection::disconnect,
            commands::connection::get_connection_status,
            commands::connection::get_server_info,
            commands::connection::send_team_message,
            commands::connection::get_server_profiles,
            commands::connection::delete_server_profile,
            commands::connection::clear_server_profiles,
            commands::connection::update_server_name,
            commands::map::get_map,
            commands::map::get_map_markers,
            commands::map::get_time,
            commands::team::get_team_info,
            commands::team::get_team_chat,
            commands::team::get_mock_data,
            commands::team::promote_to_leader,
            commands::devices::get_entity_info,
            commands::devices::set_entity_value,
            commands::devices::toggle_foreign_device,
            commands::overlay::set_overlay_mode,
            commands::overlay::set_overlay_visible,
            commands::overlay::is_overlay_visible,
            commands::steam::get_steam_avatar,
            commands::steam::get_steam_profile_info,
            commands::steam::get_rust_member_stats,
            commands::steam::open_external_url,
            commands::camera::camera_subscribe,
            commands::camera::camera_unsubscribe,
            commands::camera::camera_input,
            commands::rustmaps::get_rustmaps_monuments,
            commands::updater::check_for_update,
            commands::updater::install_update,
            commands::discord::link_discord_bot,
            commands::discord::get_discord_links,
            commands::discord::sync_discord_server,
            commands::discord::set_discord_permissions,
            commands::discord::notify_discord_bot,
            commands::discord::unlink_discord,
            commands::discord::check_bot_health,
            open_steam_in_app_webview,
            close_steam_in_app_webview,
            resize_steam_webview,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            // Kill the FCM sidecar whenever the app is shutting down so its exe
            // isn't left locked (which blocked installer/updater overwrites).
            match event {
                tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit => {
                    kill_sidecar(app_handle);
                }
                _ => {}
            }
        });
}

#[tauri::command]
fn open_steam_in_app_webview(
    app: tauri::AppHandle,
    url: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    let main_window = app.get_window("main").ok_or("Failed to get main window")?;
    let parsed_url = url.parse::<tauri::Url>().map_err(|e| e.to_string())?;
    let webview_url = tauri::WebviewUrl::External(parsed_url);

    // If it already exists, close it first
    if let Some(w) = app.get_webview("steam-login") {
        let _ = w.close();
    }

    let app_handle_clone = app.clone();
    let builder = tauri::WebviewBuilder::new("steam-login", webview_url)
        .on_navigation(move |nav_url| {
            let domain = nav_url.host_str().unwrap_or(nav_url.as_str());
            let _ = app_handle_clone.emit("steam-webview-navigated", serde_json::json!({
                "url": nav_url.as_str(),
                "domain": domain,
            }));
            true
        });

    let _child = main_window.add_child(
        builder,
        tauri::LogicalPosition::new(x, y),
        tauri::LogicalSize::new(width, height),
    ).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
fn close_steam_in_app_webview(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview("steam-login") {
        let _ = w.close();
    }
    Ok(())
}

#[tauri::command]
fn resize_steam_webview(
    app: tauri::AppHandle,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    if let Some(w) = app.get_webview("steam-login") {
        w.set_position(tauri::LogicalPosition::new(x, y)).map_err(|e| e.to_string())?;
        w.set_size(tauri::LogicalSize::new(width, height)).map_err(|e| e.to_string())?;
    }
    Ok(())
}



