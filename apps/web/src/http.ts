/** An error response from one of our services. `code` is the machine-readable reason (e.g. EMAIL_NOT_VERIFIED). */
export class ApiError extends Error {
  constructor(public status: number, message: string, public code = '', public fieldErrors: string[] = []) {
    super(message);
  }
}

/** Throws an ApiError carrying the server's message and error code when the response is not 2xx. */
export async function ensureOk(res: Response): Promise<void> {
  if (res.ok) return;
  let detail = 'Something went wrong. Please try again.';
  let code = '';
  let errors: string[] = [];
  try {
    const p = await res.json();
    detail = p.detail ?? detail;
    code = p.code ?? '';
    errors = p.errors ?? [];
  } catch {
    /* non-JSON error body */
  }
  throw new ApiError(res.status, detail, code, errors);
}

export async function parseJson<T>(res: Response): Promise<T> {
  await ensureOk(res);
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}
