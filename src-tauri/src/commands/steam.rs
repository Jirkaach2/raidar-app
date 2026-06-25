use std::time::Duration;

/// Steam Web API key (server-side). Used for GetOwnedGames (authoritative Rust
/// playtime: total + last-2-weeks) and other IPlayerService/ISteamUser calls.
/// Kept in the Rust backend so it is never shipped in the web bundle.
const STEAM_API_KEY: &str = "D92F91DA6E65A414EF233A3BAE2C82E0";

#[derive(serde::Serialize)]
pub struct SteamProfileInfo {
    pub name: String,
    pub avatar_url: String,
    pub privacy_state: String,
    pub is_vac_banned: bool,
    pub trade_ban_state: String,
    pub is_limited: bool,
    pub rust_hours: Option<f64>,
    /// Rust playtime over the last 2 weeks (hours). Enables an hrs/day figure.
    pub recent_hours: Option<f64>,
    pub steam_level: u32,
    pub is_playing_rust: bool,
}

/// Fetch authoritative Rust playtime via the Steam Web API GetOwnedGames.
/// Returns (total_hours, last_2weeks_hours). Requires the player's game details
/// to be public (the common case); returns (None, None) otherwise. This is the
/// reliable source now that Steam gates the community games XML/HTML behind a
/// login, so anonymous scraping returns a sign-in page.
async fn fetch_rust_playtime(
    client: &reqwest::Client,
    steam_id: &str,
) -> (Option<f64>, Option<f64>) {
    let url = format!(
        "https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key={}&steamid={}&include_played_free_games=1&appids_filter[0]=252490",
        STEAM_API_KEY, steam_id
    );
    let resp = match client.get(&url).send().await {
        Ok(r) => r,
        Err(_) => return (None, None),
    };
    if !resp.status().is_success() {
        return (None, None);
    }
    let val = match resp.json::<serde_json::Value>().await {
        Ok(v) => v,
        Err(_) => return (None, None),
    };
    let games = match val.get("response").and_then(|r| r.get("games")).and_then(|g| g.as_array()) {
        Some(g) => g,
        None => return (None, None),
    };
    for game in games {
        if game.get("appid").and_then(|a| a.as_u64()) == Some(252490) {
            let forever = game
                .get("playtime_forever")
                .and_then(|v| v.as_f64())
                .map(|m| m / 60.0)
                .filter(|h| *h > 0.0);
            let recent = game
                .get("playtime_2weeks")
                .and_then(|v| v.as_f64())
                .map(|m| m / 60.0)
                .filter(|h| *h > 0.0);
            return (forever, recent);
        }
    }
    (None, None)
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

    // 1b. PRIMARY hours source: Steam Web API GetOwnedGames (authoritative —
    //     total playtime + last-2-weeks). This replaces the now-defunct
    //     community games XML/HTML scraping, which Steam gates behind a login.
    let (api_total_hours, recent_hours) = fetch_rust_playtime(&client, &steam_id).await;
    let mut rust_hours = api_total_hours;

    // 2. Fallback: Games XML for Rust hours (appID 252490) only if the Web API
    //    didn't return them.
    if rust_hours.is_none() && privacy_state == "public" {
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
            // Parse the PROFILE OWNER's Steam level.
            //
            // The owner's level lives in the profile header persona block, whose
            // markup is `...persona_level...<span class="friendPlayerLevelNum">N</span>`.
            // Friends in the friends/showcase block reuse the SAME
            // `friendPlayerLevelNum` span but inside a `friendBlock` (no
            // `persona_level` class), so anchoring on the FIRST
            // `friendPlayerLevelNum` blindly can return a FRIEND's level (the
            // root cause of the bogus "439"). We therefore anchor strictly to the
            // owner's `persona_level` container and read the first level span that
            // follows it. If the owner's level can't be isolated we leave it at 0
            // rather than emit a wrong number.
            steam_level = parse_owner_steam_level(&html_body);

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

    // 4. Second Fallback: Query RustStats RPC API for playtime if Steam hours are
    //    private/None. The RustStats `get_profile` RPC mirrors Steam's TOTAL "hrs
    //    on record" via `overview.time_played` (e.g. "3,795 hours", "1,200 hours
    //    30 minutes", or "0 minute" when the player's game details are private).
    //    We parse hours + minutes explicitly and only accept a STRICTLY POSITIVE
    //    total — a "0 minute" reading means RustStats can't see the playtime
    //    either, in which case we leave `rust_hours` as None so the UI degrades
    //    gracefully ("Hours Private") instead of showing a misleading "0 hrs".
    if rust_hours.is_none() {
        let rpc_url = "https://ruststats.io/api/rpc/get_profile";
        let body_json = serde_json::json!({ "id": steam_id });
        if let Ok(resp) = client.post(rpc_url).json(&body_json).send().await {
            if resp.status().is_success() {
                if let Ok(val) = resp.json::<serde_json::Value>().await {
                    if let Some(time_played_str) = val
                        .get("overview")
                        .and_then(|o| o.get("time_played"))
                        .and_then(|v| v.as_str())
                    {
                        rust_hours = parse_ruststats_time(time_played_str);
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
        recent_hours,
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
    /// Every `<stat><name>X</name><value>Y</value></stat>` pair found in the
    /// Steam XML, keyed by the real Steam stat api name. The frontend only ever
    /// renders keys that are actually present here, so no value is ever invented.
    #[serde(rename = "all_stats")]
    pub all_stats: std::collections::HashMap<String, u32>,
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

    // 1. PRIMARY SOURCE: the Steam community stats XML endpoint. Historically
    //    this returned the COMPLETE set of `<stat><name>X</name><value>Y</value>
    //    </stat>` pairs for public profiles. Steam has since largely STOPPED
    //    exposing the numeric Rust stats here — for many fully-public profiles
    //    the `<stats>` container now holds only `<hoursPlayed>0</hoursPlayed>`
    //    with ZERO `<stat>` blocks (only `<achievements>` remain). Crucially we
    //    must therefore decide whether to use this source based on whether it
    //    actually yielded any `<stat>` blocks — NOT on the mere presence of the
    //    `<stats>` container. Returning an all-zero "public" result here was the
    //    root cause of public profiles showing "PRIVATE / UNSYNCED": the code
    //    returned early before ever consulting the RustStats RPC fallback below.
    //    No value is ever invented — only keys that actually exist are emitted.
    let xml_url = format!("https://steamcommunity.com/profiles/{}/stats/252490/?xml=1", steam_id);
    let xml_body = match client.get(&xml_url).send().await {
        Ok(resp) => resp.text().await.unwrap_or_default(),
        Err(_) => String::new(),
    };

    // Parse whatever `<stat>` blocks are present. We ONLY treat the XML as the
    // authoritative source when it actually produced stat values; an empty map
    // (the common modern case) falls through to the RustStats RPC below.
    let xml_stats = parse_all_stats(&xml_body);
    if !xml_stats.is_empty() {
        let kills = xml_stats.get("kill_player").copied().unwrap_or(0);
        let deaths = xml_stats.get("deaths").copied().unwrap_or(0);
        let headshots = xml_stats.get("headshot").copied().unwrap_or(0);
        let bullet_fired = xml_stats.get("bullet_fired").copied().unwrap_or(0);
        let bullet_hit = xml_stats.get("bullet_hit").copied().unwrap_or(0);

        return Ok(RustMemberStats {
            kills,
            deaths,
            headshots,
            bullet_fired,
            bullet_hit,
            privacy: "public".to_string(),
            all_stats: xml_stats,
        });
    }

    // 2b. FALLBACK: the Steam XML was private / permission-denied / had no
    //     readable `<stat>` blocks. Query the RustStats `get_profile` RPC. This
    //     is the exact endpoint the ruststats.io site itself uses (POST
    //     {"id": <steamid64>}) and it returns a rich, cached snapshot of a
    //     player's Rust stats even when their Steam game details are private —
    //     which is precisely the case the bug report hit (Steam stats XML denied,
    //     yet ruststats.io HAS the player).
    //
    //     We translate the RustStats JSON into the SAME Steam stat api-name keys
    //     the frontend tiles expect (kill_player, deaths, headshot, bullet_hit,
    //     bullet_hit_building, …) so the full rich breakdown renders. Privacy is
    //     taken from the response's real `is_private` flag, so a public ruststats
    //     profile is correctly reported as "public" (the combat scorecard and
    //     tile grid only render for public profiles). No value is invented — keys
    //     are only inserted when the corresponding field is actually present.
    let rpc_url = "https://ruststats.io/api/rpc/get_profile";
    let body_json = serde_json::json!({ "id": steam_id });

    if let Ok(resp) = client.post(rpc_url).json(&body_json).send().await {
        if resp.status().is_success() {
            if let Ok(val) = resp.json::<serde_json::Value>().await {
                let all_stats = build_all_stats_from_ruststats(&val);
                if !all_stats.is_empty() {
                    // A populated map means ruststats has this player's data.
                    let is_private = val
                        .get("is_private")
                        .and_then(|v| v.as_bool())
                        .unwrap_or(false);

                    let kills = all_stats.get("kill_player").copied().unwrap_or(0);
                    let deaths = all_stats.get("deaths").copied().unwrap_or(0);
                    let headshots = all_stats.get("headshot").copied().unwrap_or(0);
                    let bullet_fired = all_stats.get("bullet_fired").copied().unwrap_or(0);
                    let bullet_hit = all_stats.get("bullet_hit").copied().unwrap_or(0);

                    return Ok(RustMemberStats {
                        kills,
                        deaths,
                        headshots,
                        bullet_fired,
                        bullet_hit,
                        privacy: if is_private {
                            "private".to_string()
                        } else {
                            "public".to_string()
                        },
                        all_stats,
                    });
                }
            }
        }
    }

    // 3. Nothing readable from either source — report a private/empty profile.
    Ok(RustMemberStats {
        kills: 0,
        deaths: 0,
        headshots: 0,
        bullet_fired: 0,
        bullet_hit: 0,
        privacy: "private".to_string(),
        all_stats: std::collections::HashMap::new(),
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

/// Extract the PROFILE OWNER's Steam level from a Steam community HTML profile
/// page.
///
/// The owner's level is rendered inside the profile header persona block, which
/// carries the `persona_level` CSS class, e.g.:
///   `<div class="persona_name persona_level">Level
///      <div class="friendPlayerLevel lvl_100 lvl_plus_0">
///        <span class="friendPlayerLevelNum">100</span></div></div>`
///
/// Friends shown in the friends/showcase block reuse the SAME
/// `friendPlayerLevelNum` span, but they live inside `friendBlock` containers
/// that do NOT carry the `persona_level` class. Anchoring on the first
/// `friendPlayerLevelNum` blindly can therefore latch onto a friend's level
/// (the cause of the bogus "439"). We instead locate the owner's `persona_level`
/// container first and read the next level span after it. Returns 0 when the
/// owner's level can't be reliably isolated (preferred over a wrong value).
fn parse_owner_steam_level(html: &str) -> u32 {
    let anchor = match html.find("persona_level") {
        Some(a) => a,
        None => return 0,
    };
    let after = &html[anchor..];
    let needle = "friendPlayerLevelNum\">";
    let rel = match after.find(needle) {
        Some(r) => r,
        None => return 0,
    };
    let start = anchor + rel + needle.len();
    // The level value is followed by `</span>`; stop at the first '<'.
    if let Some(end_rel) = html[start..].find('<') {
        let level_str = html[start..start + end_rel].trim();
        if let Ok(lvl) = level_str.parse::<u32>() {
            return lvl;
        }
    }
    0
}

/// Parse a RustStats `overview.time_played` string into total hours.
///
/// RustStats mirrors Steam's TOTAL "hrs on record" and renders it localized as
/// human text, e.g. "3,795 hours", "1,200 hours 30 minutes", "45 minutes", or
/// "0 minute" when the player's game details are private. We scan for each
/// `<number> <unit>` pair, summing hours directly and converting minutes, so any
/// combination resolves correctly. Numbers may be grouped ("3,795" / "3 795").
/// Returns `Some(total)` only when the total is STRICTLY POSITIVE — a "0 minute"
/// reading yields `None` so the caller degrades gracefully rather than reporting
/// a misleading "0 hrs".
fn parse_ruststats_time(raw: &str) -> Option<f64> {
    let lower = raw.to_lowercase();
    let chars: Vec<char> = lower.chars().collect();
    let mut hours = 0.0f64;
    let mut minutes = 0.0f64;
    let mut found_unit = false;
    let mut i = 0usize;

    while i < chars.len() {
        if chars[i].is_ascii_digit() {
            // Collect a (possibly grouped) number.
            let num_start = i;
            while i < chars.len()
                && (chars[i].is_ascii_digit() || is_number_separator(chars[i]))
            {
                // A separator only continues the number when sandwiched between
                // two digits; otherwise it terminates it.
                if chars[i].is_ascii_digit() {
                    i += 1;
                } else if i + 1 < chars.len() && chars[i + 1].is_ascii_digit() {
                    i += 1;
                } else {
                    break;
                }
            }
            let number_str: String = chars[num_start..i].iter().collect();
            let value = parse_grouped_hours(&number_str).unwrap_or(0.0);

            // Skip whitespace between the number and its unit word.
            while i < chars.len() && chars[i].is_whitespace() {
                i += 1;
            }
            // Read the unit word.
            let unit_start = i;
            while i < chars.len() && chars[i].is_ascii_alphabetic() {
                i += 1;
            }
            let unit: String = chars[unit_start..i].iter().collect();
            if unit.starts_with("hour") {
                hours += value;
                found_unit = true;
            } else if unit.starts_with("minute") {
                minutes += value;
                found_unit = true;
            }
        } else {
            i += 1;
        }
    }

    if !found_unit {
        return None;
    }
    let total = hours + minutes / 60.0;
    if total > 0.0 {
        Some(total)
    } else {
        None
    }
}

/// Translate a RustStats `get_profile` JSON payload into the Steam stat
/// api-name keyed map the frontend tiles consume (`kill_player`, `deaths`,
/// `headshot`, `bullet_hit_building`, …). RustStats groups its figures into
/// nested objects (`pvp_stats`, `bullets_hit`, `kills`, `bow_hits`, …) with
/// values rendered as grouped/abbreviated strings ("12,496", "554.0k",
/// "3.31m"); `parse_number_str` normalizes those. A key is inserted ONLY when
/// the source field is actually present, so no value is ever fabricated.
/// Duration/aggregate-only fields whose units don't map cleanly to a Steam
/// counter (e.g. "51 hours" voice time, horse kilometers) are intentionally
/// omitted rather than misrepresented.
fn build_all_stats_from_ruststats(
    val: &serde_json::Value,
) -> std::collections::HashMap<String, u32> {
    let mut map = std::collections::HashMap::new();

    // (steam_key, [json path]) — first present path wins is unnecessary here as
    // each maps to a single ruststats location.
    let mappings: &[(&str, &[&str])] = &[
        // Headline PvP figures.
        ("kill_player", &["pvp_stats", "kills"]),
        ("deaths", &["pvp_stats", "deaths"]),
        ("headshot", &["pvp_stats", "headshots"]),
        ("bullet_fired", &["pvp_stats", "bullets_fired"]),
        ("bullet_hit", &["pvp_stats", "bullets_hit"]),
        // Bullet-hit breakdown.
        ("bullet_hit_building", &["bullets_hit", "buildings"]),
        ("bullet_hit_sign", &["bullets_hit", "signs"]),
        ("bullet_hit_deadplayers", &["bullets_hit", "dead_players"]),
        ("bullet_hit_stag", &["bullets_hit", "deer"]),
        ("bullet_hit_bear", &["bullets_hit", "bears"]),
        ("bullet_hit_boar", &["bullets_hit", "boars"]),
        ("bullet_hit_wolf", &["bullets_hit", "wolves"]),
        // Kill breakdown.
        ("kill_scientist", &["kills", "scientists"]),
        ("kill_dweller", &["kills", "dwellers_while_moving"]),
        ("kill_mlrs", &["other", "mlrs_kills"]),
        ("kill_shark", &["other", "shark_speargun_kills"]),
        // Animal kills.
        ("kill_bear", &["kills", "bears"]),
        ("kill_boar", &["kills", "boars"]),
        ("kill_stag", &["kills", "deer"]),
        ("kill_horse", &["kills", "horses"]),
        ("kill_wolf", &["kills", "wolves"]),
        ("kill_chicken", &["kills", "chickens"]),
        // Explosives & melee.
        ("rocket_fired", &["other", "rockets_fired"]),
        ("melee_strikes", &["melee", "strikes"]),
        ("melee_thrown", &["melee", "throws"]),
        // Bow.
        ("arrow_fired", &["bow_hits", "shots_fired"]),
        ("arrow_hit_player", &["bow_hits", "players"]),
        ("arrow_hit_building", &["bow_hits", "buildings"]),
        // Shotgun.
        ("shotgun_fired", &["shotgun_hits", "shots_fired"]),
        ("shotgun_hit_player", &["shotgun_hits", "players"]),
        ("shotgun_hit_building", &["shotgun_hits", "buildings"]),
        // Deaths breakdown.
        ("death_fall", &["deaths", "fall"]),
        ("death_suicide", &["deaths", "suicide"]),
        // Wounds.
        ("wounded", &["wounds", "wounded"]),
        ("wounded_healed", &["wounds", "healed"]),
        // Gathering.
        ("acquired_wood", &["gathered", "wood"]),
        ("acquired_stones", &["gathered", "stone"]),
        ("acquired_metal.ore", &["gathered", "metal_ore"]),
        ("acquired_scrap", &["gathered", "scrap"]),
        ("harvested_cloth", &["gathered", "cloth"]),
        ("harvested_leather", &["gathered", "leather"]),
        ("acquired_lowgradefuel", &["gathered", "low_grade_fuel"]),
        // Building.
        ("placed_blocks", &["building_blocks", "placed"]),
        ("upgraded_blocks", &["building_blocks", "upgraded"]),
        // Survival.
        ("calories_consumed", &["consumed", "calories"]),
        ("water_consumed", &["consumed", "water"]),
        // Menu usage.
        ("INVENTORY_OPENED", &["menus_opened", "inventory"]),
        ("CRAFTING_OPENED", &["menus_opened", "crafting"]),
        ("MAP_OPENED", &["menus_opened", "map"]),
        // Other.
        ("destroyed_barrels", &["other", "barrels_destroyed"]),
        ("item_drop", &["other", "items_dropped"]),
        ("blueprint_studied", &["other", "bps_learned"]),
        ("MISSION_COMPLETE", &["other", "missions_completed"]),
        ("examine", &["other", "items_inspected"]),
        ("gesture_wave_count", &["other", "waved_at_players"]),
        ("BEE_ATTACKS", &["other", "bee_attacks_count"]),
        ("PIPES_CONNECTED", &["other", "pipes_connected"]),
        ("WIRES_CONNECTED", &["other", "wires_connected"]),
        ("HELI_LANDINGS", &["other", "helipad_landings"]),
        ("TIN_CAN_ALARM", &["other", "tincanalarms_wired"]),
        ("KAYAK_METERS", &["other", "kayak_distance_travelled"]),
    ];

    for (key, path) in mappings {
        let mut cur = val;
        let mut ok = true;
        for p in *path {
            match cur.get(*p) {
                Some(next) => cur = next,
                None => {
                    ok = false;
                    break;
                }
            }
        }
        if !ok {
            continue;
        }
        if let Some(s) = cur.as_str() {
            map.insert((*key).to_string(), parse_number_str(s));
        }
    }

    map
}

/// Parse EVERY `<stat>` block in a Rust Steam stats XML document into a map of
/// `name -> value`. Rust's stats XML contains entries shaped like
/// `<stat><name>kill_player</name><value>1234</value></stat>`. We iterate them
/// generically so the frontend receives the complete, real set of stats present
/// for a player and never has to guess. Achievement blocks use `<apiname>` and
/// live inside `<achievement>`, so scanning strictly for `<stat>` … `</stat>`
/// never picks those up. Note that `<stats>` (the container) is not matched
/// because the literal `<stat>` is not a substring of `<stats>`.
fn parse_all_stats(xml: &str) -> std::collections::HashMap<String, u32> {
    let mut map = std::collections::HashMap::new();
    let open = "<stat>";
    let close = "</stat>";
    let mut cursor = 0usize;
    while let Some(rel) = xml[cursor..].find(open) {
        let block_start = cursor + rel + open.len();
        let end_rel = match xml[block_start..].find(close) {
            Some(e) => e,
            None => break,
        };
        let block = &xml[block_start..block_start + end_rel];
        cursor = block_start + end_rel + close.len();

        let name = extract_xml_tag(block, "name");
        let value = extract_xml_tag(block, "value");
        if let (Some(name), Some(value)) = (name, value) {
            let name = name.trim();
            if name.is_empty() {
                continue;
            }
            // Steam stat values are integral counters; parse defensively so a
            // stray float (e.g. "12.0") still resolves rather than being dropped.
            let parsed = value
                .trim()
                .parse::<u32>()
                .ok()
                .or_else(|| value.trim().parse::<f64>().ok().map(|f| f.max(0.0) as u32));
            if let Some(v) = parsed {
                map.insert(name.to_string(), v);
            }
        }
    }
    map
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

// ─────────────────────────────────────────────────────────────────────────
// Steam inventory scan (Rust, appid 252490, context 2)
// ─────────────────────────────────────────────────────────────────────────

#[derive(serde::Serialize)]
pub struct InventoryItem {
    pub name: String,
    pub icon_url: String,
    pub item_type: String,
    pub count: u32,
    pub marketable: bool,
    pub tradable: bool,
    /// Per-unit price in USD, when a Steam Market quote was available.
    pub price: Option<f64>,
}

#[derive(serde::Serialize)]
pub struct SteamInventory {
    pub total_items: u32,
    pub distinct_items: u32,
    pub items: Vec<InventoryItem>,
    pub total_value: f64,
    pub tradable_value: f64,
    pub priced_count: u32,
    pub unpriced_count: u32,
    pub is_private: bool,
}

/// Parse a Steam Market price string ("$1.23", "1,23€", "£0.59") into a float.
fn parse_market_price(s: &str) -> Option<f64> {
    let mut cleaned: String = s
        .chars()
        .filter(|c| c.is_ascii_digit() || *c == '.' || *c == ',')
        .collect();
    // If both separators exist, assume ',' is thousands and '.' is decimal.
    if cleaned.contains('.') && cleaned.contains(',') {
        cleaned = cleaned.replace(',', "");
    } else if cleaned.contains(',') && !cleaned.contains('.') {
        // Lone comma → decimal separator (EU formatting).
        cleaned = cleaned.replace(',', ".");
    }
    cleaned.parse::<f64>().ok().filter(|v| *v > 0.0)
}

/// Fetch and value a player's public Rust inventory.
///
/// Items come from the public community inventory JSON (no key needed). Prices
/// are best-effort live quotes from the Steam Market `priceoverview` endpoint,
/// which is aggressively rate-limited — so we price unique marketable items
/// within a bounded budget and report how many resolved ("priced") vs not
/// ("unpriced"). No value is invented: unpriced items contribute 0.
#[tauri::command]
pub async fn get_steam_inventory(steam_id: String) -> Result<SteamInventory, String> {
    if steam_id.len() < 16 || steam_id.len() > 20 || !steam_id.chars().all(|c| c.is_ascii_digit()) {
        return Err("Invalid Steam ID".into());
    }

    let empty = || SteamInventory {
        total_items: 0,
        distinct_items: 0,
        items: vec![],
        total_value: 0.0,
        tradable_value: 0.0,
        priced_count: 0,
        unpriced_count: 0,
        is_private: true,
    };

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(12))
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .build()
        .map_err(|e| format!("client build failed: {}", e))?;

    let inv_url = format!(
        "https://steamcommunity.com/inventory/{}/252490/2?l=english&count=2000",
        steam_id
    );
    let resp = match client.get(&inv_url).send().await {
        Ok(r) => r,
        Err(_) => return Ok(empty()),
    };
    // Private/empty inventories return 403 or a null/!success body.
    if resp.status().as_u16() == 403 {
        return Ok(empty());
    }
    let val = match resp.json::<serde_json::Value>().await {
        Ok(v) => v,
        Err(_) => return Ok(empty()),
    };
    let descriptions = match val.get("descriptions").and_then(|d| d.as_array()) {
        Some(d) => d,
        None => return Ok(empty()),
    };
    let assets = val.get("assets").and_then(|a| a.as_array()).cloned().unwrap_or_default();

    // Count how many of each (classid,instanceid) the player holds.
    let mut counts: std::collections::HashMap<(String, String), u32> = std::collections::HashMap::new();
    for a in &assets {
        let cid = a.get("classid").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let iid = a.get("instanceid").and_then(|v| v.as_str()).unwrap_or("0").to_string();
        let amount = a
            .get("amount")
            .and_then(|v| v.as_str())
            .and_then(|s| s.parse::<u32>().ok())
            .unwrap_or(1);
        *counts.entry((cid, iid)).or_insert(0) += amount;
    }

    let icon_base = "https://community.cloudflare.steamstatic.com/economy/image/";
    let mut items: Vec<InventoryItem> = Vec::new();
    // Unique marketable hash names → price once, apply to all matching stacks.
    let mut price_cache: std::collections::HashMap<String, Option<f64>> = std::collections::HashMap::new();

    for d in descriptions {
        let cid = d.get("classid").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let iid = d.get("instanceid").and_then(|v| v.as_str()).unwrap_or("0").to_string();
        let count = counts.get(&(cid.clone(), iid.clone())).copied().unwrap_or(0);
        if count == 0 {
            continue;
        }
        let name = d.get("name").and_then(|v| v.as_str()).unwrap_or("Unknown").to_string();
        let item_type = d.get("type").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let icon = d.get("icon_url").and_then(|v| v.as_str()).unwrap_or("");
        let icon_url = if icon.is_empty() { String::new() } else { format!("{}{}", icon_base, icon) };
        let marketable = d.get("marketable").and_then(|v| v.as_u64()).unwrap_or(0) == 1;
        let tradable = d.get("tradable").and_then(|v| v.as_u64()).unwrap_or(0) == 1;
        let market_hash_name = d
            .get("market_hash_name")
            .and_then(|v| v.as_str())
            .unwrap_or(&name)
            .to_string();

        if marketable && !price_cache.contains_key(&market_hash_name) {
            price_cache.insert(market_hash_name.clone(), None); // placeholder
        }

        items.push(InventoryItem {
            name,
            icon_url,
            item_type,
            count,
            marketable,
            tradable,
            price: None,
        });
    }

    // Build a name→hash map so we can apply cached prices after fetching.
    // (descriptions iterate in the same order; rebuild hash list cheaply.)
    let mut hash_for_index: Vec<String> = Vec::with_capacity(items.len());
    {
        let mut i = 0usize;
        for d in descriptions {
            let cid = d.get("classid").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let iid = d.get("instanceid").and_then(|v| v.as_str()).unwrap_or("0").to_string();
            let count = counts.get(&(cid, iid)).copied().unwrap_or(0);
            if count == 0 {
                continue;
            }
            let name = d.get("name").and_then(|v| v.as_str()).unwrap_or("Unknown");
            let hash = d.get("market_hash_name").and_then(|v| v.as_str()).unwrap_or(name).to_string();
            if i < items.len() {
                hash_for_index.push(hash);
                i += 1;
            }
        }
    }

    // Price unique marketable hash names within a bounded budget (the Steam
    // Market endpoint 429s aggressively). Stop early on sustained throttling.
    let start = std::time::Instant::now();
    let budget = Duration::from_secs(18);
    let mut consecutive_429 = 0u32;
    let unique_names: Vec<String> = price_cache.keys().cloned().collect();
    for hash in unique_names {
        if start.elapsed() > budget || consecutive_429 >= 6 {
            break;
        }
        let r = client
            .get("https://steamcommunity.com/market/priceoverview/")
            .query(&[("appid", "252490"), ("currency", "1"), ("market_hash_name", hash.as_str())])
            .send()
            .await;
        match r {
            Ok(resp) => {
                if resp.status().as_u16() == 429 {
                    consecutive_429 += 1;
                    tokio::time::sleep(Duration::from_millis(800)).await;
                    continue;
                }
                consecutive_429 = 0;
                if let Ok(pv) = resp.json::<serde_json::Value>().await {
                    let price = pv
                        .get("lowest_price")
                        .or_else(|| pv.get("median_price"))
                        .and_then(|v| v.as_str())
                        .and_then(parse_market_price);
                    price_cache.insert(hash, price);
                }
            }
            Err(_) => {}
        }
        tokio::time::sleep(Duration::from_millis(120)).await;
    }

    // Apply prices, compute totals.
    let mut total_value = 0.0f64;
    let mut tradable_value = 0.0f64;
    let mut priced_count = 0u32;
    let mut unpriced_count = 0u32;
    let mut total_items = 0u32;
    for (idx, item) in items.iter_mut().enumerate() {
        total_items += item.count;
        let hash = hash_for_index.get(idx).cloned().unwrap_or_default();
        let price = price_cache.get(&hash).and_then(|p| *p);
        if item.marketable {
            if let Some(p) = price {
                item.price = Some(p);
                let line = p * item.count as f64;
                total_value += line;
                if item.tradable {
                    tradable_value += line;
                }
                priced_count += item.count;
            } else {
                unpriced_count += item.count;
            }
        } else {
            unpriced_count += item.count;
        }
    }

    // Sort: priced (desc by line value) first, then the rest by count.
    items.sort_by(|a, b| {
        let av = a.price.map(|p| p * a.count as f64).unwrap_or(0.0);
        let bv = b.price.map(|p| p * b.count as f64).unwrap_or(0.0);
        bv.partial_cmp(&av).unwrap_or(std::cmp::Ordering::Equal)
    });

    let distinct_items = items.len() as u32;
    Ok(SteamInventory {
        total_items,
        distinct_items,
        items,
        total_value,
        tradable_value,
        priced_count,
        unpriced_count,
        is_private: false,
    })
}
