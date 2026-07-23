import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';

type ActionsMenuProps = {
  onNew: () => void;
  onExport: () => void;
  onPrint: () => void;
  onImport: () => void;
  canPrint: boolean;
};

/**
 * Consolidated New / Export / Print / Import actions as a WAI-ARIA menu button — ink-fill
 * trigger, hairline dropdown. Opening moves focus into the menu; Down/Up (and Home/End) rove
 * between the enabled items; Escape or choosing an item closes the menu and returns focus to
 * the trigger; Tab or an outside pointer press closes it. The disabled item (Print with no
 * batch sheet) is skipped by keyboard navigation.
 */
export function ActionsMenu({ onNew, onExport, onPrint, onImport, canPrint }: ActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  // true → focus the LAST item when the menu next opens (Up-arrow open); reset after each open.
  const openToLastRef = useRef(false);

  const items: { label: string; onSelect: () => void; disabled?: boolean }[] = [
    { label: 'New recipe', onSelect: onNew },
    { label: 'Export', onSelect: onExport },
    { label: 'Print batch sheet', onSelect: onPrint, disabled: !canPrint },
    { label: 'Import', onSelect: onImport },
  ];

  const enabledItems = (): HTMLButtonElement[] =>
    menuRef.current
      ? Array.from(
          menuRef.current.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([disabled])'),
        )
      : [];

  // On open, move focus into the menu (first enabled item, or last for an Up-arrow open) and
  // arm the outside-pointer closer. Outside clicks close without pulling focus back.
  useEffect(() => {
    if (!open) return;
    const els = enabledItems();
    (openToLastRef.current ? els[els.length - 1] : els[0])?.focus();
    openToLastRef.current = false;
    const onPointer = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    return () => document.removeEventListener('mousedown', onPointer);
  }, [open]);

  const closeToTrigger = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  const select = (onSelect: () => void) => {
    // Close and restore focus to the trigger before running the action, so keyboard users
    // land somewhere predictable (actions that open their own surface, e.g. Import's file
    // dialog, take focus from there).
    setOpen(false);
    triggerRef.current?.focus();
    onSelect();
  };

  const onTriggerKeyDown = (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    // Enter/Space fall through to the button's native click (which toggles `open`); the effect
    // then focuses the first item. Arrows open with an explicit focus target.
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      openToLastRef.current = false;
      setOpen(true);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      openToLastRef.current = true;
      setOpen(true);
    }
  };

  const onMenuKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const els = enabledItems();
    if (!els.length) return;
    const current = els.indexOf(document.activeElement as HTMLButtonElement);
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        els[(current + 1) % els.length]?.focus();
        break;
      case 'ArrowUp':
        e.preventDefault();
        els[(current - 1 + els.length) % els.length]?.focus();
        break;
      case 'Home':
        e.preventDefault();
        els[0]?.focus();
        break;
      case 'End':
        e.preventDefault();
        els[els.length - 1]?.focus();
        break;
      case 'Escape':
        e.preventDefault();
        closeToTrigger();
        break;
      case 'Tab':
        // Menu-button pattern: Tab closes the menu and lets focus move on naturally.
        setOpen(false);
        break;
      default:
        break;
    }
  };

  return (
    <div className="actions-menu" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`actions-menu__trigger${open ? ' actions-menu__trigger--open' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? 'actions-menu-list' : undefined}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={onTriggerKeyDown}
      >
        Actions
        <span className="actions-menu__chevron" aria-hidden="true" />
      </button>
      {open && (
        <div
          className="actions-menu__list"
          id="actions-menu-list"
          role="menu"
          aria-label="Actions"
          ref={menuRef}
          onKeyDown={onMenuKeyDown}
        >
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              tabIndex={-1}
              className="actions-menu__item"
              disabled={it.disabled}
              onClick={() => select(it.onSelect)}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
