// Opening websites and launching installed apps on the user's request. URLs are limited to
// http(s); apps are resolved only against installed .app bundles in the standard folders.

use std::path::{Path, PathBuf};

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    /// Localized display name (what Finder shows).
    pub name: String,
    pub bundle_id: Option<String>,
    #[serde(skip)]
    pub path: PathBuf,
    /// File name without ".app" (often the English name).
    #[serde(skip)]
    pub stem: String,
}

pub fn open_url(raw: &str) -> Result<String, String> {
    let url = url::Url::parse(raw.trim()).map_err(|_| "invalid url".to_string())?;
    if url.scheme() != "http" && url.scheme() != "https" {
        return Err("only http and https urls can be opened".into());
    }
    open::that_detached(url.as_str()).map_err(|e| e.to_string())?;
    Ok(url.into())
}

fn app_dirs() -> Vec<PathBuf> {
    let mut dirs = vec![
        PathBuf::from("/Applications"),
        PathBuf::from("/Applications/Utilities"),
        PathBuf::from("/System/Applications"),
        PathBuf::from("/System/Applications/Utilities"),
    ];
    if let Some(home) = std::env::var_os("HOME") {
        dirs.push(Path::new(&home).join("Applications"));
    }
    dirs
}

#[cfg(target_os = "macos")]
fn describe(path: &Path) -> Option<AppInfo> {
    use objc2_foundation::{NSBundle, NSFileManager, NSString};
    let stem = path.file_stem()?.to_string_lossy().into_owned();
    let ns_path = NSString::from_str(&path.to_string_lossy());
    let bundle_id = NSBundle::bundleWithPath(&ns_path).and_then(|b| b.bundleIdentifier()).map(|s| s.to_string());
    let shown = NSFileManager::defaultManager().displayNameAtPath(&ns_path).to_string();
    let name = shown.strip_suffix(".app").unwrap_or(&shown).to_string();
    Some(AppInfo { name, bundle_id, path: path.to_path_buf(), stem })
}

#[cfg(not(target_os = "macos"))]
fn describe(path: &Path) -> Option<AppInfo> {
    let stem = path.file_stem()?.to_string_lossy().into_owned();
    Some(AppInfo { name: stem.clone(), bundle_id: None, path: path.to_path_buf(), stem })
}

pub fn list_apps() -> Vec<AppInfo> {
    let mut apps: Vec<AppInfo> = app_dirs()
        .into_iter()
        .filter_map(|d| std::fs::read_dir(d).ok())
        .flatten()
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.extension().is_some_and(|x| x == "app"))
        .filter_map(|p| describe(&p))
        .collect();
    apps.sort_by_key(|a| a.name.to_lowercase());
    apps.dedup_by(|a, b| a.name == b.name);
    apps
}

/// Lowercase letters and digits only: "Visual Studio Code" == "visualstudiocode".
fn norm(s: &str) -> String {
    s.chars().filter(|c| c.is_alphanumeric()).flat_map(char::to_lowercase).collect()
}

/// Best installed app for `query`: exact name or bundle id, then prefix, then substring.
pub fn resolve_app(query: &str) -> Option<AppInfo> {
    let q = norm(query.trim().trim_end_matches(".app"));
    if q.is_empty() {
        return None;
    }
    let apps = list_apps();
    let keys = |a: &AppInfo| [norm(&a.name), norm(&a.stem)];
    let bundle = |a: &AppInfo| a.bundle_id.as_deref().map(|b| b.to_lowercase()) == Some(query.trim().to_lowercase());
    apps.iter()
        .find(|a| bundle(a) || keys(a).contains(&q))
        .or_else(|| apps.iter().filter(|a| keys(a).iter().any(|k| k.starts_with(&q))).min_by_key(|a| a.name.len()))
        .or_else(|| (q.len() >= 3).then(|| apps.iter().filter(|a| keys(a).iter().any(|k| k.contains(&q))).min_by_key(|a| a.name.len())).flatten())
        .cloned()
}

pub fn open_app(query: &str) -> Result<String, String> {
    let app = resolve_app(query).ok_or_else(|| format!("no installed app matches \"{}\"", query.trim()))?;
    std::process::Command::new("/usr/bin/open").arg(&app.path).spawn().map_err(|e| e.to_string())?;
    Ok(app.name)
}

#[cfg(all(test, target_os = "macos"))]
mod tests {
    use super::*;

    #[test]
    fn resolves_installed_apps_only() {
        assert_eq!(resolve_app("safari").map(|a| a.stem), Some("Safari".into()));
        assert_eq!(resolve_app("com.apple.Safari").map(|a| a.stem), Some("Safari".into()));
        assert!(resolve_app("no-such-app-xyz").is_none());
        assert!(open_url("file:///etc/passwd").is_err());
        assert!(open_url("javascript:alert(1)").is_err());
    }
}
