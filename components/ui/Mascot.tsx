/** Poses of the bird mascot, stored as public/mascot/<pose>.webp (384 px, transparent). */
export type Pose =
  | "waving"
  | "reading"
  | "grading"
  | "checkmark"
  | "celebrating"
  | "thinking"
  | "sleeping"
  | "flying"
  | "carrying-papers"
  | "magnifier"
  | "shrugging"
  | "pointing"
  | "laptop"
  | "graduate"
  | "clipboard"
  | "thumbs-up"
  | "peeking"
  | "flag"
  | "speech-bubble"
  | "sad"
  | "gear"
  | "notebook"
  | "mail"
  | "sitting"
  | "binders"
  | "inbox"
  | "chart"
  | "stamp"
  | "archive"
  | "desk"
  | "lifebuoy";

/** The mascot in one of its poses. Decorative (hidden from screen readers) unless `alt` is set. */
export function Mascot({ pose, size = 120, alt = "", bob = false, className }: { pose: Pose; size?: number; alt?: string; bob?: boolean; className?: string }) {
  return (
    <img
      src={`/mascot/${pose}.webp`}
      width={size}
      height={size}
      alt={alt}
      aria-hidden={alt ? undefined : true}
      draggable={false}
      className={"mascot" + (bob ? " mascot--bob" : "") + (className ? " " + className : "")}
    />
  );
}

/** A centered mascot with a title, a line of text and optional actions, for empty lists and dead ends. */
export function EmptyState({
  pose,
  size = 112,
  title,
  children,
  actions,
}: {
  pose: Pose;
  size?: number;
  title?: React.ReactNode;
  children?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="empty-state">
      <Mascot pose={pose} size={size} />
      {title && <strong className="empty-state__title">{title}</strong>}
      {children && <div className="empty-state__body">{children}</div>}
      {actions && <div className="empty-state__actions">{actions}</div>}
    </div>
  );
}
