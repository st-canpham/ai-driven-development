-- Read-only user for the MySQL MCP server (L2: least privilege).
-- Runs only when the mysql-data volume is created for the first time.
-- Covers `booking` and per-worktree schemas such as `booking_feat_x` (L4).
CREATE USER IF NOT EXISTS 'booking_ro'@'%' IDENTIFIED BY 'booking_ro';
GRANT SELECT, SHOW VIEW ON `booking%`.* TO 'booking_ro'@'%';
FLUSH PRIVILEGES;
