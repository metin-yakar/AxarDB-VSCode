export class AxarError extends Error {
  constructor(message: string, public readonly status?: number, public readonly detail?: string) {
    super(message);
    this.name = 'AxarError';
  }
}

export class AuthError extends AxarError {
  constructor(message = 'Unauthorized: invalid credentials or session expired', status = 401) {
    super(message, status);
    this.name = 'AuthError';
  }
}

export class ConnectionError extends AxarError {
  constructor(message = 'Connection failed: unable to reach AxarDB server', public readonly originalError?: unknown) {
    super(message);
    this.name = 'ConnectionError';
  }
}

export class QueryError extends AxarError {
  constructor(message: string, status?: number, detail?: string) {
    super(message, status, detail);
    this.name = 'QueryError';
  }
}
