#!/usr/bin/env python3
"""
Additively insert the documented test accounts (testadmin / testapplicant /
testevaluator) into the RMIS production SQLite database. This replicates
EXACTLY what the RMISv2 repo's db/production-data.db contains on top of the
original production data.db:

  - up_users:  testadmin      (id=129, is_admin=1)        password = "password123"
  - up_users:  testapplicant  (id=130, is_applicant=1)    password = "password123"
  - up_users:  testevaluator  (id=131, is_admin=NULL, is_applicant=NULL,
                               linked to role_id=1 Authenticated)
                                                            password = "password123"
  - up_users_role_lnk:          (16, 129 -> role 1 Authenticated)
                                (17, 130 -> role 3 applicants)
                                (18, 131 -> role 1 Authenticated)
  - up_users_applicant_id_lnk:  (530, 130 -> applicant 568)
  - applicants:                 id=568  (testapplicant's profile)
  - sqlite_sequence bumped for the 4 tables.

IDEMPOTENT (INSERT OR IGNORE) and ADDITIVE — never deletes/modifies production rows.

Role derivation (see src/lib/role-utils.ts deriveUserRole):
    is_admin=true                         -> ADMIN
    else linked to role_id=3 (applicants) -> APPLICANT
    else                                  -> EVALUATOR

So testevaluator (is_admin=NULL, role_id=1, NOT role_id=3) -> EVALUATOR.

Login:
    testadmin / password123        -> Administrator
    testapplicant / password123    -> Applicant
    testevaluator / password123    -> Evaluator
"""
import sqlite3
import sys
import os

DB_PATH = sys.argv[1] if len(sys.argv) > 1 else "db/production-data.db"

if not os.path.exists(DB_PATH):
    print("ERROR: database not found at " + DB_PATH, file=sys.stderr)
    sys.exit(1)

con = sqlite3.connect(DB_PATH)
cur = con.cursor()

# bcrypt(cost 10) hashes of "password123", copied verbatim from the RMISv2 repo DB
TESTADMIN_PW = "$2b$10$ND.ZfTXGiw7HuURTFu5fN..RHdd258iMODS4AmbvrJta81BfWOyKG"
TESTAPPLICANT_PW = "$2b$10$8XWSuj7Xb.oWOEQvQCSfSOaPzpUIA7ius4gEHYheqcwamiYdAR2sC"
# testevaluator reuses the same password hash as testapplicant (both = "password123")
TESTEVALUATOR_PW = TESTAPPLICANT_PW
now_ms = 1786006027941  # epoch ms

# 1. up_users: testadmin (id=129)
cur.execute(
    """INSERT OR IGNORE INTO up_users
       (id, document_id, username, email, provider, password, confirmed, blocked,
        created_at, updated_at, is_admin, is_applicant, first_name, last_name)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
    (129, None, "testadmin", "testadmin@rmis.test", None, TESTADMIN_PW, 1, 0,
     now_ms, now_ms, 1, None, "Test", "Admin"),
)
# 2. up_users: testapplicant (id=130)
cur.execute(
    """INSERT OR IGNORE INTO up_users
       (id, document_id, username, email, provider, password, confirmed, blocked,
        created_at, updated_at, is_admin, is_applicant, first_name, last_name)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
    (130, None, "testapplicant", "testapplicant@rmis.test", None, TESTAPPLICANT_PW, 1, 0,
     now_ms, now_ms, None, 1, "Test", "Applicant"),
)
# 2b. up_users: testevaluator (id=131)
#     is_admin=NULL + is_applicant=NULL + linked to role_id=1 (Authenticated)
#     -> deriveUserRole returns EVALUATOR (not admin, not applicant).
cur.execute(
    """INSERT OR IGNORE INTO up_users
       (id, document_id, username, email, provider, password, confirmed, blocked,
        created_at, updated_at, is_admin, is_applicant, first_name, last_name)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
    (131, None, "testevaluator", "testevaluator@rmis.test", None, TESTEVALUATOR_PW, 1, 0,
     now_ms, now_ms, None, None, "Test", "Evaluator"),
)
# 3. role links
cur.execute("INSERT OR IGNORE INTO up_users_role_lnk (id, user_id, role_id, user_ord) VALUES (?,?,?,?)", (16, 129, 1, None))
cur.execute("INSERT OR IGNORE INTO up_users_role_lnk (id, user_id, role_id, user_ord) VALUES (?,?,?,?)", (17, 130, 3, None))
cur.execute("INSERT OR IGNORE INTO up_users_role_lnk (id, user_id, role_id, user_ord) VALUES (?,?,?,?)", (18, 131, 1, None))
# 4. applicant link (user 130 -> applicant 568)
cur.execute("INSERT OR IGNORE INTO up_users_applicant_id_lnk (id, user_id, applicant_id) VALUES (?,?,?)", (530, 130, 568))
# 5. applicants: id=568 (testapplicant's profile)
#    is_fillouted=0 + submitted_date=NULL so the profile correctly reflects
#    its actual (incomplete) state. The applicant can fill in sections and
#    click "Mark Profile Complete" themselves to test that flow.
cur.execute(
    """INSERT OR IGNORE INTO applicants
       (id, document_id, first_name, last_name, email_address, gender, civil_status,
        citizenship, created_at, updated_at, submitted_date, is_fillouted)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
    (568, None, "Test", "Applicant", "testapplicant@rmis.test", "Male", "Single",
     "Filipino", now_ms, now_ms, None, 0),
)
# If the row already existed (from a previous run that set is_fillouted=1),
# correct it so the displayed status matches the actual (empty) profile.
cur.execute(
    """UPDATE applicants SET is_fillouted=0, submitted_date=NULL
       WHERE id=568 AND (
         is_fillouted=1 OR submitted_date IS NOT NULL
       )"""
)
# 6. bump sqlite_sequence
for tbl, seq in [("up_users", 131), ("up_users_role_lnk", 18),
                 ("up_users_applicant_id_lnk", 530), ("applicants", 568)]:
    cur.execute("UPDATE sqlite_sequence SET seq=? WHERE name=?", (seq, tbl))

con.commit()

print("=== Verification ===")
print("up_users count:", cur.execute("SELECT COUNT(*) FROM up_users").fetchone()[0])
print("testadmin:", cur.execute("SELECT id, username, email, is_admin, confirmed, blocked FROM up_users WHERE username='testadmin'").fetchone())
print("testapplicant:", cur.execute("SELECT id, username, email, is_applicant, confirmed, blocked FROM up_users WHERE username='testapplicant'").fetchone())
print("testevaluator:", cur.execute("SELECT id, username, email, is_admin, is_applicant, confirmed, blocked FROM up_users WHERE username='testevaluator'").fetchone())
print("applicants count:", cur.execute("SELECT COUNT(*) FROM applicants").fetchone()[0])
print("applicant 568:", cur.execute("SELECT id, first_name, last_name, email_address FROM applicants WHERE id=568").fetchone())
print("role links (129,130,131):", cur.execute("SELECT * FROM up_users_role_lnk WHERE user_id IN (129,130,131)").fetchall())
print("applicant link (130):", cur.execute("SELECT * FROM up_users_applicant_id_lnk WHERE user_id=130").fetchall())
print("sqlite_sequence:", cur.execute("SELECT name, seq FROM sqlite_sequence WHERE name IN ('up_users','up_users_role_lnk','up_users_applicant_id_lnk','applicants')").fetchall())
con.close()
print("\nOK: test accounts ready. Login: testadmin/password123 (Admin) | testapplicant/password123 (Applicant) | testevaluator/password123 (Evaluator)")
