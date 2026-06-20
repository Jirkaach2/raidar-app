use serde::Serialize;
use tauri::State;

use crate::rustplus::connection::RustPlusConnection;
use crate::rustplus::protocol;
use crate::AppState;

/// SteamID64s exceed JS's safe integer range — serialize as strings.
fn steamid_to_string<S: serde::Serializer>(v: &u64, s: S) -> Result<S::Ok, S::Error> {
    s.serialize_str(&v.to_string())
}

#[derive(Debug, Serialize)]
pub struct ServerInfo {
    pub name: String,
    pub header_image: String,
    pub url: String,
    pub map: String,
    pub map_size: u32,
    pub players: u32,
    pub max_players: u32,
    pub queued_players: u32,
    pub seed: u32,
    pub ip: String,
    pub port: u16,
    #[serde(serialize_with = "steamid_to_string")]
    pub player_steam_id: u64,
}

use tauri::{AppHandle, Emitter};

/// Connect to a Rust+ server.
#[tauri::command]
pub async fn connect(
    app: AppHandle,
    state: State<'_, AppState>,
    ip: String,
    port: u16,
    player_id: String,
    player_token: i32,
) -> Result<String, String> {
    let player_id_u64 = player_id.parse::<u64>().map_err(|e| format!("Invalid player_id: {}", e))?;

    // Disconnect existing connection if any
    {
        let mut conn_guard = state.connection.lock().await;
        if let Some(mut existing) = conn_guard.take() {
            existing.disconnect().await;
        }
    }

    let connection = RustPlusConnection::connect(ip.clone(), port, player_id_u64, player_token).await?;

    // Spawn event listener
    let mut rx = connection.subscribe();
    tokio::spawn(async move {
        while let Ok(msg) = rx.recv().await {
            let _ = app.emit("rustplus-event", msg);
        }
    });

    // Save the profile to the database
    {
        let db = state.db.lock().await;
        let _ = db.save_server_profile(&ip, port, player_id_u64, player_token, "");
    }

    let mut conn_guard = state.connection.lock().await;
    *conn_guard = Some(connection);

    Ok("Connected successfully".to_string())
}

/// Disconnect from the current server.
#[tauri::command]
pub async fn disconnect(state: State<'_, AppState>) -> Result<String, String> {
    let mut conn_guard = state.connection.lock().await;
    if let Some(mut connection) = conn_guard.take() {
        connection.disconnect().await;
        Ok("Disconnected".to_string())
    } else {
        Err("Not connected".to_string())
    }
}

/// Check if currently connected.
#[tauri::command]
pub async fn get_connection_status(state: State<'_, AppState>) -> Result<bool, String> {
    let conn_guard = state.connection.lock().await;
    Ok(conn_guard.is_some())
}

/// Get server info from the connected Rust+ server.
#[tauri::command]
pub async fn get_server_info(state: State<'_, AppState>) -> Result<ServerInfo, String> {
    let conn_guard = state.connection.lock().await;
    let connection = conn_guard.as_ref().ok_or("Not connected")?;

    let request = protocol::get_info_request();
    let response = connection.send_request(request).await?;

    let info = response.info.ok_or("No info in response")?;

    // Update database with the server name
    {
        let db = state.db.lock().await;
        let _ = db.save_server_profile(&connection.ip, connection.port, connection.player_id, connection.player_token, &info.name);
    }

    Ok(ServerInfo {
        name: info.name,
        header_image: info.header_image,
        url: info.url,
        map: info.map,
        map_size: info.map_size,
        players: info.players,
        max_players: info.max_players,
        queued_players: info.queued_players,
        seed: info.seed.unwrap_or(0),
        ip: connection.ip.clone(),
        port: connection.port,
        player_steam_id: connection.player_id,
    })
}

/// Send a team chat message.
#[tauri::command]
pub async fn send_team_message(
    state: State<'_, AppState>,
    message: String,
) -> Result<String, String> {
    let conn_guard = state.connection.lock().await;
    let connection = conn_guard.as_ref().ok_or("Not connected")?;

    let request = protocol::send_team_message_request(message);
    let response = connection.send_request(request).await?;

    if response.error.is_some() {
        let err = response.error.unwrap().error;
        let friendly = match err.as_str() {
            "message_not_sent" => "Message not sent. You must be in a team (not solo) and your in-game player must be online.".to_string(),
            "not_found" => "Not connected to a team on this server.".to_string(),
            "rate_limit" => "Sending too fast. Slow down and try again.".to_string(),
            other => format!("Server error: {}", other),
        };
        Err(friendly)
    } else {
        Ok("Message sent".to_string())
    }
}

#[derive(Debug, serde::Serialize)]
pub struct ServerProfileDto {
    pub id: i64,
    pub ip: String,
    pub port: u16,
    #[serde(serialize_with = "steamid_to_string")]
    pub player_id: u64,
    pub player_token: i32,
    pub server_name: String,
    pub last_connected: String,
}

/// Get all saved server profiles.
#[tauri::command]
pub async fn get_server_profiles(state: State<'_, AppState>) -> Result<Vec<ServerProfileDto>, String> {
    let db = state.db.lock().await;
    let profiles = db.get_server_profiles()?;
    let dtos = profiles.into_iter().map(|p| ServerProfileDto {
        id: p.id,
        ip: p.ip,
        port: p.port,
        player_id: p.player_id,
        player_token: p.player_token,
        server_name: p.server_name,
        last_connected: p.last_connected,
    }).collect();
    Ok(dtos)
}

/// Delete a saved server profile.
#[tauri::command]
pub async fn delete_server_profile(state: State<'_, AppState>, id: i64) -> Result<(), String> {
    let db = state.db.lock().await;
    db.delete_server_profile(id)?;
    Ok(())
}

/// Clear all saved server profiles.
#[tauri::command]
pub async fn clear_server_profiles(state: State<'_, AppState>) -> Result<(), String> {
    let db = state.db.lock().await;
    db.conn.execute("DELETE FROM server_profiles", rusqlite::params![])
        .map_err(|e| format!("Failed to clear server profiles: {}", e))?;
    Ok(())
}

/// Update a server profile's name.
#[tauri::command]
pub async fn update_server_name(state: State<'_, AppState>, id: i64, name: String) -> Result<(), String> {
    let db = state.db.lock().await;
    db.conn.execute("UPDATE server_profiles SET server_name = ?1 WHERE id = ?2", rusqlite::params![name, id])
        .map_err(|e| format!("Failed to update server name: {}", e))?;
    Ok(())
}
