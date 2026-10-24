// Local agent runtime (agent-runtime/, a Node process around the Claude Agent SDK): spawned
// on app start with a fresh token, reached by the webview over 127.0.0.1, stopped on quit.
// Release builds run the bundled copy (Resources/agent-runtime: node, main.mjs, claude);
// debug builds run the repo's TypeScript sources with tsx and the system node.
// See docs/agent-runtime.md and docs/desktop-app.md.

use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Manager};

/// Proxy base for model calls in release builds: `DESKTOP_API_BASE` at build time.
const API_BASE: Option<&str> = option_env!("DESKTOP_API_BASE");
const API_BASE_PLACEHOLDER: &str = "https://yuiyumi-seven.vercel.app";
const READY_TIMEOUT: Duration = Duration::from_secs(30);

#[derive(serde::Serialize, Clone)]
pub struct Endpoint {
    pub port: u16,
    pub token: String,
}

enum Status {
    Idle,
    Starting,
    Ready(Endpoint),
    Failed(String),
}

struct Proc {
    child: Child,
    /// Held open: the runtime exits when the app's end of its stdin closes.
    stdin: Option<ChildStdin>,
}

pub struct AgentRuntime {
    status: Mutex<Status>,
    proc: Mutex<Option<Proc>>,
}

impl AgentRuntime {
    pub fn new() -> Self {
        Self { status: Mutex::new(Status::Idle), proc: Mutex::new(None) }
    }
}

/// What to run: program, arguments, working directory, bundled node folder and SDK binary.
struct Launch {
    program: PathBuf,
    args: Vec<String>,
    cwd: PathBuf,
    node_dir: Option<PathBuf>,
    claude: Option<PathBuf>,
}

#[cfg(not(debug_assertions))]
fn launch(app: &AppHandle) -> Result<Launch, String> {
    let dir = app.path().resource_dir().map_err(|e| e.to_string())?.join("agent-runtime");
    let (node, main, claude) = (dir.join("node"), dir.join("main.mjs"), dir.join("claude"));
    for f in [&node, &main, &claude] {
        if !f.is_file() {
            return Err(format!("not_installed: {} is missing from the app bundle", f.file_name().unwrap_or_default().to_string_lossy()));
        }
    }
    Ok(Launch {
        program: node,
        args: vec![main.to_string_lossy().into_owned(), "--exit-on-stdin-close".into()],
        cwd: dir.clone(),
        node_dir: Some(dir),
        claude: Some(claude),
    })
}

#[cfg(debug_assertions)]
fn launch(_app: &AppHandle) -> Result<Launch, String> {
    let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("..").join("agent-runtime");
    let tsx = dir.join("node_modules").join(".bin").join("tsx");
    if !tsx.is_file() {
        return Err("not_installed: run pnpm install (agent-runtime/node_modules/.bin/tsx is missing)".into());
    }
    Ok(Launch {
        program: tsx,
        args: vec!["src/main.ts".into(), "--exit-on-stdin-close".into()],
        cwd: dir,
        node_dir: None,
        claude: None,
    })
}

fn random_token() -> Result<String, String> {
    let mut buf = [0u8; 32];
    getrandom::fill(&mut buf).map_err(|e| e.to_string())?;
    Ok(buf.iter().map(|b| format!("{b:02x}")).collect())
}

/// PATH for the runtime and the agent's shell: bundled node first, then the usual tool
/// folders (apps opened from Finder get only /usr/bin:/bin:/usr/sbin:/sbin).
fn search_path(node_dir: Option<&Path>) -> String {
    let mut parts: Vec<String> = Vec::new();
    if let Some(d) = node_dir {
        parts.push(d.to_string_lossy().into_owned());
    }
    if let Some(home) = std::env::var_os("HOME") {
        let home = PathBuf::from(home);
        for p in [".local/bin", ".volta/bin", ".bun/bin", ".cargo/bin"] {
            parts.push(home.join(p).to_string_lossy().into_owned());
        }
    }
    parts.extend(["/opt/homebrew/bin", "/opt/homebrew/sbin", "/usr/local/bin"].map(String::from));
    if let Ok(p) = std::env::var("PATH") {
        parts.extend(p.split(':').filter(|s| !s.is_empty()).map(String::from));
    }
    parts.extend(["/usr/bin", "/bin", "/usr/sbin", "/sbin"].map(String::from));
    let mut seen = std::collections::HashSet::new();
    parts.retain(|p| seen.insert(p.clone()));
    parts.join(":")
}

