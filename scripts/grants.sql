-- Database users for the split member / admin apps (spec §1 "DB user และสิทธิ์").
--
-- Run once as a MariaDB administrator, AFTER the member app's migrations have created its tables
-- (a table-level GRANT without CREATE needs the table to exist):
--   mariadb -u root -p < scripts/grants.sql
-- Before running: replace the database name `lotto` everywhere (sed 's/lotto\./yourdb./g') and both
-- passwords. Never grant `ON lotto.*`: that would cover the other app's tables.
--
-- Keep in sync with the admin source: `node scripts/check-grants.mjs` fails when a table is granted
-- that the code no longer uses, the code uses a table or verb that is not granted, or chok_member
-- is given an admin-owned table. Re-run it after any change to SQL in src/.

CREATE USER IF NOT EXISTS 'chok_admin'@'%' IDENTIFIED BY 'CHANGE-ME-ADMIN';
CREATE USER IF NOT EXISTS 'chok_member'@'%' IDENTIFIED BY 'CHANGE-ME-MEMBER';

-- =====================================================================================
-- chok_admin (the back office, this repo)
-- Table list = every table the admin source names in FROM / JOIN / INTO / UPDATE / DELETE FROM.
-- Verbs = only the ones that source runs on that table (see the README matrix). Named locks
-- (GET_LOCK) and SET FOREIGN_KEY_CHECKS need no grant. MariaDB lets SELECT ... FOR UPDATE run with
-- SELECT; every table locked that way also has an UPDATE grant here.
-- =====================================================================================

-- Admin-owned tables: created and migrated by this app (src/server/db/migrations.ts), full rights.
-- ALL includes CREATE, so these grants work before the admin migrator has created the tables.
-- audit_log is still created by the member migrations; ownership moves to admin at the switch.
GRANT ALL ON lotto.employee_roles TO 'chok_admin'@'%';
GRANT ALL ON lotto.employees TO 'chok_admin'@'%';
GRANT ALL ON lotto.employee_sessions TO 'chok_admin'@'%';
GRANT ALL ON lotto.employee_session_ends TO 'chok_admin'@'%';
GRANT ALL ON lotto.employee_login_challenges TO 'chok_admin'@'%';
GRANT ALL ON lotto.employee_login_attempts TO 'chok_admin'@'%';
GRANT ALL ON lotto.employee_auth_log TO 'chok_admin'@'%';
GRANT ALL ON lotto.schema_migrations_admin TO 'chok_admin'@'%';
GRANT ALL ON lotto.audit_log TO 'chok_admin'@'%';

-- Shared business tables, read only (reports, dashboards, member detail).
GRANT SELECT ON lotto.game_catalog TO 'chok_admin'@'%';
GRANT SELECT ON lotto.game_moves TO 'chok_admin'@'%';
GRANT SELECT ON lotto.game_txns TO 'chok_admin'@'%';
GRANT SELECT ON lotto.voucher_redemptions TO 'chok_admin'@'%';
-- wheel_spins: the copied activities.spinWheel inserts here, but it is member-facing and nothing
-- in production calls it (only activities.test.ts), so admin only reads.
GRANT SELECT ON lotto.wheel_spins TO 'chok_admin'@'%';
-- staff_roles: read once by `npm run db -- import-staff` (legacy staff roles, member-owned). The contract
-- migration (member migration 9) drops this table; to re-run this file after it, delete both staff_roles lines.
GRANT SELECT ON lotto.staff_roles TO 'chok_admin'@'%';

-- Append-only ledgers: admin adds rows, never changes or removes them.
GRANT SELECT, INSERT ON lotto.transactions TO 'chok_admin'@'%';
GRANT SELECT, INSERT ON lotto.bank_account_moves TO 'chok_admin'@'%';
GRANT SELECT, INSERT ON lotto.point_moves TO 'chok_admin'@'%';
GRANT SELECT, INSERT ON lotto.promotion_claims TO 'chok_admin'@'%';

