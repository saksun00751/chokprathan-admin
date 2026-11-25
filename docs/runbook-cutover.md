# Runbook: ย้ายหลังบ้านไป `chokprathan-admin`

ลำดับขั้นตามแบบ (spec §5): Expand → Parallel run → Switch → (rollback ได้จนถึง contract) → Contract.
ทุกขั้นเป็นรายการคำสั่งเรียงตามลำดับ จบด้วยบรรทัด **Verify:** ห้ามข้ามไปขั้นถัดไปถ้า Verify ไม่ผ่าน

แนวทางทั้งเอกสาร:

- คำสั่ง SQL ใช้ `mariadb` client กับไฟล์ `~/.my.cnf` ของผู้ใช้สิทธิ์สูง (ไม่ใส่รหัสผ่านใน command line)
- ชื่อฐานข้อมูลในตัวอย่างคือ `lotto` ถ้าไม่ใช่ ให้แก้ค่า `DB` ด้านล่าง (และใน `grants.sql` ผ่าน `sed`)
- `npm run db -- ...` รันจาก checkout ของ repo บนเครื่องที่เข้าฐานข้อมูลได้ (build แบบ standalone ไม่มี `scripts/` และ `tsx`)
  `npm run db` อ่าน `.env.local` แต่ค่าที่ส่งใน environment ชนะค่าในไฟล์เสมอ จึงใช้รูป `DATABASE_URL=... npm run db -- <cmd>`
- รหัสผ่านใน `DATABASE_URL` ต้องเข้ารหัสแบบ URL (`$` → `%24`, `@` → `%40`, `#` → `%23`)

ตัวแปรที่ใช้ทั้งเอกสาร (ตั้งครั้งเดียวใน shell ที่ทำงาน):

```bash
export DB=lotto
export ADMIN_DIR=/srv/chokprathan-admin     # checkout ของ repo นี้
export MEMBER_DIR=/srv/chokprathan          # checkout ของ member repo
# ผู้ใช้ฐานข้อมูลที่มีสิทธิ์ DDL (CREATE/ALTER/DROP/INDEX/REFERENCES) ใช้ "เฉพาะ" รัน migration
# แนะนำ: ผู้ใช้ที่ member app ใช้อยู่วันนี้ (มันรัน migration ตอนเริ่มได้ จึงมีสิทธิ์ครบ) เก็บไว้ ห้ามลบ เพราะต้องใช้ตอน rollback
export MIGRATE_URL='mysql://MIGRATE_USER:MIGRATE_PASS@DB_HOST:3306/lotto'
export ADMIN_URL='mysql://chok_admin:ADMIN_PASS@DB_HOST:3306/lotto'
export MEMBER_URL='mysql://chok_member:MEMBER_PASS@DB_HOST:3306/lotto'
```

`~/.my.cnf` (สิทธิ์ไฟล์ `chmod 600 ~/.my.cnf`) ของผู้ใช้เดียวกับ `MIGRATE_URL`:

```ini
[client]
host=DB_HOST
user=MIGRATE_USER
password=MIGRATE_PASS
```

---

## 0. เรื่องที่ต้องตัดสินใจและทำให้เสร็จ "ก่อน" เริ่ม

1. [ ] **(a) member จะ migrate schema ตัวเองไม่ได้อีกเมื่อรันเป็น `chok_member`.** `chok_member` มีแค่ DML (ดูหมายเหตุใน
   `scripts/grants.sql` ส่วน chok_member) ไม่มี CREATE/ALTER/INDEX/DROP/REFERENCES ถ้าเปิด auto-migrate ไว้
   `migrate()` ตอนเริ่มจะล้มที่ `CREATE TABLE IF NOT EXISTS schema_migrations` และ scheduler ฝั่ง member ไม่เริ่ม ดังนั้น:
   - member ต้องรันด้วย `DB_AUTO_MIGRATE=false` ใน `.env.production.local` ของ member **ก่อนเริ่ม build/deploy ใด ๆ
     ของ cut-over branch** (ไม่ใช่รอถึงตอนสลับเป็น `chok_member`; ดูข้อ 10)
   - migration ของ member (รวม migration 9 ตอน contract) รันแยกด้วยผู้ใช้สิทธิ์สูง `MIGRATE_URL` เสมอ:
     ```bash
     cd "$MEMBER_DIR" && DATABASE_URL="$MIGRATE_URL" npm run db -- migrate
     cd "$MEMBER_DIR" && DATABASE_URL="$MIGRATE_URL" npm run db -- status
     ```
   - ทุกครั้งที่ deploy member เวอร์ชันที่มี migration ใหม่: รันคำสั่งบน **ก่อน** เปิดเวอร์ชันใหม่
   - ฝั่ง admin เปิด auto-migrate ได้ตามปกติ (`chok_admin` มี `ALL` บนตารางของ admin เอง) หรือรัน
     `cd "$ADMIN_DIR" && DATABASE_URL="$MIGRATE_URL" npm run db -- migrate` เองก็ได้
2. [ ] **(b) `grants.sql` ใช้ได้หลัง migration ของ member รันครบแล้วเท่านั้น** (GRANT ระดับตารางที่ไม่มี CREATE ต้องให้ตารางมีอยู่ก่อน)
   ลำดับในขั้น 2 จึงเป็น: member migrate → admin migrate → import-staff → grants
3. [ ] **(c) merge branch `admin-split/prep` ของ member** เข้า main ของ member
   ทั้งสองแอปต้องอ้าง `chokprathan-core` tag เดียวกัน (`grep chokprathan-core package.json` ทั้งสอง repo)
4. [ ] **(d) งานตรวจ cache TTL (plan Task 17, ไฟล์ `docs/cache-ttl-audit.md` ใน member branch)** merge และ deploy ฝั่ง member
   **ก่อน** Switch: ค่าที่ admin แก้ (settings, blocklist, lottos/สถานะรอบ, banners) ต้องถึงหน้า member ภายใน TTL ≤ 5 วินาที
   เพราะ cache ของ member invalidate ได้เฉพาะใน process ของตัวเอง
5. [ ] **(e) ความลับของ AMB ไม่ให้ admin.** ห้ามใส่ค่า AMB ใด ๆ ใน `.env.production.local` หรือ CI ของ admin
   (admin เปิด/ปิด `game_products` ด้วยการเขียนตารางร่วมเท่านั้น)
6. [ ] **(f) ประวัติการเข้าสู่ระบบของพนักงานก่อน Switch อยู่ที่ store ของ member** (`auth_log` ใน MariaDB / Mongo `auth_log`)
   เป็น archive อ่านอย่างเดียว หน้า "ความปลอดภัย" ของ admin แสดงเฉพาะ `employee_auth_log` ตั้งแต่ Switch เป็นต้นไป
   แจ้งเจ้าของระบบและผู้ตรวจสอบให้รับทราบก่อน
