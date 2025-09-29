import React from 'react';

interface PreviewTableProps {
  title: string;
  columns: string[];
  rows: string[][];
  limit?: number;
  containerClassName?: string;
  tableClassName?: string;
  invalidCells?: Map<number, Set<number>>;
}

const PreviewTable: React.FC<PreviewTableProps> = ({
  title,
  columns,
  rows,
  limit = 200,
  containerClassName,
  tableClassName,
  invalidCells
}) => {
  const limitedRows = rows.slice(0, limit);

  return (
    <div className={containerClassName}>
      <h2>{title}</h2>
      <div className="table-container">
        <table className={tableClassName}>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {limitedRows.map((row, rowIndex) => (
              <tr key={`${rowIndex}-${row.join('|')}`}>
                {row.map((cell, cellIndex) => {
                  const invalid = invalidCells?.get(rowIndex)?.has(cellIndex);
                  return (
                    <td key={`${rowIndex}-${cellIndex}`} className={invalid ? 'invalid' : undefined}>
                      {cell}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > limit && <p>{`Es werden nur die ersten ${limit} Zeilen angezeigt.`}</p>}
    </div>
  );
};

export default PreviewTable;
