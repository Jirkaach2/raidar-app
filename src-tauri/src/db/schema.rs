use rusqlite::Connection;
use serde::Serialize;

/// A saved server connection profile.
#[derive(Debug, Serialize)]
pub struct ServerProfile {
    pub id: i64,
    pub ip: String,
    pub port: u16,
    pub player_id: u64,
    pub player_token: i32,
    pub server_name: String,
    pub last_connected: String,
}

/// Run all schema migrations.
pub fn create_tables(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS server_profiles (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            ip              TEXT    NOT NULL,
            port            INTEGER NOT NULL,
            player_id       INTEGER NOT NULL,
            player_token    INTEGER NOT NULL,
            server_name     TEXT    NOT NULL DEFAULT '',
            last_connected  TEXT    NOT NULL DEFAULT (datetime('now')),
            UNIQUE(ip, port, player_id)
        );

        CREATE TABLE IF NOT EXISTS map_cache (
            server_ip   TEXT PRIMARY KEY,
            map_data    TEXT NOT NULL,
            cached_at   TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS chat_history (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            server_ip   TEXT    NOT NULL,
            steam_id    INTEGER NOT NULL,
            name        TEXT    NOT NULL,
            message     TEXT    NOT NULL,
            color       TEXT    NOT NULL DEFAULT '',
            timestamp   INTEGER NOT NULL,
            received_at TEXT    NOT NULL DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_chat_server_ip ON chat_history(server_ip);
        CREATE INDEX IF NOT EXISTS idx_chat_timestamp  ON chat_history(timestamp);
        ",
    )
    .map_err(|e| format!("Failed to run migrations: {}", e))?;

    Ok(())
}