7. [ ] **member build ของ plan Task 14** (ไม่มี `/admin`, `/console`, ไม่มีงาน round/settlement/deposit/audit/stats) คือ
   tag **`admin-split-switch`** ของ member repo (**ไม่ใช่** ปลาย branch `admin-split/cutover` ซึ่งมี migration 9 อยู่ด้วย)
   ผ่าน `npm test && npm run typecheck && npm run lint && npm run build` และพร้อม deploy แต่ **ยังไม่ deploy** จนถึงขั้น 4
   ```bash
   cd "$MEMBER_DIR" && git fetch --tags && git rev-parse admin-split-switch admin-split-contract
   ```
   ต้องได้ commit สองค่า (tag `admin-split-contract` ใช้ในขั้น 6 เท่านั้น)
8. [ ] **วิธีปิดปรับปรุง (maintenance).** member app ไม่มีโหมดปิดปรับปรุงในตัว ใช้ nginx ของ member ตอบ 503 ยกเว้น IP ผู้ดูแล
   เตรียมไว้ล่วงหน้า (เพิ่มใน `server { listen 443 ... }` ของ member ก่อน `location`) แล้ว `nginx -s reload` หนึ่งครั้ง:
   ```nginx
   set $maint 0;
   if (-f /etc/nginx/maintenance.on) { set $maint 1; }
   if ($remote_addr = 203.0.113.10) { set $maint 0; }   # IP ผู้ดูแล (ตัวอย่าง) ให้ทดสอบได้ระหว่างปิด
   if ($maint) { return 503; }
   ```
   เปิด/ปิดได้โดยไม่ต้อง reload: `touch /etc/nginx/maintenance.on` / `rm /etc/nginx/maintenance.on`
9. [ ] **(แนะนำ) id ของพนักงานใหม่ไม่ชนกับ id สมาชิก.** `import-staff` คง id เดิมของ staff ไว้ หลังจากนั้น `employees`
   AUTO_INCREMENT จะต่อจาก id staff สูงสุด ซึ่งมักซ้ำกับ id ของสมาชิกใน `users` ถ้า rollback หลังมีพนักงานใหม่ แอปเดิมจะอ่าน
   `actor_id` ของพนักงานใหม่เป็นสมาชิกคนนั้น ทางแก้คือขั้น 2 ข้อ 5 (ตั้ง AUTO_INCREMENT สูง) ตัดสินใจก่อนว่าจะทำหรือไม่
10. [ ] **`DB_AUTO_MIGRATE=false` ต้องอยู่ใน `.env.production.local` ของ member "ก่อน" เริ่ม build ใด ๆ ของ cut-over branch**
    บนเครื่อง member (ทั้ง tag `admin-split-switch` และ `admin-split-contract`) เพราะปลาย branch มี migration 9 ซึ่ง
    **ลบแถว staff ออกจาก `users`** ถ้า build นั้นเริ่มด้วย auto-migrate และผู้ใช้สิทธิ์สูง migration 9 จะรันเองทันที
    และ **rollback (ขั้น 5) เป็นไปไม่ได้อีก** (เหลือแค่กู้จาก backup) ผู้ใช้สิทธิ์สูงของ `MIGRATE_URL` เก็บแยกไว้ ใช้เฉพาะคำสั่ง
    `npm run db -- migrate` ที่สั่งเองเท่านั้น ห้ามอยู่ใน env ของ member app ที่รันด้วย auto-migrate

**Verify:** ทุกช่องด้านบนติ๊กแล้ว, ทั้งสองแอปอ้าง `chokprathan-core` tag เดียวกัน, และ `node scripts/check-grants.mjs --member "$MEMBER_DIR"` พิมพ์ `grants ok`;
`git -C "$MEMBER_DIR" rev-parse admin-split-switch` ได้ commit (tag มีอยู่ในเครื่อง member)

---

## 1. Pre-flight

1. Backup ตารางที่การย้ายแตะ และ backup ทั้งฐาน (เก็บไว้นอกเครื่องด้วย):
   ```bash
   STAMP=$(date +%Y%m%d-%H%M)
   mysqldump --single-transaction "$DB" users staff_roles audit_log | gzip > "pre-split-tables-$STAMP.sql.gz"
   mysqldump --single-transaction --routines --triggers "$DB" | gzip > "pre-split-full-$STAMP.sql.gz"
   ls -lh pre-split-*-"$STAMP".sql.gz
   ```
2. ตรวจว่า id ทุกค่าที่เก็บ "id พนักงาน" (คอลัมน์เหล่านี้ไม่มี FK) เป็นของ staff จริง คอลัมน์ทั้งหมดใน member
   `src/server/db/migrations.ts`: `audit_log.actor_id`, `transactions.actor_id`, `bank_account_moves.actor_id`,
   `point_moves.actor_id`, `manual_limits.created_by`, `vouchers.created_by`, `blocklist.created_by`,
   `blocklist.removed_by`, `deposits.reviewed_by`, `withdrawals.reviewed_by`, `rounds.resulted_by`,
   `bank_accounts.archived_by`, `users.closed_by` คำสั่งเดียวตรวจครบทุกคอลัมน์:
   ```bash
   mariadb "$DB" -e "
   SELECT 'audit_log.actor_id' AS col, actor_id AS id FROM audit_log WHERE actor_id IS NOT NULL AND actor_id NOT IN (SELECT id FROM users WHERE role='staff') GROUP BY actor_id
   UNION ALL SELECT 'transactions.actor_id', actor_id FROM transactions WHERE actor_id IS NOT NULL AND actor_id NOT IN (SELECT id FROM users WHERE role='staff') GROUP BY actor_id
   UNION ALL SELECT 'bank_account_moves.actor_id', actor_id FROM bank_account_moves WHERE actor_id IS NOT NULL AND actor_id NOT IN (SELECT id FROM users WHERE role='staff') GROUP BY actor_id
   UNION ALL SELECT 'point_moves.actor_id', actor_id FROM point_moves WHERE actor_id IS NOT NULL AND actor_id NOT IN (SELECT id FROM users WHERE role='staff') GROUP BY actor_id
   UNION ALL SELECT 'manual_limits.created_by', created_by FROM manual_limits WHERE created_by IS NOT NULL AND created_by NOT IN (SELECT id FROM users WHERE role='staff') GROUP BY created_by
   UNION ALL SELECT 'vouchers.created_by', created_by FROM vouchers WHERE created_by IS NOT NULL AND created_by NOT IN (SELECT id FROM users WHERE role='staff') GROUP BY created_by
   UNION ALL SELECT 'blocklist.created_by', created_by FROM blocklist WHERE created_by IS NOT NULL AND created_by NOT IN (SELECT id FROM users WHERE role='staff') GROUP BY created_by
   UNION ALL SELECT 'blocklist.removed_by', removed_by FROM blocklist WHERE removed_by IS NOT NULL AND removed_by NOT IN (SELECT id FROM users WHERE role='staff') GROUP BY removed_by
   UNION ALL SELECT 'deposits.reviewed_by', reviewed_by FROM deposits WHERE reviewed_by IS NOT NULL AND reviewed_by NOT IN (SELECT id FROM users WHERE role='staff') GROUP BY reviewed_by
   UNION ALL SELECT 'withdrawals.reviewed_by', reviewed_by FROM withdrawals WHERE reviewed_by IS NOT NULL AND reviewed_by NOT IN (SELECT id FROM users WHERE role='staff') GROUP BY reviewed_by
   UNION ALL SELECT 'rounds.resulted_by', resulted_by FROM rounds WHERE resulted_by IS NOT NULL AND resulted_by NOT IN (SELECT id FROM users WHERE role='staff') GROUP BY resulted_by
   UNION ALL SELECT 'bank_accounts.archived_by', archived_by FROM bank_accounts WHERE archived_by IS NOT NULL AND archived_by NOT IN (SELECT id FROM users WHERE role='staff') GROUP BY archived_by
   UNION ALL SELECT 'users.closed_by', closed_by FROM users WHERE closed_by IS NOT NULL AND closed_by NOT IN (SELECT id FROM users WHERE role='staff') GROUP BY closed_by;"
   ```
   ถ้าได้แถวใด ๆ = มี id ที่ไม่ใช่ staff (สมาชิก หรือ id ที่ไม่มีแล้ว) ถูกบันทึกเป็นผู้กระทำ: **หยุด** ห้ามทำขั้น 2
   ตรวจว่าแถวนั้นมาจากโค้ดส่วนไหนและแก้ข้อมูลหรือโค้ดก่อน แล้วรันซ้ำจนได้ `Empty set`
   (การตรวจนี้มีความหมายเฉพาะ **ก่อน** contract เพราะ migration 9 ลบแถว staff ออกจาก `users`; คอลัมน์ `role` ยังอยู่แต่เหลือแค่ `member`)
