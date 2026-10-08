import { useEffect, useState } from 'react';

export async function apiGet(path) {
  const res = await fetch(`/api${path}`);
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error?.message || `Request failed (${res.status})`);
  return body;
}

// Fetches `path` whenever it changes. Pass null to skip the request.
// A slow response for an old path is ignored once a newer one has started.
export function useApi(path) {
  const [state, setState] = useState({ data: null, error: null, loading: path !== null });

  useEffect(() => {
    if (path === null) return undefined;
    let current = true;
    setState((s) => ({ ...s, error: null, loading: true }));
    apiGet(path)
      .then((data) => current && setState({ data, error: null, loading: false }))
      .catch((error) => current && setState({ data: null, error, loading: false }));
    return () => {
      current = false;
    };
  }, [path]);

  return state;
}
