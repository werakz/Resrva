-- Resrva database schema and seed data for MySQL / XAMPP.
CREATE DATABASE IF NOT EXISTS resrva
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE resrva;

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS activity_logs;
DROP TABLE IF EXISTS email_logs;
DROP TABLE IF EXISTS ai_assignment_logs;
DROP TABLE IF EXISTS booking_tables;
DROP TABLE IF EXISTS bookings;
DROP TABLE IF EXISTS venue_tables;
DROP TABLE IF EXISTS areas;
DROP TABLE IF EXISTS customers;
DROP TABLE IF EXISTS opening_hours;
DROP TABLE IF EXISTS settings;
DROP TABLE IF EXISTS users;
SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(160) NOT NULL UNIQUE,
  role ENUM('manager', 'customer') NOT NULL DEFAULT 'manager',
  password_hash VARCHAR(255) NOT NULL,
  status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL
) ENGINE=InnoDB;

CREATE TABLE customers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(160) NOT NULL UNIQUE,
  phone VARCHAR(30) NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL
) ENGINE=InnoDB;

CREATE TABLE areas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(20) NOT NULL UNIQUE,
  name VARCHAR(80) NOT NULL,
  table_start INT NOT NULL,
  table_end INT NOT NULL,
  function_enabled TINYINT(1) NOT NULL DEFAULT 0,
  active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0
) ENGINE=InnoDB;

CREATE TABLE venue_tables (
  id INT AUTO_INCREMENT PRIMARY KEY,
  area_id INT NOT NULL,
  table_number INT NOT NULL UNIQUE,
  capacity INT NOT NULL DEFAULT 8,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  CONSTRAINT fk_tables_area FOREIGN KEY (area_id) REFERENCES areas(id)
) ENGINE=InnoDB;

CREATE TABLE bookings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  booking_reference VARCHAR(30) NOT NULL UNIQUE,
  booking_type ENUM('table', 'function') NOT NULL,
  status ENUM('pending', 'confirmed', 'seated', 'completed', 'cancelled', 'no_show', 'approved', 'declined') NOT NULL,
  customer_id INT NOT NULL,
  guest_count INT NOT NULL,
  booking_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  preferred_area_id INT NULL,
  assigned_area_id INT NULL,
  notes TEXT NULL,
  staff_notes TEXT NULL,
  event_type VARCHAR(120) NULL,
  manager_message TEXT NULL,
  created_by_user_id INT NULL,
  updated_by_user_id INT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  CONSTRAINT fk_bookings_customer FOREIGN KEY (customer_id) REFERENCES customers(id),
  CONSTRAINT fk_bookings_preferred_area FOREIGN KEY (preferred_area_id) REFERENCES areas(id),
  CONSTRAINT fk_bookings_assigned_area FOREIGN KEY (assigned_area_id) REFERENCES areas(id),
  CONSTRAINT fk_bookings_created_by FOREIGN KEY (created_by_user_id) REFERENCES users(id),
  CONSTRAINT fk_bookings_updated_by FOREIGN KEY (updated_by_user_id) REFERENCES users(id),
  INDEX idx_bookings_lookup (booking_type, booking_date, status),
  INDEX idx_bookings_overlap (booking_date, start_time, end_time)
) ENGINE=InnoDB;

CREATE TABLE booking_tables (
  booking_id INT NOT NULL,
  table_id INT NOT NULL,
  PRIMARY KEY (booking_id, table_id),
  CONSTRAINT fk_booking_tables_booking FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
  CONSTRAINT fk_booking_tables_table FOREIGN KEY (table_id) REFERENCES venue_tables(id)
) ENGINE=InnoDB;

CREATE TABLE booking_function_areas (
  booking_id INT NOT NULL,
  area_id INT NOT NULL,
  PRIMARY KEY (booking_id, area_id),
  CONSTRAINT fk_booking_function_areas_booking FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
  CONSTRAINT fk_booking_function_areas_area FOREIGN KEY (area_id) REFERENCES areas(id)
) ENGINE=InnoDB;

