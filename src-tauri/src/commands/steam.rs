use std::time::Duration;

#[derive(serde::Serialize)]
pub struct SteamProfileInfo {
    pub name: String,
    pub avatar_url: String,
    pub privacy_state: String,
    pub is_vac_banned: bool,
    pub trade_ban_state: String,
    pub is_limited: bool,
    pub rust_hours: Option<f64>,
    pub steam_level: u32,
    pub is_playing_rust: bool,
}

/// Fetch a Steam profile avatar URL from the public community XML endpoint.
#[tauri::command]
pub async fn get_steam_avatar(steam_id: String) -> Result<String, String> {
    // Validate: SteamID64 is a 17-digit number.
    if steam_id.len() < 16 || steam_id.len() > 20 || !steam_id.chars().all(|c| c.is_ascii_digit()) {
        return Err("Invalid Steam ID".into());
    }

    let url = format!("https://steamcommunity.com/profiles/{}/?xml=1", steam_id);

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(8))
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Raidar/1.0")
        .build()
        .map_err(|e| format!("client build failed: {}", e))?;

    let body = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("request failed: {}", e))?
        .text()
        .await
        .map_err(|e| format!("read failed: {}", e))?;

    // Prefer the medium avatar (small, fast), then full, then icon.
    let mut avatar_url: Option<String> = None;
    for tag in ["avatarMedium", "avatarFull", "avatarIcon"] {
        if let Some(url) = extract_xml_tag(&body, tag) {
            avatar_url = Some(url);
            break;
        }
    }

    let url = match avatar_url {
        Some(u) => u,
        None => return Ok(String::new()),
    };

    // Download the image and return it as a base64 data URI so the webview
    // renders it directly (no remote image loading / CORS concerns).
    match client.get(&url).send().await {
        Ok(resp) => {
            let ct = resp
                .headers()
                .get("content-type")
                .and_then(|v| v.to_str().ok())
                .unwrap_or("image/jpeg")
                .to_string();
            match resp.bytes().await {
                Ok(bytes) => {
                    use base64::Engine;
                    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
                    Ok(format!("data:{};base64,{}", ct, b64))
                }
                Err(_) => Ok(url),
            }
        }
        Err(_) => Ok(url),
    }
}

