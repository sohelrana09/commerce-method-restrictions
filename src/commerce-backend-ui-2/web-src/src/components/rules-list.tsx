import { ActionButton } from "@react-spectrum/s2/ActionButton";
import { Button } from "@react-spectrum/s2/Button";
import { Content } from "@react-spectrum/s2/Content";
import { Heading } from "@react-spectrum/s2/Heading";
import { IllustratedMessage } from "@react-spectrum/s2/IllustratedMessage";
import { InlineAlert } from "@react-spectrum/s2/InlineAlert";
import Refresh from "@react-spectrum/s2/icons/Refresh";
import {
  Menu,
  MenuItem,
  MenuSection,
  MenuTrigger,
} from "@react-spectrum/s2/Menu";
import { ProgressCircle } from "@react-spectrum/s2/ProgressCircle";
import { StatusLight } from "@react-spectrum/s2/StatusLight";
import { style } from "@react-spectrum/s2/style" with { type: "macro" };
import {
  Cell,
  Column,
  Row,
  TableBody,
  TableHeader,
  TableView,
} from "@react-spectrum/s2/TableView";
import { useCallback } from "react";

import { clock, isActive } from "#engine";

import {
  describeConditions,
  describeMethods,
  describeWhen,
  TYPE_LABELS,
} from "../lib/rules.ts";

import type { Key } from "react-aria-components";
import type { Lookups, Rule, RuleType } from "../lib/types.ts";

export type RulesListProps = {
  error: string | null;
  examples: Rule[];
  loading: boolean;
  lookups: Lookups | null;
  onCreate: (template?: Rule | RuleType) => void;
  onEdit: (code: string) => void;
  onReload: () => void;
  rules: Rule[];
};

function status(
  rule: Rule,
  today: string,
): { label: string; variant: "positive" | "neutral" | "notice" } {
  if (rule.enabled === false) {
    return { label: "Off", variant: "neutral" };
  }
  if (!isActive(rule, today)) {
    return { label: "Scheduled or ended", variant: "notice" };
  }
  return { label: "On", variant: "positive" };
}

export function RulesList({
  rules,
  examples,
  loading,
  lookups,
  error,
  onReload,
  onEdit,
  onCreate,
}: RulesListProps) {
  const today = clock(new Date(), lookups?.timezone ?? "UTC").date;
  const handleRowAction = useCallback(
    (key: Key) => onEdit(String(key)),
    [onEdit],
  );
  const handleAdd = useCallback(
    (key: Key) => onCreate(String(key) as RuleType),
    [onCreate],
  );
  const handleTemplate = useCallback(
    (key: Key) => {
      const example = examples.find((rule) => rule.code === key);
      if (example) {
        onCreate(example);
      }
    },
    [examples, onCreate],
  );

  const renderEmptyState = useCallback(
    () => (
      <IllustratedMessage>
        <Heading>No rules yet</Heading>
        <Content>
          Add a rule, or start from an example. Until then, shoppers see every
          method.
        </Content>
      </IllustratedMessage>
    ),
    [],
  );

  const byType = (type: RuleType) =>
    examples.filter((example) => example.type === type);

  return (
    <main
      className={style({ display: "flex", flexDirection: "column", gap: 16 })}>
      <div
        className={style({
          alignItems: "center",
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
        })}>
        <Heading
          level={1}
          styles={style({ flexGrow: 1, font: "heading-lg", margin: 0 })}>
          Method restrictions
        </Heading>
        <ActionButton
          aria-label="Reload"
          isDisabled={loading}
          onPress={onReload}>
          <Refresh />
        </ActionButton>
        <MenuTrigger>
          <Button variant="secondary">Start from example</Button>
          <Menu onAction={handleTemplate}>
            {(["payment", "shipping"] as const).map((type) => (
              <MenuSection key={type}>
                <Heading>{`${TYPE_LABELS[type]} rules`}</Heading>
                {byType(type).map((example) => (
                  <MenuItem id={example.code} key={example.code}>
                    {example.name}
                  </MenuItem>
                ))}
              </MenuSection>
            ))}
          </Menu>
        </MenuTrigger>
        <MenuTrigger>
          <Button variant="accent">Add rule</Button>
          <Menu onAction={handleAdd}>
            <MenuItem id="payment">Payment rule</MenuItem>
            <MenuItem id="shipping">Shipping rule</MenuItem>
          </Menu>
        </MenuTrigger>
      </div>

      {error && (
        <InlineAlert variant="negative">
          <Heading>Couldn't load rules</Heading>
          <Content>{error}</Content>
        </InlineAlert>
      )}

      {loading ? (
        <div
          className={style({
            display: "flex",
            justifyContent: "center",
            marginTop: 32,
          })}>
          <ProgressCircle aria-label="Loading rules" isIndeterminate size="L" />
        </div>
      ) : (
        <TableView
          aria-label="Method restriction rules"
          onAction={handleRowAction}
          overflowMode="wrap"
          selectionMode="none"
          styles={style({ minHeight: 320, width: "full" })}>
          <TableHeader>
            <Column isRowHeader>Name</Column>
            <Column>Type</Column>
            <Column>Methods</Column>
            <Column>When</Column>
            <Column>Dates</Column>
            <Column>Priority</Column>
            <Column>Status</Column>
          </TableHeader>
          <TableBody items={rules} renderEmptyState={renderEmptyState}>
            {(rule) => {
              const state = status(rule, today);
              return (
                <Row id={rule.code}>
                  <Cell>{rule.name}</Cell>
                  <Cell>{TYPE_LABELS[rule.type] ?? rule.type}</Cell>
                  <Cell>{describeMethods(rule)}</Cell>
                  <Cell>{describeConditions(rule, lookups)}</Cell>
                  <Cell>{describeWhen(rule)}</Cell>
                  <Cell>{String(rule.priority ?? 0)}</Cell>
                  <Cell>
                    <StatusLight size="S" variant={state.variant}>
                      {state.label}
                    </StatusLight>
                  </Cell>
                </Row>
              );
            }}
          </TableBody>
        </TableView>
      )}
    </main>
  );
}
