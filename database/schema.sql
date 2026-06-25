-- Resrva database schema and seed data for MySQL / XAMPP.
CREATE DATABASE IF NOT EXISTS resrva
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE resrva;

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS activity_logs;
DROP TABLE IF EXISTS email_logs;
DROP TABLE IF EXISTS ai_assignment_candidates;
DROP TABLE IF EXISTS ai_assignment_logs;
DROP TABLE IF EXISTS booking_custom_answers;
DROP TABLE IF EXISTS booking_tables;
DROP TABLE IF EXISTS booking_function_areas;
DROP TABLE IF EXISTS bookings;
DROP TABLE IF EXISTS booking_custom_fields;
DROP TABLE IF EXISTS booking_sessions;
DROP TABLE IF EXISTS booking_type_schedules;
DROP TABLE IF EXISTS booking_types;
DROP TABLE IF EXISTS online_booking_blocks;
DROP TABLE IF EXISTS table_join_group_tables;
DROP TABLE IF EXISTS table_join_groups;
DROP TABLE IF EXISTS venue_tables;
DROP TABLE IF EXISTS areas;
DROP TABLE IF EXISTS customers;
DROP TABLE IF EXISTS opening_hours;
DROP TABLE IF EXISTS settings;
DROP TABLE IF EXISTS user_venues;
DROP TABLE IF EXISTS venues;
DROP TABLE IF EXISTS accounts;
DROP TABLE IF EXISTS users;
SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE accounts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  business_name VARCHAR(160) NOT NULL,
  plan VARCHAR(40) NOT NULL DEFAULT 'standard',
  billing_status VARCHAR(40) NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL
) ENGINE=InnoDB;

CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(160) NOT NULL UNIQUE,
  role ENUM('manager', 'customer') NOT NULL DEFAULT 'manager',
  password_hash VARCHAR(255) NOT NULL,
  status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  avatar_url VARCHAR(255) NULL,
  is_platform_admin TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL
) ENGINE=InnoDB;

CREATE TABLE venues (
  id INT AUTO_INCREMENT PRIMARY KEY,
  account_id INT NOT NULL,
  name VARCHAR(160) NOT NULL,
  slug VARCHAR(120) NOT NULL UNIQUE,
  timezone VARCHAR(80) NOT NULL DEFAULT 'Australia/Sydney',
  address VARCHAR(255) NULL,
  phone VARCHAR(40) NULL,
  email VARCHAR(160) NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  CONSTRAINT fk_venues_account FOREIGN KEY (account_id) REFERENCES accounts(id),
  INDEX idx_venues_account (account_id)
) ENGINE=InnoDB;

CREATE TABLE user_venues (
  user_id INT NOT NULL,
  venue_id INT NOT NULL,
  role ENUM('owner', 'manager', 'staff') NOT NULL DEFAULT 'manager',
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (user_id, venue_id),
  CONSTRAINT fk_user_venues_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_user_venues_venue FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE CASCADE,
  INDEX idx_user_venues_venue (venue_id)
) ENGINE=InnoDB;

CREATE TABLE customers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  venue_id INT NOT NULL,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(160) NOT NULL,
  phone VARCHAR(30) NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  CONSTRAINT fk_customers_venue FOREIGN KEY (venue_id) REFERENCES venues(id),
  UNIQUE KEY uniq_customers_venue_email (venue_id, email)
) ENGINE=InnoDB;

CREATE TABLE areas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  venue_id INT NOT NULL,
  code VARCHAR(20) NOT NULL,
  name VARCHAR(80) NOT NULL,
  table_start INT NOT NULL,
  table_end INT NOT NULL,
  function_enabled TINYINT(1) NOT NULL DEFAULT 0,
  auto_assign_enabled TINYINT(1) NOT NULL DEFAULT 1,
  allow_table_joins TINYINT(1) NOT NULL DEFAULT 1,
  max_joined_tables INT NULL DEFAULT 4,
  assignment_priority INT NOT NULL DEFAULT 0,
  preferred_min_guests INT NULL,
  preferred_max_guests INT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  CONSTRAINT fk_areas_venue FOREIGN KEY (venue_id) REFERENCES venues(id),
  UNIQUE KEY uniq_areas_venue_code (venue_id, code),
  INDEX idx_areas_venue (venue_id, active, sort_order)
) ENGINE=InnoDB;

