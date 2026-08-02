import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// @testing-library/react só sabe avançar timers falsos quando enxerga um
// global `jest` com fake timers (é assim que ela detecta e usa
// `jest.advanceTimersByTime` para drenar a fila de microtasks depois de
// cada callback). Sem isso, qualquer `waitFor` rodando junto de
// `vi.useFakeTimers()` trava para sempre, porque o `setTimeout(…, 0)`
// interno também fica congelado e nada o avança.
if (typeof (globalThis as { jest?: unknown }).jest === 'undefined') {
  (globalThis as { jest?: unknown }).jest = vi;
}
