/*
 * Colour logos and file icons for the formats and services Jupygrader works with, for the home page. All
 * decorative: the text beside each one names it. The Jupyter, Python and Canvas outlines are from Simple Icons
 * (CC0), in each project's own colours.
 */

type LogoProps = { size?: number; className?: string };

/** The Jupyter mark: two orange bands and three grey moons. */
export function JupyterIcon({ size = 24, className }: LogoProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false" className={className}>
      <g fill="#f37726">
        <path d="M12.328 4.853c3.769 0 7.06 1.38 8.768 3.424a9.363 9.363 0 0 0-3.393-4.547 9.238 9.238 0 0 0-5.377-1.728A9.238 9.238 0 0 0 6.95 3.73a9.363 9.363 0 0 0-3.394 4.547c1.713-2.04 5.004-3.424 8.772-3.424Z" />
        <path d="M12.329 18.148c-3.768 0-7.06-1.381-8.768-3.425a9.363 9.363 0 0 0 3.394 4.547A9.238 9.238 0 0 0 12.33 21a9.238 9.238 0 0 0 5.377-1.729 9.363 9.363 0 0 0 3.393-4.547c-1.712 2.044-5.003 3.425-8.772 3.425Z" />
      </g>
      <circle cx="5.374" cy="22.201" r="1.79" fill="#616262" />
      <circle cx="19.167" cy="1.427" r="1.42" fill="#989798" />
      <circle cx="3.946" cy="3.336" r="1.05" fill="#6f7070" />
    </svg>
  );
}

/** The Python logo: a blue snake and a yellow one, each with an eye cut out. */
export function PythonIcon({ size = 24, className }: LogoProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false" className={className}>
      <path
        fill="#3776ab"
        fillRule="evenodd"
        d="M14.25.18l.9.2.73.26.59.3.45.32.34.34.25.34.16.33.1.3.04.26.02.2-.01.13V8.5l-.05.63-.13.55-.21.46-.26.38-.3.31-.33.25-.35.19-.35.14-.33.1-.3.07-.26.04-.21.02H8.77l-.69.05-.59.14-.5.22-.41.27-.33.32-.27.35-.2.36-.15.37-.1.35-.07.32-.04.27-.02.21v3.06H3.17l-.21-.03-.28-.07-.32-.12-.35-.18-.36-.26-.36-.36-.35-.46-.32-.59-.28-.73-.21-.88-.14-1.05-.05-1.23.06-1.22.16-1.04.24-.87.32-.71.36-.57.4-.44.42-.33.42-.24.4-.16.36-.1.32-.05.24-.01h.16l.06.01h8.16v-.83H6.18l-.01-2.75-.02-.37.05-.34.11-.31.17-.28.25-.26.31-.23.38-.2.44-.18.51-.15.58-.12.64-.1.71-.06.77-.04.84-.02 1.27.05zM7.95 2.16l-.23.33-.08.41.08.41.23.34.33.22.41.09.41-.09.33-.22.23-.34.08-.41-.08-.41-.23-.33-.33-.22-.41-.09-.41.09z"
      />
      <path
        fill="#ffd43b"
        fillRule="evenodd"
        d="M21.04 6.11l.28.06.32.12.35.18.36.27.36.35.35.47.32.59.28.73.21.88.14 1.04.05 1.23-.06 1.23-.16 1.04-.24.86-.32.71-.36.57-.4.45-.42.33-.42.24-.4.16-.36.09-.32.05-.24.02-.16-.01h-8.22v.82h5.84l.01 2.76.02.36-.05.34-.11.31-.17.29-.25.25-.31.24-.38.2-.44.17-.51.15-.58.13-.64.09-.71.07-.77.04-.84.01-1.27-.04-1.07-.14-.9-.2-.73-.25-.59-.3-.45-.33-.34-.34-.25-.34-.16-.33-.1-.3-.04-.25-.02-.2.01-.13v-5.34l.05-.64.13-.54.21-.46.26-.38.3-.32.33-.24.35-.2.35-.14.33-.1.3-.06.26-.04.21-.02.13-.01h5.84l.69-.05.59-.14.5-.21.41-.28.33-.32.27-.35.2-.36.15-.36.1-.35.07-.32.04-.28.02-.21V6.07h2.09l.14.01zM14.57 20.36l-.23.33-.08.41.08.41.23.33.33.23.41.08.41-.08.33-.23.23-.33.08-.41-.08-.41-.23-.33-.33-.23-.41-.08-.41.08z"
      />
    </svg>
  );
}

