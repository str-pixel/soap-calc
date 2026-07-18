export function PreservePanel() {
  return (
    <section className="panel panel--nested">
      <div className="panel__head">
        <div>
          <h2 className="panel__title">Preserve</h2>
          <p className="panel__subtitle">Diluted liquid soap needs a preservative — a bar does not</p>
        </div>
      </div>
      <p className="results-hint">
        A cured bar sits at a low water activity (roughly 0.66–0.76), which is self-preserving.
        Diluting soap paste into liquid soap raises the water activity to around 0.98 — well
        within the range where mold, yeast, and bacteria can grow. That means diluted liquid soap
        needs a broad-spectrum preservative that stays stable at soap's high pH.
      </p>
      <p className="results-hint" role="alert">
        Choose the preservative and its use level with your supplier&rsquo;s guidance — verify
        with the supplier before finalizing a batch, since dosing depends on the specific product.
      </p>
    </section>
  );
}
