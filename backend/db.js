const mysql = require("mysql2/promise");
const dotenv = require("dotenv");

dotenv.config();

// Connection for DB creation and queries
const DB_CONFIG = {
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
};

const DB_NAME = process.env.DB_NAME || "tracewrite";

// Main pool used by controllers/services for app queries.
const pool = mysql.createPool({
  ...DB_CONFIG,
  database: DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

async function query(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

// Create DB once if it does not exist yet.
async function ensureDatabaseExists() {
  const connection = await mysql.createConnection(DB_CONFIG);
  try {
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\``);
  } finally {
    await connection.end();
  }
}

async function ensureBaseTables() {
  await query(
    `CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      email VARCHAR(190) NOT NULL UNIQUE,
      password VARCHAR(255) NOT NULL,
      email_verified TINYINT(1) NOT NULL DEFAULT 0,
      mfa_enabled TINYINT(1) NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`
  );

  await query(
    `CREATE TABLE IF NOT EXISTS projects (
      id INT AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(200) NOT NULL,
      description TEXT,
      owner_id INT NOT NULL,
      total_pages INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_projects_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
    )`
  );

  await query(
    `CREATE TABLE IF NOT EXISTS project_members (
      id INT AUTO_INCREMENT PRIMARY KEY,
      project_id INT NOT NULL,
      user_id INT NOT NULL,
      role ENUM('Owner', 'Editor', 'Viewer') NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_project_user (project_id, user_id),
      CONSTRAINT fk_pm_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      CONSTRAINT fk_pm_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`
  );

  await query(
    `CREATE TABLE IF NOT EXISTS pages (
      id INT AUTO_INCREMENT PRIMARY KEY,
      project_id INT NOT NULL,
      page_number INT NOT NULL,
      content MEDIUMTEXT,
      last_edited_by INT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_project_page (project_id, page_number),
      CONSTRAINT fk_pages_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      CONSTRAINT fk_pages_editor FOREIGN KEY (last_edited_by) REFERENCES users(id) ON DELETE SET NULL
    )`
  );

  await query(
    `CREATE TABLE IF NOT EXISTS chat_messages (
      id INT AUTO_INCREMENT PRIMARY KEY,
      project_id INT NOT NULL,
      user_id INT NOT NULL,
      message TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_chat_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      CONSTRAINT fk_chat_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`
  );

  await query(
    `CREATE TABLE IF NOT EXISTS contribution_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      project_id INT NOT NULL,
      page_number INT NOT NULL,
      action_type VARCHAR(40) NOT NULL,
      word_count INT DEFAULT 0,
      time_spent INT DEFAULT 0,
      timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_cl_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_cl_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    )`
  );
}

// Add migration-safe tables/columns introduced after the initial schema.
async function ensureSchema() {
  await query(
    `ALTER TABLE users
     ADD COLUMN IF NOT EXISTS email_verified TINYINT(1) NOT NULL DEFAULT 0`
  );

  await query(
    `ALTER TABLE users
     ADD COLUMN IF NOT EXISTS mfa_enabled TINYINT(1) NOT NULL DEFAULT 0`
  );

  await query(
    `CREATE TABLE IF NOT EXISTS otp_codes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      email VARCHAR(190) NOT NULL,
      purpose ENUM('email_verify', 'mfa_login') NOT NULL,
      challenge_token VARCHAR(120) NULL,
      otp_hash VARCHAR(255) NOT NULL,
      attempts INT NOT NULL DEFAULT 0,
      expires_at DATETIME NOT NULL,
      consumed_at DATETIME NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      KEY idx_otp_email_purpose (email, purpose),
      UNIQUE KEY uniq_challenge_token (challenge_token),
      CONSTRAINT fk_otp_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`
  );

  await query(
    `CREATE TABLE IF NOT EXISTS project_documents (
      id INT AUTO_INCREMENT PRIMARY KEY,
      project_id INT NOT NULL UNIQUE,
      content MEDIUMTEXT,
      updated_by INT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_pd_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      CONSTRAINT fk_pd_user FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
    )`
  );

  await query(
    `CREATE TABLE IF NOT EXISTS direct_messages (
      id INT AUTO_INCREMENT PRIMARY KEY,
      from_user_id INT NOT NULL,
      to_user_id INT NOT NULL,
      message TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_dm_from_user FOREIGN KEY (from_user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_dm_to_user FOREIGN KEY (to_user_id) REFERENCES users(id) ON DELETE CASCADE
    )`
  );

  await query(
    `CREATE TABLE IF NOT EXISTS project_invitations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      project_id INT NOT NULL,
      inviter_id INT NOT NULL,
      invitee_id INT NOT NULL,
      role ENUM('Editor', 'Viewer') NOT NULL,
      status ENUM('Pending', 'Accepted', 'Rejected') DEFAULT 'Pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      responded_at TIMESTAMP NULL,
      KEY idx_invitee_status (invitee_id, status),
      CONSTRAINT fk_pi_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      CONSTRAINT fk_pi_inviter FOREIGN KEY (inviter_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_pi_invitee FOREIGN KEY (invitee_id) REFERENCES users(id) ON DELETE CASCADE
    )`
  );
}

// Single initialization entry used at server startup.
async function initDatabase() {
  await ensureDatabaseExists();
  await ensureBaseTables();
  await ensureSchema();
}

module.exports = { pool, query, ensureSchema, initDatabase };
