// 幼麟原文件要的 roommgr、usermgr、db、crypto、定时器和随机数。规则不在这里。
// db 的回调同步调用且传入 null：get_user_history 把参数当历史数组，null 走原文「没有记录」；
// create_game 只要求回调被调用，结算才会发出去。指导写的是 cb(true)，那样历史回调会在 .length 上抛错。

export const SCMJ_CONF = Object.freeze({
    type: 'xzdd',
    baseScore: 1,
    zimo: 0,
    jiangdui: true,
    hsz: true,
    dianganghua: 0,
    menqing: true,
    tiandihu: true,
    maxFan: 4,
    maxGames: 4,
});

export function mulberry32(seed) {
    let s = seed >>> 0;
    return () => {
        s = (s + 0x6D2B79F5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function emptyDb() {
    const fn = (...args) => {
        const cb = args[args.length - 1];
        if (typeof cb === 'function') cb(null);
    };
    return new Proxy({}, { get: () => fn });
}

export function createScmjHost(options = {}) {
    const conf = options.conf || SCMJ_CONF;
    const roomId = options.roomId == null ? 100001 : options.roomId;
    const userIds = options.userIds || [1001, 1002, 1003, 1004];
    const messages = [];
    const timers = [];
    const logs = [];
    const userLocation = {};
    const seats = userIds.map((userId, seatIndex) => ({
        userId,
        score: 0,
        name: options.names ? options.names[seatIndex] : '',
        ready: false,
        seatIndex,
        numZiMo: 0,
        numJiePao: 0,
        numDianPao: 0,
        numAnGang: 0,
        numMingGang: 0,
        numChaJiao: 0,
    }));
    for (const seat of seats) userLocation[seat.userId] = { roomId, seatIndex: seat.seatIndex };
    const room = {
        uuid: options.uuid || 'scmj',
        id: roomId,
        numOfGames: 0,
        createTime: options.createTime || 0,
        nextButton: 0,
        seats,
        conf,
    };
    const rooms = { [roomId]: room };

    const roommgr = {
        getUserRoom(userId) {
            const loc = userLocation[userId];
            return loc ? loc.roomId : null;
        },
        getRoom(id) { return rooms[id] || null; },
        getUserSeat(userId) {
            const loc = userLocation[userId];
            return loc ? loc.seatIndex : null;
        },
        setReady(userId, value) {
            const seat = seats[roommgr.getUserSeat(userId)];
            if (seat) seat.ready = value;
        },
        destroy(id) {
            const gone = rooms[id];
            if (!gone) return;
            for (const seat of gone.seats) delete userLocation[seat.userId];
            delete rooms[id];
        },
        isOnline() { return true; },
    };

    function push(userId, event, data) {
        messages.push({ event, userId, data });
    }

    const usermgr = {
        sendMsg(userId, event, data) { push(userId, event, data); },
        broacastInRoom(event, data, sender, includingSender) {
            const id = roommgr.getUserRoom(sender);
            const info = roommgr.getRoom(id);
            if (!info) return;
            for (const seat of info.seats) {
                if (!includingSender && seat.userId === sender) continue;
                push(seat.userId, event, data);
            }
        },
        isOnline() { return true; },
        kickAllInRoom() {},
    };

    // 浏览器里没有 Buffer：终局存战绩时会调到这里，抛错会吞掉那一批消息里的结算。
    const crypto = {
        toBase64(content) {
            const bytes = new TextEncoder().encode(String(content == null ? '' : content));
            let binary = '';
            for (const byte of bytes) binary += String.fromCharCode(byte);
            return btoa(binary);
        },
        fromBase64(content) {
            const binary = atob(String(content));
            return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
        },
        md5() { return ''; },
    };

    let mjutils = null;
    const db = emptyDb();
    const require = (id) => {
        if (id === './roommgr') return roommgr;
        if (id === './usermgr') return usermgr;
        if (id === './mjutils') return mjutils;
        if (id === '../utils/db') return db;
        if (id === '../utils/crypto') return crypto;
        throw new Error(`幼麟垫片没有这个模块：${id}`);
    };

    const host = {
        require,
        setTimeout(fn) {
            timers.push(fn);
            return timers.length;
        },
        setInterval() { return 0; },
        console: {
            log(...args) { logs.push(args.map((item) => String(item)).join(' ')); },
            error(...args) { logs.push(args.map((item) => String(item)).join(' ')); },
            warn(...args) { logs.push(args.map((item) => String(item)).join(' ')); },
        },
        Math: Object.create(Math, {
            random: { value: typeof options.random === 'function' ? options.random : Math.random },
        }),
        room,
        userIds,
        messages,
        logs,
        takeMessages() {
            return messages.splice(0, messages.length);
        },
        takeLogs() {
            return logs.splice(0, logs.length);
        },
        flush() {
            while (timers.length) timers.shift()();
        },
        bindMjutils(value) { mjutils = value; },
        roommgr,
        usermgr,
        db,
        crypto,
    };
    return host;
}
