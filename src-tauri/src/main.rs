// Tauri entry point
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    rust_overlay_lib::run();
}
