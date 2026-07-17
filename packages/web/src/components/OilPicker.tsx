import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { searchOils, oilById, type OilRecord } from '../lib/oils';
import { formatInciSubtitle, oilPickerTag } from '../lib/oilDisplay';

type OilPickerProps = {
  value: string;
  onChange: (oilId: string) => void;
  /** Accessible name; distinguish multiple pickers (e.g. "Post-cook superfat oil"). */
  ariaLabel?: string;
};

export function OilPicker({ value, onChange, ariaLabel = 'Oil' }: OilPickerProps) {
  const listId = useId();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  const selected = oilById(value);
  const searchQuery = open && query.length === 0 ? '' : (query || selected?.displayName || '');
  // The list only renders while open; don't run the full-DB filter on every
  // app re-render for each closed picker.
  const results = useMemo(
    () => (open ? searchOils(searchQuery, searchQuery ? 50 : undefined) : []),
    [open, searchQuery],
  );

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  useEffect(() => {
    if (highlight >= results.length) setHighlight(Math.max(0, results.length - 1));
  }, [results.length, highlight]);

  function pick(oil: OilRecord) {
    onChange(oil.id);
    setQuery(oil.displayName);
    setOpen(false);
  }

  const activeId = results[highlight] ? `${listId}-opt-${results[highlight].id}` : undefined;

  return (
    <div className="oil-picker" ref={rootRef}>
      <input
        type="text"
        className="oil-picker__input"
        value={open ? query : (selected?.displayName ?? '')}
        placeholder="Search oils…"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open ? activeId : undefined}
        aria-autocomplete="list"
        onFocus={() => {
          setOpen(true);
          setQuery('');
          setHighlight(-1);
        }}
        onBlur={(e) => {
          if (e.relatedTarget && !rootRef.current?.contains(e.relatedTarget as Node)) {
            setOpen(false);
          }
        }}
        onChange={(e) => {
          const value = e.target.value;
          setQuery(value);
          setOpen(true);
          setHighlight(value.length === 0 ? -1 : 0);
        }}
        onKeyDown={(e) => {
          if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) {
            setOpen(true);
            return;
          }
          if (!open) return;
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlight((h) => Math.min(h + 1, results.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlight((h) => Math.max(h - 1, 0));
          } else if (e.key === 'Enter') {
            e.preventDefault();
            if (results[highlight]) pick(results[highlight]);
            else setOpen(false);
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
        aria-label={ariaLabel}
        autoComplete="off"
      />
      {open && results.length > 0 && (
        <ul className="oil-picker__list" id={listId} role="listbox">
          {results.map((oil, index) => {
            const tag = oilPickerTag(oil);
            const inciSubtitle = oil.inciName
              ? formatInciSubtitle(oil.displayName, oil.inciName, { category: oil.category })
              : undefined;

            return (
            <li key={oil.id} role="presentation">
              <button
                type="button"
                id={`${listId}-opt-${oil.id}`}
                role="option"
                aria-selected={index === highlight}
                className={`oil-picker__option${index === highlight ? ' oil-picker__option--active' : ''}${oil.id === value ? ' oil-picker__option--selected' : ''}`}
                onMouseEnter={() => setHighlight(index)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(oil)}
              >
                <span className="oil-picker__text">
                  <span className="oil-picker__name">{oil.displayName}</span>
                  {inciSubtitle && (
                    <span className="oil-picker__inci">{inciSubtitle}</span>
                  )}
                </span>
                {oil.sourceType === 'derived' && (
                  <span
                    className="oil-picker__tag oil-picker__tag--modeled"
                    title="Fatty-acid profile is a reconstruction, not a measured composition"
                  >
                    Modeled
                  </span>
                )}
                {tag && (
                  <span className="oil-picker__tag">{tag}</span>
                )}
              </button>
            </li>
            );
          })}
        </ul>
      )}
      {open && query.length > 0 && results.length === 0 && (
        <p className="oil-picker__empty" role="status">
          No oils found
        </p>
      )}
    </div>
  );
}
