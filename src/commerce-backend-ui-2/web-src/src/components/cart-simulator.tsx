import { Checkbox } from "@react-spectrum/s2/Checkbox";
import { Content } from "@react-spectrum/s2/Content";
import { Heading } from "@react-spectrum/s2/Heading";
import { InlineAlert } from "@react-spectrum/s2/InlineAlert";
import { Picker, PickerItem } from "@react-spectrum/s2/Picker";
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
import { Text } from "@react-spectrum/s2/Text";
import { TextArea } from "@react-spectrum/s2/TextArea";
import { TextField } from "@react-spectrum/s2/TextField";
import { useMemo } from "react";

import { clockAt, evaluateRules } from "#engine";

import {
  DAY_LABELS,
  ITEMS_HELP,
  sampleToContext,
  TYPE_LABELS,
} from "../lib/rules.ts";

import type { Key } from "react-aria-components";
import type { Lookups, Rule, RuleType, SampleCart } from "../lib/types.ts";

export type CartSimulatorProps = {
  rules: Rule[];
  lookups: Lookups | null;
  sample: SampleCart;
  onSampleChange: (sample: SampleCart) => void;
};

const grid = style({
  display: "grid",
  gap: 16,
  gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
});

const TRACE_LABELS: Record<string, string> = {
  applied: "Applies",
  inactive: "Outside its dates",
  not_matched: "Conditions don't match",
  off: "Off",
  skipped: "Skipped",
};

function money(n: number): string {
  return n.toFixed(2);
}

/**
 * Runs the saved rules against a made-up checkout, in the browser, with the same engine the
 * webhooks use. The methods listed are the store's method list from the app settings.
 */
