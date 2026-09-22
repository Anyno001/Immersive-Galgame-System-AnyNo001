const REFERENCE_DIALOG_TYPOGRAPHY = Object.freeze({
    'western-classic': Object.freeze({
        nameAlign: 'center',
        nameColor: '#3b2a22',
        textColor: '#f2e5c4',
        thoughtColor: '#6b5146',
        narrationColor: '#f2e5c4',
    }),
    'plant-coffee': Object.freeze({
        nameAlign: 'center',
        nameColor: '#b4d35f',
        textColor: '#5a4442',
        thoughtColor: '#80636b',
        narrationColor: '#5a4442',
    }),
    'black-white-manga': Object.freeze({
        nameAlign: 'left',
        nameColor: '#241b18',
        textColor: '#352923',
        thoughtColor: '#67534a',
        narrationColor: '#352923',
    }),
    'cute-pink': Object.freeze({
        nameAlign: 'center',
        nameColor: '#ffffff',
        textColor: '#604050',
        thoughtColor: '#8d6876',
        narrationColor: '#604050',
    }),
});

export function getReferenceDialogTypography(dialogSkin) {
    return REFERENCE_DIALOG_TYPOGRAPHY[dialogSkin] || null;
}
