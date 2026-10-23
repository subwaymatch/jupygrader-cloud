"use client";

import { Menu } from "@base-ui/react/menu";
import type { ReactElement, ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

export type MenuEntry =
  | { type?: "item"; label: string; icon?: IconName; hint?: ReactNode; danger?: boolean; disabled?: boolean; onClick: () => void; checked?: boolean }
  | { type: "separator" }
  | { type: "heading"; label: string };

/** A trigger with a dropdown of actions. Pass the trigger as a button element. */
export function ActionMenu({
  trigger,
  items,
  align = "end",
  side = "bottom",
  minWidth,
}: {
  trigger: ReactElement<Record<string, unknown>>;
  items: (MenuEntry | false | null | undefined)[];
  align?: "start" | "center" | "end";
  side?: "top" | "bottom" | "left" | "right";
  minWidth?: number;
}) {
  const list = items.filter(Boolean) as MenuEntry[];
  return (
    <Menu.Root modal={false}>
      <Menu.Trigger render={trigger} />
      <Menu.Portal>
        <Menu.Positioner className="menu-positioner" sideOffset={6} align={align} side={side}>
          <Menu.Popup className="menu-popup" style={minWidth ? { minWidth } : undefined}>
            {list.map((it, i) => {
              if (it.type === "separator") return <Menu.Separator key={i} className="menu-sep" />;
              if (it.type === "heading")
                return (
                  <div key={i} className="menu-head">
                    {it.label}
                  </div>
                );
              return (
                <Menu.Item
                  key={i}
                  className={"menu-item" + (it.danger ? " menu-item--danger" : "")}
                  onClick={it.onClick}
                  disabled={it.disabled}
                  label={it.label}
                >
                  <span className="menu-item__main">
                    {it.icon && <Icon name={it.icon} size={15} />}
                    <span>{it.label}</span>
                  </span>
                  {it.hint && <span className="menu-item__hint">{it.hint}</span>}
                  {it.checked && <Icon name="check" size={15} className="select-item__check" />}
                </Menu.Item>
              );
            })}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
