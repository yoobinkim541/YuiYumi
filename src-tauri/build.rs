fn main() {
    // runtime.rs bakes the proxy base into release builds.
    println!("cargo:rerun-if-env-changed=DESKTOP_API_BASE");
    tauri_build::build()
}