3. จดจำนวน staff ไว้เทียบในขั้น 2 และ 6:
   ```bash
   mariadb "$DB" -e "SELECT COUNT(*) AS staff FROM users WHERE role='staff'; SELECT COUNT(*) AS roles FROM staff_roles;"
   ```
4. (แนะนำ) รันคำสั่งตรวจ FK ของขั้น 6 ข้อ 2 (แถวที่อ้าง staff และจะขวาง `DELETE` ของ migration 9) ได้ตั้งแต่ตอนนี้
   คำสั่งนั้นอ่านอย่างเดียว ถ้ามีค่าใดไม่เป็น `0` จะได้มีเวลาสืบสาเหตุก่อนถึง contract

**Verify:** ไฟล์ backup สองไฟล์ขนาดไม่เป็นศูนย์, คำสั่งข้อ 2 ได้ `Empty set` (0 แถว), จดจำนวน staff/roles แล้ว

---

## 2. Expand

แอปเดิมยังทำงานปกติทั้งหมด ขั้นนี้ลบทิ้งได้โดยไม่กระทบ

1. member schema เป็นเวอร์ชันล่าสุด (ด้วยผู้ใช้สิทธิ์สูง):
   ```bash
   cd "$MEMBER_DIR" && DATABASE_URL="$MIGRATE_URL" npm run db -- migrate && DATABASE_URL="$MIGRATE_URL" npm run db -- status
   ```
2. ตาราง admin (`employee_*`, `schema_migrations_admin`):
   ```bash
   cd "$ADMIN_DIR" && npm ci && DATABASE_URL="$MIGRATE_URL" npm run db -- migrate
   ```
3. คัดลอก staff และตำแหน่ง (คง id เดิม):
   ```bash
   cd "$ADMIN_DIR" && DATABASE_URL="$MIGRATE_URL" npm run db -- import-staff
   ```
   ต้องพิมพ์ `employee_roles: N, employees: M` โดย M = จำนวน staff, N = จำนวน roles ที่จดไว้ในขั้น 1 ข้อ 3
4. ตรวจการคัดลอก:
   ```bash
   mariadb "$DB" -e "SELECT u.id FROM users u LEFT JOIN employees e ON e.id = u.id WHERE u.role='staff' AND (e.id IS NULL OR e.username <> u.username);"
   ```
   ต้องได้ `Empty set`
5. (ถ้าตัดสินใจในขั้น 0 ข้อ 9) ให้ id พนักงานใหม่เริ่มสูงกว่า id สมาชิกทุกคน:
   ```bash
   mariadb "$DB" -e "ALTER TABLE employees AUTO_INCREMENT = 1000000000; SELECT AUTO_INCREMENT FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employees';"
   ```
6. ตรวจ `grants.sql` กับโค้ดและ migration ของ member (ไม่ต้องใช้ฐานข้อมูล):
   ```bash
   cd "$ADMIN_DIR" && node scripts/check-grants.mjs --member "$MEMBER_DIR"
   ```
   ต้องพิมพ์ `chok_member list checked against ...` และ `grants ok`
7. สร้างผู้ใช้และ GRANT (รันครั้งเดียวด้วยผู้ใช้ผู้ดูแล MariaDB รหัสผ่านควรเป็นตัวอักษร/ตัวเลขล้วน เพราะผ่าน `sed`)
   ```bash
   cd "$ADMIN_DIR"
   read -rs ADMIN_DB_PASS && read -rs MEMBER_DB_PASS
   sed -e "s/lotto\./$DB./g" -e "s/CHANGE-ME-ADMIN/$ADMIN_DB_PASS/" -e "s/CHANGE-ME-MEMBER/$MEMBER_DB_PASS/" scripts/grants.sql | mariadb
   unset ADMIN_DB_PASS MEMBER_DB_PASS
   mariadb -e "SHOW GRANTS FOR 'chok_admin'@'%'; SHOW GRANTS FOR 'chok_member'@'%';"
   ```
   (ผู้ใช้ถูกสร้างเป็น `'@'%'` ถ้าต้องการจำกัด IP เครื่องแอปตาม DEPLOY.md ของ member ให้แก้ host ใน `sed` ด้วย)
