import type { PreviewState } from './previewMachine';

export function isWaitingForUnlock(state: PreviewState): boolean {
    return state.kind === 'awaitingUnlock';
}

export function isTerminal(state: PreviewState): boolean {
    return state.kind === 'ready' || state.kind === 'failed';
}

export function canRetry(state: PreviewState): boolean {
    return state.kind === 'failed';
}
