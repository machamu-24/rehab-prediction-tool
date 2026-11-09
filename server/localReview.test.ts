import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { reviewLiterature } from '../scripts/lib/literature-review.mjs';
import { runEngine } from './ruleEngine';
import { prepareRuleEdit } from './ruleReview';
import { assessmentSchema } from '../shared/assessment';
import { validateRuleDefinition } from '../shared/ruleValidation';
import type { LiteratureRule } from '../drizzle/schema';

const baseline = JSON.parse(fs.readFileSync(new URL('../scripts/local-literature.baseline.json',import.meta.url),'utf8'));
const reviewed = (id:number) => reviewLiterature(baseline.find((r:LiteratureRule) => r.id === id)) as LiteratureRule;
const result = (id:number, inputs:Record<string,number|string|boolean>) => runEngine([reviewed(id)],inputs).results[0];

describe('原著照合後の通常版モデル', () => {
  it('17件すべての確認記録があり、13件の構造が有効、4件を計算対象外にする', () => {
    expect(baseline).toHaveLength(17);
    for(const original of baseline) {
      const r = reviewLiterature(original);
      if(r.id === 30005) {
        expect(runEngine([r],{}).results[0]).toMatchObject({ status:'missing_input', isPositive:null, probability:null, referenceOnly:{reason:expect.stringContaining('ベースライン生存関数')} });
      } else if([60007,60008,60009].includes(r.id)) {
        expect(runEngine([r],{}).results[0]).toMatchObject({ status:'unsupported', isPositive:null });
      } else expect(validateRuleDefinition(r.ruleDefinition),r.name).toBeNull();
    }
  });
  it('FIMは現在値で入院時入力を補わず、正しい入院時値なら72.52点', () => {
    const values={admission_age:70,admission_fim_motor_total:41,admission_fim_cognitive_total:24,days_onset_to_admission:17};
    expect(result(30008,values).numericValue).toBeCloseTo(72.52);
    expect(result(30008,{age:70,fim_motor_total:41,fim_cognitive_total:24,days_onset_to_admission:17}).status).toBe('missing_input');
  });
  it.each([
    [{delta_bbs:21,admission_age:67},'86.5%',true],
    [{delta_bbs:21,admission_age:68},'42.3%',false],
    [{delta_bbs:20,delta_fim_motor:24},'71.4%',true],
    [{delta_bbs:20,delta_fim_motor:23,admission_fim_motor_total:43},'8.1%',false],
    [{delta_bbs:20,delta_fim_motor:23,admission_fim_motor_total:44},'33.3%',false],
  ])('重度群の経路・等号を原著図1と合わせる %j', (input, rate, supports) => {
    expect(result(30006,{admission_fim_motor_total:40,...input})).toMatchObject({status:'evaluated',isPositive:supports,prediction:expect.stringContaining(rate)});
  });
  it.each([
    [{delta_fim_motor:13},'95.4%',true],
    [{delta_fim_motor:12,admission_cba_score:18,delta_fim_cognitive:1},'14.3%',false],
    [{delta_fim_motor:12,admission_cba_score:18,delta_fim_cognitive:2},'50%',null],
    [{delta_fim_motor:12,admission_cba_score:19,admission_age:67},'91.6%',true],
    [{delta_fim_motor:12,admission_cba_score:19,admission_age:68},'54.7%',true],
  ])('中等度群の経路・等号を原著図2と合わせる %j', (input, rate, supports) => {
    expect(result(30007,{admission_fim_motor_total:55,...input})).toMatchObject({status:'evaluated',isPositive:supports,prediction:expect.stringContaining(rate)});
  });
  it.each([
    [{stroke_type:'脳梗塞',admission_care_level:3},'11.8%',false],
    [{stroke_type:'脳梗塞',admission_care_level:2,admission_fim_cognitive_total:19},'42.9%',false],
    [{stroke_type:'脳梗塞',admission_care_level:2,admission_fim_cognitive_total:20},'97.4%',true],
    [{stroke_type:'脳出血',admission_fim_motor_total:47},'8.7%',false],
    [{stroke_type:'脳出血',admission_fim_motor_total:48},'100%',true],
  ])('妹尾らの要介護分岐を取り違えない %j', (input,rate,supports) => {
    expect(result(60006,input)).toMatchObject({status:'evaluated',prediction:expect.stringContaining(rate),isPositive:supports});
  });
  it('未対象の病型を脳梗塞として計算しない', () => {
    expect(result(60006,{stroke_type:'その他',admission_care_level:1}).status).toBe('outside');
  });
  it('BBS12点の非歩行サブグループ条件を満たす必要がある', () => {
    const inputs={days_onset_to_admission:20,admission_mmse_score:24,admission_bbs_score:12,stroke_type:'脳梗塞'};
    expect(result(60002,inputs).status).toBe('missing_input');
    expect(result(60002,{...inputs,admission_unassisted_5m:true}).status).toBe('outside');
    expect(result(60002,{...inputs,admission_unassisted_5m:false}).isPositive).toBe(true);
  });
  it('慢性期の判別を急性期や糖尿病の対象に適用しない', () => {
    expect(result(60003,{months_since_onset:2,tug_seconds:10,mmse_score:28,diabetes:false}).status).toBe('outside');
    expect(result(60003,{months_since_onset:8,tug_seconds:10,mmse_score:28,diabetes:true}).status).toBe('outside');
    expect(result(60003,{months_since_onset:8,tug_seconds:14.77,mmse_score:28,diabetes:false}).isPositive).toBe(false);
  });
  it('ルールは登録・編集後に再照合なしで計算できる', () => {
    const r=reviewed(30001);
    const changed=prepareRuleEdit(r,{ruleDefinition:{...r.ruleDefinition,threshold:1,evidenceReview:{status:'pending'}}});
    expect(runEngine([{...r,ruleDefinition:changed}],{knee_ext_paretic_nm_kg:0.8}).results[0]).toMatchObject({status:'evaluated',isPositive:false});
    const created=prepareRuleEdit(undefined,{ruleDefinition:r.ruleDefinition});
    expect((created as any).evidenceReview).toBeUndefined();
    expect(runEngine([{...r,ruleDefinition:created}],{knee_ext_paretic_nm_kg:0.8}).results[0]).toMatchObject({status:'evaluated',isPositive:true});
  });
  it('明示された計算対象外の理由は編集で消さない', () => {
    const r=reviewed(60007);
    const definition=prepareRuleEdit(r,{source:'出典表記の修正'});
    expect(runEngine([{...r,ruleDefinition:definition}],{}).results[0]).toMatchObject({status:'unsupported',isPositive:null});
    expect((definition as any).evidenceReview.reason).toBe((r.ruleDefinition as any).evidenceReview.reason);
  });
  it('不正な日付や識別子を保存しない', () => {
    expect(assessmentSchema.safeParse({caseId:'CASE-1',assessedOn:'2026-10-07',assessmentPhase:'admission'}).success).toBe(true);
    expect(assessmentSchema.safeParse({assessedOn:'2026-02-30'}).success).toBe(false);
    expect(assessmentSchema.safeParse({caseId:'氏名'}).success).toBe(false);
  });
});