8. ทดสอบการแยกสิทธิ์ (`src/server/db/isolation.test.ts`) **บนเซิร์ฟเวอร์ทิ้งได้ก่อน** ห้ามรันกับ production
   (ข้อทดสอบเชิงลบลอง `DROP`/`DELETE` จริง ถ้า grant ผิดข้อมูลหาย) ตัวทดสอบอ่าน env สองตัว
   `ISOLATION_MEMBER_URL` (ผู้ใช้ `chok_member`) และ `ISOLATION_ADMIN_URL` (ผู้ใช้ `chok_admin`) ถ้าไม่ตั้งทั้งคู่จะ skip
   ผู้ใช้ root ของเซิร์ฟเวอร์ทิ้งได้ใช้แค่ตอนเตรียม (migrate และ grants) ไม่ใช่ env ของ test:
   ```bash
   export SCRATCH_ROOT_URL='mysql://root:ROOT_PASS@127.0.0.1:3306/lotto'   # เซิร์ฟเวอร์ทิ้งได้เท่านั้น
   cd "$MEMBER_DIR" && DATABASE_URL="$SCRATCH_ROOT_URL" npm run db -- migrate
   cd "$ADMIN_DIR" && DATABASE_URL="$SCRATCH_ROOT_URL" npm run db -- migrate
   mariadb -h 127.0.0.1 -u root -p < scripts/grants.sql      # ชื่อฐาน lotto, รหัสผ่าน CHANGE-ME-* ตามไฟล์
   # TEST_DATABASE_URL ว่างไว้เสมอ: ไม่งั้น vitest อ่านค่าจากไฟล์ .env* แล้ว global setup จะ drop/migrate ตารางของฐานทดสอบนั้นก่อน
   TEST_DATABASE_URL= \
   ISOLATION_MEMBER_URL='mysql://chok_member:CHANGE-ME-MEMBER@127.0.0.1:3306/lotto' \
   ISOLATION_ADMIN_URL='mysql://chok_admin:CHANGE-ME-ADMIN@127.0.0.1:3306/lotto' \
     npx vitest run src/server/db/isolation.test.ts
   ```
   ต้องผ่านทุกข้อ (ไม่มี skipped)
   บน production ตรวจแบบอ่านอย่างเดียวแทน: `mariadb -u chok_member -p "$DB" -e "SELECT 1 FROM employees LIMIT 1"` ต้องได้
   `ERROR 1142 ... SELECT command denied`
9. Deploy admin บน subdomain (`admin.example.com`) ด้วย `.env.production.local`:
   `DATABASE_URL=$ADMIN_URL`, **`SCHEDULER=off`**, `TRUST_PROXY=1`, `NEXT_PUBLIC_SITE_URL=https://admin.example.com`
   ```bash
   cd "$ADMIN_DIR" && grep -E '^(DATABASE_URL|SCHEDULER)=' .env.production.local | sed 's/:[^:@]*@/:***@/'
   npm run build && cp -r .next/static .next/standalone/.next/ && cp .env.production.local .next/standalone/ && pm2 start ecosystem.config.cjs
   ```

**Verify:** `curl -fsS https://admin.example.com/api/health` ได้ `{"ok":true,"db":"up",...}`; `SHOW GRANTS` ตรงกับ `grants.sql`;
isolation test ผ่านบนเซิร์ฟเวอร์ทิ้งได้; แถว `system_status.name='scheduler'` มี `value.host` เป็นเครื่อง member เท่านั้น (admin ยังไม่รัน scheduler)
(**อย่าใช้ `IS_USED_LOCK(...)` ตรวจว่า scheduler รันอยู่หรือไม่:** ทั้งสองแอปถือ named lock เฉพาะระหว่าง tick ซึ่งกินเวลาไม่กี่มิลลิวินาที
ทุก 20 วินาที แล้วปล่อย ผลจึงเป็น `NULL` แทบทุกครั้งที่ตรวจ ไม่ว่า scheduler จะรันหรือไม่ ให้ดู heartbeat ใน `system_status` แทน:
`value.host`/`value.pid` คือ process ที่ทำ tick ล่าสุด และ `updated_at` ต้องไม่เก่ากว่า ~40 วินาที)
(หมายเหตุ: ค่า `scheduler` ใน `/api/health` ของ admin อ่านแถว `system_status.name='scheduler'` ระหว่างนี้แถวนั้นเขียนโดย
member build เดิม (ก่อน Switch) จึงสะท้อน scheduler ของ member; member build ของ cut-over เขียนแถวของตัวเอง `member_scheduler`)

---

## 3. Parallel run

1. ทีมเข้า `https://admin.example.com` ด้วยชื่อผู้ใช้/รหัสผ่านเดิม (2 ขั้นเดิมใช้ได้) ทดลองทุกหน้าที่ใช้ประจำ:
   สมาชิก, ฝาก/ถอน (เปิดดูสลิป), รอบ/ผลรางวัล, รายงาน, ตั้งค่า งานจริงยังทำที่แอปเดิมหรือที่ admin ก็ได้ (ตารางธุรกิจใช้ร่วมกัน)
2. **กฎ: การเปลี่ยนแปลงข้อมูลพนักงาน (รหัสผ่าน, ตำแหน่ง/สิทธิ์, 2 ขั้น, เพิ่ม/ระงับพนักงาน) ทำที่แอปเดิมเท่านั้น** จนถึง Switch
   (`import-staff --refresh` ในขั้น 4 จะคัดลอกค่าล่าสุดจากแอปเดิมทับ admin ถ้าแก้ที่ admin ระหว่างนี้จะถูกทับหาย)
3. **กฎ: scheduler ทำงานได้ทีละแอป.** admin ต้อง `SCHEDULER=off` ตลอดช่วงนี้ (lock ของสองแอปชื่อไม่เหมือนกัน
   `chokprathan:scheduler` / `chokprathan-admin:scheduler` จึงไม่กันกันเอง ถ้าเปิดทั้งคู่ งานรอบ/settlement จะรันซ้อน)
   ตรวจเป็นระยะ:
   ```bash
   mariadb "$DB" -e "SELECT name, \`value\`, FROM_UNIXTIME(updated_at/1000) AS at, NOW() AS now FROM system_status WHERE name = 'scheduler';"
   ```
4. เก็บปัญหาที่พบเป็นรายการ แก้และ deploy admin ซ้ำได้ตามต้องการ (ยัง `SCHEDULER=off`)

**Verify:** ทุกครั้งที่ตรวจ แถว `scheduler` มี `value.host` เป็นเครื่อง member (ไม่เคยเป็นเครื่อง admin) และ `at` ไม่เก่ากว่า ~40 วินาที;
ทีมยืนยันว่าทุกหน้าที่ใช้ประจำทำงาน; ไม่มีการแก้ข้อมูลพนักงานที่ admin

---

## 4. Switch (ช่วงปิดปรับปรุง)

ประกาศเวลาปิดล่วงหน้า เลือกช่วงที่ไม่มีรอบใหญ่ปิดรับหรือออกผล ทำตามลำดับนี้เท่านั้น:

1. เปิดโหมดปิดปรับปรุงที่ nginx ของ member (ขั้น 0 ข้อ 8):
   ```bash
   touch /etc/nginx/maintenance.on
   curl -s -o /dev/null -w '%{http_code}\n' https://example.com/   # จากเครื่องที่ไม่ใช่ IP ผู้ดูแล: 503
   ```
2. ปิด auto-migrate ของ member **ก่อน** deploy build ใหม่ (ขั้น 0 ข้อ 10) เก็บ env เดิมไว้สำหรับ rollback ก่อนแก้อะไร
   ยังใช้ `DATABASE_URL` เดิม (ผู้ใช้สิทธิ์สูงของ `MIGRATE_URL` เก็บแยกไว้ ห้ามลบ ใช้ตอน rollback และ contract):
   ```bash
   cd "$MEMBER_DIR" && cp .env.production.local ".env.production.local.pre-switch"
   # เพิ่ม/แก้ DB_AUTO_MIGRATE=false ด้วย editor แล้วตรวจ:
   grep -E '^DB_AUTO_MIGRATE=' .env.production.local
   ```
   ต้องได้ `DB_AUTO_MIGRATE=false` ห้ามทำข้อ 3 ถ้ายังไม่ได้
