use rand::RngCore;
use std::fs;
use std::io::Read;
use std::path::PathBuf;
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};

use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

// Holds the spawned sidecar handle so we can kill it on shutdown.
struct SidecarState(Mutex<Option<CommandChild>>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(SidecarState(Mutex::new(None)))
        .setup(|app| {
            let app_handle = app.handle().clone();

            // Resolve OS-specific app data dir, ensure it exists.
            let data_dir = app
                .path()
                .app_data_dir()
                .expect("failed to resolve app data dir");
            fs::create_dir_all(&data_dir)?;

            let db_path = data_dir.join("app.db");
            let secret = ensure_session_secret(&data_dir)?;
            let migrations_dir = resolve_migrations_dir(&app_handle);

            let port = pick_port();
            let url = format!("http://127.0.0.1:{port}");

            // Spawn the Node sidecar. The binary is named `jobvault-node` per
            // tauri.conf.json's externalBin entry; Tauri rewrites it to
            // `<resources>/jobvault-node-<target-triple>` at runtime.
            let shell = app_handle.shell();
            let sidecar = shell
                .sidecar("jobvault-node")
                .map_err(|e| format!("sidecar lookup failed: {e}"))?
                .args([resolve_server_entry(&app_handle).to_string_lossy().to_string()])
                .env("PORT", port.to_string())
                .env("DATABASE_URL", format!("file:{}", db_path.to_string_lossy()))
                .env("SESSION_SECRET", &secret)
                .env(
                    "MIGRATIONS_FOLDER",
                    migrations_dir.to_string_lossy().to_string(),
                );

            let (mut rx, child) = sidecar
                .spawn()
                .map_err(|e| format!("failed to spawn sidecar: {e}"))?;

            app_handle
                .state::<SidecarState>()
                .0
                .lock()
                .unwrap()
                .replace(child);

            // Forward sidecar stdout/stderr to the host logs.
            let log_handle = app_handle.clone();
            tauri::async_runtime::spawn(async move {
                while let Some(event) = rx.recv().await {
                    match event {
                        CommandEvent::Stdout(line) => {
                            log::info!("[server] {}", String::from_utf8_lossy(&line).trim_end());
                        }
                        CommandEvent::Stderr(line) => {
                            log::warn!("[server] {}", String::from_utf8_lossy(&line).trim_end());
                        }
                        CommandEvent::Error(err) => {
                            log::error!("[server] {}", err);
                        }
                        CommandEvent::Terminated(payload) => {
                            log::error!("[server] terminated: {:?}", payload);
                            let _ = log_handle.exit(1);
                            break;
                        }
                        _ => {}
                    }
                }
            });

            // Spawn a thread that polls /api/auth/me until 200, then shows the
            // window. Bind the window builder on the main thread via run_on_main.
            let ready_handle = app_handle.clone();
            let ready_url = url.clone();
            thread::spawn(move || {
                if wait_for_ready(&ready_url, Duration::from_secs(30)) {
                    let main_handle = ready_handle.clone();
                    let _ = ready_handle.run_on_main_thread(move || {
                        let url_parsed = ready_url
                            .parse()
                            .expect("failed to parse server url");
                        let window = WebviewWindowBuilder::new(
                            &main_handle,
                            "main",
                            WebviewUrl::External(url_parsed),
                        )
                        .title("Jobvault")
                        .inner_size(1280.0, 800.0)
                        .min_inner_size(900.0, 600.0)
                        .visible(true)
                        .build();
                        if let Err(e) = window {
                            log::error!("failed to build window: {e}");
                        }
                    });
                } else {
                    log::error!("server did not become ready in time");
                    let _ = ready_handle.exit(1);
                }
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                if let Some(state) = window.app_handle().try_state::<SidecarState>() {
                    if let Some(child) = state.0.lock().unwrap().take() {
                        let _ = child.kill();
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Jobvault desktop");
}

fn pick_port() -> u16 {
    portpicker::pick_unused_port().expect("no free port available")
}

fn ensure_session_secret(data_dir: &PathBuf) -> Result<String, Box<dyn std::error::Error>> {
    let path = data_dir.join("session.key");
    if let Ok(mut f) = fs::File::open(&path) {
        let mut s = String::new();
        f.read_to_string(&mut s)?;
        let trimmed = s.trim().to_string();
        if !trimmed.is_empty() {
            return Ok(trimmed);
        }
    }
    // 32 bytes → 64-char hex string, plenty for iron-session.
    let mut buf = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut buf);
    let hex: String = buf.iter().map(|b| format!("{b:02x}")).collect();
    fs::write(&path, &hex)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = fs::metadata(&path)?.permissions();
        perms.set_mode(0o600);
        fs::set_permissions(&path, perms)?;
    }
    Ok(hex)
}

fn resolve_resource_dir<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> PathBuf {
    app.path()
        .resource_dir()
        .expect("failed to resolve resource dir")
}

fn resolve_server_entry<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> PathBuf {
    // In dev (`tauri dev`), beforeDevCommand has built dist-server next to the
    // project root; we point at it via the resources/ symlink-or-copy emitted
    // by the pre-dev script. In bundled builds, `resources/server.mjs` is
    // packaged inside the app via tauri.conf.json's `resources` glob.
    let base = resolve_resource_dir(app);
    let bundled = base.join("resources").join("server.mjs");
    if bundled.exists() {
        return bundled;
    }
    // Fallback for tauri dev: hop up out of `src-tauri/target/.../` to project root.
    let mut probe = std::env::current_exe().expect("current_exe");
    for _ in 0..6 {
        if !probe.pop() {
            break;
        }
        let candidate = probe.join("dist-server").join("server.mjs");
        if candidate.exists() {
            return candidate;
        }
    }
    PathBuf::from("./dist-server/server.mjs")
}

fn resolve_migrations_dir<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> PathBuf {
    let base = resolve_resource_dir(app);
    let bundled = base.join("resources").join("migrations");
    if bundled.exists() {
        return bundled;
    }
    let server_entry = resolve_server_entry(app);
    server_entry
        .parent()
        .map(|p| p.join("migrations"))
        .unwrap_or_else(|| PathBuf::from("./dist-server/migrations"))
}

fn wait_for_ready(url: &str, timeout: Duration) -> bool {
    let probe_url = format!("{url}/api/auth/me");
    let start = Instant::now();
    while start.elapsed() < timeout {
        if let Ok(resp) = ureq::get(&probe_url).timeout(Duration::from_millis(750)).call() {
            let status = resp.status();
            if (200..300).contains(&status) {
                return true;
            }
        }
        thread::sleep(Duration::from_millis(200));
    }
    false
}
