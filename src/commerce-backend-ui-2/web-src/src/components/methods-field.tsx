import { Picker, PickerItem } from "@react-spectrum/s2/Picker";
import { style } from "@react-spectrum/s2/style" with { type: "macro" };
import { TextField } from "@react-spectrum/s2/TextField";

import { methodMatches } from "#engine";

import type { RuleAction, RuleType } from "../lib/types.ts";

export type MethodsFieldProps = {
  action: RuleAction;
  type: RuleType;
  known: string[];
  value: string[];
  onChange: (methods: string[]) => void;
};

/**
 * Methods as two inputs that edit one list: a picker of the store's known methods, and a text
 * field for anything else (codes the list doesn't have, or patterns such as ups_*).
 */
export function MethodsField({
  action,
  type,
  known,
  value,
  onChange,
}: MethodsFieldProps) {
  const isKnown = (code: string) => known.includes(code);
  const picked = value.filter(isKnown);
  const others = value.filter((code) => !isKnown(code));
  const items = known.map((code) => ({ id: code }));
  const format =
    type === "shipping"
      ? "Shipping methods are carrier_method, for example flatrate_flatrate or ups_GND."
      : "Payment methods are their codes, for example checkmo.";
  const wildcard = others.filter((code) => code.endsWith("*"));
  const covered = wildcard.length
    ? known.filter((code) => wildcard.some((p) => methodMatches(p, code)))
    : [];

  return (
    <div
      className={style({
        display: "grid",
        gap: 16,
        gridTemplateColumns: { default: "1fr", md: "1fr" },
      })}>
      <Picker
        description={
          action === "allow_only"
            ? "Shoppers see only these. Every other method on your list is hidden."
            : "Shoppers don't see these."
        }
        items={items}
        label={`${type === "payment" ? "Payment" : "Shipping"} methods`}
        onChange={(keys) =>
          onChange([...(keys as Iterable<unknown>)].map(String).concat(others))
        }
        placeholder="Choose methods"
        selectionMode="multiple"
        value={picked}>
        {(item) => <PickerItem id={item.id}>{item.id}</PickerItem>}
      </Picker>
      <TextField
        description={`${format} End with * to match a prefix.${covered.length ? ` Matches ${covered.join(", ")}.` : ""}`}
        label="Other codes or patterns"
        onChange={(text) =>
          onChange(
            picked.concat(
              text
                .split(",")
                .map((code) => code.trim())
                .filter(Boolean),
            ),
          )
        }
        placeholder="ups_*, my_custom_method"
        value={others.join(", ")}
      />
    </div>
  );
}
