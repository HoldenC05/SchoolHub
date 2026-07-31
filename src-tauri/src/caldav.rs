use base64::Engine;
use quick_xml::Reader;
use quick_xml::events::Event;
use reqwest::blocking::Client;
use reqwest::header::{CONTENT_TYPE, LOCATION};
use std::time::Duration;

const BASE: &str = "https://caldav.icloud.com";

#[derive(Debug, Clone)]
pub struct CalInfo {
    pub href: String,
    pub display_name: Option<String>,
}

#[derive(Debug, Clone, Default)]
pub struct IcsEvent {
    pub uid: String,
    pub summary: Option<String>,
    pub location: Option<String>,
    pub description: Option<String>,
    pub starts_at: Option<String>,
    pub ends_at: Option<String>,
    pub status: Option<String>,
}

pub struct CalDavClient {
    client: Client,
    auth: String,
}

fn local(e: quick_xml::name::QName) -> String {
    String::from_utf8_lossy(e.local_name().as_ref()).into_owned()
}

fn text_inside(xml: &str, tag: &str) -> Option<String> {
    all_texts_inside(xml, tag).into_iter().next()
}

fn all_texts_inside(xml: &str, tag: &str) -> Vec<String> {
    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(true);
    let mut stack: Vec<String> = Vec::new();
    let mut buf = Vec::new();
    let mut out = Vec::new();
    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(e)) => stack.push(local(e.name())),
            Ok(Event::End(e)) => {
                let name = local(e.name());
                if let Some(top) = stack.last() {
                    if *top == name {
                        stack.pop();
                    }
                }
            }
            Ok(Event::Text(t)) => {
                let txt = String::from_utf8_lossy(&t).trim().to_string();
                if !txt.is_empty() && stack.iter().any(|s| s == tag) {
                    out.push(txt);
                }
            }
            Ok(Event::Eof) | Err(_) => break,
            _ => {}
        }
        buf.clear();
    }
    out
}

fn parse_calendar_list(xml: &str) -> Vec<CalInfo> {
    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(true);
    let mut items: Vec<CalInfo> = Vec::new();
    let mut current: Option<(Option<String>, Option<String>)> = None;
    let mut in_href = false;
    let mut in_displayname = false;
    let mut buf = Vec::new();
    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(e)) => {
                let name = local(e.name());
                match name.as_str() {
                    "response" => current = Some((None, None)),
                    "href" if current.is_some() => in_href = true,
                    "displayname" if current.is_some() => in_displayname = true,
                    _ => {}
                }
            }
            Ok(Event::End(e)) => {
                let name = local(e.name());
                match name.as_str() {
                    "href" => in_href = false,
                    "displayname" => in_displayname = false,
                    "response" => {
                        if let Some((href, name)) = current.take() {
                            if let Some(href) = href {
                                items.push(CalInfo {
                                    href,
                                    display_name: name,
                                });
                            }
                        }
                    }
                    _ => {}
                }
            }
            Ok(Event::Text(t)) => {
                let txt = String::from_utf8_lossy(&t).trim().to_string();
                if txt.is_empty() {
                    buf.clear();
                    continue;
                }
                if in_href {
                    if let Some(cur) = current.as_mut() {
                        if cur.0.is_none() {
                            cur.0 = Some(txt.clone());
                        }
                    }
                } else if in_displayname {
                    if let Some(cur) = current.as_mut() {
                        if cur.1.is_none() {
                            cur.1 = Some(txt.clone());
                        }
                    }
                }
            }
            Ok(Event::Eof) | Err(_) => break,
            _ => {}
        }
        buf.clear();
    }
    items
}

fn full_url(path: &str) -> String {
    if path.starts_with("http") {
        path.to_string()
    } else {
        format!("{BASE}{path}")
    }
}

impl CalDavClient {
    pub fn new(email: &str, password: &str) -> reqwest::Result<Self> {
        let client = Client::builder().timeout(Duration::from_secs(30)).build()?;
        let encoded = base64::engine::general_purpose::STANDARD
            .encode(format!("{email}:{password}"));
        Ok(Self {
            client,
            auth: format!("Basic {encoded}"),
        })
    }