-- Status changes only (approve/reject, settle, edit): no INSERT, no DELETE.
GRANT SELECT, UPDATE ON lotto.bills TO 'chok_admin'@'%';
GRANT SELECT, UPDATE ON lotto.bill_items TO 'chok_admin'@'%';
GRANT SELECT, UPDATE ON lotto.deposits TO 'chok_admin'@'%';
GRANT SELECT, UPDATE ON lotto.withdrawals TO 'chok_admin'@'%';
GRANT SELECT, UPDATE ON lotto.lottos TO 'chok_admin'@'%';
GRANT SELECT, UPDATE ON lotto.game_products TO 'chok_admin'@'%';
-- point_guesses: settlement updates status; INSERT only in the unused member-facing placeGuess.
GRANT SELECT, UPDATE ON lotto.point_guesses TO 'chok_admin'@'%';

-- Created and edited by admin (soft-deleted or archived, never DELETEd).
GRANT SELECT, INSERT, UPDATE ON lotto.rounds TO 'chok_admin'@'%';
GRANT SELECT, INSERT, UPDATE ON lotto.bank_accounts TO 'chok_admin'@'%';
GRANT SELECT, INSERT, UPDATE ON lotto.blocklist TO 'chok_admin'@'%';
GRANT SELECT, INSERT, UPDATE ON lotto.promotions TO 'chok_admin'@'%';
GRANT SELECT, INSERT, UPDATE ON lotto.vouchers TO 'chok_admin'@'%';
-- Upserts (INSERT ... ON DUPLICATE KEY UPDATE needs both verbs).
GRANT SELECT, INSERT, UPDATE ON lotto.settings TO 'chok_admin'@'%';
GRANT SELECT, INSERT, UPDATE ON lotto.member_points TO 'chok_admin'@'%';
-- system_status: scheduler heartbeat and audit-chain status.
GRANT SELECT, INSERT, UPDATE ON lotto.system_status TO 'chok_admin'@'%';

-- Edited and hard-deleted by admin.
GRANT SELECT, INSERT, UPDATE, DELETE ON lotto.banners TO 'chok_admin'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON lotto.news TO 'chok_admin'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON lotto.manual_limits TO 'chok_admin'@'%';
-- rate_limits: login throttle (upsert + purge of old windows).
GRANT SELECT, INSERT, UPDATE, DELETE ON lotto.rate_limits TO 'chok_admin'@'%';
-- media: slip / banner uploads when MongoDB is not configured (insert, read, delete).
GRANT SELECT, INSERT, DELETE ON lotto.media TO 'chok_admin'@'%';
-- exposures: settlement clears a settled round's exposure rows.
GRANT SELECT, DELETE ON lotto.exposures TO 'chok_admin'@'%';

-- Member sessions: revokeAllMemberSessions (src/server/services/member-sessions.ts) signs a member
-- out when admin suspends, closes or resets them. It reads + deletes `sessions` and records why
-- in `session_ends` (INSERT IGNORE ... SELECT FROM sessions).
GRANT SELECT, DELETE ON lotto.sessions TO 'chok_admin'@'%';
GRANT INSERT ON lotto.session_ends TO 'chok_admin'@'%';

-- users: read everything (member list, import-staff reads the legacy staff columns), UPDATE only
-- the columns the admin source sets:
--   balance, cashback_balance, affiliate_balance   wallet.move, settlement.applyDeltas
--   turnover_required                              settlement, finance (promotions), activities
--   first_deposit_at                               finance.approveDeposit
--   name, phone, bank_code, bank_account, bank_name members.updateMember
--   status, closed_at, closed_by, close_reason     members.closeMember/reopenMember, actions/admin (status)
--   password_hash                                  actions/admin (reset member password)
--   staff_note                                     actions/admin (member note)
-- No INSERT and no DELETE: admin never creates or removes member accounts.
GRANT SELECT ON lotto.users TO 'chok_admin'@'%';
GRANT UPDATE (balance, cashback_balance, affiliate_balance, turnover_required, first_deposit_at,
  name, phone, bank_code, bank_account, bank_name, status, closed_at, closed_by, close_reason,
  password_hash, staff_note) ON lotto.users TO 'chok_admin'@'%';

