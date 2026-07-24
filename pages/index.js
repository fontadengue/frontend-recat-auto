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
    let fallosConsecutivos = 0;
    const MAX_FALLOS_CONSECUTIVOS = 8; // ~20s de margen a fallos transitorios de red

    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${API_URL}/status/${id}`, {
          headers: API_KEY ? { 'x-api-key': API_KEY } : {},
        });
        const data = await res.json();
        fallosConsecutivos = 0;
        setStatus(data);
        if (data.status === 'done') {
          clearInterval(pollRef.current);
          handleDownload(id); // descarga automática apenas termina
        } else if (data.status === 'error') {
          clearInterval(pollRef.current);
        }
      } catch (err) {
        fallosConsecutivos += 1;
        if (fallosConsecutivos >= MAX_FALLOS_CONSECUTIVOS) {
          setError(`No se pudo conectar con el servidor tras varios intentos: ${err.message}`);
          clearInterval(pollRef.current);
        }
        // si no, seguimos intentando en la próxima vuelta del polling —
        // puede ser un reinicio momentáneo del backend
      }
    }, 2500);
  }

  async function handleDownload(jobIdOverride) {
    const idParaDescargar = jobIdOverride || jobId;
    const url = `${API_URL}/download/${idParaDescargar}`;
    try {
      const res = await fetch(url, {
        headers: API_KEY ? { 'x-api-key': API_KEY } : {},
      });

      const contentType = res.headers.get('content-type') || '';
      if (!res.ok || !contentType.includes('zip')) {
        // La respuesta no es un zip real (probablemente un error en JSON,
        // por ejemplo si el job expiró de la memoria del backend). Mostramos
        // el error en vez de descargar un archivo corrupto.
        let mensaje = `Error al descargar (HTTP ${res.status})`;
        try {
          const data = await res.json();
          if (data && data.error) mensaje = data.error;
        } catch (_) {
          // la respuesta no era JSON tampoco, nos quedamos con el mensaje genérico
        }
        setError(mensaje);
        return;
      }

      const blob = await res.blob();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `clientes_afip_${idParaDescargar}.zip`;
      link.click();
    } catch (err) {
      setError(`Error al descargar: ${err.message}`);
    }
  }

  return (
    <main style={{ maxWidth: 640, margin: '40px auto', fontFamily: 'system-ui, sans-serif', padding: '0 16px' }}>
      <h1>Scraper AFIP / ARCA</h1>
      <p style={{ color: '#555' }}>
        Subí un excel con columna A: CUIT, columna B: Clave fiscal y columna C: Número de cliente.
        El proceso hace login por cada cliente, saca la facturación de Monotributo y el total de
        comprobantes recibidos.
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
                  {r.numeroCliente ? `${r.numeroCliente} — ` : ''}{r.cuit} — {r.nombre || '(sin nombre)'} {r.error ? `⚠️ ${r.error}` : '✅'}
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