    fn authed(&self, method: &str, url: &str) -> reqwest::blocking::RequestBuilder {
        self.client
            .request(
                reqwest::Method::from_bytes(method.as_bytes()).expect("valid method"),
                url,
            )
            .header("Authorization", &self.auth)
    }

    fn propfind(&self, path: &str, xml: &str, depth: &str) -> Result<String, String> {
        let resp = self
            .authed("PROPFIND", &full_url(path))
            .header(CONTENT_TYPE, "application/xml; charset=utf-8")
            .header("Depth", depth)
            .body(xml.to_string())
            .send()
            .map_err(|e| format!("network error: {e}"))?;
        if !resp.status().is_success() {
            return Err(format!(
                "CalDAV PROPFIND {} → {} — check your Apple ID email and app-specific password",
                path,
                resp.status()
            ));
        }
        resp.text().map_err(|e| e.to_string())
    }

    fn report(&self, path: &str, xml: &str) -> Result<String, String> {
        let resp = self
            .authed("REPORT", &full_url(path))
            .header(CONTENT_TYPE, "application/xml; charset=utf-8")
            .body(xml.to_string())
            .send()
            .map_err(|e| format!("network error: {e}"))?;
        if !resp.status().is_success() {
            return Err(format!("CalDAV REPORT failed with {}", resp.status()));
        }
        resp.text().map_err(|e| e.to_string())
    }

    pub fn principal_href(&self) -> Result<String, String> {
        let xml = r#"<D:propfind xmlns:D="DAV:"><D:prop><D:current-user-principal/></D:prop></D:propfind>"#;
        let body = self.propfind("/", xml, "0")?;
        text_inside(&body, "current-user-principal").ok_or_else(|| {
            "could not resolve your iCloud calendar principal — is this a valid iCloud Apple ID?".into()
        })
    }

    pub fn home_set_href(&self) -> Result<String, String> {
        let principal = self.principal_href()?;
        let xml = r#"<D:propfind xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav"><D:prop><C:calendar-home-set/></D:prop></D:propfind>"#;
        let body = self.propfind(&principal, xml, "0")?;
        text_inside(&body, "calendar-home-set")
            .ok_or_else(|| "could not find your calendar home set".into())
    }

    pub fn list_calendars(&self) -> Result<Vec<CalInfo>, String> {
        let home = self.home_set_href()?;
        let xml = r#"<D:propfind xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
            <D:prop><D:displayname/><C:supported-calendar-component-set/><D:resourcetype/></D:prop>
        </D:propfind>"#;
        let body = self.propfind(&home, xml, "1")?;
        Ok(parse_calendar_list(&body))
    }

    pub fn fetch_events(
        &self,
        calendar_href: &str,
        start_utc: &str,
        end_utc: &str,
    ) -> Result<Vec<IcsEvent>, String> {
        let xml = format!(
            r#"<?xml version="1.0" encoding="UTF-8"?>
<C:calendar-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:prop><D:getetag/><C:calendar-data/></D:prop>
  <C:filter>
    <C:comp-filter name="VCALENDAR">
      <C:comp-filter name="VEVENT">
        <C:time-range start="{start}" end="{end}"/>
      </C:comp-filter>
    </C:comp-filter>
  </C:filter>
</C:calendar-query>"#,
            start = start_utc,
            end = end_utc
        );
        let body = self.report(calendar_href, &xml)?;
        let mut events = Vec::new();
        for ics in all_texts_inside(&body, "calendar-data") {
            events.extend(parse_ics(&ics));
        }
        Ok(events)
    }

    pub fn put_event(&self, calendar_href: &str, uid: &str, ics: &str) -> Result<String, String> {
        let href = format!("{}/{}.ics", calendar_href.trim_end_matches('/'), uid);
        let resp = self
            .authed("PUT", &full_url(&href))
            .header(CONTENT_TYPE, "text/calendar; charset=utf-8")
            .body(ics.to_string())
            .send()
            .map_err(|e| format!("network error: {e}"))?;
        if resp.status().is_success() {
            let location = resp
                .headers()
                .get(LOCATION)
                .and_then(|v| v.to_str().ok())
                .map(|s| s.to_string());
            Ok(location.unwrap_or(href))
        } else {
            Err(format!("CalDAV PUT failed with {}", resp.status()))
        }
    }

