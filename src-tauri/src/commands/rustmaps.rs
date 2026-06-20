use serde::Serialize;
use std::time::Duration;

/// One monument from the RustMaps v4 response, with WORLD coordinates.
#[derive(Debug, Serialize)]
pub struct RmMonument {
    pub r#type: String,
    pub wx: f64,
    pub wy: f64,
}

#[derive(Debug, Serialize)]
pub struct RmStats {
    pub biome_s: f64,
    pub biome_d: f64,
    pub biome_f: f64,
    pub biome_t: f64,
    pub biome_j: f64,
    pub land_percent: i64,
    pub islands: i64,
    pub mountains: i64,
    pub rivers: i64,
    pub lakes: i64,
    pub canyons: i64,
    pub total_monuments: i64,
}

#[derive(Debug, Serialize)]
pub struct RmResult {
    /// "ok" | "generating" | "unauthorized" | "error"
    pub status: String,
    pub message: String,
    pub monuments: Vec<RmMonument>,
    pub stats: Option<RmStats>,
}

/// Map the numeric MonumentTypes enum → canonical name (kinds we care about).
fn type_name(v: &serde_json::Value) -> String {
    if let Some(n) = v.as_i64() {
        return match n {
            155 => "Water Well A",
            160 => "Water Well B",
            165 => "Water Well C",
            170 => "Water Well D",
            175 => "Water Well E",
            240 => "Cave Large Hard",
            245 => "Cave Large Medium",
            250 => "Cave Large Sewers Hard",
            255 => "Cave Medium Easy",
            260 => "Cave Medium Hard",
            265 => "Cave Medium Medium",
            270 => "Cave Small Easy",
            275 => "Cave Small Hard",
            280 => "Cave Small Medium",
            other => return format!("type_{}", other),
        }
        .to_string();
    }
    v.as_str().unwrap_or("").replace('_', " ").trim().to_string()
}

/// Fetch caves + water wells (and all monuments) from RustMaps by seed + size.
/// Routed through the backend so there are no webview CORS issues.
#[tauri::command]
pub async fn get_rustmaps_monuments(api_key: String, size: u32, seed: u32) -> Result<RmResult, String> {
    if api_key.trim().is_empty() {
        return Ok(RmResult { status: "no_key".into(), message: "No RustMaps API key.".into(), monuments: vec![], stats: None });
    }

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .user_agent("Raidar/1.0")
        .build()
        .map_err(|e| format!("client build failed: {}", e))?;

    let url = format!("https://api.rustmaps.com/v4/maps/{}/{}?staging=false", size, seed);
    let resp = client
        .get(&url)
        .header("X-API-Key", api_key.trim())
        .send()
        .await
        .map_err(|e| format!("RustMaps request failed: {}", e))?;

    let code = resp.status().as_u16();
    println!("[rustmaps] GET {} -> {}", url, code);

    if code == 401 || code == 403 {
        return Ok(RmResult { status: "unauthorized".into(), message: "RustMaps key rejected.".into(), monuments: vec![], stats: None });
    }
    if code == 409 {
        // Map exists and is already in the generation queue — just keep polling.
        return Ok(RmResult { status: "generating".into(), message: "Map is generating on RustMaps.".into(), monuments: vec![], stats: None });
    }
    if code == 404 {
        // Doesn't exist yet — queue generation, then poll.
        let body = serde_json::json!({ "size": size, "seed": seed, "staging": false });
        let _ = client
            .post("https://api.rustmaps.com/v4/maps")
            .header("X-API-Key", api_key.trim())
            .json(&body)
            .send()
            .await;
        return Ok(RmResult { status: "generating".into(), message: "Queued map generation on RustMaps.".into(), monuments: vec![], stats: None });
    }
    if code == 429 {
        return Ok(RmResult { status: "error".into(), message: "RustMaps rate limit hit.".into(), monuments: vec![], stats: None });
    }
    if !(200..300).contains(&code) {
        return Ok(RmResult { status: "error".into(), message: format!("RustMaps HTTP {}", code), monuments: vec![], stats: None });
    }

    let json: serde_json::Value = resp.json().await.map_err(|e| format!("bad JSON: {}", e))?;
    let data = json.get("data").cloned().unwrap_or(serde_json::Value::Null);
    let mons = data
        .get("monuments")
        .and_then(|m| m.as_array())
        .cloned()
        .unwrap_or_default();
    println!("[rustmaps] parsed {} monuments from response", mons.len());

    let mut out = Vec::new();
    for m in mons {
        let name = type_name(m.get("type").unwrap_or(&serde_json::Value::Null));
        let coords = m.get("coordinates").cloned().unwrap_or(serde_json::Value::Null);
        let wx = coords.get("x").and_then(|v| v.as_f64());
        let wy = coords.get("y").and_then(|v| v.as_f64());
        if let (Some(wx), Some(wy)) = (wx, wy) {
            out.push(RmMonument { r#type: name, wx, wy });
        }
    }

    // Top-level map stats (biome %, terrain counts) for the Map Info card.
    let num = |v: &serde_json::Value, k: &str| v.get(k).and_then(|x| x.as_f64()).unwrap_or(0.0);
    let int = |v: &serde_json::Value, k: &str| v.get(k).and_then(|x| x.as_i64()).unwrap_or(0);
    let biomes = data.get("biomePercentages").cloned().unwrap_or(serde_json::Value::Null);
    let stats = RmStats {
        biome_s: num(&biomes, "s"),
        biome_d: num(&biomes, "d"),
        biome_f: num(&biomes, "f"),
        biome_t: num(&biomes, "t"),
        biome_j: num(&biomes, "j"),
        land_percent: int(&data, "landPercentageOfMap"),
        islands: int(&data, "islands"),
        mountains: int(&data, "mountains"),
        rivers: int(&data, "rivers"),
        lakes: int(&data, "lakes"),
        canyons: int(&data, "canyons"),
        total_monuments: int(&data, "totalMonuments"),
    };

    Ok(RmResult { status: "ok".into(), message: String::new(), monuments: out, stats: Some(stats) })
}
