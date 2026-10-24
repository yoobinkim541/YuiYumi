// Connector sign-in for the desktop app. The system browser runs the provider's OAuth flow on
// the server: <API>/api/auth/<provider>/start?client=desktop&port=N&nonce=X. The server ends it
// with a redirect to http://127.0.0.1:N/yuiyumi-auth?provider=..&nonce=..&blob=..&account=..,
// which a one-shot loopback listener receives. The sealed blob is kept per provider in the
// macOS Keychain; the frontend sends all blobs as `Authorization: Bearer <blob>,<blob>`.

use std::collections::hash_map::RandomState;
use std::hash::{BuildHasher, Hasher};
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::time::{Duration, Instant};

use tauri::{AppHandle, Emitter};

const KEYCHAIN_SERVICE: &str = "app.yuiyumi.desktop";
pub const PROVIDERS: [&str; 3] = ["google", "slack", "discord"];
const WAIT: Duration = Duration::from_secs(300);

/// Server origin for sign-in links that point at the app's own origin (relative /api/auth/...).
pub static API_BASE: std::sync::Mutex<Option<url::Url>> = std::sync::Mutex::new(None);

#[derive(serde::Serialize, Clone)]
pub struct AuthEvent {
    pub provider: String,
    pub ok: bool,
    pub account: Option<String>,
    pub error: Option<String>,
}

fn entry(provider: &str) -> Result<keyring::Entry, String> {
    if !PROVIDERS.contains(&provider) {
        return Err("unknown provider".into());
    }
    keyring::Entry::new(KEYCHAIN_SERVICE, &format!("connector-{provider}")).map_err(|e| e.to_string())
}

/// Stored blobs of every signed-in provider.
pub fn load_all() -> Vec<String> {
    PROVIDERS.iter().filter_map(|p| entry(p).ok()?.get_password().ok()).filter(|b| !b.is_empty()).collect()
}

pub fn store(provider: &str, blob: &str) -> Result<(), String> {
    entry(provider)?.set_password(blob).map_err(|e| e.to_string())
}

pub fn clear(provider: &str) -> Result<(), String> {
    match entry(provider)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

fn nonce() -> String {
    let mut h = RandomState::new().build_hasher();
    h.write_u128(std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_nanos());
    format!("{:016x}{:016x}", h.finish(), RandomState::new().build_hasher().finish())
}

/// `start_url` is the server's /api/auth/<provider>/start URL (any query is kept).
pub fn sign_in(app: AppHandle, provider: String, start_url: url::Url) -> Result<(), String> {
    if !PROVIDERS.contains(&provider.as_str()) {
        return Err("unknown provider".into());
    }
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let nonce = nonce();
    let mut url = start_url;
    if url.scheme() != "http" && url.scheme() != "https" {
        let base = API_BASE.lock().unwrap().clone().ok_or("api base unknown")?;
        let mut rebased = base.join(url.path()).map_err(|e| e.to_string())?;
        rebased.set_query(url.query());
        url = rebased;
    }
    {
        let keep: Vec<(String, String)> =
            url.query_pairs().filter(|(k, _)| k != "client" && k != "port" && k != "nonce").map(|(k, v)| (k.into(), v.into())).collect();
        let mut q = url.query_pairs_mut();
        q.clear();
        for (k, v) in keep {
            q.append_pair(&k, &v);
        }
        q.append_pair("client", "desktop").append_pair("port", &port.to_string()).append_pair("nonce", &nonce);
    }
    open::that_detached(url.as_str()).map_err(|e| e.to_string())?;

    std::thread::spawn(move || {
        let event = match wait_for_callback(&listener, &nonce, &provider) {
            Ok((blob, account)) => match store(&provider, &blob) {
                Ok(()) => AuthEvent { provider, ok: true, account, error: None },
                Err(e) => AuthEvent { provider, ok: false, account: None, error: Some(e) },
            },
            Err(e) => AuthEvent { provider, ok: false, account: None, error: Some(e) },
        };
        let _ = app.emit("yy://auth", event);
    });
    Ok(())
}

type Callback = Result<(String, Option<String>), String>;

fn wait_for_callback(listener: &TcpListener, nonce: &str, provider: &str) -> Callback {
    listener.set_nonblocking(true).map_err(|e| e.to_string())?;
    let deadline = Instant::now() + WAIT;
    while Instant::now() < deadline {
        match listener.accept() {
            Ok((stream, _)) => {
                if let Some(result) = handle(stream, nonce, provider) {
                    return result;
                }
            }
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => std::thread::sleep(Duration::from_millis(100)),
            Err(e) => return Err(e.to_string()),
        }
    }
    Err("timeout".into())
}

/// None: not the callback (favicon, probes, a stale nonce); keep waiting.
fn handle(mut stream: TcpStream, nonce: &str, provider: &str) -> Option<Callback> {
    let _ = stream.set_nonblocking(false);
    let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
    let mut buf = vec![0u8; 16 * 1024];
    let n = stream.read(&mut buf).ok()?;
    let head = String::from_utf8_lossy(&buf[..n]);
    let target = head.lines().next()?.split_whitespace().nth(1)?.to_string();
    let url = url::Url::parse(&format!("http://127.0.0.1{target}")).ok()?;
    if url.path() != "/yuiyumi-auth" {
        let _ = respond(&mut stream, 404, "");
        return None;
    }
    let get = |key: &str| url.query_pairs().find(|(k, _)| k == key).map(|(_, v)| v.into_owned());
    if get("nonce").as_deref() != Some(nonce) || get("provider").is_some_and(|p| p != provider) {
        let _ = respond(&mut stream, 400, PAGE_FAIL);
        return None;
    }
    let blob = get("blob").filter(|b| !b.is_empty());
    let error = get("error").or_else(|| get("reason"));
    let ok = blob.is_some() && error.is_none();
    let _ = respond(&mut stream, 200, if ok { PAGE_OK } else { PAGE_FAIL });
    Some(match (blob, error) {
        (Some(b), None) => Ok((b, get("account"))),
        (_, e) => Err(e.unwrap_or_else(|| "denied".into())),
    })
}

fn respond(stream: &mut TcpStream, status: u16, body: &str) -> std::io::Result<()> {
    let reason = match status { 200 => "OK", 400 => "Bad Request", _ => "Not Found" };
    write!(
        stream,
        "HTTP/1.1 {status} {reason}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n{body}",
        body.len()
    )
}

const PAGE_OK: &str = "<!doctype html><meta charset=utf-8><title>YuiYumi</title><body style=\"font:16px system-ui;padding:40px;line-height:1.7\">\
<p>Connected. You can close this tab and return to YuiYumi.</p><p>連携しました。このタブを閉じて YuiYumi に戻ってください。</p>\
<p>연결됐어요. 이 탭을 닫고 YuiYumi로 돌아가세요.</p><p>已连接。可以关闭此标签页并返回 YuiYumi。</p><p>已連結。可以關閉此分頁並回到 YuiYumi。</p></body>";

const PAGE_FAIL: &str = "<!doctype html><meta charset=utf-8><title>YuiYumi</title><body style=\"font:16px system-ui;padding:40px;line-height:1.7\">\
<p>Sign-in did not complete. Please try again from YuiYumi.</p><p>サインインが完了しませんでした。YuiYumi からもう一度お試しください。</p>\
<p>로그인이 끝나지 않았어요. YuiYumi에서 다시 시도해 주세요.</p><p>登录未完成。请从 YuiYumi 重试。</p><p>登入未完成。請從 YuiYumi 再試一次。</p></body>";
