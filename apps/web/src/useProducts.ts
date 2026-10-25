import { useCallback, useEffect, useState } from 'react';
import { catalogApi } from './api';
import type { Product } from './data/products';
import { ApiError } from './http';

interface State {
  products: Product[];
  loading: boolean;
  error: string | null;
}

/** Loads the public catalogue once; `reload` fetches it again (e.g. after the admin changes something). */
export function useProducts() {
  const [state, setState] = useState<State>({ products: [], loading: true, error: null });

  const load = useCallback(() => {
    setState((s) => ({ ...s, loading: true, error: null }));
    return catalogApi
      .list()
      .then((products) => setState({ products, loading: false, error: null }))
      .catch((err) =>
        setState((s) => ({
          ...s,
          loading: false,
          error: err instanceof ApiError ? err.message : "Can't reach the product service. Is it running on port 8082?",
        })),
      );
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { ...state, reload: load };
}
