use crossterm::event::{self, Event, KeyCode, KeyEventKind, KeyModifiers};
use ratatui::{
    Frame,
    layout::{Constraint, Layout},
    style::{Color, Style},
    text::{Line, Span},
    widgets::{Block, Borders, Paragraph, Wrap},
};
use serde::Deserialize;
use std::{
    env, fs,
    io::{self, Write},
    time::{Duration, Instant},
};
#[derive(Deserialize)]
struct Choice {
    id: String,
    name: String,
    cost: f64,
}
#[derive(Deserialize)]
struct Request {
    summary: String,
    reason: String,
    choices: Vec<Choice>,
}
fn clean(s: &str, max: usize) -> String {
    s.chars().filter(|c| !c.is_control()).take(max).collect()
}
fn render(frame: &mut Frame, request: &Request, selected: usize) {
    let bg = Color::Rgb(16, 20, 25);
    let muted = Color::Rgb(142, 155, 166);
    let green = Color::Rgb(133, 224, 179);
    let area = frame.area();
    frame.render_widget(Block::default().style(Style::default().bg(bg)), area);
    let border = Block::default()
        .borders(Borders::ALL)
        .border_style(Style::default().fg(green))
        .title(" bohselecta ")
        .title_bottom(" LOCAL · NO ROUTING MODEL CALL ");
    let inner = border.inner(area);
    frame.render_widget(border, area);
    if area.width < 44 || area.height < 13 {
        frame.render_widget(
            Paragraph::new("Make the terminal larger. Esc keeps your current model; q cancels.")
                .wrap(Wrap { trim: true })
                .style(Style::default().fg(muted)),
            inner,
        );
        return;
    }
    let rows = Layout::vertical([
        Constraint::Length(1),
        Constraint::Length(2),
        Constraint::Length(2),
        Constraint::Length(2),
        Constraint::Length(3),
        Constraint::Min(1),
        Constraint::Length(1),
        Constraint::Length(1),
    ])
    .split(inner);
    frame.render_widget(
        Paragraph::new(" THE RIGHT MODEL. BACK TO WORK.").style(Style::default().fg(green).bold()),
        rows[1],
    );
    frame.render_widget(
        Paragraph::new(format!(" {}", clean(&request.summary, 130)))
            .style(Style::default().fg(Color::White))
            .wrap(Wrap { trim: false }),
        rows[2],
    );
    frame.render_widget(
        Paragraph::new(format!(" {}", clean(&request.reason, 130)))
            .style(Style::default().fg(muted))
            .wrap(Wrap { trim: false }),
        rows[3],
    );
    let options: Vec<Line> = request
        .choices
        .iter()
        .enumerate()
        .map(|(i, c)| {
            let prefix = if i == selected { " › " } else { "   " };
            let suffix = if i == 0 {
                "  RECOMMENDED"
            } else {
                "  MORE CAPACITY"
            };
            Line::from(vec![
                Span::styled(
                    format!("{}{:10}", prefix, clean(&c.name, 12)),
                    Style::default()
                        .fg(if i == selected { green } else { Color::White })
                        .bold(),
                ),
                Span::styled(
                    format!("tier {}{}", c.cost, suffix),
                    Style::default().fg(muted),
                ),
            ])
        })
        .collect();
    frame.render_widget(Paragraph::new(options), rows[4]);
    frame.render_widget(
        Paragraph::new(" Relative cost tiers · your task stays saved")
            .style(Style::default().fg(muted)),
        rows[6],
    );
    frame.render_widget(
        Paragraph::new(" ↑↓ choose   Enter continue   Esc keep   q cancel")
            .style(Style::default().fg(green)),
        rows[7],
    );
}
fn main() -> Result<(), Box<dyn std::error::Error>> {
    if env::args().nth(1).as_deref() == Some("--self-test") {
        let request = Request { summary: "Installation check".into(), reason: "Local rendering".into(), choices: vec![Choice { id: "sonnet".into(), name: "Sonnet".into(), cost: 2.0 }] };
        let mut terminal = ratatui::Terminal::new(ratatui::backend::TestBackend::new(68, 16))?;
        terminal.draw(|frame| render(frame, &request, 0))?;
        println!("boh-popup: render check passed");
        return Ok(());
    }
    let args: Vec<String> = env::args().collect();
    if args.len() != 3 {
        return Err("expected request and result paths".into());
    }
    let data = fs::read(&args[1])?;
    if data.len() > 32768 {
        return Err("input too large".into());
    }
    let request: Request = serde_json::from_slice(&data)?;
    if request.choices.is_empty()
        || request.choices.len() > 2
        || request
            .choices
            .iter()
            .any(|c| !["haiku", "sonnet", "opus"].contains(&c.id.as_str()))
    {
        return Err("invalid choices".into());
    }
    let mut terminal = ratatui::init();
    let started = Instant::now();
    let mut selected = 0;
    let result = (|| -> io::Result<String> {
        loop {
            terminal.draw(|f| render(f, &request, selected))?;
            if started.elapsed() > Duration::from_secs(45) {
                return Ok("cancel".into());
            }
            if !event::poll(Duration::from_millis(100))? {
                continue;
            }
            if let Event::Key(key) = event::read()? {
                if key.kind != KeyEventKind::Press {
                    continue;
                }
                match key.code {
                    KeyCode::Up | KeyCode::Char('k') => selected = selected.saturating_sub(1),
                    KeyCode::Down | KeyCode::Char('j') => {
                        selected = (selected + 1).min(request.choices.len() - 1)
                    }
                    KeyCode::Enter => return Ok(request.choices[selected].id.clone()),
                    KeyCode::Esc => return Ok("keep".into()),
                    KeyCode::Char('q') => return Ok("cancel".into()),
                    KeyCode::Char('c') if key.modifiers.contains(KeyModifiers::CONTROL) => {
                        return Ok("cancel".into());
                    }
                    _ => {}
                }
            }
        }
    })();
    ratatui::restore();
    let mut file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&args[2])?;
    file.write_all(result?.as_bytes())?;
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    use ratatui::{Terminal, backend::TestBackend};
    #[test]
    fn renders_choices_and_small_terminal_without_panicking() {
        let request = Request {
            summary: "todo app".into(),
            reason: "Scope is uncertain".into(),
            choices: vec![
                Choice {
                    id: "sonnet".into(),
                    name: "Sonnet".into(),
                    cost: 2.0,
                },
                Choice {
                    id: "opus".into(),
                    name: "Opus".into(),
                    cost: 3.0,
                },
            ],
        };
        for (w, h) in [(74, 18), (68, 16), (44, 13), (30, 8)] {
            let mut terminal = Terminal::new(TestBackend::new(w, h)).unwrap();
            terminal.draw(|f| render(f, &request, 0)).unwrap();
        }
    }
    #[test]
    fn removes_terminal_control_characters() {
        assert_eq!(clean("hi\x1b\nthere", 20), "hithere");
    }
}
