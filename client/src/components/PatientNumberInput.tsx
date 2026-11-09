import { useState } from "react";
import {
  classifyPatientScoreInput,
  getPatientScoreRange,
} from "@shared/patientScoreRanges";
import { Input } from "./ui/input";

export function PatientNumberInput({
  fieldKey,
  placeholder,
  describedBy,
  value,
  onValueChange,
  readOnly = false,
  disabled = false,
}: {
  fieldKey: string;
  placeholder?: string;
  describedBy?: string;
  value: string | number | undefined;
  onValueChange: (value: string) => void;
  readOnly?: boolean;
  disabled?: boolean;
}) {
  const range = getPatientScoreRange(fieldKey);
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <Input
      id={`patient-${fieldKey}`}
      aria-describedby={describedBy}
      type={range ? "text" : "number"}
      inputMode={range ? "numeric" : undefined}
      pattern={range ? "[0-9]*" : undefined}
      title={range ? `${range.min}〜${range.max}の整数` : undefined}
      className="h-8 text-sm"
      placeholder={
        placeholder ?? (range ? `${range.min}〜${range.max}` : undefined)
      }
      readOnly={readOnly}
      disabled={disabled}
      value={readOnly ? value ?? "" : draft ?? value ?? ""}
      onChange={event => {
        const next = event.target.value;
        if (!range) {
          onValueChange(next);
          return;
        }
        const state = classifyPatientScoreInput(next, range);
        if (state === "invalid") return;
        setDraft(next);
        onValueChange(state === "partial" ? "" : next);
      }}
      // Incomplete prefixes are never used for calculation or saved in drafts.
      onBlur={() => setDraft(null)}
    />
  );
}
