use serde::Serialize;
use tauri::State;

use crate::rustplus::protocol;
use crate::AppState;

/// SteamID64 values exceed JavaScript's safe integer range (2^53), so we must
/// serialize them as strings — otherwise the frontend receives a rounded,
/// WRONG id (which then resolves to the default Steam avatar, etc.).
fn steamid_to_string<S: serde::Serializer>(v: &u64, s: S) -> Result<S::Ok, S::Error> {
    s.serialize_str(&v.to_string())
}

#[derive(Debug, Serialize)]
pub struct TeamInfo {
    #[serde(serialize_with = "steamid_to_string")]
    pub leader_steam_id: u64,
    pub members: Vec<TeamMember>,
}

#[derive(Debug, Clone, Serialize)]
pub struct TeamMember {
    #[serde(serialize_with = "steamid_to_string")]
    pub steam_id: u64,
    pub name: String,
    pub x: f32,
    pub y: f32,
    pub is_online: bool,
    pub spawn_time: u32,
    pub is_alive: bool,
    pub death_time: u32,
}

#[derive(Debug, Serialize)]
pub struct ChatMessage {
    #[serde(serialize_with = "steamid_to_string")]
    pub steam_id: u64,
    pub name: String,
    pub message: String,
    pub color: String,
    pub time: u32,
}

/// Full mock data payload for frontend development.
#[derive(Debug, Serialize)]
pub struct MockData {
    pub server_info: MockServerInfo,
    pub team: TeamInfo,
    pub chat_messages: Vec<ChatMessage>,
    pub map_markers: Vec<MockMapMarker>,
}

#[derive(Debug, Serialize)]
pub struct MockServerInfo {
    pub name: String,
    pub map: String,
    pub map_size: u32,
    pub players: u32,
    pub max_players: u32,
    pub queued_players: u32,
    pub seed: u32,
    pub header_image: String,
}

#[derive(Debug, Serialize)]
pub struct MockMapMarker {
    pub id: u32,
    pub marker_type: i32,
    pub x: f32,
    pub y: f32,
    pub name: String,
    pub rotation: f32,
    pub radius: f32,
    pub steam_id: u64,
}

/// Get team info from the connected server.
#[tauri::command]
pub async fn get_team_info(state: State<'_, AppState>) -> Result<TeamInfo, String> {
    let conn_guard = state.connection.lock().await;
    let connection = conn_guard.as_ref().ok_or("Not connected")?;

    let request = protocol::get_team_info_request();
    let response = connection.send_request(request).await?;

    let team = response.team_info.ok_or("No team info in response")?;

    Ok(TeamInfo {
        leader_steam_id: team.leader_steam_id,
        members: team
            .members
            .into_iter()
            .map(|m| TeamMember {
                steam_id: m.steam_id,
                name: m.name,
                x: m.x,
                y: m.y,
                is_online: m.is_online,
                spawn_time: m.spawn_time,
                is_alive: m.is_alive,
                death_time: m.death_time,
            })
            .collect(),
    })
}

/// Get the team chat history from the connected server.
#[tauri::command]
pub async fn get_team_chat(state: State<'_, AppState>) -> Result<Vec<ChatMessage>, String> {
    let conn_guard = state.connection.lock().await;
    let connection = conn_guard.as_ref().ok_or("Not connected")?;

    let request = protocol::get_team_chat_request();
    let response = connection.send_request(request).await?;

    let chat = response.team_chat.ok_or("No team chat in response")?;

    Ok(chat
        .messages
        .into_iter()
        .map(|m| ChatMessage {
            steam_id: m.steam_id,
            name: m.name,
            message: m.message,
            color: m.color,
            time: m.time,
        })
        .collect())
}