/** The Canvas LMS mark: a red ring of rounded petals and dots. */
export function CanvasIcon({ size = 24, className }: LogoProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false" className={className}>
      <path
        fill="#e72429"
        d="M.4403 15.4142a13.7061 13.7061 0 0 1-.4362-3.4403 13.7 13.7 0 0 1 .4362-3.4401c1.7144.2103 3.0438 1.6686 3.0438 3.44 0 1.771-1.3287 3.23-3.0438 3.4404zm3.9728-3.4403c0 .6004.4866 1.0873 1.0872 1.0873.601 0 1.088-.487 1.088-1.0873s-.487-1.088-1.088-1.088c-.6006 0-1.0872.4876-1.0872 1.088zM23.56 8.5338c-1.7151.2103-3.044 1.6686-3.044 3.44 0 1.771 1.3289 3.23 3.044 3.4404a13.7313 13.7313 0 0 0 .436-3.4403c0-1.1883-.1518-2.3413-.436-3.4401zm-6.148 3.44c0 .6005.4865 1.0874 1.0877 1.0874.6002 0 1.088-.487 1.088-1.0873s-.4878-1.088-1.088-1.088c-.6012 0-1.0877.4876-1.0877 1.088zm-5.4347 8.5465c-1.7709 0-3.229 1.33-3.44 3.044a13.7364 13.7364 0 0 0 3.441.4357c1.1885 0 2.3403-.1515 3.44-.4357-.2107-1.714-1.6687-3.044-3.441-3.044zm.001-3.1046c-.6012 0-1.0878.4876-1.0878 1.0883s.4866 1.0882 1.0878 1.0882c.6 0 1.087-.4874 1.087-1.0882s-.487-1.0883-1.087-1.0883zm0-13.936c1.7713 0 3.2295-1.3292 3.4399-3.0438A13.7353 13.7353 0 0 0 11.9782 0c-1.1887 0-2.3412.1519-3.441.4359.211 1.7146 1.6691 3.0438 3.441 3.0438zm0 .9291c-.6012 0-1.0878.4866-1.0878 1.0876 0 .6002.4866 1.0876 1.0878 1.0876.6 0 1.087-.4874 1.087-1.0876 0-.601-.487-1.0876-1.087-1.0876zm6.032 13.5965c-1.2514 1.2523-1.344 3.2211-.2825 4.582a13.762 13.762 0 0 0 4.8636-4.8654c-1.3608-1.0597-3.3299-.9673-4.5812.2834zm-.6568-2.1948c-.425-.4245-1.1135-.4245-1.539 0-.4243.4252-.4243 1.1136 0 1.5383.4255.4253 1.114.4253 1.539 0 .424-.4247.424-1.1131 0-1.5383zM5.9648 5.9603c1.2516-1.2513 1.3437-3.2206.2825-4.5813a13.7677 13.7677 0 0 0-4.8644 4.8643c1.3612 1.0616 3.3306.9687 4.582-.283zm.6567.6572c-.424.4247-.424 1.1139 0 1.5383.4245.4246 1.114.4246 1.5382 0 .4248-.4244.4248-1.1136 0-1.5383-.4243-.4243-1.1137-.4243-1.5382 0zm15.9625-.3857a13.7597 13.7597 0 0 0-4.8637-4.8642c-1.0614 1.3609-.969 3.33.2823 4.5818 1.2517 1.2507 3.2204 1.3436 4.5814.2824zM17.346 8.1443c.4237-.4248.4237-1.1135 0-1.5383-.425-.4247-1.1145-.4247-1.5388 0-.4241.4248-.4241 1.1135 0 1.5383.4243.4243 1.1137.4243 1.5388 0zM1.3772 17.7087a13.763 13.763 0 0 0 4.8647 4.8654c1.0613-1.3608.9685-3.3297-.2833-4.5818-1.2512-1.251-3.2204-1.3436-4.5814-.2836zm5.2385-1.9115c-.4238.4247-.4238 1.1136 0 1.5384.425.4246 1.1141.4246 1.5382 0 .425-.4248.425-1.1137 0-1.5384-.4241-.4245-1.1131-.4245-1.5382 0z"
      />
    </svg>
  );
}

