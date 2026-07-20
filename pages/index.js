import { useState, useRef } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL; // ej: https://tu-backend.up.railway.app
const API_KEY = process.env.NEXT_PUBLIC_API_KEY || '';

export default function Home() {
  const fileRef = useRef(null);
  const [rango, setRango] = useState('01/07/2025 - 30/06/2026');
  const [jobId, setJobId] = useState(null);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const pollRef = useRef(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setStatus(null);

    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError('Subí un excel primero.');
      return;
    }

    const formData = new FormData();
    formData.append('excel', file);
    formData.append('rangoFechas', rango);

    setEnviando(true);
    try {
      const res = await fetch(`${API_URL}/upload`, {
        method: 'POST',
        headers: API_KEY ? { 'x-api-key': API_KEY } : {},
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error subiendo el excel');

      setJobId(data.jobId);
      setStatus({ status: 'processing', total: data.total, processed: 0 });
      iniciarPolling(data.jobId);
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  function iniciarPolling(id) {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${API_URL}/status/${id}`, {
          headers: API_KEY ? { 'x-api-key': API_KEY } : {},
        });
        const data = await res.json();
        setStatus(data);
        if (data.status === 'done' || data.status === 'error') {
          clearInterval(pollRef.current);
        }
      } catch (err) {
        setError(err.message);
        clearInterval(pollRef.current);
      }
    }, 2500);
  }

  function handleDownload() {
    const url = `${API_URL}/download/${jobId}`;
    if (API_KEY) {
      // Si hay API key, hay que traer el blob a mano (no se puede pasar header en <a href>)
      fetch(url, { headers: { 'x-api-key': API_KEY } })
        .then((r) => r.blob())
        .then((blob) => {
          const link = document.createElement('a');
          link.href = URL.createObjectURL(blob);
          link.download = `clientes_afip_${jobId}.zip`;
          link.click();
        });
    } else {
      window.location.href = url;
    }
  }

  return (
    <main style={{ maxWidth: 640, margin: '40px auto', fontFamily: 'system-ui, sans-serif', padding: '0 16px' }}>
      <h1>Scraper AFIP / ARCA</h1>
      <p style={{ color: '#555' }}>
        Subí un excel con columna A: CUIT y columna B: Clave fiscal. El proceso hace login por
        cada cliente, saca la facturación de Monotributo y el total de comprobantes recibidos.
      </p>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 24 }}>
        <label>
          Excel de clientes (CUIT / Clave)
          <input ref={fileRef} type="file" accept=".xlsx,.xls" required style={{ display: 'block', marginTop: 4 }} />
        </label>

        <label>
          Rango de fechas para Mis Comprobantes
          <input
            type="text"
            value={rango}
            onChange={(e) => setRango(e.target.value)}
            style={{ display: 'block', marginTop: 4, width: '100%', padding: 6 }}
          />
        </label>

        <button type="submit" disabled={enviando} style={{ padding: '10px 16px', cursor: 'pointer' }}>
          {enviando ? 'Enviando...' : 'Procesar clientes'}
        </button>
      </form>

      {error && <p style={{ color: 'red', marginTop: 16 }}>{error}</p>}

      {status && (
        <div style={{ marginTop: 24 }}>
          <p>
            Estado: <strong>{status.status}</strong> — {status.processed ?? 0}/{status.total ?? '?'} clientes procesados
          </p>

          {Array.isArray(status.resultados) && status.resultados.length > 0 && (
            <ul>
              {status.resultados.map((r) => (
                <li key={r.cuit}>
                  {r.cuit} — {r.nombre || '(sin nombre)'} {r.error ? `⚠️ ${r.error}` : '✅'}
                </li>
              ))}
            </ul>
          )}

          {status.status === 'done' && (
            <button onClick={handleDownload} style={{ padding: '10px 16px', cursor: 'pointer', marginTop: 12 }}>
              Descargar ZIP con los excels
            </button>
          )}

          {status.status === 'error' && <p style={{ color: 'red' }}>Error: {status.error}</p>}
        </div>
      )}
    </main>
  );
}
