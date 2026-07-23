import { useEffect, useRef, useState } from 'react';

type ActionsMenuProps = {
  onNew: () => void;
  onExport: () => void;
  onPrint: () => void;
  onImport: () => void;
  canPrint: boolean;
};

/**
 * Consolidated New / Export / Print / Import actions as a Signal disclosure menu — ink-fill
 * trigger, hairline dropdown, click-outside + Escape to close. Selecting an item closes the
 * menu and runs its handler.
 */
export function ActionsMenu({ onNew, onExport, onPrint, onImport, canPrint }: ActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const items: { label: string; onSelect: () => void; disabled?: boolean }[] = [
    { label: 'New recipe', onSelect: onNew },
    { label: 'Export', onSelect: onExport },
    { label: 'Print batch sheet', onSelect: onPrint, disabled: !canPrint },
    { label: 'Import', onSelect: onImport },
  ];

  return (
    <div className="actions-menu" ref={ref}>
      <button
        type="button"
        className={`actions-menu__trigger${open ? ' actions-menu__trigger--open' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        Actions
        <span className="actions-menu__chevron" aria-hidden="true" />
      </button>
      {open && (
        <div className="actions-menu__list" role="menu">
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              className="actions-menu__item"
              disabled={it.disabled}
              onClick={() => {
                setOpen(false);
                it.onSelect();
              }}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
