/** The Jupygrader mark: the bird mascot, from public/logo.svg. */
export function LogoMark({ size = 24, animated = false }: { size?: number; animated?: boolean }) {
  return <img src="/logo.svg" width={size} height={size} alt="" aria-hidden="true" className={animated ? "logo logo--animated" : "logo"} />;
}

export function Logo({ size = 24, animated }: { size?: number; animated?: boolean }) {
  return (
    <span className="logo-word">
      <LogoMark size={size} animated={animated} />
      Jupygrader
    </span>
  );
}
