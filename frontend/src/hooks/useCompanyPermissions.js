import { useEffect, useState } from 'react';
import apiClient from '../config/API/axiosConfig.js';
import { getSessionGeneration, registerSessionCache } from '../utils/sessionCaches.js';

//* Module-level cache of the caller's company permissions
//* (`callerPermissions` from GET /api/v1/team): fetched once per session
//* instead of once per page. A failed fetch resolves to null ("unknown" -
//* the backend still enforces every permission) and clears the cache so the
//* next mount retries. Team.jsx primes it with the list it already loaded
let cached = null; // { generation, promise }

const reset = () => {
  cached = null;
};

registerSessionCache(reset);

//* Exported for tests and for callers that already hold fresh permissions
export const invalidateCompanyPermissionsCache = reset;

export const primeCompanyPermissions = (permissions) => {
  cached = { generation: getSessionGeneration(), promise: Promise.resolve(permissions ?? []) };
};

export const fetchCompanyPermissions = () => {
  const generation = getSessionGeneration();

  if (cached && cached.generation === generation) {
    return cached.promise;
  }

  const entry = { generation, promise: null };

  entry.promise = apiClient
    .get('/api/v1/team')
    .then((response) => response.data?.callerPermissions ?? [])
    .catch(() => {
      //* Only clear the cache if it still holds this request - a session
      //* change (or a newer fetch) may already have replaced it
      if (cached === entry) {
        cached = null;
      }

      return null;
    });

  cached = entry;

  return entry.promise;
};

//* permissions: undefined while loading, null when they could not be
//* loaded, otherwise the array of permission names
export function useCompanyPermissions() {
  const [permissions, setPermissions] = useState(undefined);

  useEffect(() => {
    let active = true;
    const generation = getSessionGeneration();

    fetchCompanyPermissions().then((value) => {
      //* Drop results that belong to a previous session
      if (active && generation === getSessionGeneration()) {
        setPermissions(value);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  return {
    permissions,
    loading: permissions === undefined,
    failed: permissions === null,
    has: (permission) => Array.isArray(permissions) && permissions.includes(permission),
  };
}

export default useCompanyPermissions;