CREATE TABLE venue_tables (
  id INT AUTO_INCREMENT PRIMARY KEY,
  venue_id INT NOT NULL,
  area_id INT NOT NULL,
  table_number INT NOT NULL,
  capacity INT NOT NULL DEFAULT 8,
  active TINYINT(1) NOT NULL DEFAULT 1,
  auto_assign_enabled TINYINT(1) NOT NULL DEFAULT 1,
  joinable TINYINT(1) NOT NULL DEFAULT 1,
  assignment_priority INT NOT NULL DEFAULT 0,
  preferred_min_guests INT NULL,
  preferred_max_guests INT NULL,
  keep_for_walkins TINYINT(1) NOT NULL DEFAULT 0,
  accessibility_friendly TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  CONSTRAINT fk_tables_venue FOREIGN KEY (venue_id) REFERENCES venues(id),
  CONSTRAINT fk_tables_area FOREIGN KEY (area_id) REFERENCES areas(id),
  UNIQUE KEY uniq_tables_venue_number (venue_id, table_number),
  INDEX idx_tables_venue_area (venue_id, area_id, active)
) ENGINE=InnoDB;

CREATE TABLE table_join_groups (
  id INT AUTO_INCREMENT PRIMARY KEY,
  venue_id INT NOT NULL,
  area_id INT NOT NULL,
  name VARCHAR(120) NOT NULL,
  max_tables INT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  priority INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  CONSTRAINT fk_table_join_groups_venue FOREIGN KEY (venue_id) REFERENCES venues(id),
  CONSTRAINT fk_table_join_groups_area FOREIGN KEY (area_id) REFERENCES areas(id) ON DELETE CASCADE,
  INDEX idx_table_join_groups_area (venue_id, area_id, active, priority)
) ENGINE=InnoDB;

