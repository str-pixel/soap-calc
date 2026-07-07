import { RECIPE_PRESETS } from '../data/recipe-presets';

type RecipePresetsPanelProps = {
  onLoadPreset: (presetId: string) => void;
};

export function RecipePresetsPanel({ onLoadPreset }: RecipePresetsPanelProps) {
  return (
    <section className="panel panel--compact">
      <div className="panel__head">
        <div>
          <h2 className="panel__title">Recipe presets</h2>
          <p className="panel__subtitle">Built-in starting points — adjust to your batch</p>
        </div>
      </div>
      <ul className="preset-list">
        {RECIPE_PRESETS.map((preset) => (
          <li key={preset.id} className="preset-list__item">
            <div className="preset-list__body">
              <strong>{preset.name}</strong>
              <p className="preset-list__desc">{preset.description}</p>
            </div>
            <button
              type="button"
              className="btn btn--ghost btn--small"
              onClick={() => onLoadPreset(preset.id)}
            >
              Load
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
