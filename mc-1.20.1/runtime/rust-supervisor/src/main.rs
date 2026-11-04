//! Opt-in, bounded user-mode supervisor. The stable root is deliberately not replaced.
#![cfg(windows)]
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    env,
    fs::{self, File, OpenOptions},
    io::{self, BufRead, Read, Write},
    os::windows::{
        fs::{MetadataExt, OpenOptionsExt},
        io::AsRawHandle,
    },
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::mpsc,
    thread,
    time::{Duration, Instant},
};
use windows_sys::Win32::{
    Foundation::*,
    Security::{Authorization::*, *},
    System::{JobObjects::*, Threading::*},
};
type Result<T> = std::result::Result<T, Box<dyn std::error::Error>>;
const ENV: &[&str] = &[
    "SystemRoot",
    "WINDIR",
    "TEMP",
    "TMP",
    "USERPROFILE",
    "APPDATA",
    "LOCALAPPDATA",
    "ComSpec",
    "ProgramFiles",
    "ProgramFiles(x86)",
    "ProgramW6432",
    "OS",
];
#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct Config {
    schema: u32,
    guard: PathBuf,
    guard_sha256: String,
    guard_config_sha256: String,
    manifest: PathBuf,
    manifest_sha256: String,
    directory: PathBuf,
    max_generations: u32,
}
#[derive(Deserialize, Serialize, Clone)]
#[serde(deny_unknown_fields)]
struct Entry {
    generation: u32,
    parent: String,
    id: String,
}
#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct Budget {
    schema: u32,
    config_sha256: String,
    image_sha256: String,
    entries: Vec<Entry>,
}
fn hash(b: &[u8]) -> String {
    format!("{:x}", Sha256::digest(b))
}
fn valid_hash(s: &str) -> bool {
    s.len() == 64
        && s.bytes()
            .all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c))
}
fn local(p: &Path) -> Result<()> {
    let s = p.to_str().ok_or("PATH_ENCODING")?;
    if !p.is_absolute() || s.starts_with("\\\\") || s.contains(['\r', '\n']) {
        return Err("LOCAL_ABSOLUTE_PATH_REQUIRED".into());
    }
    for a in p.ancestors() {
        if fs::symlink_metadata(a)?.file_attributes() & 0x400 != 0 {
            return Err("REPARSE_PATH_REJECTED".into());
        }
    }
    Ok(())
}
fn read_held(p: &Path, cap: u64) -> Result<(File, Vec<u8>)> {
    local(p)?;
    let mut f = OpenOptions::new().read(true).share_mode(1).open(p)?;
    if f.metadata()?.len() > cap {
        return Err("FILE_BUDGET".into());
    }
    let mut b = Vec::new();
    f.read_to_end(&mut b)?;
    Ok((f, b))
}
fn config(p: &Path, pin: &str) -> Result<(Config, File)> {
    if !valid_hash(pin) {
        return Err("CONFIG_PIN_REQUIRED".into());
    }
    let (f, b) = read_held(p, 32768)?;
    if hash(&b) != pin {
        return Err("CONFIG_HASH_MISMATCH".into());
    }
    let c: Config = serde_json::from_slice(&b)?;
    validate(&c)?;
    local(&c.directory)?;
    Ok((c, f))
}
fn validate(c: &Config) -> Result<()> {
    if c.schema != 1
        || !(1..=4).contains(&c.max_generations)
        || !valid_hash(&c.guard_sha256)
        || !valid_hash(&c.guard_config_sha256)
        || !valid_hash(&c.manifest_sha256)
    {
        return Err("CONFIG_POLICY".into());
    }
    Ok(())
}
fn next(b: &mut Budget, c: &Config) -> Result<u32> {
    if b.schema != 1 || b.entries.len() >= c.max_generations as usize {
        return Err("GENERATION_BUDGET".into());
    }
    let mut parent = "GENESIS".to_string();
    for (i, e) in b.entries.iter().enumerate() {
        if e.generation != (i + 1) as u32
            || e.parent != parent
            || e.id != identity(&b.config_sha256, &b.image_sha256, e.generation, &parent)
        {
            return Err("GENERATION_LINEAGE".into());
        }
        parent = e.id.clone();
    }
    let n = b.entries.len() as u32 + 1;
    let id = identity(&b.config_sha256, &b.image_sha256, n, &parent);
    b.entries.push(Entry {
        generation: n,
        parent,
        id,
    });
    Ok(n)
}
fn identity(c: &str, i: &str, n: u32, p: &str) -> String {
    hash(format!("eff-rust-generation-v1\n{c}\n{i}\n{n}\n{p}").as_bytes())
}
fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(Some(0)).collect()
}
fn label(handle: HANDLE, kind: SE_OBJECT_TYPE) -> Result<()> {
    unsafe {
        let mut d = std::ptr::null_mut();
        let mut sacl = std::ptr::null_mut();
        let mut present = 0;
        let mut defaulted = 0;
        let sddl = if kind == SE_FILE_OBJECT {
            "S:(ML;OICI;NRNWNX;;;ME)"
        } else {
            "S:(ML;;NRNWNX;;;ME)"
        };
        if ConvertStringSecurityDescriptorToSecurityDescriptorW(
            wide(sddl).as_ptr(),
            1,
            &mut d,
            std::ptr::null_mut(),
        ) == 0
        {
            return Err(io::Error::last_os_error().into());
        }
        let result = if GetSecurityDescriptorSacl(d, &mut present, &mut sacl, &mut defaulted) == 0 {
            Err(io::Error::last_os_error())
        } else {
            let e = SetSecurityInfo(
                handle,
                kind,
                LABEL_SECURITY_INFORMATION,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                sacl,
            );
            if e == 0 {
                Ok(())
            } else {
                Err(io::Error::from_raw_os_error(e as i32))
            }
        };
        LocalFree(d);
        result?;
        Ok(())
    }
}
fn medium() -> Result<()> {
    unsafe {
        let mut token = std::ptr::null_mut();
        if OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token) == 0 {
            return Err(io::Error::last_os_error().into());
        }
        let mut n = 0;
        GetTokenInformation(token, TokenIntegrityLevel, std::ptr::null_mut(), 0, &mut n);
        let mut b = vec![0u64; (n as usize + 7) / 8];
        let ok = GetTokenInformation(token, TokenIntegrityLevel, b.as_mut_ptr() as _, n, &mut n);
        CloseHandle(token);
        if ok == 0 {
            return Err(io::Error::last_os_error().into());
        }
        let sid = (*(b.as_ptr() as *const TOKEN_MANDATORY_LABEL)).Label.Sid;
        let count = *GetSidSubAuthorityCount(sid);
        let il = *GetSidSubAuthority(sid, (count - 1) as u32);
        if il != 0x2000 {
            return Err("MEDIUM_INTEGRITY_REQUIRED_NOT_ADMIN_OR_LOW".into());
        }
        label(GetCurrentProcess(), SE_KERNEL_OBJECT)
    }
}
// Initialization only: inherited Modify is insufficient to set mandatory labels.
// Use the caller's existing owner WRITE_DAC, never take ownership or enable privileges.
fn prepare_directory(path: &Path) -> Result<()> {
    local(path)?;
    if path.parent().is_none() || fs::read_dir(path)?.next().is_some() {
        return Err("INIT_REQUIRES_FRESH_NONROOT_DIRECTORY".into());
    }
    let directory = OpenOptions::new()
        .read(true)
        .access_mode(0x00020000 | 0x00040000)
        .share_mode(3)
        .custom_flags(0x02000000 | 0x00200000)
        .open(path)?;
    unsafe {
        let mut token = std::ptr::null_mut();
        if OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token) == 0 {
            return Err(io::Error::last_os_error().into());
        }
        let query = |class| -> Result<Vec<u64>> {
            let mut n = 0;
            GetTokenInformation(token, class, std::ptr::null_mut(), 0, &mut n);
            let mut buffer = vec![0u64; (n as usize + 7) / 8];
            if GetTokenInformation(token, class, buffer.as_mut_ptr() as _, n, &mut n) == 0 {
                return Err(io::Error::last_os_error().into());
            }
            Ok(buffer)
        };
        let infos = (query(TokenUser), query(TokenOwner));
        CloseHandle(token);
        let (user, token_owner) = (infos.0?, infos.1?);
        let user_sid = (*(user.as_ptr() as *const TOKEN_USER)).User.Sid;
        let token_owner_sid = (*(token_owner.as_ptr() as *const TOKEN_OWNER)).Owner;
        let mut actual = std::ptr::null_mut();
        let mut descriptor = std::ptr::null_mut();
        let status = GetSecurityInfo(
            directory.as_raw_handle(),
            SE_FILE_OBJECT,
            OWNER_SECURITY_INFORMATION,
            &mut actual,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            &mut descriptor,
        );
        if status != 0 {
            return Err(io::Error::from_raw_os_error(status as i32).into());
        }
        let owned = EqualSid(actual, user_sid) != 0 || EqualSid(actual, token_owner_sid) != 0;
        LocalFree(descriptor);
        if !owned {
            return Err("INIT_CALLER_OWNER_REQUIRED".into());
        }
        let mut sid_text = std::ptr::null_mut();
        if ConvertSidToStringSidW(user_sid, &mut sid_text) == 0 {
            return Err(io::Error::last_os_error().into());
        }
        let mut count = 0;
        while *sid_text.add(count) != 0 {
            count += 1;
        }
        let sid = String::from_utf16_lossy(std::slice::from_raw_parts(sid_text, count));
        LocalFree(sid_text as _);
        let sddl = wide(&format!("D:P(A;OICI;FA;;;{sid})(A;OICI;FA;;;SY)"));
        if ConvertStringSecurityDescriptorToSecurityDescriptorW(
            sddl.as_ptr(),
            1,
            &mut descriptor,
            std::ptr::null_mut(),
        ) == 0
        {
            return Err(io::Error::last_os_error().into());
        }
        let mut dacl = std::ptr::null_mut();
        let mut present = 0;
        let mut defaulted = 0;
        let result: Result<()> =
            if GetSecurityDescriptorDacl(descriptor, &mut present, &mut dacl, &mut defaulted) == 0
                || present == 0
            {
                Err("INIT_DACL_REQUIRED".into())
            } else {
                let status = SetSecurityInfo(
                    directory.as_raw_handle(),
                    SE_FILE_OBJECT,
                    DACL_SECURITY_INFORMATION | PROTECTED_DACL_SECURITY_INFORMATION,
                    std::ptr::null_mut(),
                    std::ptr::null_mut(),
                    dacl,
                    std::ptr::null_mut(),
                );
                if status == 0 {
                    Ok(())
                } else {
                    Err(io::Error::from_raw_os_error(status as i32).into())
                }
            };
        LocalFree(descriptor);
        result?;
    }
    if fs::read_dir(path)?.next().is_some() {
        return Err("INIT_DIRECTORY_CHANGED".into());
    }
    Ok(())
}
struct Job(HANDLE);
impl Job {
    fn new() -> Result<Self> {
        unsafe {
            let h = CreateJobObjectW(std::ptr::null(), std::ptr::null());
            if h.is_null() {
                return Err(io::Error::last_os_error().into());
            }
            let j = Self(h);
            let mut l: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
            l.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
                | JOB_OBJECT_LIMIT_ACTIVE_PROCESS
                | JOB_OBJECT_LIMIT_JOB_MEMORY;
            l.BasicLimitInformation.ActiveProcessLimit = 32;
            l.JobMemoryLimit = 8 * 1024 * 1024 * 1024;
            if SetInformationJobObject(
                h,
                JobObjectExtendedLimitInformation,
                &l as *const _ as _,
                std::mem::size_of_val(&l) as u32,
            ) == 0
            {
                return Err(io::Error::last_os_error().into());
            }
            Ok(j)
        }
    }
    fn add(&self, p: &Child) -> Result<()> {
        unsafe {
            if AssignProcessToJobObject(self.0, p.as_raw_handle()) == 0 {
                return Err(io::Error::last_os_error().into());
            }
            label(p.as_raw_handle(), SE_KERNEL_OBJECT)
        }
    }
    fn drain(&self) -> Result<()> {
        unsafe {
            if TerminateJobObject(self.0, 71) == 0 {
                return Err(io::Error::last_os_error().into());
            }
            let start = Instant::now();
            loop {
                let mut a: JOBOBJECT_BASIC_ACCOUNTING_INFORMATION = std::mem::zeroed();
                if QueryInformationJobObject(
                    self.0,
                    JobObjectBasicAccountingInformation,
                    &mut a as *mut _ as _,
                    std::mem::size_of_val(&a) as u32,
                    std::ptr::null_mut(),
                ) == 0
                {
                    return Err(io::Error::last_os_error().into());
                }
                if a.ActiveProcesses == 0 {
                    return Ok(());
                }
                if start.elapsed() > Duration::from_secs(10) {
                    return Err("OLD_GENERATION_NOT_DRAINED".into());
                }
                thread::sleep(Duration::from_millis(20));
            }
        }
    }
}
impl Drop for Job {
    fn drop(&mut self) {
        unsafe {
            CloseHandle(self.0);
        }
    }
}
fn clean_command(exe: &Path) -> Command {
    let mut c = Command::new(exe);
    c.env_clear();
    for k in ENV {
        if let Some(v) = env::var_os(k) {
            c.env(k, v);
        }
    }
    c
}
fn child_mode(c: &Config, n: u32) -> Result<i32> {
    let mut boot = String::new();
    io::stdin().lock().take(64).read_line(&mut boot)?;
    if boot != format!("BOOT {n}\n") {
        return Err("ROOT_BOOT_REQUIRED".into());
    }
    let mut guard = clean_command(&c.guard)
        .arg(&c.manifest)
        .arg(&c.manifest_sha256)
        .current_dir(&c.directory)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::inherit())
        .spawn()?;
    loop {
        if let Some(s) = guard.try_wait()? {
            return Ok(s.code().unwrap_or(2));
        }
        println!("PULSE {n}");
        io::stdout().flush()?;
        thread::sleep(Duration::from_secs(1));
    }
}
fn run() -> Result<i32> {
    // Every entrypoint validates its token and labels itself before reading any
    // deployment inputs. This is still post-creation: a trusted launcher must
    // supply the process security descriptor at creation to close that window.
    medium()?;
    let a: Vec<String> = env::args().collect();
    if a.len() != 4 && a.len() != 5 {
        return Err(
            "USAGE: --init|--run CONFIG SHA256; internal --generation CONFIG SHA256 EPOCH".into(),
        );
    }
    let (c, _config_lock) = config(Path::new(&a[2]), &a[3])?;
    let image = env::current_exe()?; // canonical Windows extended prefix is removed only for our own executable.
    let image = PathBuf::from(image.to_string_lossy().trim_start_matches("\\\\?\\"));
    let (_image_lock, ib) = read_held(&image, 64 * 1024 * 1024)?;
    let ip = hash(&ib);
    let (_guard_lock, gb) = read_held(&c.guard, 64 * 1024 * 1024)?;
    if hash(&gb) != c.guard_sha256 {
        return Err("GUARD_HASH_MISMATCH".into());
    }
    let guard_config = PathBuf::from(format!(
        "{}.config",
        c.guard.to_str().ok_or("PATH_ENCODING")?
    ));
    let (_guard_config_lock, gcb) = read_held(&guard_config, 131072)?;
    if hash(&gcb) != c.guard_config_sha256 {
        return Err("GUARD_CONFIG_HASH_MISMATCH".into());
    }
    let (_manifest_lock, mb) = read_held(&c.manifest, 2 * 1024 * 1024)?;
    if hash(&mb) != c.manifest_sha256 {
        return Err("MANIFEST_HASH_MISMATCH".into());
    }
    if a[1] == "--generation" && a.len() == 5 {
        return child_mode(&c, a[4].parse()?);
    }
    if a[1] == "--init" {
        prepare_directory(&c.directory)?;
    }
    let dir = OpenOptions::new()
        .read(true)
        .access_mode(0x00020000 | 0x00080000)
        .custom_flags(0x02000000)
        .open(&c.directory)?;
    label(dir.as_raw_handle(), SE_FILE_OBJECT)?;
    let _single = OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(false)
        .share_mode(0)
        .open(c.directory.join("root.lock"))?;
    let budget_path = c.directory.join("rust-generations.json");
    if a[1] == "--init" {
        let b = Budget {
            schema: 1,
            config_sha256: a[3].clone(),
            image_sha256: ip,
            entries: vec![],
        };
        let mut f = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(budget_path)?;
        f.write_all(&serde_json::to_vec(&b)?)?;
        f.sync_all()?;
        println!("RUST_ROOT_PROVISIONED");
        return Ok(0);
    }
    if a[1] != "--run" {
        return Err("UNKNOWN_MODE".into());
    }
    let (_, bb) = read_held(&budget_path, 16384)?;
    let mut b: Budget = serde_json::from_slice(&bb)?;
    if b.config_sha256 != a[3] || b.image_sha256 != ip {
        return Err("ROOT_IDENTITY_CHANGED".into());
    }
    loop {
        let n = next(&mut b, &c)?; // consume before launching, including interrupted generations
        let mut f = OpenOptions::new()
            .write(true)
            .truncate(true)
            .open(&budget_path)?;
        f.write_all(&serde_json::to_vec(&b)?)?;
        f.sync_all()?;
        drop(f);
        let job = Job::new()?;
        let mut p = clean_command(&image)
            .args(["--generation", &a[2], &a[3], &n.to_string()])
            .current_dir(&c.directory)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .spawn()?;
        if let Err(e) = job.add(&p) {
            let _ = p.kill();
            let _ = p.wait();
            return Err(e);
        }
        writeln!(p.stdin.as_mut().ok_or("BOOT_PIPE")?, "BOOT {n}")?;
        p.stdin.take();
        println!(
            "{{\"event\":\"generation-start\",\"generation\":{n},\"pid\":{}}}",
            p.id()
        );
        let output = p.stdout.take().ok_or("PULSE_PIPE")?;
        let (tx, rx) = mpsc::sync_channel(4);
        thread::spawn(move || {
            let mut r = io::BufReader::new(output);
            loop {
                let mut s = String::new();
                match r.by_ref().take(129).read_line(&mut s) {
                    Ok(0) | Err(_) => break,
                    Ok(_) => {
                        if s.len() > 128 {
                            break;
                        }
                        let _ = tx.try_send(s);
                    }
                }
            }
        });
        let mut last = Instant::now();
        let code = loop {
            if let Some(s) = p.try_wait()? {
                break s.code().unwrap_or(2);
            }
            if let Ok(s) = rx.recv_timeout(Duration::from_millis(50)) {
                if s == format!("PULSE {n}\n") {
                    last = Instant::now();
                } else {
                    break 2;
                }
            }
            if last.elapsed() > Duration::from_secs(15) {
                break 2;
            }
        };
        job.drain()?;
        let _ = p.wait();
        println!("{{\"event\":\"generation-drained\",\"generation\":{n},\"exit\":{code}}}");
        if code == 0 {
            return Ok(0);
        }
        thread::sleep(Duration::from_millis(250 * n as u64));
    }
}
fn main() {
    match run() {
        Ok(c) => std::process::exit(c),
        Err(e) => {
            eprintln!("EFF_RUST_ROOT_{e}");
            std::process::exit(2);
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    fn c() -> Config {
        Config {
            schema: 1,
            guard: "C:\\guard.exe".into(),
            guard_sha256: "a".repeat(64),
            guard_config_sha256: "f".repeat(64),
            manifest: "C:\\seal.json".into(),
            manifest_sha256: "b".repeat(64),
            directory: "C:\\lab".into(),
            max_generations: 2,
        }
    }
    fn b() -> Budget {
        Budget {
            schema: 1,
            config_sha256: "c".repeat(64),
            image_sha256: "d".repeat(64),
            entries: vec![],
        }
    }
    #[test]
    fn bounded_ancestry() {
        let mut b = b();
        assert_eq!(next(&mut b, &c()).unwrap(), 1);
        let first = b.entries[0].id.clone();
        assert_eq!(next(&mut b, &c()).unwrap(), 2);
        assert_eq!(b.entries[1].parent, first);
        assert!(next(&mut b, &c()).is_err());
    }
    #[test]
    fn forged_generation_is_rejected() {
        let mut b = b();
        next(&mut b, &c()).unwrap();
        b.entries[0].id = "e".repeat(64);
        assert!(next(&mut b, &c()).is_err());
    }
    #[test]
    fn config_cannot_add_ambient_permissions() {
        let mut v = serde_json::to_value(c()).unwrap();
        v["environment"] = serde_json::json!({"JAVA_TOOL_OPTIONS":"evil"});
        assert!(serde_json::from_value::<Config>(v).is_err());
    }
    #[test]
    fn cap_and_pins_are_mandatory() {
        let mut c = c();
        c.max_generations = 100;
        assert!(validate(&c).is_err());
        c.max_generations = 2;
        c.guard_sha256 = "*".into();
        assert!(validate(&c).is_err());
    }
}
