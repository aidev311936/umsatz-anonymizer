import { beforeEach, describe, expect, it } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useImportStore } from "./import";

describe("useImportStore hasHeader state", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("allows updating the hasHeader state flag", () => {
    const store = useImportStore();

    expect(store.hasHeader).toBe(false);

    store.hasHeader = true;

    expect(store.hasHeader).toBe(true);

    store.reset();

    expect(store.hasHeader).toBe(false);
  });
});