    pub fn delete_event(&self, href: &str) -> Result<bool, String> {
        let resp = self
            .authed("DELETE", &full_url(href))
            .send()
            .map_err(|e| format!("network error: {e}"))?;
        if resp.status().is_success() || resp.status().as_u16() == 404 {
            Ok(true)
        } else {
            Err(format!("CalDAV DELETE failed with {}", resp.status()))
        }
    }
}

fn unquote(s: &str) -> String {
    let t = s.trim();
    if t.len() >= 2 && t.starts_with('"') && t.ends_with('"') {
        t[1..t.len() - 1].to_string()
    } else {
        t.to_string()
    }
}

fn ics_to_iso(value: &str, params: &str) -> String {
    let v = value.trim();
    if params.to_uppercase().contains("VALUE=DATE") {
        if v.len() == 8 {
            return format!(
                "{}-{}-{}",
                &v[0..4],
                &v[4..6],
                &v[6..8]
            );
        }
        return v.to_string();
    }
    let v = v.trim_end_matches('Z');
    if v.len() >= 15 && v.as_bytes()[8] == b'T' {
        let mut iso = format!(
            "{}-{}-{}T{}:{}:{}",
            &v[0..4],
            &v[4..6],
            &v[6..8],
            &v[9..11],
            &v[11..13],
            &v[13..15]
        );
        if value.trim_end().ends_with('Z') {
            iso.push('Z');
        }
        return iso;
    }
    value.to_string()
}

pub fn parse_ics(ics: &str) -> Vec<IcsEvent> {
    let mut unfolded: Vec<String> = Vec::new();
    for line in ics.lines() {
        if line.starts_with(' ') || line.starts_with('\t') {
            if let Some(last) = unfolded.last_mut() {
                last.push_str(line.trim_start());
            }
        } else {
            unfolded.push(line.to_string());
        }
    }

    let mut events = Vec::new();
    let mut cur: Option<IcsEvent> = None;
    let mut in_valarm = false;
    for line in unfolded {
        let t = line.trim();
        if let Some(rest) = t.strip_prefix("BEGIN:") {
            match rest.trim() {
                "VEVENT" => cur = Some(IcsEvent::default()),
                "VALARM" => in_valarm = true,
                _ => {}
            }
        } else if let Some(rest) = t.strip_prefix("END:") {
            match rest.trim() {
                "VALARM" => in_valarm = false,
                "VEVENT" => {
                    if let Some(ev) = cur.take() {
                        events.push(ev);
                    }
                }
                _ => {}
            }
        } else if let Some(ev) = cur.as_mut() {
            if in_valarm {
                continue;
            }
            if let Some(colon) = t.find(':') {
                let head = &t[..colon];
                let value = t[colon + 1..].trim();
                let name = head.split(';').next().unwrap_or("").to_uppercase();
                match name.as_str() {
                    "UID" => ev.uid = value.to_string(),
                    "SUMMARY" => ev.summary = Some(unquote(value)),
                    "LOCATION" => ev.location = Some(value.to_string()),
                    "DESCRIPTION" => ev.description = Some(value.to_string()),
                    "STATUS" => ev.status = Some(value.to_string()),
                    "DTSTART" => ev.starts_at = Some(ics_to_iso(value, head)),
                    "DTEND" => ev.ends_at = Some(ics_to_iso(value, head)),
                    _ => {}
                }
            }
        }
    }
    events
}

fn escape_ics(s: &str) -> String {
    s.replace('\\', "\\\\")
        .replace(';', "\\;")
        .replace(',', "\\,")
        .replace('\n', "\\n")
}

pub fn now_ics_utc() -> String {
    let now = chrono_utc_now();
    format!(
        "{}{:02}{:02}T{:02}{:02}{:02}Z",
        now.0, now.1, now.2, now.3, now.4, now.5
    )
}

