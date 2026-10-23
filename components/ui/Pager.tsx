"use client";

import { Icon } from "./Icon";

export function pageSlice<T>(items: T[], page: number, size: number) {
  const pages = Math.max(1, Math.ceil(items.length / size));
  const p = Math.min(Math.max(1, page), pages);
  return { rows: items.slice((p - 1) * size, p * size), page: p, pages, from: items.length ? (p - 1) * size + 1 : 0, to: Math.min(items.length, p * size) };
}

export function Pager({
  page,
  pages,
  total,
  from,
  to,
  onPage,
}: {
  page: number;
  pages: number;
  total: number;
  from: number;
  to: number;
  onPage: (p: number) => void;
}) {
  if (pages <= 1) return null;
  const nums: (number | "…")[] = [];
  for (let i = 1; i <= pages; i++) {
    if (i === 1 || i === pages || Math.abs(i - page) <= 1) nums.push(i);
    else if (nums[nums.length - 1] !== "…") nums.push("…");
  }
  return (
    <div className="pager">
      <span>
        {from} to {to} of {total}
      </span>
      <div className="pager__pages">
        <button className="pager__btn" onClick={() => onPage(page - 1)} disabled={page <= 1} aria-label="Previous page">
          <Icon name="chevronLeft" size={15} />
        </button>
        {nums.map((n, i) =>
          n === "…" ? (
            <span key={"e" + i} className="pager__btn" aria-hidden>
              …
            </span>
          ) : (
            <button key={n} className="pager__btn" aria-current={n === page ? "page" : undefined} onClick={() => onPage(n)}>
              {n}
            </button>
          ),
        )}
        <button className="pager__btn" onClick={() => onPage(page + 1)} disabled={page >= pages} aria-label="Next page">
          <Icon name="chevronRight" size={15} />
        </button>
      </div>
    </div>
  );
}
