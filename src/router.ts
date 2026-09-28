import { CATALOG_VERSION } from './config.ts';
import type { Analysis, Choice, Model, Recommendation, Effort } from './types.ts';
import type { Task } from './store.ts';

export function classify(prompt: string, context = ''): Analysis {
  const contextDependent = /^(yes|ok(?:ay)?|continue|do (?:it|that)|implement (?:it|that)|fix (?:it|that)|go ahead|same|make (?:it|that)|now\b)/i.test(prompt.trim());
  const text = (contextDependent ? `${context}\n${prompt}` : prompt).toLowerCase();
  const risk = /\b(security|authentication|authorization|cryptograph|payment|production database|data loss|concurren|race condition|distributed|deadlock|vulnerabil)/.test(text);
  const complex = /\b(architect|redesign|migrat|large refactor|across (?:the |multiple )|entire (?:app|codebase)|root cause|complex|from scratch|end.to.end|build (?:a|an|the) (?:app|platform|system))/.test(text);
  const small = /\b(typo|spelling|rename|format|one.line|single.line|translate|summari[sz]e|explain (?:this|a)|change (?:the )?(?:label|text|color|colour)|list (?:the )?files)\b/.test(text);
  const category = /\b(debug|bug|fix|error|crash|race|deadlock)/.test(text) ? 'debugging'
    : /\b(research|compare|investigate)/.test(text) ? 'research'
    : /\b(review|audit)/.test(text) ? 'review'
    : /\b(plan|architect|design)/.test(text) ? 'planning'
    : /\b(write|rewrite|translate|summari[sz]e|email|document)/.test(text) && !/\b(code|function|test|component)/.test(text) ? 'writing' : 'coding';
  let difficulty = risk || complex ? 3 : small && text.length < 2000 ? 1 : 2;
  let confidence = risk || complex ? 0.9 : small ? 0.9 : 0.6;
  const reasons = [risk ? 'Errors could have substantial consequences.' : complex ? 'The task spans substantial reasoning or multiple moving parts.' : small ? 'The requested change is narrow and well-defined.' : 'Scope is uncertain; compare a balanced model with a stronger option.'];
  if (contextDependent && !context) { difficulty = 2; confidence = 0.4; reasons.push('There is not enough prior context to resolve this follow-up.'); }
  if (contextDependent && context) reasons.push('Relevant earlier conversation was included in classification.');
  if (text.length > 12000) { difficulty = Math.max(2, difficulty); confidence = Math.min(confidence, 0.6); reasons.push('Long input increases uncertainty about scope.'); }
  return { category, difficulty, confidence, reasons, contextDependent, source: 'rules' };
}
export function similarity(a: string, b: string) {
  const tokenize = (s: string) => new Set(s.toLowerCase().match(/[\p{L}\p{N}_-]+/gu) ?? []);
  const x = tokenize(a), y = tokenize(b);
  const overlap = [...x].filter(t => y.has(t)).length;
  return overlap / (new Set([...x, ...y]).size || 1);
}
export function effortFor(model: Model, difficulty: number): Effort | undefined {
  const target: Effort = difficulty >= 3 ? 'high' : difficulty === 2 ? 'medium' : 'low';
  return model.efforts.includes(target) ? target : model.defaultEffort ?? model.efforts[0];
}
export function recommend(input: { prompt: string; context?: string; models: Model[]; history?: Task[]; currentModel?: string; override?: string; analysis?: Analysis }): Recommendation {
  const start = performance.now();
  const analysis = structuredClone(input.analysis ?? classify(input.prompt, input.context));
  const choice = (model: Model, reason: string, effort = effortFor(model, analysis.difficulty)): Choice => ({ model, effort, reason });
  const finish = (choices: Choice[], source: Recommendation['source'], matchedTaskId?: string): Recommendation => ({ analysis, choices, source, matchedTaskId, catalogVersion: CATALOG_VERSION, elapsedMs: performance.now() - start });
  if (input.override) {
    const m = input.models.find(m => m.id === input.override || m.resolvedId === input.override);
    if (!m) throw new Error(`Model ${input.override} is not in the client's available model list.`);
    return finish([choice(m, 'Your explicit model choice.')], 'override');
  }
  const matches = (input.history ?? []).filter(t => t.result && t.recommendation.catalogVersion === CATALOG_VERSION &&
    t.recommendation.analysis.category === analysis.category &&
    similarity(`${t.prompt}\n${analysis.contextDependent ? t.context : ''}`, `${input.prompt}\n${analysis.contextDependent ? input.context ?? '' : ''}`) >= 0.8);
  // Explicit negative feedback raises the floor; successful execution alone is not a quality label.
  for (const t of matches) if (t.feedback === 'stronger' && t.choice) {
    analysis.difficulty = Math.max(analysis.difficulty, t.choice.model.capability + 1);
    analysis.reasons.push('You previously needed a stronger model for a similar task.');
  }
  const models = input.models.filter(m => m.capability >= analysis.difficulty && m.costRank > 0)
    .sort((a, b) => a.costRank - b.costRank || b.priority - a.priority || a.id.localeCompare(b.id));
  if (!models.length) throw new Error('No rated, available model meets this task’s requirements. Use /model for an explicit choice or update config.json.');
  for (const t of matches) {
    const m = models.find(m => m.id === t.choice?.model.id);
    if (m && t.feedback === 'good' && t.result?.status === 'completed' && ((t.result.modelEvidence === 'execution' && t.result.actualModels.includes(m.resolvedId ?? m.id)) || (t.result.modelEvidence === 'configuration' && t.result.configuredModel === m.id)) && t.choice?.model.capability === m.capability &&
      m.costRank === models[0].costRank && (!t.choice.effort || m.efforts.includes(t.choice.effort))) {
      return finish([choice(m, 'A similar task succeeded and you marked this model a good fit.', t.choice.effort)], 'history', t.id);
    }
  }
  let best = models[0];
  const current = models.find(m => m.id === input.currentModel);
  if (current && current.costRank === best.costRank) best = current;
  const choices = [choice(best, `${analysis.reasons[0]} Lowest configured cost tier that meets the requirements.`)];
  if (analysis.confidence < 0.8) {
    const second = models.find(m => m.capability > best.capability);
    if (second) choices.push(choice(second, 'More reasoning capacity if the task proves broader than expected; higher configured cost tier.'));
  }
  return finish(choices, analysis.source);
}
