import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

type Variant = "primary" | "secondary" | "outline" | "ghost" | "danger" | "danger-outline" | "link" | "pill";

type Common = {
  variant?: Variant;
  size?: "md" | "sm";
  icon?: IconName;
  iconRight?: IconName;
  loading?: boolean;
  block?: boolean;
  iconOnly?: boolean;
  children?: ReactNode;
  className?: string;
};

function cls({ variant = "secondary", size = "md", block, iconOnly, className }: Common) {
  return ["btn", "btn--" + variant, size === "sm" && "btn--sm", block && "btn--block", iconOnly && "btn--icon", className]
    .filter(Boolean)
    .join(" ");
}

function Inner({ icon, iconRight, loading, children, size }: Common) {
  const s = size === "sm" ? 14 : 15;
  return (
    <>
      {loading ? <Icon name="loader" size={s} className="spin" /> : icon ? <Icon name={icon} size={s} /> : null}
      {children}
      {iconRight ? <Icon name={iconRight} size={s - 1} /> : null}
    </>
  );
}

export function Button({
  variant,
  size,
  icon,
  iconRight,
  loading,
  block,
  iconOnly,
  className,
  children,
  type = "button",
  disabled,
  ...rest
}: Common & Omit<ComponentProps<"button">, "children">) {
  return (
    <button
      type={type}
      className={cls({ variant, size, block, iconOnly, className })}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      <Inner icon={icon} iconRight={iconRight} loading={loading} size={size}>
        {children}
      </Inner>
    </button>
  );
}

export function LinkButton({
  variant,
  size,
  icon,
  iconRight,
  block,
  iconOnly,
  className,
  children,
  href,
  ...rest
}: Common & { href: string } & Omit<ComponentProps<typeof Link>, "href" | "children">) {
  return (
    <Link href={href} className={cls({ variant, size, block, iconOnly, className })} {...rest}>
      <Inner icon={icon} iconRight={iconRight} size={size}>
        {children}
      </Inner>
    </Link>
  );
}

export function IconButton({
  icon,
  label,
  size = 16,
  className,
  ...rest
}: { icon: IconName; label: string; size?: number } & Omit<ComponentProps<"button">, "children">) {
  return (
    <button type="button" className={"icon-btn" + (className ? " " + className : "")} aria-label={label} title={label} {...rest}>
      <Icon name={icon} size={size} />
    </button>
  );
}