CREATE TABLE table_join_group_tables (
  join_group_id INT NOT NULL,
  table_id INT NOT NULL,
  PRIMARY KEY (join_group_id, table_id),
  CONSTRAINT fk_table_join_group_tables_group FOREIGN KEY (join_group_id) REFERENCES table_join_groups(id) ON DELETE CASCADE,
  CONSTRAINT fk_table_join_group_tables_table FOREIGN KEY (table_id) REFERENCES venue_tables(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE booking_types (
  id INT AUTO_INCREMENT PRIMARY KEY,
  venue_id INT NOT NULL,
  name VARCHAR(120) NOT NULL,
  slug VARCHAR(90) NOT NULL,
  category ENUM('dining', 'event', 'function', 'custom') NOT NULL DEFAULT 'event',
  description TEXT NULL,
  customer_button_label VARCHAR(80) NULL,
  internal_label VARCHAR(80) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  display_to_customers TINYINT(1) NOT NULL DEFAULT 1,
  colour VARCHAR(20) NOT NULL DEFAULT '#276749',
  icon VARCHAR(40) NOT NULL DEFAULT 'calendar',
  capacity_mode ENUM('guests', 'bookings', 'tables', 'area') NOT NULL DEFAULT 'guests',
  min_guests INT NOT NULL DEFAULT 1,
  max_guests INT NULL,
  max_capacity INT NULL,
  max_bookings INT NULL,
  requires_approval TINYINT(1) NOT NULL DEFAULT 0,
  auto_confirm TINYINT(1) NOT NULL DEFAULT 1,
  allow_waitlist TINYINT(1) NOT NULL DEFAULT 0,
  booking_cutoff_minutes INT NOT NULL DEFAULT 0,
  booking_window_days INT NOT NULL DEFAULT 90,
  cancellation_cutoff_minutes INT NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  deleted_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  CONSTRAINT fk_booking_types_venue FOREIGN KEY (venue_id) REFERENCES venues(id),
  UNIQUE KEY uniq_booking_types_venue_slug (venue_id, slug),
  INDEX idx_booking_types_venue (venue_id, is_active, display_to_customers)
) ENGINE=InnoDB;

CREATE TABLE booking_type_schedules (
  id INT AUTO_INCREMENT PRIMARY KEY,
  booking_type_id INT NOT NULL,
  recurrence_type ENUM('none', 'daily', 'weekly', 'fortnightly', 'monthly', 'custom') NOT NULL DEFAULT 'weekly',
  day_of_week TINYINT NULL,
  day_of_month TINYINT NULL,
  start_time TIME NULL,
  end_time TIME NULL,
  arrival_time TIME NULL,
  duration_minutes INT NOT NULL DEFAULT 120,
  start_date DATE NULL,
  end_date DATE NULL,
  custom_dates_json JSON NULL,
  reserved_area_ids_json JSON NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  CONSTRAINT fk_booking_type_schedules_type FOREIGN KEY (booking_type_id) REFERENCES booking_types(id) ON DELETE CASCADE,
  INDEX idx_booking_type_schedules_type (booking_type_id)
) ENGINE=InnoDB;

CREATE TABLE booking_sessions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  booking_type_id INT NOT NULL,
  venue_id INT NOT NULL,
  date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  arrival_time TIME NULL,
  capacity INT NULL,
  booking_limit INT NULL,
  reserved_area_ids_json JSON NULL,
  status ENUM('active', 'cancelled') NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  CONSTRAINT fk_booking_sessions_type FOREIGN KEY (booking_type_id) REFERENCES booking_types(id),
  CONSTRAINT fk_booking_sessions_venue FOREIGN KEY (venue_id) REFERENCES venues(id),
  UNIQUE KEY uniq_booking_session (booking_type_id, date, start_time),
  INDEX idx_booking_sessions_lookup (booking_type_id, date, status),
  INDEX idx_sessions_venue_date (venue_id, date, status)
) ENGINE=InnoDB;

CREATE TABLE booking_custom_fields (
  id INT AUTO_INCREMENT PRIMARY KEY,
  booking_type_id INT NOT NULL,
  label VARCHAR(120) NOT NULL,
  field_type ENUM('text', 'dropdown', 'checkbox', 'number') NOT NULL DEFAULT 'text',
  is_required TINYINT(1) NOT NULL DEFAULT 0,
  options_json JSON NULL,
  display_order INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  CONSTRAINT fk_booking_custom_fields_type FOREIGN KEY (booking_type_id) REFERENCES booking_types(id) ON DELETE CASCADE,
  INDEX idx_booking_custom_fields_type (booking_type_id)
) ENGINE=InnoDB;

CREATE TABLE bookings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  venue_id INT NOT NULL,
  booking_reference VARCHAR(30) NOT NULL UNIQUE,
  booking_type ENUM('table', 'function', 'event') NOT NULL,
  booking_type_id INT NULL,
  booking_session_id INT NULL,
  status ENUM('pending', 'waitlist', 'confirmed', 'seated', 'completed', 'cancelled', 'declined', 'no_show') NOT NULL,
  customer_id INT NOT NULL,
  customer_name_snapshot VARCHAR(120) NULL,
  customer_email_snapshot VARCHAR(160) NULL,
  customer_phone_snapshot VARCHAR(30) NULL,
  guest_count INT NOT NULL,
  booking_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  preferred_area_id INT NULL,
  assigned_area_id INT NULL,
  table_marked TINYINT(1) NOT NULL DEFAULT 0,
  notes TEXT NULL,
  staff_notes TEXT NULL,
  staff_name VARCHAR(120) NULL,
  event_type VARCHAR(120) NULL,
  manager_message TEXT NULL,
  created_by_user_id INT NULL,
  updated_by_user_id INT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  CONSTRAINT fk_bookings_venue FOREIGN KEY (venue_id) REFERENCES venues(id),
  CONSTRAINT fk_bookings_customer FOREIGN KEY (customer_id) REFERENCES customers(id),
  CONSTRAINT fk_bookings_booking_type FOREIGN KEY (booking_type_id) REFERENCES booking_types(id),
  CONSTRAINT fk_bookings_booking_session FOREIGN KEY (booking_session_id) REFERENCES booking_sessions(id),
  CONSTRAINT fk_bookings_preferred_area FOREIGN KEY (preferred_area_id) REFERENCES areas(id),
  CONSTRAINT fk_bookings_assigned_area FOREIGN KEY (assigned_area_id) REFERENCES areas(id),
  CONSTRAINT fk_bookings_created_by FOREIGN KEY (created_by_user_id) REFERENCES users(id),
  CONSTRAINT fk_bookings_updated_by FOREIGN KEY (updated_by_user_id) REFERENCES users(id),
  INDEX idx_bookings_lookup (booking_type, booking_date, status),
  INDEX idx_bookings_venue_date (venue_id, booking_date, status),
  INDEX idx_bookings_overlap (booking_date, start_time, end_time),
  INDEX idx_bookings_booking_type_id (booking_type_id),
  INDEX idx_bookings_booking_session_id (booking_session_id)
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

CREATE TABLE booking_custom_answers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  booking_id INT NOT NULL,
  field_id INT NULL,
  field_label_snapshot VARCHAR(120) NOT NULL,
  answer TEXT NOT NULL,
  created_at DATETIME NOT NULL,
  CONSTRAINT fk_booking_custom_answers_booking FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
  CONSTRAINT fk_booking_custom_answers_field FOREIGN KEY (field_id) REFERENCES booking_custom_fields(id) ON DELETE SET NULL,
  INDEX idx_booking_custom_answers_booking (booking_id)
) ENGINE=InnoDB;

