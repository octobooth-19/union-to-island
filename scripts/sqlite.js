import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

export function openDatabase(path = ":memory:") {
  const database = new DatabaseSync(path);
  database.exec(readFileSync(new URL("../migrations/0001_leaderboard.sql", import.meta.url), "utf8"));
  const wrap = (sql, values = []) => ({
    bind(...args) { return wrap(sql, args); },
    async first() { return database.prepare(sql).get(...values) || null; },
    async all() { return { results: database.prepare(sql).all(...values) }; },
  });
  return {
    prepare: sql => wrap(sql),
    async batch(statements) {
      database.exec("BEGIN");
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.all());
        database.exec("COMMIT");
        return results;
      } catch (error) { database.exec("ROLLBACK"); throw error; }
    },
    close() { database.close(); },
    raw: database,
  };
}
