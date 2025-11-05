import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";

import MappingEditor from "../MappingEditor.vue";

describe("MappingEditor", () => {
  it("only exposes placeholders when CSV has no header", () => {
    const wrapper = mount(MappingEditor, {
      props: {
        headers: ["Column A", "Column B", "Column C"],
        modelValue: {
          booking_date: ["$2"],
          booking_text: [],
          booking_type: [],
          booking_amount: [],
          booking_date_parse_format: "dd.MM.yyyy",
          without_header: true,
        },
      },
    });

    const firstSelect = wrapper.find("select");
    const optionValues = firstSelect
      .findAll("option")
      .map((option) => option.element.value);

    expect(optionValues).toEqual(["$1", "$2", "$3", "$4", "$5"]);
    expect(optionValues).not.toContain("Column A");
    expect(optionValues).not.toContain("Column B");
    expect(optionValues).not.toContain("Column C");
  });
});
