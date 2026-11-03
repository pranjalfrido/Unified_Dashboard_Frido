// The master seed loads cleanly, can be re-run without duplicating anything, and maps
// each bill-ledger account pair to exactly one account.
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { freshDb } from "./pgHarness.js";

const seed = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../../../scripts/sql/cn/002_cn_master_seed.sql"), "utf8");
let db;
const counts = async () => (await db.query(`
  SELECT (SELECT count(*)::int FROM cn_couriers) couriers, (SELECT count(*)::int FROM cn_courier_accounts) accounts,
         (SELECT count(*)::int FROM cn_transporters) transporters, (SELECT count(*)::int FROM cn_3pl_partners) partners,
         (SELECT count(*)::int FROM cn_3pl_facilities) facilities`)).rows[0];

beforeAll(async () => { db = await freshDb(); await db.exec(seed); });

describe("master seed", () => {
  it("loads the confirmed masters", async () => {
    expect(await counts()).toEqual({ couriers: 9, accounts: 27, transporters: 8, partners: 5, facilities: 8 });
  });

  it("can be re-run without duplicating anything", async () => {
    await db.exec(seed);
    expect(await counts()).toEqual({ couriers: 9, accounts: 27, transporters: 8, partners: 5, facilities: 8 });
  });

  it("maps no ledger courier/account-type pair to two accounts", async () => {
    const dupes = (await db.query(`
      SELECT k->>'courier' courier, k->>'account_type' account_type, count(*)::int n
        FROM cn_courier_accounts, jsonb_array_elements(ledger_keys) k
       GROUP BY 1, 2 HAVING count(*) > 1`)).rows;
    expect(dupes).toEqual([]);
  });

  it("puts Bluedart B2B under Bluedart and the Gurgaon facilities in Gurgaon", async () => {
    const r = (await db.query(`SELECT c.name courier FROM cn_courier_accounts a JOIN cn_couriers c ON c.id = a.courier_id WHERE a.name = 'Bluedart B2B'`)).rows;
    expect(r).toEqual([{ courier: "Bluedart" }]);
    const g = (await db.query(`SELECT name, location FROM cn_3pl_facilities WHERE name IN ('Gurgaon_Hexalog', 'Hexalog_GGN2') ORDER BY name`)).rows;
    expect(g).toEqual([{ name: "Gurgaon_Hexalog", location: "Gurgaon" }, { name: "Hexalog_GGN2", location: "Gurgaon" }]);
  });
});
