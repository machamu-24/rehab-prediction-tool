import { useState } from "react";
import { ASSESSMENT_PHASES } from "@shared/assessment";
import {
  PATIENT_MODELS,
  PATIENT_MODEL_PHASES,
  type PatientModel,
  type PatientModelPhase,
} from "@shared/patientModels";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export function PatientModelPicker({
  onLoad,
  disabled,
}: {
  onLoad: (model: PatientModel, phase: PatientModelPhase) => void;
  disabled: boolean;
}) {
  const [modelId, setModelId] = useState(PATIENT_MODELS[0].id);
  const [phase, setPhase] = useState<PatientModelPhase>("admission");
  const model = PATIENT_MODELS.find(item => item.id === modelId)!;
  const observation = model.observations[phase];
  return (
    <details className="rounded-lg border border-dashed bg-muted/20">
      <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-muted-foreground">
        入力例：架空患者モデル（補足）
      </summary>
      <div className="space-y-3 border-t px-4 py-4">
        <p className="text-xs text-muted-foreground">
          4症例 ×
          3評価時点の12パターン。動作確認・比較用に作成した架空の数値です。
        </p>
        <div className="space-y-1.5">
          <Label htmlFor="patient-model">症例モデル</Label>
          <select
            id="patient-model"
            className="w-full min-h-9 rounded-md border px-2 bg-background text-sm"
            value={modelId}
            onChange={e => setModelId(e.target.value)}
            disabled={disabled}
          >
            {PATIENT_MODELS.map(item => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="patient-model-phase">読み込む評価時点</Label>
          <select
            id="patient-model-phase"
            className="w-full h-9 rounded-md border px-2 bg-background text-sm"
            value={phase}
            onChange={e => setPhase(e.target.value as PatientModelPhase)}
            disabled={disabled}
          >
            {PATIENT_MODEL_PHASES.map(item => (
              <option key={item} value={item}>
                {ASSESSMENT_PHASES[item]}
              </option>
            ))}
          </select>
        </div>
        <p className="text-sm">
          {model.age}歳・{model.sex}・{model.strokeType}
        </p>
        <p className="text-xs text-muted-foreground">{model.description}</p>
        <dl className="grid grid-cols-3 gap-2 rounded-md bg-muted/50 p-3 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">BBS</dt>
            <dd>{observation.bbs} / 56</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">FIM運動</dt>
            <dd>{observation.motor} / 91</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">FIM認知</dt>
            <dd>{observation.cognitive} / 35</dd>
          </div>
        </dl>
        <Button
          type="button"
          variant="outline"
          onClick={() => onLoad(model, phase)}
          disabled={disabled}
        >
          このモデルを入力
        </Button>
        <p className="text-xs text-muted-foreground">
          読み込むと患者情報・症例ID・評価日・評価時点・時間軸を置き換えます。読み込み後は自由に編集できます。経過は回復の標準値を示すものではありません。
        </p>
      </div>
    </details>
  );
}
