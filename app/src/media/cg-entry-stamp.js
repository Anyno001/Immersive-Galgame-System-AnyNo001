export const cgEntryStamp = entry => entry?.revisionToken
    ? `${entry.updatedAt || ''}|${entry.revisionToken}` : String(entry?.updatedAt || '');
