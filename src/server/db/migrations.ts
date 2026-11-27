// src/server/db/migrations.ts
/**
 * Admin-owned schema. Append only. The member app never touches these tables.
 * Times are epoch ms. Staff ids are copied from `users.id` (see import-staff.ts), so `employees.id`
 * is also the value historical `actor_id` / `created_by` columns hold.
 */
export interface Migration {
  version: number;
  name: string;
  statements: string[];
}

const T = "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci";

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: "employee schema",
    statements: [
      `CREATE TABLE IF NOT EXISTS employee_roles (
        id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(60) NOT NULL,
        description VARCHAR(200) NOT NULL DEFAULT '',
        permissions TEXT NOT NULL,
        is_owner TINYINT(1) NOT NULL DEFAULT 0,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL,
        UNIQUE KEY employee_roles_name (name)
      ) ${T}`,
      `CREATE TABLE IF NOT EXISTS employees (
        id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(40) NOT NULL,
        password_hash VARCHAR(200) NOT NULL,
        name VARCHAR(100) NOT NULL DEFAULT '',
        status ENUM('active','suspended') NOT NULL DEFAULT 'active',
        employee_role_id INT NULL,
        totp_secret VARCHAR(64) NULL,
        totp_enabled TINYINT(1) NOT NULL DEFAULT 0,
        totp_last_step BIGINT NULL,
        must_change_password TINYINT(1) NOT NULL DEFAULT 0,
        note VARCHAR(255) NULL,
        created_at BIGINT NOT NULL,
        last_login_at BIGINT NULL,
        last_ip VARCHAR(45) NULL,
        UNIQUE KEY employees_username (username),
        CONSTRAINT employees_role_fk FOREIGN KEY (employee_role_id) REFERENCES employee_roles (id)
      ) ${T}`,
      `CREATE TABLE IF NOT EXISTS employee_sessions (
        token_hash CHAR(64) NOT NULL PRIMARY KEY,
        employee_id INT NOT NULL,
        created_at BIGINT NOT NULL,
        expires_at BIGINT NOT NULL,
        last_seen_at BIGINT NOT NULL,
        ip VARCHAR(45) NULL,
        user_agent VARCHAR(255) NULL,
        KEY employee_sessions_employee (employee_id),
        KEY employee_sessions_expires (expires_at),
        CONSTRAINT employee_sessions_fk FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE
      ) ${T}`,
      `CREATE TABLE IF NOT EXISTS employee_session_ends (
        token_hash CHAR(64) NOT NULL PRIMARY KEY,
        employee_id INT NOT NULL,
        reason VARCHAR(20) NOT NULL,
        ended_at BIGINT NOT NULL,
        by_ip VARCHAR(45) NULL,
        KEY employee_session_ends_at (ended_at),
        KEY employee_session_ends_employee (employee_id)
      ) ${T}`,
      `CREATE TABLE IF NOT EXISTS employee_login_challenges (
        token_hash CHAR(64) NOT NULL PRIMARY KEY,
        employee_id INT NOT NULL,
        next_path VARCHAR(200) NOT NULL DEFAULT '/',
        attempts INT NOT NULL DEFAULT 0,
        expires_at BIGINT NOT NULL,
        KEY employee_login_challenges_expires (expires_at),
        CONSTRAINT employee_login_challenges_fk FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE
      ) ${T}`,
      `CREATE TABLE IF NOT EXISTS employee_login_attempts (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        identifier VARCHAR(100) NOT NULL,
        ip VARCHAR(45) NULL,
        at BIGINT NOT NULL,
        KEY employee_login_attempts_ident (identifier, at),
        KEY employee_login_attempts_ip (ip, at)
      ) ${T}`,
      `CREATE TABLE IF NOT EXISTS employee_auth_log (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        employee_id INT NULL,
        identifier VARCHAR(100) NULL,
        event VARCHAR(30) NOT NULL,
        ip VARCHAR(45) NULL,
        user_agent VARCHAR(255) NULL,
        created_at BIGINT NOT NULL,
        KEY employee_auth_log_employee (employee_id, created_at),
        KEY employee_auth_log_created (created_at)
      ) ${T}`,
    ],
  },
  {
    version: 2,
    name: "employee avatar",
    statements: ["ALTER TABLE employees ADD COLUMN IF NOT EXISTS avatar VARCHAR(16) NULL"],
  },
  {
    // A deleted account keeps its row, so history still names who did what.
    version: 3,
    name: "employee deletion",
    statements: ["ALTER TABLE employees ADD COLUMN IF NOT EXISTS deleted_at BIGINT NULL"],
  },
];

/** Every table this app creates, children first (tests truncate and drop in this order). */
export const APP_TABLES = [
  "employee_auth_log",
  "employee_login_attempts",
  "employee_login_challenges",
  "employee_session_ends",
  "employee_sessions",
  "employees",
  "employee_roles",
  "schema_migrations_admin",
] as const;