fn spawn(app: &AppHandle) -> Result<(Proc, Endpoint), String> {
    let l = launch(app)?;
    let token = random_token()?;
    let state_dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("agent-runtime");
    std::fs::create_dir_all(&state_dir).map_err(|e| e.to_string())?;
    let log_dir = app.path().app_log_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&log_dir).map_err(|e| e.to_string())?;
    let log = File::create(log_dir.join("agent-runtime.log")).map_err(|e| e.to_string())?;

    let mut cmd = Command::new(&l.program);
    cmd.args(&l.args)
        .current_dir(&l.cwd)
        // A fresh environment: the runtime gets only what it needs (no app secrets).
        .env_clear()
        .env("PATH", search_path(l.node_dir.as_deref()))
        .env("YUIYUMI_AGENT_TOKEN", &token)
        .env("YUIYUMI_AGENT_STATE_DIR", &state_dir)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::from(log));
    for k in ["HOME", "USER", "LOGNAME", "SHELL", "LANG", "LC_ALL", "LC_CTYPE", "TMPDIR", "TZ", "TERM"] {
        if let Some(v) = std::env::var_os(k) {
            cmd.env(k, v);
        }
    }
    if let Some(claude) = &l.claude {
        cmd.env("YUIYUMI_AGENT_CLAUDE_PATH", claude);
    }
    if cfg!(debug_assertions) {
        // Development: the shell's key and model overrides, and the desktop dev server's origin.
        for k in ["ANTHROPIC_API_KEY", "MODEL_AGENT", "MODEL_AGENT_OPUS", "MODEL_OBSERVER", "YUIYUMI_AGENT_PROXY_URL", "YUIYUMI_AGENT_EFFORT"] {
            if let Some(v) = std::env::var_os(k) {
                cmd.env(k, v);
            }
        }
        cmd.env("YUIYUMI_AGENT_ORIGINS", "http://localhost:5181");
    } else {
        // Release: no key in the app; model calls go through the deployed proxy.
        let base = API_BASE.filter(|s| !s.is_empty()).unwrap_or(API_BASE_PLACEHOLDER).trim_end_matches('/');
        cmd.env("YUIYUMI_AGENT_PROXY_URL", format!("{base}/api/anthropic"));
    }

    let mut child = cmd.spawn().map_err(|e| format!("failed to start the agent runtime: {e}"))?;
    let stdin = child.stdin.take();
    let stdout = child.stdout.take().ok_or("no stdout")?;

    // The first stdout line is {"type":"ready","port":N}; the rest is drained.
    let (tx, rx) = std::sync::mpsc::channel::<Option<u16>>();
    std::thread::spawn(move || {
        let mut lines = BufReader::new(stdout).lines();
        let mut tx = Some(tx);
        while let Some(Ok(line)) = lines.next() {
            if let Some(t) = tx.take() {
                let port = serde_json::from_str::<serde_json::Value>(&line)
                    .ok()
                    .filter(|v| v["type"] == "ready")
                    .and_then(|v| v["port"].as_u64())
                    .and_then(|p| u16::try_from(p).ok());
                let _ = t.send(port);
            }
        }
        if let Some(t) = tx {
            let _ = t.send(None);
        }
    });
    let mut proc = Proc { child, stdin };
    match rx.recv_timeout(READY_TIMEOUT) {
        Ok(Some(port)) => Ok((proc, Endpoint { port, token })),
        other => {
            stop_proc(&mut proc);
            let why = if other.is_err() { "timed out" } else { "exited" };
            Err(format!("the agent runtime {why} before it was ready (see {})", log_dir.join("agent-runtime.log").display()))
        }
    }
}

/// Starts the runtime in the background (app start).
pub fn start(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || ensure_started(&app));
}

/// Spawns the runtime unless it is running or starting. Blocks until it is ready or failed.
fn ensure_started(app: &AppHandle) {
    let rt = app.state::<AgentRuntime>();
    {
        let mut status = rt.status.lock().unwrap();
        if matches!(*status, Status::Starting) {
            return;
        }
        // A runtime that exited (crash, killed) is started again.
        if let Status::Ready(_) = *status {
            let mut proc = rt.proc.lock().unwrap();
            let alive = proc.as_mut().is_some_and(|p| matches!(p.child.try_wait(), Ok(None)));
            if alive {
                return;
            }
            *proc = None;
        }
        *status = Status::Starting;
    }
    let next = match spawn(app) {
        Ok((proc, ep)) => {
            *rt.proc.lock().unwrap() = Some(proc);
            Status::Ready(ep)
        }
        Err(e) => {
            eprintln!("[agent-runtime] {e}");
            Status::Failed(e)
        }
    };
    *rt.status.lock().unwrap() = next;
}

/// Port and token for the webview; starts (or restarts) the runtime and waits for it.
pub async fn endpoint(app: AppHandle) -> Result<Endpoint, String> {
    let handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let rt = handle.state::<AgentRuntime>();
        // Not running, exited or failed before: try (again). No-op while it is starting.
        ensure_started(&handle);
        let deadline = Instant::now() + READY_TIMEOUT + Duration::from_secs(5);
        loop {
            match &*rt.status.lock().unwrap() {
                Status::Ready(ep) => return Ok(ep.clone()),
                Status::Failed(e) => return Err(e.clone()),
                Status::Idle | Status::Starting => {}
            }
            if Instant::now() > deadline {
                return Err("the agent runtime is still starting".into());
            }
            std::thread::sleep(Duration::from_millis(100));
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

fn stop_proc(p: &mut Proc) {
    // Closing stdin and SIGTERM both make the runtime close its sessions and exit.
    drop(p.stdin.take());
    #[cfg(unix)]
    if let Ok(pid) = i32::try_from(p.child.id()) {
        unsafe {
            libc::kill(pid, libc::SIGTERM);
        }
    }
    let until = Instant::now() + Duration::from_secs(3);
    while Instant::now() < until {
        if !matches!(p.child.try_wait(), Ok(None)) {
            return;
        }
        std::thread::sleep(Duration::from_millis(50));
    }
    let _ = p.child.kill();
    let _ = p.child.wait();
}

/// Quit: stop the runtime (it closes its Claude Code processes).
pub fn stop(app: &AppHandle) {
    if let Some(rt) = app.try_state::<AgentRuntime>() {
        if let Some(mut p) = rt.proc.lock().unwrap().take() {
            stop_proc(&mut p);
        }
        *rt.status.lock().unwrap() = Status::Idle;
    }
}
