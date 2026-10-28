"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Segmented } from "@/components/ui/Controls";
import { Field, Input, Textarea } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { Select } from "@/components/ui/Select";
import { toast } from "@/components/ui/Toast";
import { errorMessage } from "@/lib/client/api";
import {
  describeOutputPolicy,
  DOC_ACCEPT,
  LENGTHS,
  MAX_AI_IMAGES,
  STYLES,
  TONES,
  type FeedbackLength,
  type GradingStyle,
  type OutputPolicy,
  type Tone,
} from "@/lib/shared/constants";
import { fmtSize } from "@/lib/shared/format";
import { uploadDoc, type UploadedDoc } from "./uploadDoc";

export function InstructionsField({
  text,
  file,
  onText,
  onFile,
  rows = 4,
  label = true,
}: {
  text: string;
  file: UploadedDoc | null;
  onText: (t: string) => void;
  onFile: (f: UploadedDoc | null) => void;
  rows?: number;
  label?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  async function pick(f?: File) {
    if (!f) return;
    setBusy(true);
    try {
      const doc = await uploadDoc(f);
      if (!doc.hasText) toast("No text could be read from this document. The AI won't see its contents; paste the text instead.", { error: true });
      onFile(doc);
    } catch (err) {
      toast(errorMessage(err), { error: true });
    } finally {
      setBusy(false);
    }
  }
  return (
    <Field
      label={label ? "Assignment instructions" : undefined}
      optional={label}
      htmlFor="asg-task"
      hint="Sent to the AI with each submission so it knows what was expected."
      action={
        !file && (
          <Button variant="link" icon="filePlus" onClick={() => ref.current?.click()} loading={busy}>
            Upload document
          </Button>
        )
      }
    >
      <input ref={ref} type="file" accept={DOC_ACCEPT} hidden onChange={(e) => (pick(e.target.files?.[0]), (e.target.value = ""))} />
      {file ? (
        <div className="file-chip">
          <Icon name="fileText" size={16} />
          <span className="file-chip__name">{file.name}</span>
          <span className="muted">{fmtSize(file.size)}</span>
          <Button variant="link" onClick={() => ref.current?.click()}>
            Replace
          </Button>
          <Button variant="link" onClick={() => onFile(null)}>
            Remove
          </Button>
        </div>
      ) : (
        <Textarea
          id="asg-task"
          rows={rows}
          value={text}
          onChange={(e) => onText(e.target.value)}
          placeholder="Paste what students were asked to do, e.g. the questions from the assignment handout."
        />
      )}
    </Field>
  );
}

const OUTPUT_TEXT = {
  images: {
    label: "Plots and images sent to the AI",
    all: "All plots and images",
    none: "No plots or images",
    hint: (p: OutputPolicy) =>
      p.mode === "none"
        ? "The AI sees a short note in place of each image, with the plot's text description when there is one."
        : `${p.mode === "all" ? `Every output image in a notebook is sent, up to ${MAX_AI_IMAGES} per file, so the AI can judge visualizations.` : `The first ${p.limit} output images in each notebook are sent so the AI can judge visualizations. It sees a short note in place of the rest.`} Images use many tokens and need a model that accepts images.`,
  },
  interactive: {
    label: "Interactive outputs sent to the AI",
    all: "All interactive outputs",
    none: "No interactive outputs",
    hint: (p: OutputPolicy) =>
      p.mode === "none"
        ? "The AI sees a short note in place of each widget or Plotly, Bokeh or Vega chart."
        : `Widgets and Plotly, Bokeh or Vega charts can't be shown to the AI, so ${p.mode === "all" ? "their text form is sent instead" : `the text form of the first ${p.limit} is sent instead`}, up to 2,000 characters each.${p.mode === "limit" ? " The AI sees a short note in place of the rest." : ""}`,
  },
};

/**
 * How many notebook output images or interactive outputs go to the AI. With `siteDefault`
 * (on an assignment), null means "use the site's setting".
 */
export function OutputPolicyField({
  kind,
  value,
  onChange,
  siteDefault,
  extraHint,
  disabled,
}: {
  kind: "images" | "interactive";
  value: OutputPolicy | null;
  onChange: (v: OutputPolicy | null) => void;
  siteDefault?: OutputPolicy;
  extraHint?: string;
  disabled?: boolean;
}) {
  const t = OUTPUT_TEXT[kind];
  const effective = value ?? siteDefault ?? { mode: "none", limit: 6 };
  // The number stays editable while it's empty or out of range; the server says what's allowed.
  const [limit, setLimit] = useState(String(effective.limit));
  useEffect(() => {
    if (value && Number(limit) !== value.limit) setLimit(String(value.limit));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value?.limit]);
  const options = [
    ...(siteDefault ? [{ value: "default", label: `Site default (${describeOutputPolicy(siteDefault, kind)})` }] : []),
    { value: "all", label: t.all },
    { value: "limit", label: "Up to a set number" },
    { value: "none", label: t.none },
  ];
  return (
    <div className="field">
      <span className="field__label">{t.label}</span>
      <div className="row row--wrap">
        <div className="grow" style={{ minWidth: 220 }}>
          <Select
            ariaLabel={t.label}
            value={value ? value.mode : "default"}
            onChange={(m) => onChange(m === "default" ? null : { mode: m as OutputPolicy["mode"], limit: Number(limit) || effective.limit })}
            options={options}
            disabled={disabled}
          />
        </div>
        {value?.mode === "limit" && (
          <span className="row" style={{ gap: 8 }}>
            <Input
              type="number"
              min={1}
              max={MAX_AI_IMAGES}
              value={limit}
              disabled={disabled}
              aria-label={kind === "images" ? "Images per file" : "Interactive outputs per file"}
              style={{ width: 84 }}
              onChange={(e) => {
                setLimit(e.target.value);
                onChange({ mode: "limit", limit: Number(e.target.value) });
              }}
            />
            <span className="muted nowrap">per file</span>
          </span>
        )}
      </div>
      <span className="field__hint">
        {t.hint(effective)}
        {extraHint && effective.mode !== "none" ? " " + extraHint : ""}
      </span>
    </div>
  );
}

export type GradingSettings = {
  style: GradingStyle;
  tone: Tone;
  length: FeedbackLength;
  notes: string;
  /** Null uses the site's setting. */
  aiImages: OutputPolicy | null;
  aiInteractive: OutputPolicy | null;
};

/** The site's settings an assignment uses unless it sets its own. */
export type AiDefaults = { aiImages: OutputPolicy; aiInteractive: OutputPolicy };

export function GradingSettingsFields({
  value,
  onChange,
  model,
  aiDefaults,
  disabled,
}: {
  value: GradingSettings;
  onChange: (v: GradingSettings) => void;
  model: string;
  aiDefaults: AiDefaults;
  disabled?: boolean;
}) {
  const set = (p: Partial<GradingSettings>) => onChange({ ...value, ...p });
  return (
    <>
      <div className="field">
        <span className="field__label">Grading style</span>
        <Segmented ariaLabel="Grading style" value={value.style} onChange={(s) => set({ style: s })} options={STYLES} disabled={disabled} />
        <span className="field__hint">{STYLES.find((s) => s.id === value.style)?.desc}</span>
      </div>
      <div className="field">
        <span className="field__label">Student feedback</span>
        <div className="form-grid">
          <div className="field">
            <span className="field__hint">Tone</span>
            <Segmented ariaLabel="Tone" value={value.tone} onChange={(t) => set({ tone: t })} options={TONES} disabled={disabled} />
          </div>
          <div className="field">
            <span className="field__hint">Length</span>
            <Segmented ariaLabel="Length" value={value.length} onChange={(l) => set({ length: l })} options={LENGTHS} disabled={disabled} />
          </div>
        </div>
        <span className="field__hint">Changes how the summary and comments are written. Scores are not affected.</span>
      </div>
      <div className="field">
        <span className="field__label">Model</span>
        <span className="row" style={{ gap: 7 }}>
          <Icon name="bot" size={15} style={{ color: "var(--c-muted)" }} />
          {model || "Not set"}
        </span>
        <span className="field__hint">Used for all assignments. Set by an admin in Settings.</span>
      </div>
      <OutputPolicyField kind="images" value={value.aiImages} onChange={(v) => set({ aiImages: v })} siteDefault={aiDefaults.aiImages} disabled={disabled} />
      <OutputPolicyField
        kind="interactive"
        value={value.aiInteractive}
        onChange={(v) => set({ aiInteractive: v })}
        siteDefault={aiDefaults.aiInteractive}
        disabled={disabled}
      />
      <Field label="Notes for the AI" optional htmlFor="asg-notes">
        <Textarea
          id="asg-notes"
          rows={3}
          value={value.notes}
          readOnly={disabled}
          onChange={(e) => set({ notes: e.target.value })}
          placeholder="e.g. Partial credit for a correct approach with arithmetic errors."
        />
      </Field>
    </>
  );
}
