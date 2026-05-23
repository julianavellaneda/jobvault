// Prevents an extra console window from showing on Windows release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    jobvault_desktop_lib::run()
}