3. Deploy member build ของ Task 14 = tag `admin-split-switch` (ไม่มีงาน round/settlement/deposit/audit/stats, ไม่มี `/admin`,
   `/console`, **ไม่มี migration 9**) ห้ามใช้ `git pull` / ปลาย branch:
   ```bash
   cd "$MEMBER_DIR" && git fetch --tags && git checkout admin-split-switch && git log --oneline -1
   npm ci && npm run build && cp -r .next/static .next/standalone/.next/ && cp .env.production.local .next/standalone/ && pm2 reload chokprathan
   mariadb "$DB" -e "SELECT MAX(version) AS member_version FROM schema_migrations;"
   ```
   `member_version` ต้องเป็น `8` ตั้งแต่ข้อนี้ถึงข้อ 5 ไม่มี scheduler ใดรันงานรอบ/settlement (ตั้งใจ ระหว่างปิดปรับปรุง)
4. คัดลอกข้อมูลพนักงานล่าสุดจากแอปเดิมทับ admin (ครั้งเดียว):
   ```bash
   cd "$ADMIN_DIR" && DATABASE_URL="$MIGRATE_URL" npm run db -- import-staff --refresh
   ```
5. เปิด scheduler ฝั่ง admin และรีสตาร์ต (2 replica: ทั้งสองตัวจับเวลา tick แต่ named lock ให้ทำงานได้ทีละตัวต่อ tick ถ้าตัวหนึ่งล่ม อีกตัวทำต่อเอง):
   ```bash
   cd "$ADMIN_DIR" && sed -i.bak 's/^SCHEDULER=.*/SCHEDULER=on/' .env.production.local && grep '^SCHEDULER=' .env.production.local
   cp .env.production.local .next/standalone/ && pm2 reload chokprathan-admin
   ```
6. สลับ member เป็น `chok_member` (แก้ `.env.production.local` ของ member; `DB_AUTO_MIGRATE=false` ตั้งไว้แล้วในข้อ 2):
   ```bash
   cd "$MEMBER_DIR"
   # แก้ DATABASE_URL=<MEMBER_URL> ด้วย editor แล้วตรวจ:
   grep -E '^(DATABASE_URL|DB_AUTO_MIGRATE)=' .env.production.local | sed 's/:[^:@]*@/:***@/'
   cp .env.production.local .next/standalone/ && pm2 reload chokprathan
   ```
   ต้องเห็น `chok_member` ใน `DATABASE_URL` และ `DB_AUTO_MIGRATE=false`
7. ตรวจทุกข้อก่อนปิดโหมดปิดปรับปรุง (จาก IP ผู้ดูแล):
   - [ ] พนักงานเข้าสู่ระบบที่ `https://admin.example.com/login` ได้ (รวม 2 ขั้น)
   - [ ] สมาชิกเข้าสู่ระบบที่เว็บ member ได้ และ `https://example.com/admin` / `https://example.com/console` ได้ 404
   - [ ] แทงโพยเล็ก ๆ หนึ่งใบสำเร็จ และเห็นในหน้ารอบของ admin
   - [ ] บันทึกการเข้าสู่ระบบของพนักงานเข้า `employee_auth_log`:
     ```bash
     mariadb "$DB" -e "SELECT * FROM employee_auth_log ORDER BY id DESC LIMIT 5;"
     ```
   - [ ] heartbeat ของ scheduler มาจากเครื่อง admin (หลัง Switch แถว `scheduler` เป็นของ admin เท่านั้น
     member build ใหม่เขียนแถวของตัวเอง `member_scheduler` ซึ่ง `/api/health` ของ member อ่าน):
     ```bash
     mariadb "$DB" -e "SELECT name, \`value\`, FROM_UNIXTIME(updated_at/1000) AS at, NOW() AS now FROM system_status WHERE name IN ('scheduler', 'member_scheduler');"
     ```
     แถว `scheduler`: `value.host` เป็น hostname ของ container/เครื่อง admin, `at` ไม่เกิน ~40 วินาทีก่อน (ตรวจซ้ำหลัง 20 วินาทีต้องขยับ);
     แถว `member_scheduler` มี `updated_at` ใหม่ (scheduler ของ member ยังเดินงานของตัวเอง)
   - [ ] รอบปิดและจ่ายรางวัลได้ (ดู tick หนึ่งรอบ ~20 วินาที): เลือกรอบออกผลอัตโนมัติ (ยี่กี) ที่ใกล้ปิด
     ```bash
     mariadb "$DB" -e "SELECT r.id, l.name, FROM_UNIXTIME(r.closes_at/1000) AS closes, FROM_UNIXTIME(r.draw_at/1000) AS draw, r.status, r.settled_at FROM rounds r JOIN lottos l ON l.id = r.lotto_id WHERE r.status = 'scheduled' ORDER BY r.draw_at LIMIT 5;"
     # หลังเวลา draw ของรอบที่เลือก (แทน ROUND_ID):
     mariadb "$DB" -e "SELECT id, status, resulted_at, settled_at FROM rounds WHERE id = ROUND_ID;"
     ```
     ต้องได้ `status='resulted'` และ `settled_at` ไม่เป็น `NULL`
   - [ ] `/api/health` ของทั้งสองแอป:
     ```bash
     curl -fsS https://admin.example.com/api/health; echo; curl -fsS https://example.com/api/health; echo
     ```
     ทั้งคู่ `"ok":true,"db":"up","scheduler":"ok"`
   - [ ] เปิดรายการฝากที่มีสลิปในหน้า "การเงิน" ของ admin แล้วเห็นรูปสลิป
   - [ ] member อ่านตารางของ admin ไม่ได้:
     ```bash
     mariadb -u chok_member -p "$DB" -e "SELECT 1 FROM employees LIMIT 1;"
     ```
     ต้องได้ `ERROR 1142 ... SELECT command denied`
   - [ ] log ของ member ไม่มีสิทธิ์ถูกปฏิเสธ: `pm2 logs chokprathan --lines 300 --nostream | grep -i denied`
     ต้องว่าง
8. ปิดโหมดปิดปรับปรุง:
   ```bash
   rm /etc/nginx/maintenance.on
   ```

**Verify:** ทุกช่องในข้อ 7 ติ๊กแล้ว, `SELECT MAX(version) FROM schema_migrations` ยังเป็น `8` และหลังเปิดเว็บ 15 นาที `/api/health` ทั้งสองแอปยัง `ok` และ log ไม่มี `denied`
ถ้าข้อใดไม่ผ่านและแก้ไม่ได้ภายในเวลาที่ประกาศ: ทำขั้น 5 (rollback) ทันที

---

## 5. Rollback (ทำได้จนถึง contract)

