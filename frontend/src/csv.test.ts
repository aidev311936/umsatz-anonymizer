import { describe, expect, it } from "vitest";
import { Buffer } from "node:buffer";
import { parseCsv } from "./csv";

describe("parseCsv", () => {
  it("decodes Windows-1252 encoded CSV files", async () => {
    const csvContent = "Spalte1;Spalte2\näöü;ÄÖÜß";
    const bytes = Buffer.from(csvContent, "latin1");
    const file = new File([bytes], "test.csv", { type: "text/csv" });

    const rows = await parseCsv(file);

    expect(rows).toEqual([
      ["Spalte1", "Spalte2"],
      ["äöü", "ÄÖÜß"],
    ]);
  });
});
