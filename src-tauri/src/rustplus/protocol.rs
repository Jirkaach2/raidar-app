use crate::generated::*;

/// Helper to build a GetInfo request.
pub fn get_info_request() -> AppRequest {
    AppRequest {
        get_info: Some(AppEmpty {}),
        ..Default::default()
    }
}

/// Helper to build a GetTime request.
pub fn get_time_request() -> AppRequest {
    AppRequest {
        get_time: Some(AppEmpty {}),
        ..Default::default()
    }
}

/// Helper to build a GetMap request.
pub fn get_map_request() -> AppRequest {
    AppRequest {
        get_map: Some(AppEmpty {}),
        ..Default::default()
    }
}

/// Helper to build a GetTeamInfo request.
pub fn get_team_info_request() -> AppRequest {
    AppRequest {
        get_team_info: Some(AppEmpty {}),
        ..Default::default()
    }
}

/// Helper to build a GetTeamChat request.
pub fn get_team_chat_request() -> AppRequest {
    AppRequest {
        get_team_chat: Some(AppEmpty {}),
        ..Default::default()
    }
}

/// Helper to build a SendTeamMessage request.
pub fn send_team_message_request(message: String) -> AppRequest {
    AppRequest {
        send_team_message: Some(AppSendMessage { message }),
        ..Default::default()
    }
}

/// Helper to build a GetMapMarkers request.
pub fn get_map_markers_request() -> AppRequest {
    AppRequest {
        get_map_markers: Some(AppEmpty {}),
        ..Default::default()
    }
}

/// Helper to build a GetEntityInfo request.
pub fn get_entity_info_request(entity_id: u32) -> AppRequest {
    AppRequest {
        entity_id: Some(entity_id),
        get_entity_info: Some(AppEmpty {}),
        ..Default::default()
    }
}

/// Helper to build a SetEntityValue request.
pub fn set_entity_value_request(entity_id: u32, value: bool) -> AppRequest {
    AppRequest {
        entity_id: Some(entity_id),
        set_entity_value: Some(AppSetEntityValue { value }),
        ..Default::default()
    }
}

/// Helper to build a CameraSubscribe request.
pub fn camera_subscribe_request(camera_id: String) -> AppRequest {
    AppRequest {
        camera_subscribe: Some(AppCameraSubscribe { camera_id }),
        ..Default::default()
    }
}

/// Helper to build a CameraUnsubscribe request.
pub fn camera_unsubscribe_request() -> AppRequest {
    AppRequest {
        camera_unsubscribe: Some(AppEmpty {}),
        ..Default::default()
    }
}

/// Helper to build a CameraInput request (movement / mouse for the camera).
pub fn camera_input_request(buttons: i32, x: f32, y: f32) -> AppRequest {
    AppRequest {
        camera_input: Some(AppCameraInput {
            buttons,
            mouse_delta: Vector2 { x: Some(x), y: Some(y) },
        }),
        ..Default::default()
    }
}

/// Helper to build a PromoteToLeader request.
pub fn promote_to_leader_request(steam_id: u64) -> AppRequest {
    AppRequest {
        promote_to_leader: Some(AppPromoteToLeader { steam_id }),
        ..Default::default()
    }
}
