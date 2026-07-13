mod secrets;

use tauri::Manager;
use tauri_plugin_sql::{Migration, MigrationKind};

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

const MIGRATION_1_SQL: &str = r#"
CREATE TABLE categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL DEFAULT '#8b5cf6',
  emoji TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  price_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  billing_cycle TEXT NOT NULL DEFAULT 'monthly'
    CHECK (billing_cycle IN ('weekly','monthly','quarterly','annual','custom')),
  cycle_days INTEGER,
  next_renewal TEXT,
  auto_renews INTEGER NOT NULL DEFAULT 1,
  payment_method TEXT,
  url TEXT,
  notes TEXT,
  is_trial INTEGER NOT NULL DEFAULT 0,
  trial_ends TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','canceled')),
  icon_kind TEXT NOT NULL DEFAULT 'auto' CHECK (icon_kind IN ('auto','simple','emoji')),
  icon_value TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE notified_renewals (
  subscription_id INTEGER NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  renewal_date TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('t3','t1','t0')),
  notified_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (subscription_id, renewal_date, kind)
);
"#;

const MIGRATION_2_SQL: &str = r#"
CREATE TABLE usage_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subscription_id INTEGER REFERENCES subscriptions(id) ON DELETE SET NULL,
  provider TEXT NOT NULL,
  display_name TEXT NOT NULL,
  tier_label TEXT,
  connector TEXT NOT NULL DEFAULT 'manual',
  connector_config TEXT NOT NULL DEFAULT '{}',
  enabled INTEGER NOT NULL DEFAULT 1,
  refresh_minutes INTEGER NOT NULL DEFAULT 15,
  last_fetch_at TEXT,
  last_status TEXT NOT NULL DEFAULT 'never' CHECK (last_status IN ('never','ok','error','auth')),
  last_error TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE limit_buckets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id INTEGER NOT NULL REFERENCES usage_plans(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  label TEXT NOT NULL,
  window_kind TEXT NOT NULL DEFAULT 'custom'
    CHECK (window_kind IN ('rolling_5h','daily','weekly','monthly','plan_period','custom')),
  used REAL,
  limit_value REAL,
  unit TEXT CHECK (unit IN ('requests','tokens','usd','percent')),
  percent REAL NOT NULL DEFAULT 0,
  resets_at TEXT,
  reset_behavior TEXT NOT NULL DEFAULT 'zero' CHECK (reset_behavior IN ('zero','hold')),
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','api','unofficial','local')),
  alerted_for_reset TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (plan_id, key)
);

CREATE TABLE usage_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id INTEGER NOT NULL,
  bucket_key TEXT NOT NULL,
  percent REAL NOT NULL,
  used REAL,
  limit_value REAL,
  captured_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_snapshots_plan ON usage_snapshots(plan_id, bucket_key, captured_at);
"#;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "subscriptions_core",
            sql: MIGRATION_1_SQL,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "ai_usage",
            sql: MIGRATION_2_SQL,
            kind: MigrationKind::Up,
        },
    ];

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:subpulse.db", migrations)
                .build(),
        )
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_log::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            secrets::secret_set,
            secrets::secret_get,
            secrets::secret_delete
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
