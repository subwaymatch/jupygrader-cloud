import { forwardRef, useId, type ComponentProps, type ReactNode } from "react";

export function Field({
  label,
  optional,
  hint,
  error,
  action,
  htmlFor,
  children,
  className,
}: {
  label?: ReactNode;
  optional?: boolean;
  hint?: ReactNode;
  error?: ReactNode;
  action?: ReactNode;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={"field" + (className ? " " + className : "")}>
      {(label || action) && (
        <div className="field__label">
          {label ? (
            <label htmlFor={htmlFor}>
              {label}
              {optional && <span className="opt"> optional</span>}
            </label>
          ) : (
            <span />
          )}
          {action}
        </div>
      )}
      {children}
      {error ? (
        <span className="field__error" role="alert">
          {error}
        </span>
      ) : hint ? (
        <span className="field__hint">{hint}</span>
      ) : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, ComponentProps<"input"> & { mono?: boolean; small?: boolean }>(function Input(
  { className, mono, small, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      className={["input", mono && "input--mono", small && "input--sm", className].filter(Boolean).join(" ")}
      {...rest}
    />
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, ComponentProps<"textarea">>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={"textarea" + (className ? " " + className : "")} {...rest} />;
});

/** Number input with a unit suffix, such as "100 pts". */
export function AffixInput({
  prefix,
  suffix,
  className,
  ...rest
}: { prefix?: string; suffix?: string } & ComponentProps<"input">) {
  return (
    <span className={"affix" + (className ? " " + className : "")}>
      {prefix && <span>{prefix}</span>}
      <input {...rest} />
      {suffix && <span>{suffix}</span>}
    </span>
  );
}

export function useFieldId(prefix = "f") {
  return prefix + useId().replace(/:/g, "");
}
