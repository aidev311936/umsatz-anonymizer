import React, { useMemo, useState } from 'react';
import { MappingConfig } from '../lib/normalize';

type MappingTarget = 'date' | 'text' | 'type' | 'amount' | null;

interface MappingPanelProps {
  columns: string[];
  mapping: MappingConfig;
  onChange: (mapping: MappingConfig) => void;
}

const MappingPanel: React.FC<MappingPanelProps> = ({ columns, mapping, onChange }) => {
  const [activeTarget, setActiveTarget] = useState<MappingTarget>(null);

  const singleAssignments = useMemo(() => {
    return new Map<string, 'date' | 'type' | 'amount'>([
      ...(mapping.bookingDate ? [[mapping.bookingDate, 'date'] as const] : []),
      ...(mapping.bookingType ? [[mapping.bookingType, 'type'] as const] : []),
      ...(mapping.bookingAmount ? [[mapping.bookingAmount, 'amount'] as const] : [])
    ]);
  }, [mapping.bookingAmount, mapping.bookingDate, mapping.bookingType]);

  const textAssignmentSet = useMemo(() => new Set(mapping.bookingText), [mapping.bookingText]);

  const handleColumnClick = (column: string) => {
    if (!activeTarget) {
      return;
    }

    if (activeTarget === 'text') {
      const exists = textAssignmentSet.has(column);
      const nextText = exists
        ? mapping.bookingText.filter((item) => item !== column)
        : [...mapping.bookingText, column];
      onChange({ ...mapping, bookingText: nextText });
      return;
    }

    if (activeTarget === 'date') {
      onChange({ ...mapping, bookingDate: column });
      return;
    }
    if (activeTarget === 'type') {
      onChange({ ...mapping, bookingType: column });
      return;
    }
    if (activeTarget === 'amount') {
      onChange({ ...mapping, bookingAmount: column });
      return;
    }
  };

  const moveTextColumn = (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= mapping.bookingText.length) {
      return;
    }
    const next = [...mapping.bookingText];
    const [current] = next.splice(index, 1);
    next.splice(targetIndex, 0, current);
    onChange({ ...mapping, bookingText: next });
  };

  const removeTextColumn = (index: number) => {
    const next = mapping.bookingText.filter((_, idx) => idx !== index);
    onChange({ ...mapping, bookingText: next });
  };

  const renderTargetButton = (label: string, target: Exclude<MappingTarget, null>, currentValue?: string | string[]) => {
    const isActive = activeTarget === target;
    const displayValue = Array.isArray(currentValue)
      ? (currentValue.length > 0 ? currentValue.join(' → ') : 'nicht zugeordnet')
      : currentValue ?? 'nicht zugeordnet';

    return (
      <button
        type="button"
        className={isActive ? 'active' : undefined}
        onClick={() => setActiveTarget(isActive ? null : target)}
      >
        {`${label}: ${displayValue}`}
      </button>
    );
  };

  return (
    <section className="mapping-target">
      <h3>Feldzuordnung</h3>
      <p>Wählen Sie zuerst ein Ziel oben und klicken Sie anschließend auf eine Spalte in der Liste.</p>
      <div className="mapping-actions">
        {renderTargetButton('Buchungsdatum', 'date', mapping.bookingDate)}
        {renderTargetButton('Buchungstext', 'text', mapping.bookingText)}
        {renderTargetButton('Buchungstyp', 'type', mapping.bookingType)}
        {renderTargetButton('Betrag', 'amount', mapping.bookingAmount)}
      </div>
      <div className="column-chips" role="list">
        {columns.map((column) => {
          const assignedSingle = singleAssignments.get(column);
          const isText = textAssignmentSet.has(column);
          const chipClasses = [
            'column-chip',
            assignedSingle ? 'assigned' : '',
            isText ? 'assigned' : '',
            activeTarget ? 'interactive' : ''
          ]
            .filter(Boolean)
            .join(' ');

          return (
            <button
              key={column}
              type="button"
              role="listitem"
              className={chipClasses}
              onClick={() => handleColumnClick(column)}
            >
              {column}
            </button>
          );
        })}
      </div>
      {mapping.bookingText.length > 0 && (
        <div style={{ marginTop: '1rem' }}>
          <h4>Reihenfolge Buchungstext</h4>
          <div className="text-list">
            {mapping.bookingText.map((column, index) => (
              <span key={`${column}-${index}`} className="text-item">
                {column}
                <button type="button" onClick={() => moveTextColumn(index, -1)} disabled={index === 0}>
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => moveTextColumn(index, 1)}
                  disabled={index === mapping.bookingText.length - 1}
                >
                  ↓
                </button>
                <button type="button" onClick={() => removeTextColumn(index)} aria-label={`Entferne ${column}`}>
                  ✕
                </button>
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
};

export default MappingPanel;
