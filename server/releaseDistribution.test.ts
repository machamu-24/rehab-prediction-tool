import { describe, it, expect, vi } from "vitest";
import { readFile } from "node:fs/promises";
import {
  exportLiteratureSeed,
  importLiteratureSeed,
  validateLiteratureSeed,
  seedDigest,
} from "../scripts/lib/literature-seed.mjs";

const seed = JSON.parse(
  await readFile(
    new URL("../release/literature.seed.json", import.meta.url),
    "utf8"
  )
);
describe("配布用の文献データ", () => {
  it("文献・アウトカムのみを含み、参照先とチェックサムが一致する", () => {
    const p = validateLiteratureSeed(seed);
    expect(Object.keys(p.tables).sort()).toEqual([
      "literature_rules",
      "outcomes",
    ]);
    expect(p.tables.literature_rules.length).toBeGreaterThan(0);
    expect(JSON.stringify(p)).not.toContain("patientInputs");
  });
  it("履歴混入はチェックサムを更新しても拒否する", () => {
    const mixed = structuredClone(seed);
    mixed.payload.tables.predictions = [{ id: 1, patientInputs: { age: 70 } }];
    mixed.checksum = seedDigest(mixed.payload);
    expect(() => validateLiteratureSeed(mixed)).toThrow("文献以外");
  });
  it("余分な列・欠けた列・改ざん・重複ID・参照切れを拒否する", () => {
    for (const mutate of [
      (p: any) => {
        p.tables.outcomes[0].patientInputs = {};
      },
      (p: any) => {
        delete p.tables.literature_rules[0].source;
      },
      (p: any) => {
        p.tables.literature_rules[0].outcomeId = -1;
      },
      (p: any) => {
        p.tables.outcomes.push(p.tables.outcomes[0]);
      },
    ]) {
      const invalid = structuredClone(seed);
      mutate(invalid.payload);
      invalid.checksum = seedDigest(invalid.payload);
      expect(() => validateLiteratureSeed(invalid)).toThrow();
    }
    const tampered = structuredClone(seed);
    tampered.payload.tables.outcomes[0].name = "変更";
    expect(() => validateLiteratureSeed(tampered)).toThrow("チェックサム");
  });
  it("既存履歴があれば1行も挿入・削除せず取り込みを拒否する", async () => {
    const connection = {
      query: vi.fn(async (sql: string) =>
        sql.startsWith("SELECT COUNT")
          ? [[{ n: sql.includes("`predictions`") ? 1 : 0 }]]
          : [[]]
      ),
      beginTransaction: vi.fn(),
      rollback: vi.fn(),
      commit: vi.fn(),
      execute: vi.fn(),
    };
    await expect(importLiteratureSeed(connection, seed)).rejects.toThrow(
      "既存データ"
    );
    expect(connection.execute).not.toHaveBeenCalled();
    expect(connection.commit).not.toHaveBeenCalled();
    expect(connection.rollback).toHaveBeenCalledOnce();
    expect(
      connection.query.mock.calls.some(([sql]) =>
        /DELETE|TRUNCATE|DROP/.test(sql)
      )
    ).toBe(false);
  });
  it("最新文献の書き出しは履歴を読み取らず、取得失敗時はロールバックする", async () => {
    const connection = {
      query: vi.fn(async (sql: string) => {
        if (sql.startsWith("SELECT"))
          return [
            sql.includes("`literature_rules`")
              ? seed.payload.tables.literature_rules
              : seed.payload.tables.outcomes,
          ];
        return [[]];
      }),
      beginTransaction: vi.fn(),
      rollback: vi.fn(),
      commit: vi.fn(),
    };
    expect(
      validateLiteratureSeed(await exportLiteratureSeed(connection)).tables
    ).toEqual(seed.payload.tables);
    expect(
      connection.query.mock.calls.every(
        ([sql]) => !/predictions|prediction_results|users/.test(sql)
      )
    ).toBe(true);
    connection.query.mockImplementation(async (sql: string) => {
      if (sql.startsWith("SELECT")) throw new Error("テスト接続失敗");
      return [[]];
    });
    await expect(exportLiteratureSeed(connection)).rejects.toThrow();
    expect(connection.rollback).toHaveBeenCalledOnce();
  });
});
