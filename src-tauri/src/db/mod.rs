pub mod schema;

use log::info;
use rusqlite::Connection;

pub struct Database {
    pub conn: Connection,
}

impl Database {
    pub fn new() -> Result<Self, String> {
        let conn = Connection::open("rustoverlay.db")
            .map_err(|e| format!("Failed to open database: {}", e))?;

        let db = Self { conn };
        db.run_migrations()?;

        info!("Database initialized successfully");
        Ok(db)
    }

    fn run_migrations(&self) -> Result<(), String> {
        schema::create_tables(&self.conn)
    }

    // ── Server Profiles ────────────────────────────────────────────

    pub fn save_server_profile(
        &self,
        ip: &str,
        port: u16,
        player_id: u64,
        player_token: i32,
        server_name: &str,
    ) -> Result<(), String> {
        self.conn
            .execute(
                "INSERT OR REPLACE INTO server_profiles (ip, port, player_id, player_token, server_name, last_connected)
                 VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'))",
                rusqlite::params![ip, port, player_id, player_token, server_name],
            )
            .map_err(|e| format!("Failed to save server profile: {}", e))?;
        Ok(())
    }

    pub fn delete_server_profile(&self, id: i64) -> Result<(), String> {
        self.conn
            .execute("DELETE FROM server_profiles WHERE id = ?1", rusqlite::params![id])
            .map_err(|e| format!("Failed to delete server profile: {}", e))?;
        Ok(())
    }

    pub fn get_server_profile_by_ip(&self, ip: &str, port: u16) -> Result<schema::ServerProfile, String> {
        let mut stmt = self
            .conn
            .prepare("SELECT id, ip, port, player_id, player_token, server_name, last_connected FROM server_profiles WHERE ip = ?1 AND port = ?2 ORDER BY last_connected DESC LIMIT 1")
            .map_err(|e| format!("Failed to prepare query: {}", e))?;

        stmt.query_row(rusqlite::params![ip, port], |row| {
            Ok(schema::ServerProfile {
                id: row.get(0)?,
                ip: row.get(1)?,
                port: row.get(2)?,
                player_id: row.get(3)?,
                player_token: row.get(4)?,
                server_name: row.get(5)?,
                last_connected: row.get(6)?,
            })
        })
        .map_err(|e| format!("Server profile not found: {}", e))
    }

    pub fn get_server_profiles(&self) -> Result<Vec<schema::ServerProfile>, String> {
        let mut stmt = self
            .conn
            .prepare("SELECT id, ip, port, player_id, player_token, server_name, last_connected FROM server_profiles ORDER BY last_connected DESC")
            .map_err(|e| format!("Failed to prepare query: {}", e))?;

        let rows = stmt
            .query_map([], |row| {
                Ok(schema::ServerProfile {
                    id: row.get(0)?,
                    ip: row.get(1)?,
                    port: row.get(2)?,
                    player_id: row.get(3)?,
                    player_token: row.get(4)?,
                    server_name: row.get(5)?,
                    last_connected: row.get(6)?,
                })
            })
            .map_err(|e| format!("Failed to query server profiles: {}", e))?;

        let mut profiles = Vec::new();
        for row in rows {
            profiles.push(row.map_err(|e| format!("Row error: {}", e))?);
        }
        Ok(profiles)
    }

    // ── Map Cache ──────────────────────────────────────────────────

    pub fn cache_map_data(&self, server_ip: &str, map_data_b64: &str) -> Result<(), String> {
        self.conn
            .execute(
                "INSERT OR REPLACE INTO map_cache (server_ip, map_data, cached_at)
                 VALUES (?1, ?2, datetime('now'))",
                rusqlite::params![server_ip, map_data_b64],
            )
            .map_err(|e| format!("Failed to cache map data: {}", e))?;
        Ok(())
    }

    pub fn get_cached_map(&self, server_ip: &str) -> Result<Option<String>, String> {
        let mut stmt = self
            .conn
            .prepare("SELECT map_data FROM map_cache WHERE server_ip = ?1")
            .map_err(|e| format!("Failed to prepare query: {}", e))?;

        let result = stmt
            .query_row(rusqlite::params![server_ip], |row| row.get(0))
            .ok();

        Ok(result)
    }
}