pub fn now_iso_utc() -> String {
    let now = chrono_utc_now();
    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z",
        now.0, now.1, now.2, now.3, now.4, now.5
    )
}

fn chrono_utc_now() -> (i32, u32, u32, u32, u32, u32) {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;
    days_from_civil_to_ymd(secs / 86_400)
}

fn days_from_civil_to_ymd(days: i64) -> (i32, u32, u32, u32, u32, u32) {
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as i64;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    let y = (if m <= 2 { y + 1 } else { y }) as i32;
    let secs_of_day = secs_of_day_now() as u32;
    let (h, mi, s) = (secs_of_day / 3600, (secs_of_day / 60) % 60, secs_of_day % 60);
    (y, m, d, h, mi, s)
}

fn secs_of_day_now() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
        % 86_400
}

pub fn ics_range(days_back: i64, days_forward: i64) -> (String, String) {
    let now = secs_of_day_now() as i64
        + (std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as i64
            / 86_400)
            * 86_400;
    let start = now - days_back * 86_400;
    let end = now + days_forward * 86_400;
    fn fmt(unix: i64) -> String {
        let days = unix.div_euclid(86_400);
        let (y, mo, d, _, _, _) = days_from_civil_to_ymd(days);
        format!("{y:04}{mo:02}{d:02}T000000Z")
    }
    (fmt(start), fmt(end))
}

pub fn due_to_ics(due: &str) -> Option<(String, String, bool)> {
    let s = due.trim();
    let digits: String = s.chars().filter(|c| c.is_ascii_digit()).collect();
    let has_time = s.contains('T') || s.contains(':') || s.contains(' ');
    if !has_time && digits.len() >= 8 {
        let (y, mo, d) = (&digits[0..4], &digits[4..6], &digits[6..8]);
        let (ny, nm, nd) = next_day(y, mo, d);
        return Some((format!("{y}{mo}{d}"), format!("{ny}{nm}{nd}"), true));
    }
    let (y, mo, d, h, mi, se) = if digits.len() >= 14 {
        (
            &digits[0..4],
            &digits[4..6],
            &digits[6..8],
            &digits[8..10],
            &digits[10..12],
            &digits[12..14],
        )
    } else if digits.len() >= 12 {
        (
            &digits[0..4],
            &digits[4..6],
            &digits[6..8],
            &digits[8..10],
            &digits[10..12],
            "00",
        )
    } else {
        return None;
    };
    let (ny, nm, nd, nh, nmi) = add_hour(y, mo, d, h, mi);
    let start = format!("{y}{mo}{d}T{h}{mi}{se}");
    let end = format!("{ny}{nm}{nd}T{nh}{nmi}{se}");
    Some((start, end, false))
}

fn add_hour(
    y: &str,
    mo: &str,
    d: &str,
    h: &str,
    mi: &str,
) -> (String, String, String, String, String) {
    let (mut yy, mut mm, mut dd) = (y.parse::<u32>().unwrap_or(2026), mo.parse::<u32>().unwrap_or(1), d.parse::<u32>().unwrap_or(1));
    let mut hh = h.parse::<u32>().unwrap_or(0);
    hh = (hh + 1) % 24;
    if hh == 0 {
        (yy, mm, dd) = next_day_nums(yy, mm, dd);
    }
    (format!("{yy:04}"), format!("{mm:02}"), format!("{dd:02}"), format!("{hh:02}"), mi.to_string())
}

fn next_day(y: &str, mo: &str, d: &str) -> (String, String, String) {
    let (yy, mm, dd) = next_day_nums(
        y.parse().unwrap_or(2026),
        mo.parse().unwrap_or(1),
        d.parse().unwrap_or(1),
    );
    (format!("{yy:04}"), format!("{mm:02}"), format!("{dd:02}"))
}

