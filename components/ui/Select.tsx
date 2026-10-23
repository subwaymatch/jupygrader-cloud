"use client";

import { Select as BaseSelect } from "@base-ui/react/select";
import { Icon } from "./Icon";

export type SelectOption<V extends string = string> = { value: V; label: string; desc?: string; disabled?: boolean };

export function Select<V extends string = string>({
  value,
  onChange,
  options,
  placeholder,
  disabled,
  id,
  ariaLabel,
  className,
}: {
  value: V | null;
  onChange: (v: V) => void;
  options: SelectOption<V>[];
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  ariaLabel?: string;
  className?: string;
}) {
  const items = options.map((o) => ({ value: o.value, label: o.label }));
  return (
    <BaseSelect.Root
      value={value}
      onValueChange={(v) => v !== null && onChange(v as V)}
      items={items}
      disabled={disabled}
    >
      <BaseSelect.Trigger className={"select-trigger" + (className ? " " + className : "")} id={id} aria-label={ariaLabel}>
        <BaseSelect.Value className="select-value" placeholder={placeholder} />
        <BaseSelect.Icon>
          <Icon name="chevronDown" size={16} />
        </BaseSelect.Icon>
      </BaseSelect.Trigger>
      <BaseSelect.Portal>
        <BaseSelect.Positioner className="select-positioner" sideOffset={6} alignItemWithTrigger={false}>
          <BaseSelect.Popup className="select-popup">
            <BaseSelect.List>
              {options.map((o) => (
                <BaseSelect.Item key={o.value} value={o.value} className="select-item" disabled={o.disabled} label={o.label}>
                  <span className="select-item__text">
                    <BaseSelect.ItemText>{o.label}</BaseSelect.ItemText>
                    {o.desc && <span className="select-item__desc">{o.desc}</span>}
                  </span>
                  <BaseSelect.ItemIndicator className="select-item__check">
                    <Icon name="check" size={15} />
                  </BaseSelect.ItemIndicator>
                </BaseSelect.Item>
              ))}
            </BaseSelect.List>
          </BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    </BaseSelect.Root>
  );
}
