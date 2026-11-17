import { AlertDialog } from "@react-spectrum/s2/AlertDialog";
import { Button } from "@react-spectrum/s2/Button";
import { ButtonGroup } from "@react-spectrum/s2/ButtonGroup";
import { Checkbox } from "@react-spectrum/s2/Checkbox";
import { Content } from "@react-spectrum/s2/Content";
import { DialogTrigger } from "@react-spectrum/s2/Dialog";
import { Heading } from "@react-spectrum/s2/Heading";
import { InlineAlert } from "@react-spectrum/s2/InlineAlert";
import { NumberField } from "@react-spectrum/s2/NumberField";
import { Picker, PickerItem } from "@react-spectrum/s2/Picker";
import { Switch } from "@react-spectrum/s2/Switch";
import { style } from "@react-spectrum/s2/style" with { type: "macro" };
import { Tab, TabList, TabPanel, Tabs } from "@react-spectrum/s2/Tabs";
import { Text } from "@react-spectrum/s2/Text";
import { TextArea } from "@react-spectrum/s2/TextArea";
import { TextField } from "@react-spectrum/s2/TextField";
import { useMemo, useState } from "react";

import { validateRule } from "#engine";

import { ApiError } from "../hooks/use-restrictions-api.ts";
import {
  ACTION_LABELS,
  cleanRule,
  describeConditions,
  describeMethods,
  TYPE_LABELS,
  toCode,
  toFlat,
  toTree,
} from "../lib/rules.ts";
import { ConditionsEditor } from "./conditions-editor.tsx";
import { MethodsField } from "./methods-field.tsx";

import type { Key } from "react-aria-components";
import type {
  ConditionLeaf,
  Lookups,
  MatchMode,
  Rule,
  RuleAction,
  RuleType,
} from "../lib/types.ts";

export type RuleEditorProps = {
  initial: Rule;
  lookups: Lookups | null;
  onCancel: () => void;
  onDelete: (code: string) => Promise<void>;
  onSave: (rule: Rule, previousCode?: string) => Promise<void>;
  /** The saved code when editing; undefined for a new rule. */
  originalCode?: string;
};

const column = style({
  display: "flex",
  flexDirection: "column",
  gap: 16,
  paddingY: 16,
});
const grid = style({
  display: "grid",
  gap: 16,
  gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
});

const DATE = /^\d{4}-\d{2}-\d{2}$/u;

function dateError(value?: string): string | undefined {
  return value && !DATE.test(value) ? "Use YYYY-MM-DD" : undefined;
}