CREATE TABLE ai_assignment_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  booking_id INT NOT NULL,
  suggested_area_id INT NULL,
  suggested_table_numbers_json JSON NOT NULL,
  explanation TEXT NOT NULL,
  rules_snapshot_json JSON NOT NULL,
  accepted_by_user_id INT NULL,
  accepted_at DATETIME NULL,
  final_table_numbers_json JSON NOT NULL,
  overridden TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL,
  CONSTRAINT fk_ai_booking FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
  CONSTRAINT fk_ai_area FOREIGN KEY (suggested_area_id) REFERENCES areas(id),
  CONSTRAINT fk_ai_user FOREIGN KEY (accepted_by_user_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE email_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  booking_id INT NULL,
  recipient_email VARCHAR(160) NOT NULL,
  subject VARCHAR(180) NOT NULL,
  body TEXT NOT NULL,
  status ENUM('logged', 'sent', 'failed') NOT NULL DEFAULT 'logged',
  created_at DATETIME NOT NULL,
  CONSTRAINT fk_email_booking FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE activity_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NULL,
  action VARCHAR(60) NOT NULL,
  entity_type VARCHAR(60) NOT NULL,
  entity_id INT NULL,
  details_json JSON NULL,
  created_at DATETIME NOT NULL,
  CONSTRAINT fk_activity_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE settings (
  setting_key VARCHAR(80) PRIMARY KEY,
  setting_value VARCHAR(255) NOT NULL,
  updated_at DATETIME NOT NULL
) ENGINE=InnoDB;

CREATE TABLE opening_hours (
  day_of_week TINYINT NOT NULL PRIMARY KEY,
  opens_at TIME NOT NULL,
  closes_at TIME NOT NULL,
  is_closed TINYINT(1) NOT NULL DEFAULT 0,
  updated_at DATETIME NOT NULL
) ENGINE=InnoDB;

INSERT INTO users (name, email, role, password_hash, status, created_at, updated_at)
VALUES
  ('Resrva Manager', 'manager@resrva.test', 'manager', '$2y$10$TFmxQt22rkg/nkg6ybGpeeCnbhpNSjIWwOVYeBdA7J77uhXEBwQMS', 'active', NOW(), NOW());

INSERT INTO areas (code, name, table_start, table_end, function_enabled, active, sort_order)
VALUES
  ('OSF', 'OSF', 1, 29, 0, 1, 10),
  ('SCHUMACK', 'Schumack', 30, 40, 1, 1, 20),
  ('WISTERIA', 'Wisteria', 41, 52, 1, 1, 30),
  ('STABLES', 'Stables', 53, 57, 0, 1, 40),
  ('KOOKABURRA', 'Kookaburra', 58, 60, 1, 1, 50),
  ('MAIN_BAR', 'Main Bar', 61, 73, 0, 1, 60);

DELIMITER //
CREATE PROCEDURE seed_area_tables(IN areaCode VARCHAR(20), IN firstTable INT, IN lastTable INT)
BEGIN
  DECLARE currentTable INT DEFAULT firstTable;
  DECLARE areaId INT;

  SELECT id INTO areaId FROM areas WHERE code = areaCode;

  WHILE currentTable <= lastTable DO
    INSERT INTO venue_tables (area_id, table_number, capacity, active, created_at, updated_at)
    VALUES (areaId, currentTable, 8, 1, NOW(), NOW());
    SET currentTable = currentTable + 1;
  END WHILE;
END//
DELIMITER ;

CALL seed_area_tables('OSF', 1, 29);
CALL seed_area_tables('SCHUMACK', 30, 40);
CALL seed_area_tables('WISTERIA', 41, 52);
CALL seed_area_tables('STABLES', 53, 57);
CALL seed_area_tables('KOOKABURRA', 58, 60);
CALL seed_area_tables('MAIN_BAR', 61, 73);
DROP PROCEDURE seed_area_tables;

INSERT INTO settings (setting_key, setting_value, updated_at)
VALUES
  ('min_table_guests', '8', NOW()),
  ('max_table_guests', '29', NOW()),
  ('default_duration_minutes', '120', NOW()),
  ('slot_interval_minutes', '30', NOW()),
  ('annual_closed_day', '12-25', NOW()),
  ('venue_name', 'Old Canberra Inn', NOW()),
  ('venue_phone', '(02) 6134 6000', NOW()),
  ('venue_email', 'manager@oldcanberrainn.com.au', NOW()),
  ('booking_policy_note', 'Online bookings are for groups of 8 or more. Smaller groups are welcome to walk in.', NOW());

INSERT INTO opening_hours (day_of_week, opens_at, closes_at, is_closed, updated_at)
VALUES
  (0, '12:00:00', '21:00:00', 0, NOW()),
  (1, '12:00:00', '21:30:00', 0, NOW()),
  (2, '12:00:00', '21:30:00', 0, NOW()),
  (3, '12:00:00', '21:30:00', 0, NOW()),
  (4, '12:00:00', '21:30:00', 0, NOW()),
  (5, '12:00:00', '22:00:00', 0, NOW()),
  (6, '12:00:00', '22:00:00', 0, NOW());
