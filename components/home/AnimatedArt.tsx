import { CSSProperties } from "react";

/*
 * The home page's birds move: each is a looping animated WebP in public/home/animated, made from its still with
 * GPT Image 2.6 (see the README's "Generated images"). Visitors who prefer reduced motion get the still instead.
 * Decorative: the copy beside each picture says what it shows. The picture element lays out as if it weren't
 * there (home.css), so the image keeps the styles and place it had.
 */
export function AnimatedArt({
  name,
  still,
  width,
  height,
  className,
  lazy = false,
  style,
}: {
  /** public/home/animated/<name>.webp */
  name: string;
  /** The still image's path, shown when motion is reduced. */
  still: string;
  width: number;
  height: number;
  className?: string;
  lazy?: boolean;
  style?: CSSProperties;
}) {
  return (
    <picture>
      <source srcSet={`/home/animated/${name}.webp`} media="(prefers-reduced-motion: no-preference)" type="image/webp" />
      <img
        src={still}
        width={width}
        height={height}
        alt=""
        aria-hidden="true"
        draggable={false}
        loading={lazy ? "lazy" : undefined}
        className={className}
        style={style}
      />
    </picture>
  );
}