export function RuleEditor({
  initial,
  originalCode,
  lookups,
  onSave,
  onDelete,
  onCancel,
}: RuleEditorProps) {
  const start = toFlat(initial.conditions);
  const [rule, setRule] = useState<Rule>(initial);
  const [match, setMatch] = useState<MatchMode>(start.match);
  const [conditions, setConditions] = useState<ConditionLeaf[]>(start.list);
  const [nested, setNested] = useState(start.nested);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const isNew = originalCode === undefined;
  const set = (patch: Partial<Rule>) =>
    setRule((current) => ({ ...current, ...patch }));

  const draft = useMemo(
    () =>
      cleanRule({
        ...rule,
        conditions: nested ? rule.conditions : toTree(match, conditions),
      }),
    [rule, match, conditions, nested],
  );
  const problems = useMemo(() => validateRule(draft), [draft]);
  const known =
    (rule.type === "payment"
      ? lookups?.paymentMethods
      : lookups?.shippingMethods) ?? [];

  const handleSave = async () => {
    if (problems.length) {
      setErrors(problems);
      return;
    }
    setSaving(true);
    setErrors([]);
    try {
      await onSave(draft, originalCode);
    } catch (error) {
      setErrors(
        error instanceof ApiError && error.errors.length
          ? error.errors
          : [(error as Error).message],
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <main
      className={style({ display: "flex", flexDirection: "column", gap: 8 })}>
      <div className={style({ alignItems: "center", display: "flex", gap: 8 })}>
        <Heading level={1} styles={style({ flexGrow: 1 })}>
          {isNew ? "New rule" : rule.name || originalCode}
        </Heading>
        <ButtonGroup>
          {!isNew && (
            <DialogTrigger>
              <Button variant="negative">Delete</Button>
              <AlertDialog
                onPrimaryAction={() => onDelete(originalCode)}
                primaryActionLabel="Delete"
                secondaryActionLabel="Cancel"
                title="Delete this rule?"
                variant="destructive">
                Methods “{rule.name}” hides come back at checkout within a
                minute.
              </AlertDialog>
            </DialogTrigger>
          )}
          <Button onPress={onCancel} variant="secondary">
            Cancel
          </Button>
          <Button
            isDisabled={!(rule.code && rule.name)}
            isPending={saving}
            onPress={handleSave}
            variant="accent">
            Save
          </Button>
        </ButtonGroup>
      </div>

      {errors.length > 0 && (
        <InlineAlert variant="negative">
          <Heading>The rule wasn't saved</Heading>
          <Content>
            {errors.map((message) => (
              <div key={message}>{message}</div>
            ))}
          </Content>
        </InlineAlert>
      )}

      <Text>
        <strong>Summary:</strong>{" "}
        {draft.methods.length
          ? `${describeMethods(draft)} when ${describeConditions(draft, lookups).toLowerCase()}.`
          : "Choose at least one method."}
      </Text>

      <Tabs aria-label="Rule settings">
        <TabList>
          <Tab id="rule">Rule</Tab>
          <Tab id="conditions">Conditions</Tab>
          <Tab id="schedule">Schedule</Tab>
        </TabList>

        <TabPanel id="rule">
          <div className={column}>
            <Switch
              isSelected={rule.enabled !== false}
              onChange={(enabled) => set({ enabled })}>
              Apply this rule at checkout
            </Switch>
            <div className={grid}>
              <TextField
                description="Only you see this, in the Admin."
                isRequired
                label="Name"
                onChange={(name) =>
                  set({
                    code:
                      isNew && (!rule.code || rule.code === toCode(rule.name))
                        ? toCode(name)
                        : rule.code,
                    name,
                  })
                }
                value={rule.name}
              />
              <TextField
                description="Unique; a-z, 0-9, - and _. Shown in the app logs."
                isRequired
                label="Code"
                onChange={(code) => set({ code: toCode(code) })}
                value={rule.code}
              />
              <NumberField
                description="Lower numbers are checked first."
                label="Priority"
                onChange={(value) =>
                  set({ priority: Number.isNaN(value) ? 0 : value })
                }
                value={rule.priority ?? 0}
              />
            </div>
            <div className={grid}>
              <Picker
                label="Restricts"
                onSelectionChange={(key: Key | null) =>
                  set({ methods: [], type: String(key) as RuleType })
                }
                selectedKey={rule.type}>
                {Object.entries(TYPE_LABELS).map(([id, label]) => (
                  <PickerItem id={id} key={id}>
                    {`${label} methods`}
                  </PickerItem>
                ))}
              </Picker>
              <Picker
                label="When the conditions match"
                onSelectionChange={(key: Key | null) =>
                  set({ action: String(key) as RuleAction })
                }
                selectedKey={rule.action}>
                {Object.entries(ACTION_LABELS).map(([id, label]) => (
                  <PickerItem id={id} key={id}>
                    {label}
                  </PickerItem>
                ))}
              </Picker>
            </div>
            <MethodsField
              action={rule.action}
              known={known}
              onChange={(methods) => set({ methods })}
              type={rule.type}
              value={rule.methods}
            />
            {rule.action === "allow_only" && known.length === 0 && (
              <InlineAlert variant="notice">
                <Heading>No method list</Heading>
                <Content>
                  "Allow only" hides the methods on your store's method list
                  that the rule doesn't name. Add your methods in the app's
                  settings in App Management.
                </Content>
              </InlineAlert>
            )}
            <Checkbox
              isSelected={rule.stopFurther === true}
              onChange={(stopFurther) => set({ stopFurther })}>
              When this rule applies, skip {rule.type} rules with a higher
              priority number
            </Checkbox>
            <TextArea
              description="Optional. Why the rule exists, for whoever edits it next."
              label="Note"
              onChange={(note) => set({ note })}
              value={rule.note ?? ""}
            />
          </div>
        </TabPanel>

        <TabPanel id="conditions">
          <div className={column}>
            {nested ? (
              <InlineAlert variant="notice">
                <Heading>Nested conditions</Heading>
                <Content>
                  <div
                    className={style({
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                    })}>
                    <Text>
                      This rule's conditions were saved through the API with
                      nested groups, which this editor can't show. They stay as
                      they are unless you replace them.
                    </Text>
                    <div>
                      <Button
                        onPress={() => {
                          setNested(false);
                          setConditions([]);
                        }}
                        variant="secondary">
                        Replace with a simple list
                      </Button>
                    </div>
                  </div>
                </Content>
              </InlineAlert>
            ) : (
              <ConditionsEditor
                conditions={conditions}
                lookups={lookups}
                match={match}
                onChange={setConditions}
                onMatchChange={setMatch}
              />
            )}
          </div>
        </TabPanel>

        <TabPanel id="schedule">
          <div className={column}>
            <div className={grid}>
              <TextField
                description="YYYY-MM-DD in the store's time zone. Empty: no start date."
                errorMessage={dateError(rule.activeFrom)}
                isInvalid={Boolean(dateError(rule.activeFrom))}
                label="Apply from"
                onChange={(activeFrom) =>
                  set({ activeFrom: activeFrom.trim() })
                }
                placeholder="2026-11-27"
                value={rule.activeFrom ?? ""}
              />
              <TextField
                description="Applies through the end of this day. Empty: no end date."
                errorMessage={dateError(rule.activeTo)}
                isInvalid={Boolean(dateError(rule.activeTo))}
                label="Apply until"
                onChange={(activeTo) => set({ activeTo: activeTo.trim() })}
                placeholder="2026-12-01"
                value={rule.activeTo ?? ""}
              />
            </div>
            <Text>
              For days of the week or hours of the day, add a "Day of the week"
              or "Time of day" condition.
            </Text>
          </div>
        </TabPanel>
      </Tabs>

      {problems.length > 0 && rule.name && (
        <Text styles={style({ color: "negative" })}>
          Fix before saving: {problems.join("; ")}.
        </Text>
      )}
    </main>
  );
}