fn next_day_nums(y: u32, m: u32, d: u32) -> (u32, u32, u32) {
    let dim = [31, if is_leap(y) { 29 } else { 28 }, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if d < dim[(m - 1) as usize] {
        (y, m, d + 1)
    } else if m == 12 {
        (y + 1, 1, 1)
    } else {
        (y, m + 1, 1)
    }
}

fn is_leap(y: u32) -> bool {
    (y % 4 == 0 && y % 100 != 0) || y % 400 == 0
}

pub fn build_event_ics(
    uid: &str,
    title: &str,
    description: &str,
    dtstart: &str,
    dtend: &str,
    all_day: bool,
) -> String {
    let start_attr = if all_day { "DTSTART;VALUE=DATE" } else { "DTSTART" };
    let end_attr = if all_day { "DTEND;VALUE=DATE" } else { "DTEND" };
    format!(
        "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//School Hub//School Hub//EN\r\nBEGIN:VEVENT\r\nUID:{uid}@schoolhub\r\nDTSTAMP:{now}\r\n{start_attr}:{dtstart}\r\n{end_attr}:{dtend}\r\nSUMMARY:{title}\r\nDESCRIPTION:{desc}\r\nSTATUS:CONFIRMED\r\nBEGIN:VALARM\r\nACTION:DISPLAY\r\nDESCRIPTION:School Hub reminder\r\nTRIGGER:-PT12H\r\nEND:VALARM\r\nEND:VEVENT\r\nEND:VCALENDAR",
        uid = uid,
        now = now_ics_utc(),
        start_attr = start_attr,
        end_attr = end_attr,
        title = escape_ics(title),
        desc = escape_ics(description),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_timestamped_event() {
        let ics = "\
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Apple Inc.//Mac OS X//EN
BEGIN:VEVENT
UID:test-123@example.com
DTSTAMP:20260914T100000Z
DTSTART:20260914T143000Z
DTEND:20260914T160000Z
SUMMARY:Team meeting
LOCATION:Room 4A
DESCRIPTION:Discuss the project plan
STATUS:CONFIRMED
END:VEVENT
END:VCALENDAR";
        let events = parse_ics(ics);
        assert_eq!(events.len(), 1);
        let ev = &events[0];
        assert_eq!(ev.uid, "test-123@example.com");
        assert_eq!(ev.summary.as_deref(), Some("Team meeting"));
        assert_eq!(ev.location.as_deref(), Some("Room 4A"));
        assert_eq!(ev.description.as_deref(), Some("Discuss the project plan"));
        assert_eq!(ev.status.as_deref(), Some("CONFIRMED"));
        assert_eq!(ev.starts_at.as_deref(), Some("2026-09-14T14:30:00Z"));
        assert_eq!(ev.ends_at.as_deref(), Some("2026-09-14T16:00:00Z"));
    }

    #[test]
    fn parses_all_day_event() {
        let ics = "\
BEGIN:VCALENDAR
BEGIN:VEVENT
UID:allday-1
DTSTART;VALUE=DATE:20260914
DTEND;VALUE=DATE:20260915
SUMMARY:Birthday
END:VEVENT
END:VCALENDAR";
        let events = parse_ics(ics);
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].starts_at.as_deref(), Some("2026-09-14"));
        assert_eq!(events[0].ends_at.as_deref(), Some("2026-09-15"));
    }

    #[test]
    fn unfolds_lines_and_skips_valarm() {
        let ics = "\
BEGIN:VCALENDAR
BEGIN:VEVENT
UID:folded-1
SUMMARY:This is a very long summary that 
 keeps going onto the next line
DESCRIPTION:real description
BEGIN:VALARM
ACTION:DISPLAY
DESCRIPTION:REMINDER TEXT
TRIGGER:-PT15M
END:VALARM
END:VEVENT
END:VCALENDAR";
        let events = parse_ics(ics);
        assert_eq!(events.len(), 1);
        assert_eq!(
            events[0].summary.as_deref(),
            Some("This is a very long summary that keeps going onto the next line")
        );
        assert_eq!(events[0].description.as_deref(), Some("real description"));
    }

    #[test]
    fn parses_multiple_events() {
        let ics = "\
BEGIN:VCALENDAR
BEGIN:VEVENT
UID:a
SUMMARY:First
END:VEVENT
BEGIN:VEVENT
UID:b
SUMMARY:Second
END:VEVENT
END:VCALENDAR";
        let events = parse_ics(ics);
        assert_eq!(events.len(), 2);
        assert_eq!(events[0].summary.as_deref(), Some("First"));
        assert_eq!(events[1].summary.as_deref(), Some("Second"));
    }

    #[test]
    fn builds_all_day_ics() {
        let ics = build_event_ics("evt-7", "Final; Exam (calc)", "read ch. 4,5", "20260914", "20260915", true);
        assert!(ics.starts_with("BEGIN:VCALENDAR"));
        assert!(ics.trim_end().ends_with("END:VCALENDAR"));
        assert!(ics.contains("UID:evt-7@schoolhub"));
        assert!(ics.contains("DTSTART;VALUE=DATE:20260914"));
        assert!(ics.contains("DTEND;VALUE=DATE:20260915"));
        assert!(ics.contains("SUMMARY:Final\\; Exam (calc)"));
        assert!(ics.contains("DESCRIPTION:read ch. 4\\,5"));
        assert!(ics.contains("TRIGGER:-PT12H"));
    }

    #[test]
    fn builds_datetime_ics_without_value_date() {
        let ics = build_event_ics("evt-1", "Homework", "", "20260914T235900", "20260915T005900", false);
        assert!(ics.contains("DTSTART:20260914T235900"));
        assert!(ics.contains("DTEND:20260915T005900"));
        assert!(!ics.contains("VALUE=DATE"));
    }

    #[test]
    fn due_date_all_day() {
        assert_eq!(due_to_ics("2026-09-15"), Some(("20260915".into(), "20260916".into(), true)));
        assert_eq!(due_to_ics("20260915"), Some(("20260915".into(), "20260916".into(), true)));
    }

    #[test]
    fn due_date_minute_precision() {
        let want = ("20260915T235900".into(), "20260916T005900".into(), false);
        assert_eq!(due_to_ics("2026-09-15T23:59"), Some(want.clone()));
        assert_eq!(due_to_ics("2026-09-15T23:59:00"), Some(want.clone()));
        assert_eq!(due_to_ics("2026-09-15 23:59"), Some(want.clone()));
        assert_eq!(due_to_ics("2026-09-15T23:59:00Z"), Some(want));
    }

    #[test]
    fn due_leap_year() {
        assert_eq!(due_to_ics("2024-02-28"), Some(("20240228".into(), "20240229".into(), true)));
        assert_eq!(due_to_ics("2023-02-28"), Some(("20230228".into(), "20230301".into(), true)));
        assert_eq!(due_to_ics("2023-12-31"), Some(("20231231".into(), "20240101".into(), true)));
    }

    #[test]
    fn due_midnight_rolls_day() {
        assert_eq!(
            due_to_ics("2026-09-15T23:30"),
            Some(("20260915T233000".into(), "20260916T003000".into(), false))
        );
    }

    #[test]
    fn due_unparseable_returns_none() {
        assert_eq!(due_to_ics(""), None);
        assert_eq!(due_to_ics("next week"), None);
        assert_eq!(due_to_ics("2026"), None);
    }

    #[test]
    fn now_iso_utc_is_formatted() {
        let s = now_iso_utc();
        assert_eq!(s.len(), 20);
        assert!(s.ends_with('Z'));
        assert_eq!(&s[4..5], "-");
        assert_eq!(&s[7..8], "-");
        assert_eq!(&s[10..11], "T");
        assert_eq!(&s[13..14], ":");
        assert_eq!(&s[16..17], ":");
        assert!(s[0..4].parse::<u32>().is_ok());
    }

    #[test]
    fn ics_range_formats_utc_dates() {
        let (start, end) = ics_range(0, 0);
        assert_eq!(start.len(), 16);
        assert_eq!(end, start);
        assert!(start.ends_with("T000000Z"));
        assert!(start[0..4].parse::<u32>().is_ok());
    }

    #[test]
    fn civil_epoch_is_1970_01_01() {
        let (y, m, d, _, _, _) = days_from_civil_to_ymd(0);
        assert_eq!((y, m, d), (1970, 1, 1));
    }
}