CREATE TABLE ai_assignment_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  venue_id INT NOT NULL,
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
  CONSTRAINT fk_ai_venue FOREIGN KEY (venue_id) REFERENCES venues(id),
  CONSTRAINT fk_ai_booking FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
  CONSTRAINT fk_ai_area FOREIGN KEY (suggested_area_id) REFERENCES areas(id),
  CONSTRAINT fk_ai_user FOREIGN KEY (accepted_by_user_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE ai_assignment_candidates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  venue_id INT NOT NULL,
  assignment_log_id INT NOT NULL,
  booking_id INT NOT NULL,
  candidate_rank INT NOT NULL,
  area_id INT NULL,
  table_ids_json JSON NOT NULL,
  table_numbers_json JSON NOT NULL,
  capacity INT NOT NULL,
  score DECIMAL(10,2) NOT NULL,
  selected TINYINT(1) NOT NULL DEFAULT 0,
  feature_snapshot_json JSON NOT NULL,
  created_at DATETIME NOT NULL,
  CONSTRAINT fk_ai_candidate_venue FOREIGN KEY (venue_id) REFERENCES venues(id),
  CONSTRAINT fk_ai_candidate_log FOREIGN KEY (assignment_log_id) REFERENCES ai_assignment_logs(id) ON DELETE CASCADE,
  CONSTRAINT fk_ai_candidate_booking FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
  CONSTRAINT fk_ai_candidate_area FOREIGN KEY (area_id) REFERENCES areas(id),
  INDEX idx_ai_assignment_candidates_booking (booking_id),
  INDEX idx_ai_assignment_candidates_log (assignment_log_id)
) ENGINE=InnoDB;

CREATE TABLE email_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  venue_id INT NOT NULL,
  booking_id INT NULL,
  recipient_email VARCHAR(160) NOT NULL,
  subject VARCHAR(180) NOT NULL,
  body TEXT NOT NULL,
  status ENUM('logged', 'sent', 'failed') NOT NULL DEFAULT 'logged',
  created_at DATETIME NOT NULL,
  CONSTRAINT fk_email_venue FOREIGN KEY (venue_id) REFERENCES venues(id),
  CONSTRAINT fk_email_booking FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE activity_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  venue_id INT NOT NULL,
  user_id INT NULL,
  action VARCHAR(60) NOT NULL,
  entity_type VARCHAR(60) NOT NULL,
  entity_id INT NULL,
  details_json JSON NULL,
  created_at DATETIME NOT NULL,
  CONSTRAINT fk_activity_venue FOREIGN KEY (venue_id) REFERENCES venues(id),
  CONSTRAINT fk_activity_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE settings (
  venue_id INT NOT NULL,
  setting_key VARCHAR(80) NOT NULL,
  setting_value VARCHAR(255) NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (venue_id, setting_key),
  CONSTRAINT fk_settings_venue FOREIGN KEY (venue_id) REFERENCES venues(id)
) ENGINE=InnoDB;

