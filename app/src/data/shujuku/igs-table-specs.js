import { COMBAT_TABLE_SPECS, logSheetSpec } from './combat-tables.js';

const requiredLog = (name, uid) => Object.freeze({ ...logSheetSpec(name, uid), optional: false });
export const IGS_LAYOUT_ID = 'igs-chat-v2';
export const IGS_LAYOUT_RECORD = Object.freeze({
    id: 'igs-layout', type: 'layout', character: '', anchor: null, createdAt: 0, change: '',
    payload: Object.freeze({ version: 1, layout: IGS_LAYOUT_ID }),
});
export const IGS_TABLE_SPECS = Object.freeze({
    layout: requiredLog('IGS·存储', 'sheet_igsstorev2'),
    ...COMBAT_TABLE_SPECS,
    attribute: requiredLog('IGS数值·属性', 'sheet_igsstatattrv2'),
    origin: requiredLog('IGS随身·日志', 'sheet_igsoriginv2'),
    points: requiredLog('IGS共享·积分', 'sheet_igspointsv2'),
});
export const IGS_MARKER_SPECS = Object.freeze({ layout: IGS_TABLE_SPECS.layout });
