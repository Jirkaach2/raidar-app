use serde::Serialize;
use serde_json::json;
use std::time::Duration;
use tauri::State;

use crate::AppState;

/// The Raidar Discord bot's public base URL (Heroku, HTTPS auto-managed).
const BOT_BASE_URL: &str = "https://salty-spire-70936-6c1b9945cfaf.herokuapp.com";

/// HTTP client with a sane timeout so a slow/unreachable bot never hangs the UI.
fn http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(12))
        .build()
        .map_err(|e| e.to_string())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscordLink {
    pub guild_id: String,
    pub guild_name: String,
    pub server_name: String,
    pub allowed_user_ids: Vec<String>,
}

/// Read the FCM/auth credentials the sidecar wrote in the app data directory.
fn read_credentials(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    use tauri::Manager;
    let cfg_path = app.path().app_data_dir()
        .map_err(|e| e.to_string())?
        .join("rustplus.config.json");
    let cfg_str = std::fs::read_to_string(&cfg_path)
        .map_err(|_| "No Rust+ credentials yet. Pair the app with a server first.".to_string())?;
    serde_json::from_str(&cfg_str).map_err(|e| format!("Bad credentials file: {}", e))
}

/// Push the app's already-valid Rust+ credentials to the bot using a one-time
/// code from `/link`. Seamless pairing — no browser Steam login required.
#[tauri::command]
pub async fn link_discord_bot(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    code: String,
    devices: Vec<serde_json::Value>,
) -> Result<String, String> {
    let (ip, port, player_id, player_token, name) = {
        let conn_guard = state.connection.lock().await;
        if let Some(c) = conn_guard.as_ref() {
            let (ip, port, pid, ptok) = (c.ip.clone(), c.port, c.player_id, c.player_token);
            drop(conn_guard);
            // Look up the saved name for this server so the link shows it.
            let name = {
                let db = state.db.lock().await;
                db.get_server_profile_by_ip(&ip, port).ok().map(|p| p.server_name).unwrap_or_default()
            };
            (ip, port, pid, ptok, name)
        } else {
            drop(conn_guard);
            let db = state.db.lock().await;
            let p = db
                .get_server_profiles()?
                .into_iter()
                .next()
                .ok_or("No server found. Connect to a server in the app first.")?;
            (p.ip, p.port, p.player_id, p.player_token, p.server_name)
        }
    };

    let cfg = read_credentials(app)?;
    let credentials = json!({
        "fcm_credentials": cfg.get("fcm_credentials"),
        "expo_push_token": cfg.get("expo_push_token"),
        "rustplus_auth_token": cfg.get("rustplus_auth_token"),
    });

    let payload = json!({
        "code": code.trim(),
        "credentials": credentials,
        "server": {
            "ip": ip, "port": port,
            "playerId": player_id.to_string(),
            "playerToken": player_token,
            "name": name,
        },
        "devices": devices,
    });

    let resp = http_client()?
        .post(format!("{}/api/link", BOT_BASE_URL))
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Couldn't reach the bot: {}", e))?;

    if resp.status().is_success() {
        Ok("Linked! Your server is now connected to the Discord bot.".to_string())
    } else {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        let msg = serde_json::from_str::<serde_json::Value>(&body)
            .ok()
            .and_then(|v| v.get("error").and_then(|e| e.as_str()).map(String::from))
            .unwrap_or(body);
        Err(format!("Link failed ({}): {}", status, msg))
    }
}

/// List the Discord servers this app's account is currently linked to.
#[tauri::command]
pub async fn get_discord_links(app: tauri::AppHandle) -> Result<Vec<DiscordLink>, String> {
    let cfg = read_credentials(app)?;
    let auth_token = cfg
        .get("rustplus_auth_token")
        .and_then(|v| v.as_str())
        .ok_or("Missing auth token.")?;

    let resp = http_client()?
        .post(format!("{}/api/status", BOT_BASE_URL))
        .json(&json!({ "authToken": auth_token }))
        .send()
        .await
        .map_err(|e| format!("Couldn't reach the bot: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("Bot returned {}", resp.status()));
    }

    let body: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    let links = body
        .get("links")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .map(|l| DiscordLink {
                    guild_id: l.get("guildId").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                    guild_name: l.get("guildName").and_then(|v| v.as_str()).unwrap_or("Unknown server").to_string(),
                    server_name: l.get("serverName").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                    allowed_user_ids: l
                        .get("allowedUserIds")
                        .and_then(|v| v.as_array())
                        .map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect())
                        .unwrap_or_default(),
                })
                .collect()
        })
        .unwrap_or_default();
    Ok(links)
}

