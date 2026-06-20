use base64::Engine;
use serde::Serialize;
use tauri::State;

use crate::rustplus::protocol;
use crate::AppState;

/// SteamID64s exceed JS's safe integer range — serialize as strings.
fn steamid_to_string<S: serde::Serializer>(v: &u64, s: S) -> Result<S::Ok, S::Error> {
    s.serialize_str(&v.to_string())
}

#[derive(Debug, Serialize)]
pub struct MapData {
    pub width: u32,
    pub height: u32,
    pub jpg_image_base64: String,
    pub ocean_margin: i32,
    pub monuments: Vec<Monument>,
    pub background: String,
}

#[derive(Debug, Serialize)]
pub struct Monument {
    pub token: String,
    pub x: f32,
    pub y: f32,
}

#[derive(Debug, Serialize)]
pub struct MapMarker {
    pub id: u32,
    pub marker_type: i32,
    pub x: f32,
    pub y: f32,
    #[serde(serialize_with = "steamid_to_string")]
    pub steam_id: u64,
    pub rotation: f32,
    pub radius: f32,
    pub name: String,
    pub sell_orders: Vec<SellOrder>,
}

#[derive(Debug, Serialize)]
pub struct SellOrder {
    pub item_id: i32,
    pub quantity: i32,
    pub currency_id: i32,
    pub cost_per_item: i32,
    pub amount_in_stock: i32,
    pub item_name: String,
    pub currency_name: String,
}

#[derive(Debug, Serialize)]
pub struct TimeInfo {
    pub day_length_minutes: f32,
    pub time_scale: f32,
    pub sunrise: f32,
    pub sunset: f32,
    pub time: f32,
}

/// Get the in-game time (current time, sunrise/sunset, day length).
#[tauri::command]
pub async fn get_time(state: State<'_, AppState>) -> Result<TimeInfo, String> {
    let conn_guard = state.connection.lock().await;
    let connection = conn_guard.as_ref().ok_or("Not connected")?;

    let request = protocol::get_time_request();
    let response = connection.send_request(request).await?;

    let time = response.time.ok_or("No time in response")?;

    Ok(TimeInfo {
        day_length_minutes: time.day_length_minutes,
        time_scale: time.time_scale,
        sunrise: time.sunrise,
        sunset: time.sunset,
        time: time.time,
    })
}

/// Get the server map (returns base64-encoded JPEG + monument data).
#[tauri::command]
pub async fn get_map(state: State<'_, AppState>) -> Result<MapData, String> {
    let conn_guard = state.connection.lock().await;
    let connection = conn_guard.as_ref().ok_or("Not connected")?;

    let request = protocol::get_map_request();
    let response = connection.send_request(request).await?;

    let map = response.map.ok_or("No map data in response")?;

    let jpg_base64 = base64::engine::general_purpose::STANDARD.encode(&map.jpg_image);

    // Cache the map data
    {
        let db = state.db.lock().await;
        let _ = db.cache_map_data(&connection.ip, &jpg_base64);
    }

    Ok(MapData {
        width: map.width,
        height: map.height,
        jpg_image_base64: jpg_base64,
        ocean_margin: map.ocean_margin,
        monuments: map
            .monuments
            .into_iter()
            .map(|m| Monument {
                token: m.token,
                x: m.x,
                y: m.y,
            })
            .collect(),
        background: map.background.unwrap_or_default(),
    })
}

/// Get map markers (players, explosions, vending machines, etc.).
#[tauri::command]
pub async fn get_map_markers(state: State<'_, AppState>) -> Result<Vec<MapMarker>, String> {
    let conn_guard = state.connection.lock().await;
    let connection = conn_guard.as_ref().ok_or("Not connected")?;

    let request = protocol::get_map_markers_request();
    let response = connection.send_request(request).await?;

    let markers_data = response.map_markers.ok_or("No marker data in response")?;

    let markers = markers_data
        .markers
        .into_iter()
        .map(|m| MapMarker {
            id: m.id,
            marker_type: m.r#type as i32,
            x: m.x,
            y: m.y,
            steam_id: m.steam_id.unwrap_or(0),
            rotation: m.rotation.unwrap_or(0.0),
            radius: m.radius.unwrap_or(0.0),
            name: m.name.unwrap_or_default(),
            sell_orders: m
                .sell_orders
                .into_iter()
                .map(|s| SellOrder {
                    item_id: s.item_id,
                    quantity: s.quantity,
                    currency_id: s.currency_id,
                    cost_per_item: s.cost_per_item,
                    amount_in_stock: s.amount_in_stock,
                    item_name: "".to_string(), // Removed from proto
                    currency_name: "".to_string(), // Removed from proto
                })
                .collect(),
        })
        .collect();

    Ok(markers)
}