export function CartSimulator({
  rules,
  lookups,
  sample,
  onSampleChange,
}: CartSimulatorProps) {
  const set = (patch: Partial<SampleCart>) =>
    onSampleChange({ ...sample, ...patch });
  const context = useMemo(() => sampleToContext(sample), [sample]);
  const at = clockAt(sample.date, sample.time);
  const methods =
    (sample.type === "payment"
      ? lookups?.paymentMethods
      : lookups?.shippingMethods) ?? [];

  const result = useMemo(
    () =>
      evaluateRules(rules, context, {
        clock: clockAt(sample.date, sample.time),
        methods,
        type: sample.type,
      }),
    [rules, context, methods, sample.type, sample.date, sample.time],
  );
  const hiddenBy = new Map(
    result.hidden.map((entry) => [entry.code.toLowerCase(), entry]),
  );
  const rows = [
    ...result.available.map((code) => ({ code, listed: true })),
    ...result.hidden
      .filter(
        (entry) =>
          !result.available.some(
            (code) => code.toLowerCase() === entry.code.toLowerCase(),
          ),
      )
      .map((entry) => ({ code: entry.code, listed: false })),
  ];
  const groups = lookups?.customerGroups ?? [];
  const stores = lookups?.storeViews ?? [];

  return (
    <div
      className={style({ display: "flex", flexDirection: "column", gap: 24 })}>
      <section
        className={style({
          display: "flex",
          flexDirection: "column",
          gap: 16,
        })}>
        <div className={grid}>
          <Picker
            label="Check"
            onSelectionChange={(key: Key | null) =>
              set({ type: String(key) as RuleType })
            }
            selectedKey={sample.type}>
            {Object.entries(TYPE_LABELS).map(([id, label]) => (
              <PickerItem id={id} key={id}>
                {`${label} methods`}
              </PickerItem>
            ))}
          </Picker>
          {groups.length ? (
            <Picker
              items={groups}
              label="Customer group"
              onSelectionChange={(key: Key | null) =>
                set({ customerGroup: String(key ?? "") })
              }
              selectedKey={sample.customerGroup || null}>
              {(item) => (
                <PickerItem id={item.id} textValue={item.label}>
                  {`${item.label} (${item.id})`}
                </PickerItem>
              )}
            </Picker>
          ) : (
            <TextField
              label="Customer group ID"
              onChange={(customerGroup) => set({ customerGroup })}
              value={sample.customerGroup}
            />
          )}
          {stores.length ? (
            <Picker
              items={stores}
              label="Store view"
              onSelectionChange={(key: Key | null) =>
                set({ storeId: String(key ?? "") })
              }
              selectedKey={sample.storeId || null}>
              {(item) => (
                <PickerItem id={item.id} textValue={item.label}>
                  {item.label}
                </PickerItem>
              )}
            </Picker>
          ) : (
            <TextField
              label="Store view ID"
              onChange={(storeId) => set({ storeId })}
              value={sample.storeId}
            />
          )}
          <TextField
            label="Coupon code"
            onChange={(couponCode) => set({ couponCode })}
            value={sample.couponCode}
          />
        </div>
        <Checkbox
          isSelected={sample.isGuest}
          onChange={(isGuest) => set({ isGuest })}>
          Guest checkout
        </Checkbox>
        <div className={grid}>
          <TextField
            description="Two-letter code"
            label="Country"
            onChange={(country) => set({ country: country.toUpperCase() })}
            value={sample.country}
          />
          <TextField
            label="Region or state"
            onChange={(region) => set({ region })}
            value={sample.region}
          />
          <TextField
            label="Postcode"
            onChange={(postcode) => set({ postcode })}
            value={sample.postcode}
          />
          <TextField
            label="City"
            onChange={(city) => set({ city })}
            value={sample.city}
          />
          <TextField
            description={at ? `A ${DAY_LABELS[at.weekday]}` : "Use YYYY-MM-DD"}
            isInvalid={!at}
            label="Date"
            onChange={(date) => set({ date: date.trim() })}
            value={sample.date}
          />
          <TextField
            description={`HH:MM, ${lookups?.timezone ?? "UTC"}`}
            label="Time"
            onChange={(time) => set({ time: time.trim() })}
            value={sample.time}
          />
        </div>
        <TextArea
          description={ITEMS_HELP}
          label="Cart items"
          onChange={(items) => set({ items })}
          styles={style({ width: "full" })}
          value={sample.items}
        />
        <Text>
          Subtotal {money(context.subtotal ?? 0)} · quantity {context.qty} ·
          weight {Number((context.weight ?? 0).toFixed(3))} ·{" "}
          {context.itemCount} line
          {context.itemCount === 1 ? "" : "s"}
        </Text>
      </section>

      <section
        aria-live="polite"
        className={style({
          display: "flex",
          flexDirection: "column",
          gap: 16,
        })}>
        <Heading level={2} styles={style({ font: "heading", margin: 0 })}>
          Result
        </Heading>
        {result.failedOpen && (
          <InlineAlert variant="negative">
            <Heading>Every method stays available</Heading>
            <Content>
              {result.error} At checkout, the app hides nothing until this is
              fixed.
            </Content>
          </InlineAlert>
        )}
        {result.safeguard && (
          <InlineAlert variant="notice">
            <Heading>Every method stays available</Heading>
            <Content>
              These rules would hide every {sample.type} method on your list, so
              the app hides none and shoppers can still check out.
            </Content>
          </InlineAlert>
        )}
        {rows.length === 0 ? (
          <Text>
            No {sample.type} methods on your list. Add them in the app's
            settings, or add a "hide" rule that names them.
          </Text>
        ) : (
          <TableView
            aria-label={`${TYPE_LABELS[sample.type]} methods for this cart`}
            overflowMode="wrap"
            selectionMode="none"
            styles={style({ width: "full" })}>
            <TableHeader>
              <Column isRowHeader>Method</Column>
              <Column>At checkout</Column>
              <Column>Why</Column>
            </TableHeader>
            <TableBody items={rows.map((row) => ({ ...row, id: row.code }))}>
              {(row) => {
                const entry = hiddenBy.get(row.code.toLowerCase());
                return (
                  <Row id={row.code}>
                    <Cell>
                      {row.listed ? row.code : `${row.code} (not on your list)`}
                    </Cell>
                    <Cell>
                      <StatusLight
                        size="S"
                        variant={entry ? "negative" : "positive"}>
                        {entry ? "Hidden" : "Available"}
                      </StatusLight>
                    </Cell>
                    <Cell>
                      {entry
                        ? entry.reasons
                            .map(
                              (reason) =>
                                `${reason.name} (${reason.action === "allow_only" ? "not on its allowed list" : "hides it"})`,
                            )
                            .join("; ")
                        : "No rule hides it"}
                    </Cell>
                  </Row>
                );
              }}
            </TableBody>
          </TableView>
        )}

        <Heading level={3} styles={style({ font: "heading-sm", margin: 0 })}>
          {`${TYPE_LABELS[sample.type]} rules, in the order they're checked`}
        </Heading>
        {result.trace.length === 0 ? (
          <Text>
            {result.failedOpen
              ? "Rules weren't checked."
              : `No ${sample.type} rules yet.`}
          </Text>
        ) : (
          <ol className={style({ font: "body", margin: 0, paddingStart: 24 })}>
            {result.trace.map((entry) => (
              <li key={entry.code}>
                <strong>{entry.name}</strong>:{" "}
                {TRACE_LABELS[entry.status ?? ""] ?? entry.status}
                {entry.status === "applied" &&
                  (entry.hides.length
                    ? `, hides ${entry.hides.join(", ")}`
                    : ", hides nothing on your list")}
                {entry.detail ? ` (${entry.detail})` : ""}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