CREATE TABLE opening_hours (
  venue_id INT NOT NULL,
  day_of_week TINYINT NOT NULL,
  opens_at TIME NOT NULL,
  closes_at TIME NOT NULL,
  is_closed TINYINT(1) NOT NULL DEFAULT 0,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (venue_id, day_of_week),
  CONSTRAINT fk_opening_hours_venue FOREIGN KEY (venue_id) REFERENCES venues(id)
) ENGINE=InnoDB;

CREATE TABLE online_booking_blocks (
  venue_id INT NOT NULL,
  block_date DATE NOT NULL,
  created_by_user_id INT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (venue_id, block_date),
  CONSTRAINT fk_online_booking_blocks_venue FOREIGN KEY (venue_id) REFERENCES venues(id),
  CONSTRAINT fk_online_booking_blocks_created_by FOREIGN KEY (created_by_user_id) REFERENCES users(id)
) ENGINE=InnoDB;

INSERT INTO accounts (business_name, plan, billing_status, created_at, updated_at)
VALUES
  ('Old Canberra Inn', 'standard', 'active', NOW(), NOW());

INSERT INTO users (name, email, role, password_hash, status, avatar_url, is_platform_admin, created_at, updated_at)
VALUES
  ('Resrva Admin', 'admin@resrva.test', 'manager', '$2y$10$TFmxQt22rkg/nkg6ybGpeeCnbhpNSjIWwOVYeBdA7J77uhXEBwQMS', 'active', NULL, 1, NOW(), NOW());

INSERT INTO venues (account_id, name, slug, timezone, address, phone, email, active, created_at, updated_at)
VALUES
  (1, 'Old Canberra Inn', 'old-canberra-inn', 'Australia/Sydney', '', '(02) 6134 6000', 'manager@oldcanberrainn.com.au', 1, NOW(), NOW());

INSERT INTO user_venues (user_id, venue_id, role, created_at, updated_at)
VALUES
  (1, 1, 'owner', NOW(), NOW());

INSERT INTO areas (venue_id, code, name, table_start, table_end, function_enabled, active, sort_order)
VALUES
  (1, 'OSF', 'OSF', 1, 29, 0, 1, 10),
  (1, 'SCHUMACK', 'Schumack', 30, 40, 1, 1, 20),
  (1, 'WISTERIA', 'Wisteria', 41, 52, 1, 1, 30),
  (1, 'STABLES', 'Stables', 53, 57, 0, 1, 40),
  (1, 'KOOKABURRA', 'Kookaburra', 58, 60, 1, 1, 50),
  (1, 'MAIN_BAR', 'Main Bar', 61, 73, 0, 1, 60);

DELIMITER //
CREATE PROCEDURE seed_area_tables(IN areaCode VARCHAR(20), IN firstTable INT, IN lastTable INT)
BEGIN
  DECLARE currentTable INT DEFAULT firstTable;
  DECLARE areaId INT;

  SELECT id INTO areaId FROM areas WHERE venue_id = 1 AND code = areaCode;

  WHILE currentTable <= lastTable DO
    INSERT INTO venue_tables (venue_id, area_id, table_number, capacity, active, created_at, updated_at)
    VALUES (1, areaId, currentTable, 8, 1, NOW(), NOW());
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

INSERT INTO table_join_groups (venue_id, area_id, name, max_tables, active, priority, created_at, updated_at)
SELECT venue_id, id, CONCAT(name, ' join group'), 4, 1, sort_order, NOW(), NOW()
FROM areas;

INSERT INTO table_join_group_tables (join_group_id, table_id)
SELECT tjg.id, vt.id
FROM table_join_groups tjg
JOIN venue_tables vt ON vt.area_id = tjg.area_id;