ข้อมูล staff ใน `users` / `staff_roles` ยังอยู่ (ตราบใดที่ migration 9 ยังไม่เคยรัน) แอปเดิมจึงกลับมาใช้ได้
ลำดับ: ปิด scheduler ของ admin ก่อน เพื่อไม่ให้มี scheduler สองตัว

1. เปิดโหมดปิดปรับปรุง: `touch /etc/nginx/maintenance.on` แล้วตรวจว่าไม่มีอะไรรัน migration 9:
   ```bash
   mariadb "$DB" -e "SELECT MAX(version) AS member_version FROM schema_migrations; SELECT COUNT(*) AS staff FROM users WHERE role='staff';"
   ```
   `member_version` ต้องเป็น `8` และ `staff` เท่ากับที่จดไว้ในขั้น 1 ข้อ 3 ถ้าได้ `9`: migration 9 รันไปแล้ว rollback ตามขั้นนี้ไม่ได้
   **หยุด** (ย้อนได้ทางเดียวคือกู้จาก backup `pre-split-*` / `pre-contract-*`)
2. ปิด scheduler ฝั่ง admin:
   ```bash
   cd "$ADMIN_DIR" && sed -i.bak 's/^SCHEDULER=.*/SCHEDULER=off/' .env.production.local
   cp .env.production.local .next/standalone/ && pm2 reload chokprathan-admin
   ```
3. คืน `DATABASE_URL` เดิมของ member (และ `DB_AUTO_MIGRATE` เดิม):
   ```bash
   cd "$MEMBER_DIR" && cp .env.production.local.pre-switch .env.production.local
   ```
4. Deploy member build ก่อน Task 14 อีกครั้ง (commit ที่รันอยู่ก่อน Switch แทน `PREVIOUS_SHA`; build นั้นมี migration ถึง 8 เท่านั้น):
   ```bash
   cd "$MEMBER_DIR" && git checkout PREVIOUS_SHA && npm ci && npm run build && cp -r .next/static .next/standalone/.next/ && cp .env.production.local .next/standalone/ && pm2 reload chokprathan
   mariadb "$DB" -e "SELECT MAX(version) AS member_version FROM schema_migrations;"
   ```
   `member_version` ยังเป็น `8`
5. ตรวจแล้วปิดโหมดปิดปรับปรุง: `rm /etc/nginx/maintenance.on`

สิ่งที่ **ย้อนไม่ได้** (หรือหายเมื่อ rollback):
- การแก้ข้อมูลพนักงานที่ทำใน admin หลัง Switch (รหัสผ่าน, 2 ขั้น, ตำแหน่ง, พนักงานใหม่) ไม่มีใน `users` แอปเดิมไม่เห็น
  พนักงานใหม่เข้าแอปเดิมไม่ได้ ต้องสร้างใหม่ในแอปเดิม
- `audit_log` / `transactions` / ฯลฯ ที่พนักงานใหม่ทำ มี `actor_id` ที่ไม่มีใน `users` (หรือชี้ไปที่สมาชิก ถ้าไม่ได้ทำขั้น 2 ข้อ 5)
- `employee_auth_log` (ประวัติเข้าสู่ระบบที่ admin) แอปเดิมไม่แสดง
- session ของพนักงานในแอปเดิมหมดอายุ/ถูกตัดไปแล้ว ทุกคนต้องเข้าสู่ระบบใหม่
- ข้อมูลธุรกิจ (โพย เงิน รอบ) ใช้ตารางร่วม ไม่หายและไม่ต้องย้อน
- หลัง contract (ขั้น 6) ย้อนได้ทางเดียวคือกู้จาก backup

**Verify:** แถว `system_status.name='scheduler'` มี `value.host` เป็นเครื่อง member และ `updated_at` ใหม่ (ไม่เกิน ~40 วินาที, ขยับทุก ~20 วินาที);
`SELECT MAX(version) FROM schema_migrations` เป็น `8`; พนักงานเข้า `/console` ของแอปเดิมได้; `https://example.com/api/health` ได้ `ok`

---

## 6. Contract (1–2 สัปดาห์หลัง Switch, ย้อนไม่ได้)

**ไม่ต้องแก้โค้ด admin ก่อน migration 9.** migration 9 (plan Task 15) **เก็บ** คอลัมน์ `users.role` (ENUM เดิม) และ
`users.staff_note` (บันทึกของพนักงานต่อสมาชิก ซึ่งเป็นข้อมูลสมาชิก) ไว้ และทำแค่: ลบแถว staff ออกจาก `users`, ลบ FK
`users_staff_role_fk`, ลบคอลัมน์ `staff_role_id`, `totp_secret`, `totp_enabled`, `totp_last_step`, `must_change_password`
และลบตาราง `staff_roles` หลังจากนั้นทุกแถวใน `users` เป็นสมาชิก ตัวกรอง `role = 'member'` ของ admin (~20 จุด) จึงทำงานเหมือนเดิม
และ column grant `UPDATE (… staff_note)` ใน `grants.sql` ยังถูกต้อง (`role` เหลือเป็นคอลัมน์ค่าเดียว จะลบทีหลังก็ได้เมื่อทั้งสองแอปเลิกกรองด้วยมัน)
`npm run db -- import-staff` ไม่ทำอะไรหลัง contract (ตรวจว่ามี `staff_roles`, `users.role` และ `users.staff_role_id` ครบก่อนอ่าน)

1. Backup อีกครั้ง:
   ```bash
   STAMP=$(date +%Y%m%d-%H%M)
   mysqldump --single-transaction "$DB" users staff_roles audit_log employees employee_roles | gzip > "pre-contract-tables-$STAMP.sql.gz"
   mysqldump --single-transaction --routines --triggers "$DB" | gzip > "pre-contract-full-$STAMP.sql.gz"
   ```
