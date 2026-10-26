"use client";

import { Checkbox as BaseCheckbox } from "@base-ui/react/checkbox";
import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";
import type { ReactNode } from "react";
import { Icon } from "./Icon";

export function Segmented<V extends string>({
  value,
  onChange,
  options,
  disabled,
  ariaLabel,
}: {
  value: V;
  onChange: (v: V) => void;
  options: readonly { id: V; name: string }[];
  disabled?: boolean;
  ariaLabel?: string;
}) {
  return (
    <RadioGroup className="seg" value={value} onValueChange={(v) => onChange(v as V)} disabled={disabled} aria-label={ariaLabel}>
      {options.map((o) => (
        <Radio.Root key={o.id} value={o.id} className="seg__item">
          {o.name}
        </Radio.Root>
      ))}
    </RadioGroup>
  );
}

export function Checkbox({
  checked,
  onChange,
  label,
  description,
  disabled,
  indeterminate,
  ariaLabel,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  indeterminate?: boolean;
  ariaLabel?: string;
}) {
  const box = (
    <BaseCheckbox.Root
      className="check__box"
      checked={checked}
      indeterminate={indeterminate}
      onCheckedChange={(v) => onChange(!!v)}
      disabled={disabled}
      aria-label={ariaLabel}
    >
      <BaseCheckbox.Indicator keepMounted={false}>
        <Icon name={indeterminate ? "minus" : "check"} size={12} strokeWidth={3} />
      </BaseCheckbox.Indicator>
    </BaseCheckbox.Root>
  );
  if (!label) return box;
  return (
    <label className="check">
      {box}
      <span className="check__text">
        <span className="check__title">{label}</span>
        {description && <span className="check__desc">{description}</span>}
      </span>
    </label>
  );
}

export function RadioCards<V extends string>({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: V;
  onChange: (v: V) => void;
  options: { id: V; title: string; desc: string }[];
  ariaLabel?: string;
}) {
  return (
    <RadioGroup className="radio-cards" value={value} onValueChange={(v) => onChange(v as V)} aria-label={ariaLabel}>
      {options.map((o) => (
        <Radio.Root key={o.id} value={o.id} className="radio-card">
          <span className="radio-dot">
            <Radio.Indicator className="radio-dot__inner" />
          </span>
          <span>
            <span className="radio-card__title">{o.title}</span>
            <span className="radio-card__desc">{o.desc}</span>
          </span>
        </Radio.Root>
      ))}
    </RadioGroup>
  );
}
