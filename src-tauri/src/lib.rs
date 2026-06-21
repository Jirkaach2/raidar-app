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
}

use tauri::{Manager, Emitter};

/// Opens the Steam/Rust+ pairing login window for the given URL.
fn open_steam_login_window(app_handle: &tauri::AppHandle, url: String) {
    let app_handle_clone = app_handle.clone();
    app_handle
        .run_on_main_thread(move || {
            use tauri::WebviewUrl;
            use tauri::WebviewWindowBuilder;
            if WebviewWindowBuilder::new(&app_handle_clone, "steam-login", WebviewUrl::External(url.parse().unwrap()))
                .title("Steam Login")
                .inner_size(800.0, 600.0)
                .center()
                .focused(true)
                .visible(true)
                .always_on_top(true)
                .build()
                .is_ok()
            {
                log::info!("Opened login window");
            }
        })
        .ok();
}

/// Called by the frontend when the Raidar (Appwrite) auth state changes. When
/// the user signs in, any deferred Steam/Rust+ pairing login is opened.
#[tauri::command]
async fn set_app_authenticated(app: tauri::AppHandle, state: tauri::State<'_, AppState>, authed: bool) -> Result<(), String> {
    state.authed.store(authed, Ordering::Relaxed);
    if authed {
        let url = { state.pending_login.lock().await.take() };
        if let Some(url) = url {
            open_steam_login_window(&app, url);
        }
    }
    Ok(())
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
    };

    tauri::Builder::default()
        // Single-instance must be the FIRST plugin. With the deep-link feature
        // it forwards `raidar://` links to the already-running instance.
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            use tauri::Manager;
            use tauri::Emitter;
            // On Windows the deep link arrives as a launch argument of the
            // second instance — pull it out and hand it to the running app.
            if let Some(url) = argv.iter().find(|a| a.starts_with("raidar://")) {
                let _ = app.emit("deep-link-received", url.clone());
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
            // Register the raidar:// scheme at runtime (needed for dev on
            // Windows/Linux; production registration is handled by the bundler).
            #[cfg(any(windows, target_os = "linux"))]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                let _ = app.deep_link().register_all();
            }
            // Auto-updater (desktop only). Checks GitLab releases on launch and,
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

            let sidecar = app.shell().sidecar("fcm-sidecar");
            if let Ok(sidecar_command) = sidecar {
                let (mut rx, child) = sidecar_command.spawn().expect("Failed to spawn sidecar");
                
                struct SidecarKiller(std::sync::Mutex<Option<tauri_plugin_shell::process::CommandChild>>);
                impl Drop for SidecarKiller {
                    fn drop(&mut self) {
                        if let Ok(mut lock) = self.0.lock() {
                            if let Some(c) = lock.take() {
                                c.kill().ok();
                            }
                        }
                    }
                }
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
                                } else if parsed.get("type").and_then(|t| t.as_str()) == Some("open_login") {
                                    let url = parsed.get("url").unwrap().as_str().unwrap().to_string();
                                    let state = app_handle.state::<AppState>();
                                    if state.authed.load(std::sync::atomic::Ordering::Relaxed) {
                                        // Already signed in to Raidar — open the pairing login now.
                                        open_steam_login_window(&app_handle, url);
                                    } else {
                                        // Hold the Steam pairing login until the user signs in with Raidar.
                                        let mut pending = state.pending_login.lock().await;
                                        *pending = Some(url);
                                        log::info!("Deferring Steam login until Raidar sign-in");
                                    }
                                } else if parsed.get("type").and_then(|t| t.as_str()) == Some("login_success") {
                                    if let Some(window) = app_handle.get_webview_window("steam-login") {
                                        window.close().ok();
                                    }
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
