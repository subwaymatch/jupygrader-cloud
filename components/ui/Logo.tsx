/** The Jupygrader mark: three stacked slabs. */
export function LogoMark({ size = 24, animated = false }: { size?: number; animated?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="-98.4 -99.6 221.1 221.1" aria-hidden="true" className={animated ? "logo logo--animated" : "logo"}>
      <g className="logo__s1">
        <polygon points="0.00,-20.00 95.26,35.00 8.66,85.00 -86.60,30.00" fill="#D1E6FF" />
        <polygon points="-86.60,50.00 8.66,105.00 8.66,85.00 -86.60,30.00" fill="#AED3FF" />
        <polygon points="95.26,55.00 8.66,105.00 8.66,85.00 95.26,35.00" fill="#5BA7FF" />
      </g>
      <g className="logo__s2">
        <polygon points="0.00,-56.00 95.26,-1.00 8.66,49.00 -86.60,-6.00" fill="#5BA7FF" />
        <polygon points="-86.60,14.00 8.66,69.00 8.66,49.00 -86.60,-6.00" fill="#046ECD" />
        <polygon points="95.26,19.00 8.66,69.00 8.66,49.00 95.26,-1.00" fill="#00407F" />
      </g>
      <g className="logo__s3">
        <polygon points="15.59,-83.00 110.85,-28.00 24.25,22.00 -71.01,-33.00" fill="#EB9558" />
        <polygon points="-71.01,-13.00 24.25,42.00 24.25,22.00 -71.01,-33.00" fill="#E47600" />
        <polygon points="110.85,-8.00 24.25,42.00 24.25,22.00 110.85,-28.00" fill="#C36400" />
      </g>
    </svg>
  );
}

export function Logo({ size = 24, animated }: { size?: number; animated?: boolean }) {
  return (
    <span className="logo-word">
      <LogoMark size={size} animated={animated} />
      Jupygrader
    </span>
  );
}
