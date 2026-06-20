fn main() {
    // Set protoc path using vendored binary
    std::env::set_var("PROTOC", protoc_bin_vendored::protoc_bin_path().unwrap());

    println!("cargo:rerun-if-changed=proto/rustplus.proto");

    // Compile protobuf schema
    let mut config = prost_build::Config::new();
    config.type_attribute(".", "#[derive(serde::Serialize, serde::Deserialize)]");
    config.out_dir("src/generated");
    config.compile_protos(&["proto/rustplus.proto"], &["proto/"])
        .expect("Failed to compile protobuf schema");

    // Forcefully kill any orphaned sidecars that would lock the binary during build
    std::process::Command::new("taskkill")
        .args(&["/F", "/IM", "fcm-sidecar.exe"])
        .output()
        .ok();

    // Run Tauri build
    tauri_build::build();
}