export type FileKind = "pdf" | "docx" | "md" | "zip";

const FILE_COLORS: Record<FileKind, string> = { pdf: "#e5484d", docx: "#2b6cdf", md: "#475569", zip: "#d9902b" };
const PAGE = "M4 1h11l8 8v17a3 3 0 0 1-3 3H4a3 3 0 0 1-3-3V4a3 3 0 0 1 3-3Z";

/** A file icon's drawing in a 24 × 30 box: the page, its folded corner, and the format's mark. */
function FileShape({ kind, outline = false }: { kind: FileKind; outline?: boolean }) {
  return (
    <>
      {outline && <path d={PAGE} fill="#fff" stroke="#fff" strokeWidth="3" strokeLinejoin="round" />}
      <path d={PAGE} fill={FILE_COLORS[kind]} />
      <path d="M15 1v5a3 3 0 0 0 3 3h5Z" fill="#fff" fillOpacity="0.5" />
      {kind === "pdf" && (
        <text x="12" y="23.5" textAnchor="middle" fill="#fff" fontSize="7.5" fontWeight="700" letterSpacing="0.2">
          PDF
        </text>
      )}
      {kind === "docx" && <path d="M7.2 15.5l2.3 8 2.5-6.6 2.5 6.6 2.3-8" fill="none" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />}
      {kind === "md" && <path d="M30 98V30h20l20 25 20-25h20v68H90V59L70 84 50 59v39zm125 0-30-33h20V30h20v35h20z" fill="#fff" transform="translate(1.6 13.6) scale(0.0968)" />}
      {kind === "zip" && (
        <g fill="#fff">
          <rect x="8.6" y="3" width="2" height="1.6" rx=".4" />
          <rect x="10.6" y="5.2" width="2" height="1.6" rx=".4" />
          <rect x="8.6" y="7.4" width="2" height="1.6" rx=".4" />
          <rect x="10.6" y="9.6" width="2" height="1.6" rx=".4" />
          <rect x="8.6" y="11.8" width="2" height="1.6" rx=".4" />
          <path d="M8.4 15h3.8a1 1 0 0 1 1 1v5.2a1.4 1.4 0 0 1-1.4 1.4H8.8a1.4 1.4 0 0 1-1.4-1.4V16a1 1 0 0 1 1-1Zm.9 3.6v2.2h2v-2.2Z" fillRule="evenodd" />
        </g>
      )}
    </>
  );
}

/** A page with a folded corner in the format's colour, marked PDF, W (Word), M↓ (the Markdown mark) or a zipper. */
export function FileIcon({ kind, size = 30, className }: { kind: FileKind; size?: number; className?: string }) {
  return (
    <svg width={(size * 24) / 30} height={size} viewBox="0 0 24 30" aria-hidden="true" focusable="false" className={className}>
      <FileShape kind={kind} />
    </svg>
  );
}

/** A PDF, a Word file and a Markdown file fanned out like a hand of cards. */
export function FileStackIcon({ size = 24, className }: LogoProps) {
  return (
    <svg width={(size * 43) / 30} height={size} viewBox="0 0 43 30" aria-hidden="true" focusable="false" className={className}>
      <g transform="translate(5.2 3.5) rotate(-10 9 21) scale(0.78)">
        <FileShape kind="pdf" outline />
      </g>
      <g transform="translate(19.2 3.5) rotate(10 9 21) scale(0.78)">
        <FileShape kind="md" outline />
      </g>
      <g transform="translate(12.2 1.5) scale(0.78)">
        <FileShape kind="docx" outline />
      </g>
    </svg>
  );
}
