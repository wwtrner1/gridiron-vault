import { useState } from "react";
import { Icon } from "./Icon";
import { Tooltip } from "./Tooltip";
import { clampRule, RULE_LIMITS, RULE_PRESETS, ruleSet, type RuleLines } from "../lib/rules";
import type { RuleCheck } from "../lib/ruleCheck";

type Props = {
  check: RuleCheck;
  rules: RuleLines;
  onRules: (next: RuleLines) => void;
  /** Yards to the goal line on a field that doesn't show one (this visit only). */
  toGoal: number | null;
  onToGoal: (yards: number | null) => void;
  /** Select the players and lines an item is about. */
  onShow: (ids: string[]) => void;
};

const MARK = { fail: "close", warn: "help", ok: "check", skip: "eye" } as const;
const SAY = { fail: "Breaks the rule", warn: "Worth a look", ok: "Legal", skip: "Can't check yet" } as const;

/**
 * Rules check: the coach's rule set (NFL FLAG 5-on-5, 7-on-7, tackle…), the
 * rule lines drawn over the field, and what the drawing breaks, read from the
 * play itself by checkRules. Tapping an item picks the players it is about.
 */
export function RulesCheck({ check, rules, onRules, toGoal, onToGoal, onShow }: Props) {
  const [tuning, setTuning] = useState(false);
  const set = ruleSet(rules.set);
  return (
    <div className="rc">
      <div className="chip-row" role="group" aria-label="Rule set">
        {RULE_PRESETS.map((r) => (
          <Tooltip key={r.id} title={r.name} hint={r.note} side="top">
            <button
              type="button"
              className={`chip${rules.set === r.id ? " is-on" : ""}`}
              aria-pressed={rules.set === r.id}
              onClick={() => onRules({ ...rules, set: r.id, rush: r.rush, noRun: r.noRun, on: rules.on && (r.rush > 0 || r.noRun > 0) })}
            >
              {r.name}
            </button>
          </Tooltip>
        ))}
      </div>

      <ul className="rc-list" aria-label={`Rules check for ${set.name}`}>
        {check.items.map((item) => (
          <li key={item.id} className={`rc-item is-${item.status}`}>
            <span className="rc-mark" aria-label={SAY[item.status]} role="img">
              <Icon name={MARK[item.status]} size={12} />
            </span>
            <div>
              <b>{item.title}</b>
              <p>{item.detail}</p>
              {item.nodes.length > 0 && (
                <button type="button" className="rc-show" onClick={() => onShow(item.nodes)}>
                  Show me on the field
                </button>
              )}
              {item.id === "no-run" && item.status === "skip" && (
                <label className="rc-goal">
                  <span>Ball is</span>
                  <input
                    className="input"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={99}
                    value={toGoal ?? ""}
                    placeholder="—"
                    aria-label="Yards from the goal line"
                    onChange={(e) => onToGoal(e.target.value === "" ? null : Math.max(0, Math.min(99, Number(e.target.value))))}
                  />
                  <span>yds from the goal line</span>
                </label>
              )}
            </div>
          </li>
        ))}
      </ul>

      <label className="switch">
        <input type="checkbox" checked={rules.on} onChange={(e) => onRules({ ...rules, on: e.target.checked })} />
        Draw the rush line and no-run zone on the field
      </label>
      <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={() => setTuning((v) => !v)} aria-expanded={tuning}>
        {tuning ? "Done" : "Change the distances"}
      </button>
      {tuning && (
        <>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <label className="field" style={{ flex: 1, marginBottom: 0 }}>
              <span>Rush line (yds)</span>
              <input
                className="input"
                type="number"
                inputMode="numeric"
                min={RULE_LIMITS.rush.min}
                max={RULE_LIMITS.rush.max}
                value={rules.rush}
                onChange={(e) => onRules({ ...rules, rush: clampRule(Number(e.target.value), "rush") })}
              />
            </label>
            <label className="field" style={{ flex: 1, marginBottom: 0 }}>
              <span>No-run zone (yds)</span>
              <input
                className="input"
                type="number"
                inputMode="numeric"
                min={RULE_LIMITS.noRun.min}
                max={RULE_LIMITS.noRun.max}
                value={rules.noRun}
                onChange={(e) => onRules({ ...rules, noRun: clampRule(Number(e.target.value), "noRun") })}
              />
            </label>
          </div>
          <p className="hint">
            Leagues differ, so set your own distances. Rushers start behind the rush line on the defense's side; the no-run zone counts back from the goal line{set.midfieldNoRun ? " and midfield" : ""}.
          </p>
        </>
      )}
    </div>
  );
}
