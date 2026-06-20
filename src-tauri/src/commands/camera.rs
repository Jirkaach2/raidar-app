use crate::rustplus::protocol;
use crate::AppState;
use tauri::State;

/// Subscribe to a Rust+ camera feed (CCTV / drone / auto turret).
///
/// On success the server begins streaming `cameraRays` broadcasts (forwarded to
/// the frontend via the `rustplus-event` channel) plus an initial
/// `cameraSubscribeInfo` with the render dimensions. The frontend decodes the
/// ray data into a viewable image.
#[tauri::command]
pub async fn camera_subscribe(state: State<'_, AppState>, camera_id: String) -> Result<serde_json::Value, String> {
    let conn_guard = state.connection.lock().await;
    let connection = conn_guard.as_ref().ok_or("Not connected")?;

    let request = protocol::camera_subscribe_request(camera_id);
    let response = connection.send_request(request).await?;

    // Return the camera info (dimensions / fov) so the UI can size the canvas.
    if let Some(info) = response.camera_subscribe_info {
        Ok(serde_json::json!({
            "width": info.width,
            "height": info.height,
            "near_plane": info.near_plane,
            "far_plane": info.far_plane,
            "control_flags": info.control_flags,
        }))
    } else if let Some(err) = response.error {
        Err(err.error)
    } else {
        Ok(serde_json::json!({ "width": 0, "height": 0 }))
    }
}

/// Unsubscribe from the current camera feed.
#[tauri::command]
pub async fn camera_unsubscribe(state: State<'_, AppState>) -> Result<(), String> {
    let conn_guard = state.connection.lock().await;
    let connection = conn_guard.as_ref().ok_or("Not connected")?;

    let request = protocol::camera_unsubscribe_request();
    connection.send_request(request).await?;
    Ok(())
}

/// Send a movement / mouse-look input to the subscribed camera.
/// `buttons` is the Rust+ camera button bitmask; `mouse_x` / `mouse_y` are the
/// mouse-look deltas.
#[tauri::command]
pub async fn camera_input(state: State<'_, AppState>, buttons: i32, mouse_x: f32, mouse_y: f32) -> Result<(), String> {
    let conn_guard = state.connection.lock().await;
    let connection = conn_guard.as_ref().ok_or("Not connected")?;

    let request = protocol::camera_input_request(buttons, mouse_x, mouse_y);
    connection.send_request(request).await?;
    Ok(())
}
