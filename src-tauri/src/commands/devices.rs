use serde::Serialize;
use tauri::State;

use crate::rustplus::connection::RustPlusConnection;
use crate::rustplus::protocol;
use crate::AppState;

#[derive(Debug, Serialize)]
pub struct EntityItem {
    pub item_id: i32,
    pub quantity: i32,
    pub is_blueprint: bool,
}

#[derive(Debug, Serialize)]
pub struct EntityInfo {
    pub entity_type: i32,
    pub payload_value: bool,
    pub payload_capacity: i32,
    pub has_protection: bool,
    pub protection_expiry: u32,
    pub items: Vec<EntityItem>,
}

#[tauri::command]
pub async fn get_entity_info(
    state: State<'_, AppState>,
    entity_id: u32,
) -> Result<EntityInfo, String> {
    let conn_guard = state.connection.lock().await;
    let connection = conn_guard.as_ref().ok_or("Not connected")?;

    let request = protocol::get_entity_info_request(entity_id);
    let response = connection.send_request(request).await?;

    // A destroyed / non-existent entity comes back as an error (or with no
    // entity_info). Surface it as "not_found" so callers can prune it.
    if let Some(err) = &response.error {
        return Err(format!("not_found:{}", err.error));
    }
    let info = response.entity_info.ok_or("not_found")?;
    let payload_value = info.payload.value.unwrap_or(false);
    let payload_capacity = info.payload.capacity.unwrap_or(0);
    let has_protection = info.payload.has_protection.unwrap_or(false);
    let protection_expiry = info.payload.protection_expiry.unwrap_or(0);
    let items = info
        .payload
        .items
        .iter()
        .map(|it| EntityItem {
            item_id: it.item_id,
            quantity: it.quantity,
            is_blueprint: it.item_is_blueprint,
        })
        .collect();

    Ok(EntityInfo {
        entity_type: info.r#type as i32,
        payload_value,
        payload_capacity,
        has_protection,
        protection_expiry,
        items,
    })
}

#[tauri::command]
pub async fn set_entity_value(
    state: State<'_, AppState>,
    entity_id: u32,
    value: bool,
) -> Result<String, String> {
    let conn_guard = state.connection.lock().await;
    let connection = conn_guard.as_ref().ok_or("Not connected")?;

    let request = protocol::set_entity_value_request(entity_id, value);
    let response = connection.send_request(request).await?;

    if let Some(err) = response.error {
        Err(format!("Failed to set entity value: {}", err.error))
    } else {
        Ok("Value set successfully".to_string())
    }
}

/// Temporarily connect to a foreign server, toggle a device, and disconnect.
#[tauri::command]
pub async fn toggle_foreign_device(
    state: State<'_, AppState>,
    server_ip: String,
    server_port: u16,
    entity_id: u32,
    value: bool,
) -> Result<String, String> {
    // Look up saved credentials for the target server
    let profile = {
        let db = state.db.lock().await;
        db.get_server_profile_by_ip(&server_ip, server_port)?
    };

    // Create a temporary connection
    let mut conn = RustPlusConnection::connect(
        server_ip,
        server_port,
        profile.player_id,
        profile.player_token,
    )
    .await?;

    // Send the toggle command
    let request = protocol::set_entity_value_request(entity_id, value);
    let response = conn.send_request(request).await?;

    // Disconnect the temporary connection
    conn.disconnect().await;

    if let Some(err) = response.error {
        Err(format!("Failed to toggle device: {}", err.error))
    } else {
        Ok("Device toggled successfully".to_string())
    }
}