/// Push a live notification to the bot, which routes it to the right Discord
/// channel for every guild linked to this account. Auto-callers ignore errors
/// (fire-and-forget); the Settings "test" button surfaces them.
#[tauri::command]
pub async fn notify_discord_bot(
    app: tauri::AppHandle,
    feature: String,
    content: String,
    fields: Option<serde_json::Value>,
) -> Result<u64, String> {
    let cfg = read_credentials(app)?;
    let auth_token = cfg
        .get("rustplus_auth_token")
        .and_then(|v| v.as_str())
        .ok_or("Not linked yet — link the app to Discord first.")?;
    let resp = http_client()?
        .post(format!("{}/api/notify", BOT_BASE_URL))
        .json(&json!({ "authToken": auth_token, "feature": feature, "content": content, "fields": fields }))
        .send()
        .await
        .map_err(|e| format!("Couldn't reach the bot: {}", e))?;
    if !resp.status().is_success() {
        return Err(format!("Bot returned {}", resp.status()));
    }
    let body: serde_json::Value = resp.json().await.unwrap_or(json!({}));
    Ok(body.get("sent").and_then(|v| v.as_u64()).unwrap_or(0))
}

/// Set the device-control whitelist (Discord user IDs) for a linked guild.
#[tauri::command]
pub async fn set_discord_permissions(
    app: tauri::AppHandle,
    guild_id: String,
    user_ids: Vec<String>,
) -> Result<(), String> {
    let cfg = read_credentials(app)?;
    let auth_token = cfg.get("rustplus_auth_token").and_then(|v| v.as_str()).ok_or("Missing auth token.")?;
    let resp = http_client()?
        .post(format!("{}/api/permissions", BOT_BASE_URL))
        .json(&json!({ "authToken": auth_token, "guildId": guild_id, "allowedUserIds": user_ids }))
        .send()
        .await
        .map_err(|e| format!("Couldn't reach the bot: {}", e))?;
    if resp.status().is_success() { Ok(()) } else { Err(format!("Failed ({})", resp.status())) }
}

/// Re-point all of this account's linked Discord servers to the currently
/// connected server (called automatically when the app switches servers).
#[tauri::command]
pub async fn sync_discord_server(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    devices: Vec<serde_json::Value>,
) -> Result<u32, String> {
    // Only meaningful while connected to a server.
    let (ip, port, player_id, player_token) = {
        let conn_guard = state.connection.lock().await;
        match conn_guard.as_ref() {
            Some(c) => (c.ip.clone(), c.port, c.player_id, c.player_token),
            None => return Ok(0), // not connected — nothing to sync
        }
    };
    let name = {
        let db = state.db.lock().await;
        db.get_server_profile_by_ip(&ip, port).ok().map(|p| p.server_name).unwrap_or_default()
    };

    let cfg = read_credentials(app)?;
    let auth_token = cfg.get("rustplus_auth_token").and_then(|v| v.as_str()).ok_or("Missing auth token.")?;

    let payload = json!({
        "authToken": auth_token,
        "server": {
            "ip": ip, "port": port,
            "playerId": player_id.to_string(),
            "playerToken": player_token,
            "name": name,
        },
        "devices": devices,
    });

    let resp = http_client()?
        .post(format!("{}/api/sync", BOT_BASE_URL))
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Couldn't reach the bot: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("Sync failed ({})", resp.status()));
    }
    let body: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    Ok(body.get("synced").and_then(|v| v.as_u64()).unwrap_or(0) as u32)
}

/// Unlink this account from a specific Discord server.
#[tauri::command]
pub async fn unlink_discord(app: tauri::AppHandle, guild_id: String) -> Result<String, String> {
    let cfg = read_credentials(app)?;
    let auth_token = cfg
        .get("rustplus_auth_token")
        .and_then(|v| v.as_str())
        .ok_or("Missing auth token.")?;

    let resp = http_client()?
        .post(format!("{}/api/unlink", BOT_BASE_URL))
        .json(&json!({ "authToken": auth_token, "guildId": guild_id }))
        .send()
        .await
        .map_err(|e| format!("Couldn't reach the bot: {}", e))?;

    if resp.status().is_success() {
        Ok("Unlinked.".to_string())
    } else {
        Err(format!("Unlink failed ({})", resp.status()))
    }
}

/// Ping the Discord bot's health endpoint to check availability.
#[tauri::command]
pub async fn check_bot_health() -> Result<bool, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(3))
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client.get(format!("{}/health", BOT_BASE_URL))
        .send()
        .await;

    match resp {
        Ok(r) => Ok(r.status().is_success()),
        Err(_) => Ok(false),
    }
}