/// Returns realistic mock data for frontend development without a live server.
#[tauri::command]
pub async fn get_mock_data() -> Result<MockData, String> {
    let team_members = vec![
        TeamMember {
            steam_id: 76561198012345678,
            name: "PlayerOne".to_string(),
            x: 1500.0,
            y: 2200.0,
            is_online: true,
            spawn_time: 1700000000,
            is_alive: true,
            death_time: 0,
        },
        TeamMember {
            steam_id: 76561198023456789,
            name: "RustChad".to_string(),
            x: 1480.0,
            y: 2180.0,
            is_online: true,
            spawn_time: 1700000100,
            is_alive: true,
            death_time: 0,
        },
        TeamMember {
            steam_id: 76561198034567890,
            name: "BaseBuilder".to_string(),
            x: 800.0,
            y: 1600.0,
            is_online: true,
            spawn_time: 1700000200,
            is_alive: true,
            death_time: 0,
        },
        TeamMember {
            steam_id: 76561198045678901,
            name: "NightOwl".to_string(),
            x: 2000.0,
            y: 3000.0,
            is_online: false,
            spawn_time: 1699999000,
            is_alive: false,
            death_time: 1700001000,
        },
    ];

    let chat_messages = vec![
        ChatMessage {
            steam_id: 76561198012345678,
            name: "PlayerOne".to_string(),
            message: "Base is getting raided! Need backup at G7!".to_string(),
            color: "#55aabb".to_string(),
            time: 1700001500,
        },
        ChatMessage {
            steam_id: 76561198023456789,
            name: "RustChad".to_string(),
            message: "On my way, 2 minutes out".to_string(),
            color: "#aa55bb".to_string(),
            time: 1700001510,
        },
        ChatMessage {
            steam_id: 76561198034567890,
            name: "BaseBuilder".to_string(),
            message: "I'll seal the back entrance".to_string(),
            color: "#bbaa55".to_string(),
            time: 1700001520,
        },
        ChatMessage {
            steam_id: 76561198012345678,
            name: "PlayerOne".to_string(),
            message: "They have rockets, bring boom".to_string(),
            color: "#55aabb".to_string(),
            time: 1700001530,
        },
        ChatMessage {
            steam_id: 76561198023456789,
            name: "RustChad".to_string(),
            message: "Got 8 C4 ready to go".to_string(),
            color: "#aa55bb".to_string(),
            time: 1700001540,
        },
    ];

    let map_markers = vec![
        MockMapMarker {
            id: 1,
            marker_type: 1, // Player
            x: 1500.0,
            y: 2200.0,
            name: "PlayerOne".to_string(),
            rotation: 45.0,
            radius: 0.0,
            steam_id: 76561198012345678,
        },
        MockMapMarker {
            id: 2,
            marker_type: 1, // Player
            x: 1480.0,
            y: 2180.0,
            name: "RustChad".to_string(),
            rotation: 120.0,
            radius: 0.0,
            steam_id: 76561198023456789,
        },
        MockMapMarker {
            id: 3,
            marker_type: 2, // Explosion
            x: 1550.0,
            y: 2250.0,
            name: "".to_string(),
            rotation: 0.0,
            radius: 50.0,
            steam_id: 0,
        },
        MockMapMarker {
            id: 4,
            marker_type: 3, // VendingMachine
            x: 1200.0,
            y: 1800.0,
            name: "AK Shop".to_string(),
            rotation: 0.0,
            radius: 0.0,
            steam_id: 0,
        },
        MockMapMarker {
            id: 5,
            marker_type: 4, // CH47
            x: 2500.0,
            y: 1500.0,
            name: "".to_string(),
            rotation: 270.0,
            radius: 0.0,
            steam_id: 0,
        },
        MockMapMarker {
            id: 6,
            marker_type: 5, // CargoShip
            x: 3800.0,
            y: 500.0,
            name: "".to_string(),
            rotation: 90.0,
            radius: 0.0,
            steam_id: 0,
        },
        MockMapMarker {
            id: 7,
            marker_type: 6, // Crate
            x: 2200.0,
            y: 2600.0,
            name: "".to_string(),
            rotation: 0.0,
            radius: 0.0,
            steam_id: 0,
        },
        MockMapMarker {
            id: 8,
            marker_type: 8, // PatrolHelicopter
            x: 1800.0,
            y: 2800.0,
            name: "".to_string(),
            rotation: 180.0,
            radius: 0.0,
            steam_id: 0,
        },
    ];

    Ok(MockData {
        server_info: MockServerInfo {
            name: "Rustopia US Main".to_string(),
            map: "Procedural Map".to_string(),
            map_size: 4250,
            players: 187,
            max_players: 250,
            queued_players: 12,
            seed: 1337420,
            header_image: "https://via.placeholder.com/800x400".to_string(),
        },
        team: TeamInfo {
            leader_steam_id: 76561198012345678,
            members: team_members,
        },
        chat_messages,
        map_markers,
    })
}

/// Promote a teammate to leader.
#[tauri::command]
pub async fn promote_to_leader(
    state: State<'_, AppState>,
    steam_id: String,
) -> Result<String, String> {
    let steam_id_u64 = steam_id.parse::<u64>().map_err(|e| format!("Invalid steam_id: {}", e))?;
    
    let conn_guard = state.connection.lock().await;
    let connection = conn_guard.as_ref().ok_or("Not connected")?;

    let request = protocol::promote_to_leader_request(steam_id_u64);
    let response = connection.send_request(request).await?;

    if let Some(err) = response.error {
        Err(format!("Failed to promote: {}", err.error))
    } else {
        Ok("Promoted successfully".to_string())
    }
}
