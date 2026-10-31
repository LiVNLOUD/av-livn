import sqlite3

from av_pipeline import backup


def db_query(con):
    con.row_factory = sqlite3.Row

    def q(sql, params):
        return [dict(r) for r in con.execute(sql, params).fetchall()]

    return q


def test_dump_restore_roundtrip_through_sql():
    src = sqlite3.connect(":memory:")
    src.executescript("""
      CREATE TABLE spots (id TEXT PRIMARY KEY, name TEXT, notes TEXT);
      CREATE TABLE field_obs (id TEXT PRIMARY KEY, spot_id TEXT REFERENCES spots(id), note TEXT, light_prob REAL);
      INSERT INTO spots VALUES ('a', 'Ağaçlı''s pier', NULL), ('b', 'B', 'gizli not');
      INSERT INTO field_obs VALUES ('o1', 'a', 'lamba var; "çift"', 0.95);
    """)
    old = backup.PAGE
    backup.PAGE = 1  # exercise paging
    try:
        d = backup.dump(db_query(src))
    finally:
        backup.PAGE = old
    assert backup.counts(d)["spots"] == 2 and d["tables"]["catch_session"] is None
    sql = backup.restore_sql(d)
    dst = sqlite3.connect(":memory:")
    dst.executescript("CREATE TABLE spots (id TEXT PRIMARY KEY, name TEXT, notes TEXT); CREATE TABLE field_obs (id TEXT PRIMARY KEY, spot_id TEXT, note TEXT, light_prob REAL);")
    dst.executescript(sql)
    dst.executescript(sql)  # replay is idempotent
    assert dst.execute("SELECT name FROM spots WHERE id='a'").fetchone()[0] == "Ağaçlı's pier"
    assert dst.execute("SELECT note, light_prob FROM field_obs").fetchall() == [('lamba var; "çift"', 0.95)]
    assert backup.lit(True) == "1" and backup.lit(None) == "NULL"
