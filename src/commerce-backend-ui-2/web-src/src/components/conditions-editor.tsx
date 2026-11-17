import { ActionButton } from "@react-spectrum/s2/ActionButton";
import { Button } from "@react-spectrum/s2/Button";
import Delete from "@react-spectrum/s2/icons/Delete";
import { NumberField } from "@react-spectrum/s2/NumberField";
import { Picker, PickerItem } from "@react-spectrum/s2/Picker";
import { style } from "@react-spectrum/s2/style" with { type: "macro" };
import { Text } from "@react-spectrum/s2/Text";
import { TextField } from "@react-spectrum/s2/TextField";

import { ATTRIBUTE_PREFIX } from "#engine";

import {
  attributeCode,
  DAY_LABELS,
  DAY_ORDER,
  defaultCondition,
  FIELD_LABELS,
  FIELD_ORDER,
  fieldKey,
  needsValue,
  newCondition,
  operatorLabel,
  operatorsFor,
  typeOfKey,
} from "../lib/rules.ts";

import type { Key } from "react-aria-components";
import type { ConditionLeaf, Lookups, MatchMode } from "../lib/types.ts";

export type ConditionsEditorProps = {
  conditions: ConditionLeaf[];
  match: MatchMode;
  lookups: Lookups | null;
  onChange: (conditions: ConditionLeaf[]) => void;
  onMatchChange: (match: MatchMode) => void;
};

const row = style({
  alignItems: "end",
  display: "grid",
  gap: 12,
  gridTemplateColumns: {
    default: "1fr",
    md: "minmax(180px, 1.2fr) minmax(140px, 1fr) minmax(200px, 1.5fr) auto",
  },
});

