import React, { useRef, useState } from 'react';
import { parseCsvFile, ParseResult } from '../lib/csv/parse';

interface UploadProps {
  onParsed: (result: ParseResult) => void;
  onError: (message: string) => void;
}

const Upload: React.FC<UploadProps> = ({ onParsed, onError }) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleFileChange: React.ChangeEventHandler<HTMLInputElement> = async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (!file.name.toLowerCase().endsWith('.csv')) {
      onError('Nur CSV-Dateien werden unterstützt.');
      event.target.value = '';
      return;
    }

    setIsLoading(true);
    onError('');

    try {
      const parsed = await parseCsvFile(file);
      onParsed(parsed);
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Datei konnte nicht gelesen werden.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  return (
    <div>
      <label htmlFor="csv-upload" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>
        CSV-Datei hochladen
      </label>
      <input
        ref={inputRef}
        type="file"
        id="csv-upload"
        accept=".csv"
        onChange={handleFileChange}
        disabled={isLoading}
      />
      {isLoading && <p>CSV wird gelesen …</p>}
      <button
        type="button"
        onClick={handleReset}
        style={{ marginTop: '0.5rem', padding: '0.25rem 0.5rem' }}
      >
        Auswahl zurücksetzen
      </button>
    </div>
  );
};

export default Upload;