2. ตรวจก่อนลบ (**ด่าน: ต้องผ่านก่อนรัน migration 9** เพราะ migration 9 ลบแถว staff ทุกแถวใน `users`):
   แถว staff ใน `users` ทุกแถวมีใน `employees` ด้วย id เดียวกัน และไม่มี staff ที่ขาดจาก `employees`:
   ```bash
   mariadb "$DB" -e "SELECT COUNT(*) AS staff_in_users FROM users WHERE role='staff'; SELECT COUNT(*) AS imported FROM employees WHERE id IN (SELECT id FROM users WHERE role='staff');"
   mariadb "$DB" -e "SELECT u.id FROM users u LEFT JOIN employees e ON e.id = u.id WHERE u.role='staff' AND e.id IS NULL;"
   ```
   `staff_in_users` = `imported` = จำนวนพนักงานที่คัดลอกมา (ขั้น 2 ข้อ 3; `employees` ทั้งหมดอาจมากกว่าถ้ามีพนักงานใหม่ใน admin)
   และคำสั่งที่สองได้ `Empty set` (ไม่มี staff ที่ขาดจาก `employees`) ถ้าไม่ผ่าน: รัน `npm run db -- import-staff` ก่อน
   (ยังใช้ได้เพราะ `staff_roles` ยังอยู่) แล้วตรวจซ้ำ สามารถรันคำสั่งตรวจของขั้น 1 ข้อ 2 ซ้ำโดยเปลี่ยน
   `(SELECT id FROM users WHERE role='staff')` เป็น `(SELECT id FROM employees)` ต้องได้ `Empty set` เช่นกัน

   **ตรวจ FK ที่จะขวาง `DELETE FROM users WHERE role = 'staff'`** (FK เหล่านี้ไม่มี `ON DELETE CASCADE`
   ชื่อคอลัมน์ตาม member `src/server/db/migrations.ts`) อ่านอย่างเดียว:
   ```bash
   mariadb "$DB" -e "
   SELECT 'bills.user_id' AS ref, COUNT(*) AS n FROM bills WHERE user_id IN (SELECT id FROM users WHERE role='staff')
   UNION ALL SELECT 'transactions.user_id', COUNT(*) FROM transactions WHERE user_id IN (SELECT id FROM users WHERE role='staff')
   UNION ALL SELECT 'deposits.user_id', COUNT(*) FROM deposits WHERE user_id IN (SELECT id FROM users WHERE role='staff')
   UNION ALL SELECT 'withdrawals.user_id', COUNT(*) FROM withdrawals WHERE user_id IN (SELECT id FROM users WHERE role='staff')
   UNION ALL SELECT 'promotion_claims.user_id', COUNT(*) FROM promotion_claims WHERE user_id IN (SELECT id FROM users WHERE role='staff')
   UNION ALL SELECT 'voucher_redemptions.user_id', COUNT(*) FROM voucher_redemptions WHERE user_id IN (SELECT id FROM users WHERE role='staff')
   UNION ALL SELECT 'users.upline1_id', COUNT(*) FROM users WHERE upline1_id IN (SELECT id FROM users WHERE role='staff')
   UNION ALL SELECT 'users.upline2_id', COUNT(*) FROM users WHERE upline2_id IN (SELECT id FROM users WHERE role='staff');"
   ```
   `n` ต้องเป็น `0` **ทุกแถว** ถ้าแถวใด > 0: **หยุด** ห้ามรัน migration 9 สืบว่าแถวนั้นมาจากไหน (staff มีโพย/รายการเงิน/เป็น upline)
   และตัดสินใจกับเจ้าของระบบ **ห้าม "แก้" ด้วยการลบแถวเงิน** (`bills`, `transactions`, `deposits`, `withdrawals` ฯลฯ)
   FK ที่ **cascade** (แถวจะถูกลบไปพร้อม staff ไม่ขวาง): `sessions`, `login_challenges`, `number_sets`, `ref_clicks`, `member_points`
   หมายเหตุ: `DELETE` เป็นคำสั่งเดียวใน InnoDB จึง atomic ถ้า FK ขวางจะล้มทั้งคำสั่งและไม่มีแถวใดถูกลบ;
   migration 9 รันซ้ำได้ (คำสั่ง DDL ทุกคำสั่งใช้ `IF EXISTS`) ถ้าล้มกลางทาง แก้สาเหตุแล้วรัน `npm run db -- migrate` ข้อ 4 ซ้ำได้เลย
3. เปิดโหมดปิดปรับปรุง (`touch /etc/nginx/maintenance.on`) และตั้ง admin `SCHEDULER=off` ชั่วคราว (ALTER TABLE `users` ล็อกตาราง)
4. รัน migration 9 ของ member ด้วยผู้ใช้สิทธิ์สูง จาก tag `admin-split-contract` (ไม่ใช่ `git pull`):
   ```bash
   cd "$MEMBER_DIR" && git fetch --tags && git checkout admin-split-contract && git log --oneline -1 && npm ci
   DATABASE_URL="$MIGRATE_URL" npm run db -- migrate && DATABASE_URL="$MIGRATE_URL" npm run db -- status
   ```
5. Deploy member build ที่มี migration 9 (Task 15) = checkout `admin-split-contract` เดิมจากข้อ 4 (`DB_AUTO_MIGRATE=false` ยังอยู่)
   (admin ไม่ต้อง deploy ใหม่), คืน admin `SCHEDULER=on` แล้วปิดโหมดปิดปรับปรุง:
   ```bash
   cd "$MEMBER_DIR" && git describe --tags --exact-match && grep '^DB_AUTO_MIGRATE=' .env.production.local
   npm ci && npm run build && cp -r .next/static .next/standalone/.next/ && cp .env.production.local .next/standalone/ && pm2 reload chokprathan
   ```
   `grants.sql` ไม่ต้องรันซ้ำ (สิทธิ์เดิมบน `staff_roles` ที่ค้างอยู่ไม่มีผล) ถ้าจะรันซ้ำหลัง contract ให้ตัดบรรทัด GRANT
   บน `lotto.staff_roles` ทั้งสองบรรทัดออกก่อน เพราะ GRANT ระดับตารางบนตารางที่ไม่มีแล้วจะล้ม

**Verify:**
```bash
mariadb "$DB" -e "SELECT COUNT(*) AS staff_columns FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME IN ('staff_role_id','totp_secret','totp_enabled','totp_last_step','must_change_password'); SELECT COUNT(*) AS staff_roles_table FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'staff_roles'; SELECT COUNT(*) AS non_members FROM users WHERE role <> 'member';"
mariadb "$DB" -e "SELECT COUNT(*) AS kept_columns FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME IN ('role','staff_note');"
cd "$ADMIN_DIR" && DATABASE_URL="$MIGRATE_URL" npm run db -- import-staff
```
`staff_columns`, `staff_roles_table`, `non_members` เป็น `0` ทั้งหมด; `kept_columns` เป็น `2`; `import-staff` พิมพ์
`employee_roles: 0, employees: 0` โดยไม่ error; member `npm run db -- status` ได้ schema version 9; พนักงานเข้า admin ได้
และหน้ารายชื่อสมาชิกของ admin แสดงสมาชิกครบ, สมาชิกเข้า member ได้, `/api/health` ทั้งสองแอป `ok`,
แถว `system_status.name='scheduler'` มี `value.host` เป็นเครื่อง admin และ `updated_at` ไม่เกิน ~40 วินาที

---

## กลุ่มหวยและงวดแบบสร้างเอง (member migration 10 และ 11)

ทำหลัง Contract (ขั้น 6) เสร็จแล้วเท่านั้น: `migrate` รันทุก migration ที่ค้าง ถ้าฐานยังต่ำกว่า 9 จะลบข้อมูลพนักงานเดิมไปด้วย

1. `cd "$MEMBER_DIR" && DATABASE_URL="$MIGRATE_URL" npm run db -- migrate`
2. ให้สิทธิ์ใหม่จาก `scripts/grants.sql`: บรรทัด `lotto.lotto_groups` ทั้งของ `chok_admin` และ `chok_member` และบรรทัด `lotto.lottos` ของ `chok_admin` (เพิ่ม INSERT สำหรับเพิ่มหวยใหม่)
3. deploy member แล้วจึง deploy admin

