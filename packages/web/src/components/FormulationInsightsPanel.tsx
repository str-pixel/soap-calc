import type { FormulationInsight } from '@soap-calc/core';

type FormulationInsightsPanelProps = {
  insights: FormulationInsight[];
};

export function FormulationInsightsPanel({ insights }: FormulationInsightsPanelProps) {
  if (insights.length === 0) return null;

  return (
    <section className="panel">
      <h2 className="panel__title">Formulation notes</h2>
      <p className="panel__subtitle">Heuristic hints — not pass/fail rules</p>
      <ul className="message-list message-list--insights">
        {insights.map((insight) => (
          <li
            key={insight.code}
            className={
              insight.level === 'warning'
                ? 'message-list__item--warn'
                : 'message-list__item--info'
            }
          >
            {insight.message}
          </li>
        ))}
      </ul>
    </section>
  );
}