-- Not granted to chok_admin (the admin source never touches them): auth_log, game_daily, game_days,
-- games, login_attempts, login_challenges, number_sets, otps, ref_clicks, schema_migrations.

-- =====================================================================================
-- chok_member (the member site, ../chokprathan)
-- Every table its migrations create (src/server/db/migrations.ts CREATE TABLE list, plus
-- schema_migrations from migrate.ts) EXCEPT the admin-owned employee_*, audit_log and
-- schema_migrations_admin. DML only.
--
-- The member app owns its schema and migrates on startup, which needs CREATE, ALTER, INDEX, DROP and
-- REFERENCES. Those are NOT granted here: at database level they would also cover the admin tables.
-- In production run the member migrations with a separate privileged migration user
-- (e.g. `DATABASE_URL=mysql://chok_migrate:...@.../lotto npm run db -- migrate` in the member repo)
-- and start the member app with DB_AUTO_MIGRATE=false; otherwise its startup migrate() fails on
-- `CREATE TABLE IF NOT EXISTS schema_migrations` and the scheduler does not start.
-- (The contract migration keeps users.role and users.staff_note and drops only staff_role_id, totp_* and
-- must_change_password, which no grant here names; the users grants stay as they are.)
-- =====================================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON lotto.auth_log TO 'chok_member'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON lotto.bank_account_moves TO 'chok_member'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON lotto.bank_accounts TO 'chok_member'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON lotto.banners TO 'chok_member'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON lotto.bill_items TO 'chok_member'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON lotto.bills TO 'chok_member'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON lotto.blocklist TO 'chok_member'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON lotto.deposits TO 'chok_member'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON lotto.exposures TO 'chok_member'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON lotto.game_catalog TO 'chok_member'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON lotto.game_daily TO 'chok_member'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON lotto.game_days TO 'chok_member'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON lotto.game_moves TO 'chok_member'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON lotto.game_products TO 'chok_member'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON lotto.game_txns TO 'chok_member'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON lotto.games TO 'chok_member'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON lotto.login_attempts TO 'chok_member'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON lotto.login_challenges TO 'chok_member'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON lotto.lottos TO 'chok_member'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON lotto.manual_limits TO 'chok_member'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON lotto.media TO 'chok_member'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON lotto.member_points TO 'chok_member'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON lotto.news TO 'chok_member'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON lotto.number_sets TO 'chok_member'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON lotto.otps TO 'chok_member'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON lotto.point_guesses TO 'chok_member'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON lotto.point_moves TO 'chok_member'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON lotto.promotion_claims TO 'chok_member'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON lotto.promotions TO 'chok_member'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON lotto.rate_limits TO 'chok_member'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON lotto.ref_clicks TO 'chok_member'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON lotto.rounds TO 'chok_member'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON lotto.schema_migrations TO 'chok_member'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON lotto.session_ends TO 'chok_member'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON lotto.sessions TO 'chok_member'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON lotto.settings TO 'chok_member'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON lotto.staff_roles TO 'chok_member'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON lotto.system_status TO 'chok_member'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON lotto.transactions TO 'chok_member'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON lotto.users TO 'chok_member'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON lotto.voucher_redemptions TO 'chok_member'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON lotto.vouchers TO 'chok_member'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON lotto.wheel_spins TO 'chok_member'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON lotto.withdrawals TO 'chok_member'@'%';
-- Deliberately absent for chok_member: employee_*, audit_log, schema_migrations_admin.

FLUSH PRIVILEGES;