const splitList = (value: unknown) =>
  String(value ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

/** The options a field can pick from, when the Admin knows them. */
function optionsFor(
  key: string,
  lookups: Lookups | null,
): { id: string; label: string }[] | null {
  if (key === "day_of_week") {
    return DAY_ORDER.map((id) => ({ id, label: DAY_LABELS[id] }));
  }
  if (key === "customer_group" && lookups?.customerGroups.length) {
    return lookups.customerGroups.map((g) => ({
      id: g.id,
      label: `${g.label} (${g.id})`,
    }));
  }
  if (key === "store_id" && lookups?.storeViews.length) {
    return lookups.storeViews.map((s) => ({
      id: s.id,
      label: `${s.label} (${s.code})`,
    }));
  }
  return null;
}

function placeholderFor(key: string, op: string): string | undefined {
  if (op === "between") {
    return key === "time" ? "09:00, 17:00" : "100, 500";
  }
  if (key === "time") {
    return "HH:MM";
  }
  if (op === "in" || op === "nin" || op === "starts_with") {
    return "comma-separated";
  }
}

function ValueInput({
  condition,
  index,
  lookups,
  onChange,
}: {
  condition: ConditionLeaf;
  index: number;
  lookups: Lookups | null;
  onChange: (condition: ConditionLeaf) => void;
}) {
  const key = fieldKey(condition.field);
  const type = typeOfKey(key);
  const label = index === 0 ? "Value" : undefined;
  const ariaLabel = `Condition ${index + 1} value`;
  const options = optionsFor(key, lookups);

  if (!needsValue(condition.op)) {
    return <div />;
  }
  if (type === "boolean") {
    return (
      <Picker
        aria-label={ariaLabel}
        label={label}
        onSelectionChange={(value) =>
          onChange({ ...condition, value: value === "yes" })
        }
        selectedKey={
          condition.value === false || condition.value === "false"
            ? "no"
            : "yes"
        }>
        <PickerItem id="yes">Yes</PickerItem>
        <PickerItem id="no">No</PickerItem>
      </Picker>
    );
  }
  if (options && (condition.op === "in" || condition.op === "nin")) {
    return (
      <Picker
        aria-label={ariaLabel}
        items={options}
        label={label}
        onChange={(keys) =>
          onChange({
            ...condition,
            value: [...(keys as Iterable<unknown>)].map(String).join(", "),
          })
        }
        placeholder="Choose"
        selectionMode="multiple"
        value={splitList(condition.value)}>
        {(item) => (
          <PickerItem id={item.id} textValue={item.label}>
            {item.label}
          </PickerItem>
        )}
      </Picker>
    );
  }
  if (options && (condition.op === "eq" || condition.op === "neq")) {
    return (
      <Picker
        aria-label={ariaLabel}
        items={options}
        label={label}
        onSelectionChange={(value: Key | null) =>
          onChange({ ...condition, value: String(value ?? "") })
        }
        placeholder="Choose"
        selectedKey={String(condition.value ?? "") || null}>
        {(item) => (
          <PickerItem id={item.id} textValue={item.label}>
            {item.label}
          </PickerItem>
        )}
      </Picker>
    );
  }
  if (type === "number" && condition.op !== "between") {
    return (
      <NumberField
        aria-label={ariaLabel}
        label={label}
        onChange={(value) =>
          onChange({ ...condition, value: Number.isNaN(value) ? 0 : value })
        }
        value={Number(condition.value ?? 0)}
      />
    );
  }
  return (
    <TextField
      aria-label={ariaLabel}
      label={label}
      onChange={(value) => onChange({ ...condition, value })}
      placeholder={placeholderFor(key, condition.op)}
      value={String(condition.value ?? "")}
    />
  );
}

function ConditionRow({
  condition,
  index,
  lookups,
  onChange,
  onRemove,
}: {
  condition: ConditionLeaf;
  index: number;
  lookups: Lookups | null;
  onChange: (condition: ConditionLeaf) => void;
  onRemove: () => void;
}) {
  const key = fieldKey(condition.field);
  const operators = operatorsFor(key);

  return (
    <div className={row}>
      <div
        className={style({ display: "flex", flexDirection: "column", gap: 8 })}>
        <Picker
          aria-label={`Condition ${index + 1} field`}
          label={index === 0 ? "Field" : undefined}
          onSelectionChange={(next: Key | null) =>
            onChange(defaultCondition(String(next)))
          }
          selectedKey={key}>
          {FIELD_ORDER.map((id) => (
            <PickerItem id={id} key={id}>
              {FIELD_LABELS[id]}
            </PickerItem>
          ))}
        </Picker>
        {key === "attribute" && (
          <TextField
            aria-label={`Condition ${index + 1} attribute code`}
            onChange={(code) =>
              onChange({
                ...condition,
                field: `${ATTRIBUTE_PREFIX}${code.trim().toLowerCase()}`,
              })
            }
            placeholder="attribute code, e.g. hazmat"
            value={attributeCode(condition.field)}
          />
        )}
      </div>
      <Picker
        aria-label={`Condition ${index + 1} operator`}
        label={index === 0 ? "Operator" : undefined}
        onSelectionChange={(op) => {
          const next = String(op);
          const wasList = ["in", "nin"].includes(condition.op);
          const isList = ["in", "nin"].includes(next);
          onChange({
            ...condition,
            op: next,
            value:
              wasList && !isList
                ? splitList(condition.value)[0]
                : condition.value,
          });
        }}
        selectedKey={condition.op}>
        {operators.map((id) => (
          <PickerItem id={id} key={id}>
            {operatorLabel(condition.field, id)}
          </PickerItem>
        ))}
      </Picker>
      <ValueInput
        condition={condition}
        index={index}
        lookups={lookups}
        onChange={onChange}
      />
      <ActionButton
        aria-label={`Remove condition ${index + 1}`}
        isQuiet
        onPress={onRemove}>
        <Delete />
      </ActionButton>
    </div>
  );
}

export function ConditionsEditor({
  conditions,
  match,
  lookups,
  onChange,
  onMatchChange,
}: ConditionsEditorProps) {
  const update = (index: number, condition: ConditionLeaf) =>
    onChange(conditions.map((c, i) => (i === index ? condition : c)));
  const remove = (index: number) =>
    onChange(conditions.filter((_, i) => i !== index));

  return (
    <div
      className={style({ display: "flex", flexDirection: "column", gap: 12 })}>
      {conditions.length > 1 && (
        <Picker
          label="Apply the rule when"
          onSelectionChange={(key) => onMatchChange(String(key) as MatchMode)}
          selectedKey={match}
          styles={style({ maxWidth: 320 })}>
          <PickerItem id="all">All conditions are true</PickerItem>
          <PickerItem id="any">Any condition is true</PickerItem>
        </Picker>
      )}
      {conditions.length === 0 && (
        <Text>No conditions: the rule applies to every checkout.</Text>
      )}
      {conditions.map((condition, index) => (
        <ConditionRow
          condition={condition}
          index={index}
          key={index}
          lookups={lookups}
          onChange={(next) => update(index, next)}
          onRemove={() => remove(index)}
        />
      ))}
      <div>
        <Button
          onPress={() => onChange([...conditions, newCondition()])}
          variant="secondary">
          Add condition
        </Button>
      </div>
      <Text>
        SKU, category and attribute conditions look at every item in the cart:
        "includes one of" matches when any item matches, "includes none of" when
        no item does. Text comparisons ignore case. Day and time use the time
        zone in the app settings
        {lookups?.timezone ? ` (${lookups.timezone})` : ""}.
      </Text>
    </div>
  );
}
