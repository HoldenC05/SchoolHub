use std::path::PathBuf;

fn file_path(data_dir: &PathBuf) -> PathBuf {
    data_dir.join("pairing-token")
}

fn read_from_file(data_dir: &PathBuf) -> Option<String> {
    std::fs::read_to_string(file_path(data_dir)).ok().map(|s| s.trim().to_string())
}

fn write_to_file(data_dir: &PathBuf, token: &str) {
    let path = file_path(data_dir);
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let _ = std::fs::write(&path, token);
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600));
    }
}

pub fn get_or_create_token(data_dir: &PathBuf) -> String {
    if let Some(existing) = read_from_file(data_dir) {
        return existing;
    }
    let token = format!("{}{}", uuid::Uuid::new_v4().simple(), uuid::Uuid::new_v4().simple());
    write_to_file(data_dir, &token);
    token
}