INSERT INTO settings (venue_id, setting_key, setting_value, updated_at)
VALUES
  (1, 'min_table_guests', '8', NOW()),
  (1, 'max_table_guests', '29', NOW()),
  (1, 'default_duration_minutes', '120', NOW()),
  (1, 'slot_interval_minutes', '30', NOW()),
  (1, 'minimum_booking_notice_minutes', '0', NOW()),
  (1, 'annual_closed_day', '12-25', NOW()),
  (1, 'annual_closed_days', '12-25', NOW()),
  (1, 'venue_name', 'Old Canberra Inn', NOW()),
  (1, 'venue_phone', '(02) 6134 6000', NOW()),
  (1, 'venue_email', 'manager@oldcanberrainn.com.au', NOW()),
  (1, 'venue_image_url', '', NOW()),
  (1, 'brand_color', '#276749', NOW()),
  (1, 'online_table_bookings_enabled', '1', NOW()),
  (1, 'online_function_requests_enabled', '1', NOW()),
  (1, 'auto_assignment_enabled', '1', NOW()),
  (1, 'booking_policy_note', 'Online bookings are for groups of 8 or more. Smaller groups are welcome to walk in.', NOW());

INSERT INTO booking_types
  (venue_id, name, slug, category, description, customer_button_label, internal_label, is_active,
   display_to_customers, colour, icon, capacity_mode, min_guests, max_guests, max_capacity,
   max_bookings, requires_approval, auto_confirm, allow_waitlist, booking_cutoff_minutes,
   booking_window_days, cancellation_cutoff_minutes, sort_order, created_at, updated_at)
VALUES
  (1, 'Lunch', 'lunch', 'dining', 'Standard lunch table bookings.', 'Lunch', 'Lunch', 1,
   1, '#276749', 'sun', 'tables', 8, 29, NULL, NULL, 0, 1, 0, 0, 90, 0, 10, NOW(), NOW()),
  (1, 'Dinner', 'dinner', 'dining', 'Standard dinner table bookings.', 'Dinner', 'Dinner', 1,
   1, '#c47f2c', 'moon', 'tables', 8, 29, NULL, NULL, 0, 1, 0, 0, 90, 0, 20, NOW(), NOW()),
  (1, 'Function Enquiry', 'function-enquiry', 'function', 'Larger groups and private event enquiries.', 'Function Enquiry', 'Functions', 1,
   1, '#2f80ed', 'wine', 'area', 8, 200, NULL, NULL, 1, 0, 0, 0, 90, 0, 30, NOW(), NOW()),
  (1, 'Trivia Night', 'trivia-night', 'event', 'Join us every Wednesday for pub trivia.', 'Book Trivia', 'Trivia', 1,
   1, '#4f8f5d', 'help-circle', 'guests', 2, 10, 80, NULL, 0, 1, 1, 120, 90, 240, 40, NOW(), NOW());

INSERT INTO booking_type_schedules
  (booking_type_id, recurrence_type, day_of_week, start_time, end_time, arrival_time,
   duration_minutes, start_date, end_date, created_at, updated_at)
SELECT id, 'weekly', 3, '19:00:00', '21:30:00', '18:30:00', 150, NULL, NULL, NOW(), NOW()
FROM booking_types
WHERE venue_id = 1 AND slug = 'trivia-night';

INSERT INTO booking_custom_fields
  (booking_type_id, label, field_type, is_required, options_json, display_order, created_at, updated_at)
SELECT id, 'Team name', 'text', 1, NULL, 10, NOW(), NOW()
FROM booking_types
WHERE venue_id = 1 AND slug = 'trivia-night';

INSERT INTO opening_hours (venue_id, day_of_week, opens_at, closes_at, is_closed, updated_at)
VALUES
  (1, 0, '12:00:00', '21:00:00', 0, NOW()),
  (1, 1, '12:00:00', '21:30:00', 0, NOW()),
  (1, 2, '12:00:00', '21:30:00', 0, NOW()),
  (1, 3, '12:00:00', '21:30:00', 0, NOW()),
  (1, 4, '12:00:00', '21:30:00', 0, NOW()),
  (1, 5, '12:00:00', '22:00:00', 0, NOW()),
  (1, 6, '12:00:00', '22:00:00', 0, NOW());
