import { ActionButton } from "@react-spectrum/s2/ActionButton";
import { Content } from "@react-spectrum/s2/Content";
import { Divider } from "@react-spectrum/s2/Divider";
import { Heading } from "@react-spectrum/s2/Heading";
import { InlineAlert } from "@react-spectrum/s2/InlineAlert";
import { style } from "@react-spectrum/s2/style" with { type: "macro" };
import { Text } from "@react-spectrum/s2/Text";
import { ToggleButton } from "@react-spectrum/s2/ToggleButton";
import { useCallback, useEffect, useState } from "react";

import { CartSimulator } from "../components/cart-simulator.tsx";
import { RuleEditor } from "../components/rule-editor.tsx";
import { RulesList } from "../components/rules-list.tsx";
import { useRestrictionsApi } from "../hooks/use-restrictions-api.ts";
import { defaultSample, editableCopy, emptyRule } from "../lib/rules.ts";

import type { Lookups, Rule, RuleType, SampleCart } from "../lib/types.ts";

type View = "rules" | "test";
type Editing = { rule: Rule; originalCode?: string } | null;

const NO_LOOKUPS: Lookups = {
  customerGroups: [],
  paymentMethods: [],
  shippingMethods: [],
  storeViews: [],
  timezone: "UTC",
  unavailable: true,
};

export function MethodRestrictionsPage() {
  const api = useRestrictionsApi();
  const [view, setView] = useState<View>("rules");
  const [rules, setRules] = useState<Rule[]>([]);
  const [examples, setExamples] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing>(null);
  const [lookups, setLookups] = useState<Lookups | null>(null);
  const [sample, setSample] = useState<SampleCart>(() => defaultSample());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.listRules();
      setRules(data.rules);
      setExamples(data.examples);
    } catch (loadError) {
      setError((loadError as Error).message);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    load();
    api.lookups().then(setLookups, () => setLookups(NO_LOOKUPS));
  }, [api, load]);

  const handleEdit = useCallback(
    (code: string) => {
      const rule = rules.find((r) => r.code === code);
      if (rule) {
        setEditing({ originalCode: code, rule: editableCopy(rule) });
      }
    },
    [rules],
  );

  const handleCreate = useCallback((from?: Rule | RuleType) => {
    setEditing({
      rule:
        typeof from === "object"
          ? { ...editableCopy(from), enabled: false }
          : emptyRule(from),
    });
  }, []);

  const handleSave = async (rule: Rule, previousCode?: string) => {
    await api.saveRule(rule, previousCode);
    setEditing(null);
    setNotice(
      `Saved “${rule.name}”. Checkout uses the change within a minute.`,
    );
    await load();
  };

  const handleDelete = async (code: string) => {
    await api.deleteRule(code);
    setEditing(null);
    setNotice("Rule deleted.");
    await load();
  };

  const page = style({
    display: "flex",
    flexDirection: "column",
    gap: 16,
    padding: 24,
  });

  if (editing) {
    return (
      <div className={page}>
        <RuleEditor
          initial={editing.rule}
          key={editing.originalCode ?? "new"}
          lookups={lookups}
          onCancel={() => setEditing(null)}
          onDelete={handleDelete}
          onSave={handleSave}
          originalCode={editing.originalCode}
        />
      </div>
    );
  }

  return (
    <div className={page}>
      <div className={style({ display: "flex", gap: 8 })}>
        <ToggleButton
          isSelected={view === "rules"}
          onChange={() => setView("rules")}>
          Rules
        </ToggleButton>
        <ToggleButton
          isSelected={view === "test"}
          onChange={() => setView("test")}>
          Test a cart
        </ToggleButton>
      </div>
      <Divider />

      {notice && (
        <InlineAlert variant="positive">
          <Heading>Done</Heading>
          <Content>
            <div
              className={style({
                alignItems: "center",
                display: "flex",
                gap: 8,
                justifyContent: "space-between",
              })}>
              <Text>{notice}</Text>
              <ActionButton isQuiet onPress={() => setNotice(null)}>
                Dismiss
              </ActionButton>
            </div>
          </Content>
        </InlineAlert>
      )}

      {lookups?.unavailable && (
        <InlineAlert variant="notice">
          <Heading>Some store data is unavailable</Heading>
          <Content>
            The Admin couldn't load store views or customer groups from
            Commerce, so those conditions take typed IDs.
          </Content>
        </InlineAlert>
      )}

      {view === "rules" ? (
        <RulesList
          error={error}
          examples={examples}
          loading={loading}
          lookups={lookups}
          onCreate={handleCreate}
          onEdit={handleEdit}
          onReload={load}
          rules={rules}
        />
      ) : (
        <main
          className={style({
            display: "flex",
            flexDirection: "column",
            gap: 16,
          })}>
          <Heading level={1} styles={style({ font: "heading-lg", margin: 0 })}>
            Test a cart
          </Heading>
          <Text>
            Describe a checkout to see which methods your saved rules would
            hide, and why. It runs the same rules engine as checkout, in your
            browser; nothing is saved.
          </Text>
          <CartSimulator
            lookups={lookups}
            onSampleChange={setSample}
            rules={rules}
            sample={sample}
          />
        </main>
      )}
    </div>
  );
}
