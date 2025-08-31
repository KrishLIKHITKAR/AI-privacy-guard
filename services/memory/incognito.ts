const tabIncognito = new Map<number, boolean>();
const tabSession = new Map<number, string>();

export function getSessionId(tabId?: number): string {
    if (!tabId && tabId !== 0) return crypto.randomUUID();
    let id = tabSession.get(tabId);
    if (!id) { id = crypto.randomUUID(); tabSession.set(tabId, id); }
    return id;
}

export function setIncognito(tabId: number, on: boolean) { tabIncognito.set(tabId, on); }
export function isIncognito(tabId?: number): boolean { return !!(tabId && tabIncognito.get(tabId)); }
