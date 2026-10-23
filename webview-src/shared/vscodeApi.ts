// Type-safe wrapper around acquireVsCodeApi()

declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

let vsCodeApi: ReturnType<typeof acquireVsCodeApi> | undefined;

export function getVsCodeApi() {
  if (!vsCodeApi) {
    if (typeof acquireVsCodeApi === 'function') {
      vsCodeApi = acquireVsCodeApi();
    } else {
      // In-browser mock for test harnesses / non-vscode environments
      const stateStore: Record<string, unknown> = {};
      vsCodeApi = {
        postMessage: (msg: unknown) => {
          console.log('[MockVsCodeApi] postMessage:', msg);
        },
        getState: () => stateStore,
        setState: (state: unknown) => {
          Object.assign(stateStore, state);
        },
      };
    }
  }
  return vsCodeApi;
}

export function postMessageToHost<T>(msg: T): void {
  getVsCodeApi().postMessage(msg);
}

export function onHostMessage<T>(handler: (msg: T) => void): () => void {
  const listener = (event: MessageEvent) => {
    if (event.data) {
      handler(event.data as T);
    }
  };
  window.addEventListener('message', listener);
  return () => {
    window.removeEventListener('message', listener);
  };
}

export function getWebviewState<T>(defaultValue: T): T {
  const state = getVsCodeApi().getState();
  return (state as T) || defaultValue;
}

export function setWebviewState<T>(state: T): void {
  getVsCodeApi().setState(state);
}