**Verify:** member `npm run db -- status` ได้ schema version 11; หน้า "ประเภทหวย" ใน admin เพิ่มกลุ่มได้; หน้าแทงหวยของ member แสดงปกติ

---

## แพ็กเกจราคาและค่าประจำงวด (member migration 12)

เพิ่มตารางอย่างเดียว ไม่ลบข้อมูล

1. `cd "$MEMBER_DIR" && DATABASE_URL="$MIGRATE_URL" npm run db -- migrate`
2. ให้สิทธิ์ใหม่จาก `scripts/grants.sql` (ตาราง `price_packages`, `package_rates`, `risk_profiles`, `lotto_bet_types`, `lotto_packages`, `lotto_rate_overrides`, `round_configs` ของทั้งสองผู้ใช้)
3. deploy member แล้วจึง deploy admin

**Verify:** member `npm run db -- status` ได้ schema version 12; ภายใน 5 นาที `SELECT COUNT(*) FROM round_configs` มากกว่า 0

---

## แทงจากค่าประจำงวด (member migration 13)

ลำดับสำคัญ: หน้าแทงรุ่นใหม่ไม่รับโพยของงวดที่ยังไม่มีค่าประจำงวด

1. `cd "$MEMBER_DIR" && DATABASE_URL="$MIGRATE_URL" npm run db -- migrate`
2. deploy **admin ก่อน** (ต้องเสร็จขั้นของ migration 12 แล้ว)
3. **Verify:** ทุกงวดที่ยังเปิดมีค่า: `SELECT COUNT(*) FROM rounds r WHERE r.status='scheduled' AND r.closes_at > UNIX_TIMESTAMP()*1000 AND NOT EXISTS (SELECT 1 FROM round_configs c WHERE c.round_id=r.id)` ได้ 0
4. deploy member

**Verify:** วางโพยทดสอบหนึ่งใบได้ และ `bills.config_version` ไม่เป็น NULL

---

## รอบจ่ายรางวัลและการยืนยันผล (member migration 14)

หลังบ้านรุ่นใหม่ใช้ตารางและคอลัมน์ของ migration นี้ทั้งตอนสร้างงวดและจ่ายรางวัล จึงต้อง migrate ก่อน

1. `cd "$MEMBER_DIR" && DATABASE_URL="$MIGRATE_URL" npm run db -- migrate`
2. ให้สิทธิ์ใหม่จาก `scripts/grants.sql` (`round_results`, `settlement_runs` ของทั้งสองผู้ใช้)
3. deploy admin แล้วจึง deploy member

**Verify:** หลังออกผลงวดแรก `SELECT status, COUNT(*) FROM settlement_runs GROUP BY status` ไม่มี `mismatch`

ถ้ามี `mismatch`: งวดจะค้างที่ "จ่ายไม่ครบ" และตัวตั้งเวลาไม่ลองซ้ำ ดูตัวเลขใน `settlement_runs.report` แล้วตรวจ `transactions` ที่มี `run_id` นั้นก่อนแก้

---

## ยืนยันผลสองคน (ทำก่อนหรือพร้อม deploy หลังบ้านรุ่นนี้)

หวยที่กรอกผลเองจะจ่ายรางวัลได้ต่อเมื่อพนักงาน **สองบัญชี** ทำงานร่วมกัน ไม่มีข้อยกเว้นแม้แต่เจ้าของระบบ

1. ใช้สิทธิ์ใหม่จาก `scripts/grants.sql`: `chok_admin` ต้องมี `SELECT, INSERT, UPDATE` บน `round_results`
2. หลัง deploy ให้สิทธิ์ "ยืนยันผลรางวัลที่คนอื่นกรอก" (`rounds.confirm`) แก่ตำแหน่งที่ต้องการในหน้าพนักงานและสิทธิ์
   ตำแหน่งที่มีอยู่แล้วไม่ได้รับสิทธิ์นี้อัตโนมัติ (ยกเว้นเจ้าของระบบ)

**Verify:** มีพนักงานสถานะใช้งานอย่างน้อยสองคนที่กรอกหรือยืนยันผลได้ แล้วกรอกผลงวดแรกด้วยคนหนึ่งและยืนยันด้วยอีกคน

---

## 7. ข้อจำกัดที่รู้อยู่และกฎที่ต้องรักษาต่อไป

1. **กติการ่วม:** logic เงินและหวยอยู่ใน `chokprathan-core` ที่เดียว สองแอปต้องอ้าง tag เดียวกัน
   การเปลี่ยนพฤติกรรมให้แก้ที่ repo นั้น ออก tag ใหม่ แล้วอัปเดตทั้งสองแอป
2. **ข้อมูลพนักงานแก้ที่ admin เท่านั้นหลัง Switch** (พนักงาน, ตำแหน่ง, session, audit log) member ไม่เขียนตารางเหล่านี้อีก
   และ `chok_member` ไม่มีสิทธิ์
3. **Cache TTL:** ค่าที่ admin แก้ (settings, blocklist, lottos, banners, theme) ถึงหน้า member หลังหมด TTL ของ cache ฝั่ง member
   (≤ 5 วินาทีสำหรับค่าสำคัญตาม `docs/cache-ttl-audit.md` ของ member, ค่าอื่นตามที่บันทึกในไฟล์นั้น) ไม่มี invalidate ข้ามแอป
4. **ประวัติ:** การเข้าสู่ระบบของพนักงานก่อน Switch อยู่ใน `auth_log` (MariaDB/Mongo) ของ member เป็น archive ไม่แสดงใน admin
5. **Scheduler:** admin เป็นเจ้าของงานรอบ/settlement/ฝาก/audit/stats ถ้า admin ล่มทั้งหมด การออกผลและจ่ายรางวัลล่าช้า
   (การรับแทงยังถูกจำกัดด้วยเวลาปิดรอบ) ให้รัน admin 2 replica เสมอ และห้ามเปิด scheduler แบบเดิมใน member อีก
   `simulateCrowd` (โหลดจำลองบน staging) ไม่ย้ายมา admin
6. **`/api/health` field `scheduler`** ของ admin อ่านแถว `system_status.name='scheduler'` (เขียนโดย admin) ส่วนของ member
   อ่านแถว `member_scheduler` (เขียนโดย member) `value.host`/`value.pid` ของแต่ละแถวบอกว่า process ไหนทำ tick ล่าสุด
   (`IS_USED_LOCK` เห็น lock เฉพาะช่วงไม่กี่มิลลิวินาทีที่ tick กำลังทำงาน จึงใช้ตรวจไม่ได้)
7. **ความลับ AMB** อยู่ที่ member เท่านั้น
8. **Migration ของ member** รันด้วย `MIGRATE_URL` แยกเสมอ (member รันด้วย `DB_AUTO_MIGRATE=false`) และหลังเพิ่มตารางใหม่ใน member
   ต้องเพิ่ม GRANT ให้ `chok_member` (`node scripts/check-grants.mjs --member "$MEMBER_DIR"` จะฟ้องถ้าขาด)