/// Fetch comprehensive public information about a Steam user without requiring an API key.
#[tauri::command]
pub async fn get_steam_profile_info(steam_id: String) -> Result<SteamProfileInfo, String> {
    if steam_id.len() < 16 || steam_id.len() > 20 || !steam_id.chars().all(|c| c.is_ascii_digit()) {
        return Err("Invalid Steam ID".into());
    }

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(8))
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .build()
        .map_err(|e| format!("client build failed: {}", e))?;

    // 1. Fetch XML Profile
    let profile_url = format!("https://steamcommunity.com/profiles/{}/?xml=1", steam_id);
    let profile_xml = match client.get(&profile_url).send().await {
        Ok(resp) => resp.text().await.unwrap_or_default(),
        Err(_) => String::new(),
    };

    let name = extract_xml_tag(&profile_xml, "steamID").unwrap_or_else(|| "Unknown".to_string());
    let avatar_url = extract_xml_tag(&profile_xml, "avatarFull").unwrap_or_default();
    let privacy_state = extract_xml_tag(&profile_xml, "privacyState").unwrap_or_else(|| "private".to_string());
    let is_vac_banned = extract_xml_tag(&profile_xml, "vacBanned").unwrap_or_default() == "1";
    let trade_ban_state = extract_xml_tag(&profile_xml, "tradeBanState").unwrap_or_else(|| "None".to_string());
    let is_limited = extract_xml_tag(&profile_xml, "isLimitedAccount").unwrap_or_default() == "1";
    let is_playing_rust = extract_xml_tag(&profile_xml, "gameID").map(|s| s.trim() == "252490").unwrap_or(false)
        || extract_xml_tag(&profile_xml, "gamePlayed").map(|s| s.trim().to_lowercase().contains("rust")).unwrap_or(false);

    // 2. Fetch Games XML to get Rust hours (appID: 252490)
    let mut rust_hours = None;
    if privacy_state == "public" {
        let games_url = format!("https://steamcommunity.com/profiles/{}/games/?tab=all&xml=1", steam_id);
        if let Ok(resp) = client.get(&games_url).send().await {
            if let Ok(games_xml) = resp.text().await {
                if let Some(idx) = games_xml.find("<appID>252490</appID>") {
                    if let Some(hours_idx) = games_xml[idx..].find("<hoursOnRecord>") {
                        let start = idx + hours_idx + "<hoursOnRecord>".len();
                        if let Some(end_idx) = games_xml[start..].find("</hoursOnRecord>") {
                            let end = start + end_idx;
                            // <hoursOnRecord> is the TOTAL playtime for Rust. It may be
                            // grouped ("1,520" / "1 520") and/or have a decimal ("1,520.5").
                            rust_hours = parse_grouped_hours(games_xml[start..end].trim());
                        }
                    }
                }
            }
        }
    }

    // 3. Fallback: Parse Rust hours from HTML profile page (recent games or showcases)
    let mut steam_level = 0;
    let html_url = format!("https://steamcommunity.com/profiles/{}/?l=english", steam_id);
    if let Ok(resp) = client.get(&html_url).send().await {
        if let Ok(html_body) = resp.text().await {
            // Parse Level
            if let Some(idx) = html_body.find("friendPlayerLevelNum\">") {
                let start = idx + "friendPlayerLevelNum\">".len();
                if let Some(end_idx) = html_body[start..].find("</span>") {
                    let level_str = html_body[start..start + end_idx].trim();
                    if let Ok(lvl) = level_str.parse::<u32>() {
                        steam_level = lvl;
                    }
                }
            }

            // Fallback: Parse Rust hours (AppID 252490) total playtime from the
            // HTML profile page. We anchor strictly to the Rust game block and the
            // "hrs on record" / "hours played" phrase so unrelated numbers on the
            // page (levels, achievement counts, percentages, "past 2 weeks") are
            // never picked up. If nothing reliable is found we leave it as None so
            // the caller can fall back to BattleMetrics / RustStats.
            if rust_hours.is_none() {
                rust_hours = extract_rust_hours_from_html(&html_body);
            }
        }
    }

    // 4. Second Fallback: Query RustStats RPC API for playtime if Steam hours are private/None
    if rust_hours.is_none() {
        let rpc_url = "https://ruststats.io/api/rpc/get_profile";
        let body_json = serde_json::json!({ "id": steam_id });
        if let Ok(resp) = client.post(rpc_url).json(&body_json).send().await {
            if resp.status().is_success() {
                if let Ok(val) = resp.json::<serde_json::Value>().await {
                    if let Some(overview) = val.get("overview") {
                        if let Some(time_played_str) = overview.get("time_played").and_then(|v| v.as_str()) {
                            let is_minutes = time_played_str.contains("minute");
                            let clean = time_played_str
                                .replace("hours", "")
                                .replace("hour", "")
                                .replace("minutes", "")
                                .replace("minute", "")
                                .replace(",", "")
                                .trim()
                                .to_string();
                            if let Ok(val) = clean.parse::<f64>() {
                                if is_minutes {
                                    rust_hours = Some(val / 60.0);
                                } else {
                                    rust_hours = Some(val);
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(SteamProfileInfo {
        name,
        avatar_url,
        privacy_state,
        is_vac_banned,
        trade_ban_state,
        is_limited,
        rust_hours,
        steam_level,
        is_playing_rust,
    })
}

/// Safely open external links in the default web browser using tauri-plugin-shell.
#[tauri::command]
pub fn open_external_url(app_handle: tauri::AppHandle, url: String) -> Result<(), String> {
    use tauri_plugin_shell::ShellExt;
    app_handle.shell().open(&url, None).map_err(|e| e.to_string())
}

/// Extract the value inside `<tag><![CDATA[value]]></tag>` or `<tag>value</tag>`
fn extract_xml_tag(xml: &str, tag: &str) -> Option<String> {
    let open = format!("<{}>", tag);
    let close = format!("</{}>", tag);
    let start = xml.find(&open)? + open.len();
    let end = xml[start..].find(&close)? + start;
    let mut inner = xml[start..end].trim().to_string();
    if let Some(s) = inner.strip_prefix("<![CDATA[") {
        inner = s.to_string();
    }
    if let Some(s) = inner.strip_suffix("]]>") {
        inner = s.to_string();
    }
    let inner = inner.trim().to_string();
    if inner.is_empty() {
        None
    } else {
        Some(inner)
    }
}

#[derive(serde::Serialize)]
pub struct RustMemberStats {
    pub kills: u32,
    pub deaths: u32,
    pub headshots: u32,
    pub bullet_fired: u32,
    pub bullet_hit: u32,
    pub privacy: String,
}

/// Fetch public/cached Rust statistics for a Steam user.
#[tauri::command]
pub async fn get_rust_member_stats(steam_id: String) -> Result<RustMemberStats, String> {
    if steam_id.len() < 16 || steam_id.len() > 20 || !steam_id.chars().all(|c| c.is_ascii_digit()) {
        return Err("Invalid Steam ID".into());
    }

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(8))
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .build()
        .map_err(|e| format!("client build failed: {}", e))?;

    // 1. Try RustStats RPC API (allows retrieving cached stats even if profile is private)
    let rpc_url = "https://ruststats.io/api/rpc/get_profile";
    let body_json = serde_json::json!({ "id": steam_id });

    if let Ok(resp) = client.post(rpc_url).json(&body_json).send().await {
        if resp.status().is_success() {
            if let Ok(val) = resp.json::<serde_json::Value>().await {
                if let Some(pvp) = val.get("pvp_stats") {
                    let kills = pvp.get("kills").and_then(|v| v.as_str()).map(parse_number_str).unwrap_or(0);
                    let deaths = pvp.get("deaths").and_then(|v| v.as_str()).map(parse_number_str).unwrap_or(0);
                    let headshots = pvp.get("headshots").and_then(|v| v.as_str()).map(parse_number_str).unwrap_or(0);
                    let bullet_fired = pvp.get("bullets_fired").and_then(|v| v.as_str()).map(parse_number_str).unwrap_or(0);
                    let bullet_hit = pvp.get("bullets_hit").and_then(|v| v.as_str()).map(parse_number_str).unwrap_or(0);
                    
                    return Ok(RustMemberStats {
                        kills,
                        deaths,
                        headshots,
                        bullet_fired,
                        bullet_hit,
                        privacy: "public".to_string(),
                    });
                }
            }
        }
    }

    // 2. Fallback to Steam XML
    let url = format!("https://steamcommunity.com/profiles/{}/stats/252490/?xml=1", steam_id);
    let body = match client.get(&url).send().await {
        Ok(resp) => resp.text().await.unwrap_or_default(),
        Err(e) => return Err(format!("Failed to fetch stats: {}", e)),
    };

    if body.contains("You do not have permission") || body.contains("fatalerror") || !body.contains("<stats>") {
        return Ok(RustMemberStats {
            kills: 0,
            deaths: 0,
            headshots: 0,
            bullet_fired: 0,
            bullet_hit: 0,
            privacy: "private".to_string(),
        });
    }

    let kills = extract_stat_value(&body, "kill_player");
    let deaths = extract_stat_value(&body, "deaths");
    let headshots = extract_stat_value(&body, "headshot");
    let bullet_fired = extract_stat_value(&body, "bullet_fired");
    let bullet_hit = extract_stat_value(&body, "bullet_hit");

    Ok(RustMemberStats {
        kills,
        deaths,
        headshots,
        bullet_fired,
        bullet_hit,
        privacy: "public".to_string(),
    })
}

fn parse_number_str(s: &str) -> u32 {
    let clean = s.replace(",", "").trim().to_lowercase();
    if clean.ends_with('k') {
        let num_part = &clean[..clean.len() - 1];
        if let Ok(val) = num_part.parse::<f64>() {
            return (val * 1000.0) as u32;
        }
    } else if clean.ends_with('m') {
        let num_part = &clean[..clean.len() - 1];
        if let Ok(val) = num_part.parse::<f64>() {
            return (val * 1_000_000.0) as u32;
        }
    }
    clean.parse::<u32>().unwrap_or(0)
}

fn extract_stat_value(xml: &str, stat_name: &str) -> u32 {
    let pattern = format!("<name>{}</name>", stat_name);
    if let Some(pos) = xml.find(&pattern) {
        let after = &xml[pos + pattern.len()..];
        if let Some(val_start) = after.find("<value>") {
            let start = val_start + "<value>".len();
            if let Some(val_end) = after[start..].find("</value>") {
                if let Ok(val) = after[start..start + val_end].trim().parse::<u32>() {
                    return val;
                }
            }
        }
    }
    0
}


/// True for any character Steam may use as a thousands grouping separator
/// (locale-dependent) or as a decimal point in English formatting.
fn is_number_separator(c: char) -> bool {
    matches!(
        c,
        ',' | '.'
            | ' '
            | '\u{00A0}' // non-breaking space
            | '\u{2007}' // figure space
            | '\u{2009}' // thin space
            | '\u{202F}' // narrow no-break space
            | '\u{2060}' // word joiner
            | '\''        // some locales group with apostrophe
    )
}

/// Parse a possibly-grouped hours value into an f64.
///
/// Steam renders the total playtime localized, e.g. "1,520" (en), "1 520" /
/// "1\u{00A0}520" (cs/fr), optionally with a decimal like "1,520.5". We strip
/// every grouping separator (commas, regular/non-breaking/thin spaces, etc.)
/// BEFORE parsing so the FULL number is read, and keep a single '.' as the
/// decimal point. Returns None when there is no parseable number.
fn parse_grouped_hours(raw: &str) -> Option<f64> {
    let mut cleaned = String::new();
    for c in raw.chars() {
        if c.is_ascii_digit() {
            cleaned.push(c);
        } else if c == '.' {
            // Keep the decimal point only (commas are treated as grouping above).
            cleaned.push('.');
        }
        // Every other character (commas, spaces, nbsp, etc.) is a grouping
        // separator and is intentionally dropped.
    }
    // Guard against a stray "." with no digits.
    if !cleaned.chars().any(|c| c.is_ascii_digit()) {
        return None;
    }
    cleaned.parse::<f64>().ok()
}

/// Case-insensitive ASCII substring search returning a byte index into `haystack`.
/// `needle` must be lowercase ASCII. The returned index is always a valid char
/// boundary because it points at an ASCII byte.
fn find_ci_ascii(haystack: &str, needle: &str) -> Option<usize> {
    let h = haystack.as_bytes();
    let n = needle.as_bytes();
    if n.is_empty() || h.len() < n.len() {
        return None;
    }
    'outer: for i in 0..=(h.len() - n.len()) {
        for j in 0..n.len() {
            if h[i + j].to_ascii_lowercase() != n[j] {
                continue 'outer;
            }
        }
        return Some(i);
    }
    None
}

/// Slice `s` by byte range, snapping the bounds to the nearest valid char
/// boundaries so we never panic on multi-byte content (e.g. non-breaking spaces).
fn safe_slice(s: &str, mut start: usize, mut end: usize) -> &str {
    if end > s.len() {
        end = s.len();
    }
    while start < end && !s.is_char_boundary(start) {
        start += 1;
    }
    while end > start && !s.is_char_boundary(end) {
        end -= 1;
    }
    &s[start..end]
}

/// Read the number that immediately precedes `phrase_byte_idx` inside `window`.
///
/// We skip only the whitespace gap between the number and the phrase, then walk
/// backwards collecting a single contiguous run of digits and grouping
/// separators. A separator is only accepted when it sits between two digits, so
/// the scan stops cleanly at surrounding markup ('>', tabs, newlines) or words
/// and can never merge unrelated numbers together.
fn parse_hours_before(window: &str, phrase_byte_idx: usize) -> Option<f64> {
    let prefix = safe_slice(window, 0, phrase_byte_idx);
    let chars: Vec<char> = prefix.chars().collect();
    let mut i = chars.len();

    // Skip the whitespace separating the number from the phrase.
    while i > 0 && chars[i - 1].is_whitespace() {
        i -= 1;
    }

    let mut collected: Vec<char> = Vec::new();
    let mut seen_digit = false;
    while i > 0 {
        let c = chars[i - 1];
        if c.is_ascii_digit() {
            collected.push(c);
            seen_digit = true;
            i -= 1;
        } else if seen_digit && is_number_separator(c) {
            // Only treat as a grouping/decimal separator if a digit precedes it,
            // otherwise we have reached the start of the number.
            if i >= 2 && chars[i - 2].is_ascii_digit() {
                collected.push(c);
                i -= 1;
            } else {
                break;
            }
        } else {
            break;
        }
    }

    if !seen_digit {
        return None;
    }
    collected.reverse();
    let number_str: String = collected.into_iter().collect();
    parse_grouped_hours(&number_str)
}

/// Extract Rust's (AppID 252490) TOTAL playtime from a Steam community HTML
/// profile page. Anchors on the Rust game block and only accepts total-playtime
/// phrases ("hrs on record" / "hours on record" / "hours played"), never the
/// "past 2 weeks" value or any unrelated number. Returns None when no reliable
/// figure is present.
fn extract_rust_hours_from_html(html: &str) -> Option<f64> {
    // Total-playtime phrases only. English is forced via `?l=english`, but we
    // also include the bare localized "hodin" (Czech "hours") as a safety net.
    let total_phrases = [
        "hrs on record",
        "hours on record",
        "hours played",
        "hodin celkem", // cs: "X hours total"
        "hodin",        // cs fallback
    ];

    let mut search_pos = 0;
    while let Some(rel) = html[search_pos..].find("252490") {
        let idx = search_pos + rel;
        search_pos = idx + "252490".len();

        // The playtime details block sits just after the Rust game/app link.
        // Look slightly before and well after the appid reference.
        let win_start = idx.saturating_sub(200);
        let win_end = (idx + 800).min(html.len());
        let window = safe_slice(html, win_start, win_end);

        for phrase in &total_phrases {
            if let Some(p) = find_ci_ascii(window, phrase) {
                if let Some(hours) = parse_hours_before(window, p) {
                    // Sanity: ignore absurd values; otherwise accept.
                    if hours >= 0.0 && hours < 1_000_000.0 {
                        return Some(hours);
                    }
                }
            }
        }
    }
    None
}
