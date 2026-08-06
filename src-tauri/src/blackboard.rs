use quick_xml::events::Event;
use quick_xml::Reader;
use serde_json::Value;

const USER_AGENT: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

fn api_base(origin: &str) -> String {
    format!(
        "{}/learn/api/public/v1",
        origin.trim_end_matches('/')
    )
}

/// HTML-scraping fallback for Blackboard "Original" experience / non-Ultra instances.
#[allow(dead_code)]
pub fn fetch_page(url: &str, cookie: &str) -> Result<String, String> {
    let text = raw_get(url, cookie, "text/html,application/xhtml+xml")?;
    Ok(text)
}

fn raw_get(url: &str, cookie: &str, accept: &str) -> Result<String, String> {
    let client = reqwest::blocking::Client::builder()
        .redirect(reqwest::redirect::Policy::limited(10))
        .build()
        .map_err(|e| format!("failed to build http client: {e}"))?;
    let mut req = client.get(url);
    if !cookie.trim().is_empty() {
        req = req.header(reqwest::header::COOKIE, cookie.trim());
    }
    req = req
        .header(reqwest::header::USER_AGENT, USER_AGENT)
        .header(reqwest::header::ACCEPT, accept);
    let resp = req.send().map_err(|e| format!("request failed: {e}"))?;
    let status = resp.status();
    let text = resp.text().map_err(|e| format!("failed to read response: {e}"))?;
    if !status.is_success() {
        let hint = if text.to_lowercase().contains("login") {
            " (your session cookie expired or wasn't accepted — grab a fresh one)"
        } else {
            ""
        };
        return Err(format!("Blackboard returned HTTP {status}{hint}"));
    }
    Ok(text)
}

fn fetch_json(url: &str, cookie: &str) -> Result<Value, String> {
    let text = raw_get(url, cookie, "application/json")?;
    serde_json::from_str(&text).map_err(|e| format!("unexpected response (not JSON): {e}"))
}

fn str_val(v: &Value, keys: &[&str]) -> String {
    for k in keys {
        match v.get(k) {
            Some(Value::String(s)) => return s.clone(),
            Some(Value::Number(n)) => return n.to_string(),
            _ => {}
        }
    }
    String::new()
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct BbCourse {
    pub id: String,
    pub name: String,
    pub external_id: String,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct BbGrade {
    pub title: String,
    pub score: String,
    pub possible: String,
    pub status: String,
    pub date: String,
}

/// List the current user's course memberships via the Learn REST API.
pub fn my_courses(origin: &str, cookie: &str) -> Result<Vec<BbCourse>, String> {
    let url = format!("{}/users/me/courses", api_base(origin));
    let json = fetch_json(&url, cookie)?;
    if let Some(err) = json["error"]["message"].as_str() {
        return Err(err.to_string());
    }
    let results = json["results"].as_array().cloned().unwrap_or_default();
    Ok(results
        .iter()
        .map(|r| BbCourse {
            id: str_val(r, &["id"]),
            name: str_val(r, &["name"]),
            external_id: str_val(r, &["courseId"]),
        })
        .filter(|c| !c.name.is_empty())
        .collect())
}

/// Fetch the current user's grades for one course via the Learn REST API.
pub fn my_grades(origin: &str, course_id: &str, cookie: &str) -> Result<Vec<BbGrade>, String> {
    let url = format!(
        "{}/users/me/courses/{}/grades",
        api_base(origin),
        course_id.trim()
    );
    let json = fetch_json(&url, cookie)?;
    if let Some(err) = json["error"]["message"].as_str() {
        return Err(err.to_string());
    }
    let results = json["results"].as_array().cloned().unwrap_or_default();
    let rows: Vec<BbGrade> = results
        .iter()
        .map(|r| BbGrade {
            title: str_val(r, &["columnName", "name", "title"]),
            score: str_val(r, &["score"]),
            possible: str_val(r, &["possible"]),
            status: str_val(r, &["status"]),
            date: r["attempt"]["dateCreated"]
                .as_str()
                .unwrap_or("")
                .to_string(),
        })
        .filter(|g| !g.title.is_empty())
        .collect();
    Ok(rows)
}

/// Best-effort grade display string, e.g. "92/100" or "A-".
#[allow(dead_code)]
pub fn grade_text(grade: &BbGrade) -> String {
    let score = grade.score.trim();
    let possible = grade.possible.trim();
    if possible.is_empty() {
        return score.to_string();
    }
    if possible == "100" {
        if let Ok(n) = score.parse::<f64>() {
            return format!("{n}%");
        }
    }
    if !score.is_empty() {
        return format!("{score}/{possible}");
    }
    String::new()
}

/// Extract every `<table>` from an HTML document as rows of cells.
/// Handles both Blackboard "Original" (grade tables) and generic HTML.
#[allow(dead_code)]
pub fn extract_tables(html: &str) -> Vec<Vec<Vec<String>>> {
    let mut reader = Reader::from_str(html);
    reader.config_mut().check_end_names = false;
    reader.config_mut().trim_markup_names_in_closing_tags = true;

    let mut tables: Vec<Vec<Vec<String>>> = Vec::new();
    let mut table: Vec<Vec<String>> = Vec::new();
    let mut row: Vec<String> = Vec::new();
    let mut in_table = false;
    let mut cell_open = false;
    let mut text_buf = String::new();
    let mut buf = Vec::new();

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(e)) => {
                let name = String::from_utf8_lossy(e.name().as_ref()).to_ascii_lowercase();
                match name.as_str() {
                    "table" => {
                        in_table = true;
                        table = Vec::new();
                        row = Vec::new();
                    }
                    "tr" if in_table => {
                        row = Vec::new();
                    }
                    "td" | "th" if in_table => {
                        cell_open = true;
                        text_buf.clear();
                    }
                    _ => {}
                }
            }
            Ok(Event::End(e)) => {
                let name = String::from_utf8_lossy(e.name().as_ref()).to_ascii_lowercase();
                match name.as_str() {
                    "table" if in_table => {
                        if !row.is_empty() {
                            table.push(std::mem::take(&mut row));
                        }
                        if !table.is_empty() {
                            tables.push(std::mem::take(&mut table));
                        }
                        in_table = false;
                        cell_open = false;
                    }
                    "tr" if in_table => {
                        if !row.is_empty() {
                            table.push(std::mem::take(&mut row));
                        }
                    }
                    "td" | "th" if in_table => {
                        if cell_open {
                            row.push(text_buf.trim().to_string());
                        }
                        cell_open = false;
                    }
                    _ => {}
                }
            }
            Ok(Event::Text(t)) => {
                if cell_open {
                    text_buf.push_str(&String::from_utf8_lossy(t.as_ref()));
                }
            }
            Ok(Event::CData(t)) => {
                if cell_open {
                    text_buf.push_str(&String::from_utf8_lossy(t.as_ref()));
                }
            }
            Ok(Event::Eof) => break,
            Err(_) => {
                buf.clear();
                continue;
            }
            _ => {}
        }
        buf.clear();
    }
    tables
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_grade_table() {
        let html = r#"<html><body><table class="gradeDataGrid"><tr><th>Name</th><th>Grade</th></tr><tr><td>Essay 1</td><td>92</td></tr><tr><td>Quiz 3</td><td>A-</td></tr></table></body></html>"#;
        let tables = extract_tables(html);
        assert_eq!(tables.len(), 1);
        assert_eq!(tables[0][0], vec!["Name", "Grade"]);
        assert_eq!(tables[0][1], vec!["Essay 1", "92"]);
        assert_eq!(tables[0][2], vec!["Quiz 3", "A-"]);
    }

    #[test]
    fn ignores_outer_layout_tables() {
        let html = r#"<table><tr><td><table><tr><td>Real</td><td>88</td></tr></table></td></tr></table>"#;
        let tables = extract_tables(html);
        assert!(tables.iter().any(|t| t.iter().any(|r| r.contains(&"Real".to_string()))));
    }

    #[test]
    fn handles_links_inside_cells() {
        let html = r#"<table><tr><td><a href="/x">Lab 2</a></td><td><b>17/20</b></td></tr></table>"#;
        let tables = extract_tables(html);
        assert_eq!(tables[0][0], vec!["Lab 2", "17/20"]);
    }

    #[test]
    fn grade_text_formats() {
        let g = |score: &str, possible: &str| BbGrade {
            title: "x".into(),
            score: score.into(),
            possible: possible.into(),
            status: "Graded".into(),
            date: "".into(),
        };
        assert_eq!(grade_text(&g("92", "100")), "92%");
        assert_eq!(grade_text(&g("17", "20")), "17/20");
        assert_eq!(grade_text(&g("A-", "")), "A-");
        assert_eq!(grade_text(&g("", "100")), "");
    }
}
