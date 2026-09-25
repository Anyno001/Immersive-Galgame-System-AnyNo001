export const RECORD_PANEL_STYLE_TEXT = `
#igs-overlay.igs-record-screen-open #igs-click-layer,#igs-overlay.igs-record-screen-open #igs-sprite,#igs-overlay.igs-record-screen-open #igs-dialog-layer,#igs-overlay.igs-record-screen-open #igs-toolbar-layer,#igs-overlay.igs-record-screen-open #igs-option-layer,#igs-overlay.igs-record-screen-open #igs-status-hud,#igs-overlay.igs-record-screen-open #igs-sprite-edit-bar{display:none!important;pointer-events:none!important;}
#igs-overlay.igs-record-screen-open #igs-db-layer{inset:0;z-index:20;pointer-events:none;}
#igs-record-panel{position:absolute;inset:0;z-index:11;display:block;padding:0;box-sizing:border-box;pointer-events:auto;background:transparent;color:var(--igs-rp-text,#d8d5cf);}
#igs-record-panel .igs-record-window{width:100%;height:100%;max-height:none;min-height:0;overflow:hidden;box-sizing:border-box;background:transparent;border:0;border-radius:0;box-shadow:none;}
#igs-record-panel button{color:inherit;cursor:pointer;font-family:inherit;}
#igs-record-panel .igs-record-tabs{display:flex;gap:8px;overflow-x:auto;padding:8px 16px;flex:none;position:relative;z-index:2;}
#igs-record-panel .igs-record-tabs button{border:1px solid var(--igs-rp-line,rgba(216,213,207,.22));background:var(--igs-rp-panel,rgba(31,34,37,.62));border-radius:var(--igs-rp-radius,8px);padding:6px 12px;min-height:36px;font-size:13px;}
#igs-record-panel .igs-record-scroll{flex:1 1 auto;min-height:0;width:100%;overflow:auto;padding:18px clamp(16px,4vw,56px) 36px;overscroll-behavior:contain;box-sizing:border-box;}
#igs-record-panel .igs-record-tabs button[aria-current="true"]{border-color:var(--igs-rp-accent,#d8d5cf);}
#igs-record-panel .igs-record-source{font-size:12px;color:var(--igs-rp-text-faint,rgba(216,213,207,.52));}
#igs-record-panel .igs-record-body{white-space:pre-wrap;overflow-wrap:anywhere;}
#igs-record-panel .igs-record-fields div{display:flex;gap:10px;margin:5px 0;overflow-wrap:anywhere;}
#igs-record-panel .igs-record-fields dt{color:var(--igs-rp-text-soft,rgba(216,213,207,.72));flex:0 0 5em;}
#igs-record-panel .igs-record-fields dd{margin:0;min-width:0;white-space:pre-wrap;}
#igs-record-panel .igs-record-inventory{display:grid;grid-template-columns:minmax(0,1fr) minmax(240px,32%);gap:20px;align-items:start;}
#igs-record-panel .igs-record-slots{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px;}
#igs-record-panel .igs-record-slots button{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;min-width:0;min-height:0;aspect-ratio:1/1;padding:14px 8px 32px;overflow-wrap:anywhere;text-align:center;border:1px solid transparent;background:rgba(255,255,255,.06);border-radius:var(--igs-rp-radius,8px);}
#igs-record-panel .igs-record-slots button svg{width:57.6px;height:57.6px;transform:translateY(3px);stroke-width:1.4;fill-opacity:.84;}
#igs-record-panel .igs-record-slots button[aria-current="true"]{border-color:var(--igs-rp-accent,#d8d5cf);box-shadow:none;}
#igs-record-panel .igs-record-slot-name{position:absolute;left:10px;right:38px;bottom:9px;max-width:none;font-size:12px;line-height:1.25;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;text-align:left;}
#igs-record-panel .igs-record-slot-quantity{position:absolute;right:7px;bottom:6px;font-size:11px;color:var(--igs-rp-text-soft,rgba(216,213,207,.72));font-variant-numeric:tabular-nums;}
#igs-record-panel.igs-rp-mid .igs-record-slots{grid-template-columns:repeat(4,minmax(0,1fr));}
#igs-record-panel.igs-rp-narrow .igs-record-inventory{grid-template-columns:1fr;}
#igs-record-panel.igs-rp-narrow .igs-record-slots{grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;}
#igs-record-panel svg{width:23px;height:23px;flex:none;}
#igs-record-panel .igs-record-item-detail{min-height:100%;margin:0;padding:24px 0 0 30px;border:0;border-left:1px solid var(--igs-rp-line-soft,rgba(216,213,207,.18));border-radius:0;background:transparent;box-sizing:border-box;}
#igs-record-panel .igs-record-item-detail-icon{display:grid;place-items:center;width:72px;height:72px;margin:0 0 18px;color:var(--igs-rp-text,#d8d5cf);}
#igs-record-panel .igs-record-item-detail-icon svg{width:72px;height:72px;stroke-width:1.4;fill-opacity:.84;}
#igs-record-panel .igs-record-item-detail-copy{min-width:0;}
#igs-record-panel .igs-record-item-detail h3{margin:0 0 8px;font-size:26px;line-height:1.3;font-weight:400;overflow-wrap:anywhere;}
#igs-record-panel .igs-record-item-quantity{margin:0;color:var(--igs-rp-text-soft,rgba(216,213,207,.72));font-size:13px;font-variant-numeric:tabular-nums;}
#igs-record-panel .igs-record-item-description{margin:22px 0 0;padding-top:18px;border-top:1px solid var(--igs-rp-line-soft,rgba(216,213,207,.18));line-height:1.8;white-space:pre-wrap;overflow-wrap:anywhere;}
#igs-record-panel .igs-record-item-detail-copy .igs-record-fields{margin-top:18px;padding-top:18px;border-top:1px solid var(--igs-rp-line-soft,rgba(216,213,207,.18));}
#igs-record-panel .igs-record-item-empty{display:flex;align-items:center;justify-content:center;gap:12px;min-height:120px;color:var(--igs-rp-text-soft,rgba(216,213,207,.72));}
#igs-record-panel .igs-record-item-empty span{display:block;width:34px;height:1px;background:var(--igs-rp-line-soft,rgba(216,213,207,.18));}
#igs-record-panel .igs-record-diary{display:grid;grid-template-columns:minmax(220px,32%) minmax(0,1fr);gap:20px;height:100%;min-height:0;position:relative;isolation:isolate;}
#igs-record-panel .igs-record-diary::before{content:"";position:fixed;inset:0;z-index:0;pointer-events:none;background:linear-gradient(90deg,transparent 0%,transparent 38%,rgba(12,14,16,.16) 54%,rgba(12,14,16,.64) 78%,rgba(12,14,16,.95) 100%);}
#igs-record-panel[data-record-category="diary"]:not(.igs-rp-narrow) .igs-rp-page::before{background:transparent;}

#igs-record-panel .igs-record-diary>*{position:relative;z-index:1;}
#igs-record-panel .igs-record-diary-side{display:flex;flex-direction:column;gap:16px;min-width:0;min-height:0;overflow:auto;}
#igs-record-panel .igs-record-bookshelf{display:flex;flex-wrap:wrap;gap:14px;align-content:flex-start;padding-bottom:30px;overflow:visible;}
#igs-record-panel .igs-record-book{position:relative;display:grid;grid-template-columns:1fr auto 1fr;grid-template-rows:auto auto;align-content:start;justify-items:center;column-gap:0;row-gap:8px;width:118px;height:168px;min-height:168px;padding:30px 10px 18px;text-align:center;background:var(--igs-rp-panel,rgba(31,34,37,.62));border:1px solid var(--igs-rp-line-soft,rgba(216,213,207,.12));border-left:3px solid var(--igs-rp-line,rgba(216,213,207,.22));border-radius:2px 8px 8px 2px;box-sizing:border-box;overflow:visible;}
#igs-record-panel .igs-record-book::before{content:"";position:absolute;top:0;bottom:0;left:10px;width:1px;background:var(--igs-rp-line-soft,rgba(216,213,207,.12));pointer-events:none;}
#igs-record-panel .igs-record-book::after{content:"";position:absolute;top:calc(100% - 1px);bottom:auto;left:16px;width:14px;height:30px;background:var(--igs-rp-text-faint,rgba(216,213,207,.52));clip-path:polygon(0 0,100% 0,100% 100%,50% 78%,0 100%);opacity:.85;z-index:2;}
#igs-record-panel .igs-record-book[aria-current="true"]{border-color:var(--igs-rp-accent,#d8d5cf);border-left-color:var(--igs-rp-accent,#d8d5cf);}
#igs-record-panel .igs-record-book svg{grid-column:1/-1;grid-row:1;width:34px;height:34px;transform:translateY(-3px);}
#igs-record-panel .igs-record-book span{grid-column:1/2;grid-row:2;justify-self:end;font-size:12px;line-height:1.3;overflow-wrap:anywhere;letter-spacing:.12em;}
#igs-record-panel .igs-record-book small{grid-column:2/4;grid-row:2;justify-self:start;font-size:10px;color:var(--igs-rp-text-soft,rgba(216,213,207,.72));white-space:nowrap;} #igs-record-panel .igs-record-book small::before{content:" · ";}
#igs-record-panel .igs-record-chapters{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;}
#igs-record-panel .igs-record-chapters li + li{border-top:1px solid var(--igs-rp-line-soft,rgba(216,213,207,.12));}
#igs-record-panel .igs-record-chapters button{position:relative;display:flex;align-items:baseline;gap:14px;width:100%;padding:12px 10px 12px 16px;border:0!important;background:transparent!important;border-radius:0!important;text-align:left;}
#igs-record-panel .igs-record-chapters button[aria-current="true"]{background:rgba(255,255,255,.05)!important;}
#igs-record-panel .igs-record-chapters button[aria-current="true"]::before{content:"";position:absolute;left:0;top:10px;bottom:10px;width:2px;background:var(--igs-rp-accent,#d8d5cf);}
#igs-record-panel .igs-record-chapter-date{flex:0 0 3.4em;font-size:12px;color:var(--igs-rp-text-soft,rgba(216,213,207,.72));font-variant-numeric:tabular-nums;}
#igs-record-panel .igs-record-chapter-title{min-width:0;overflow-wrap:anywhere;}
#igs-record-panel .igs-record-diary-detail{display:flex;flex-direction:column;min-width:0;min-height:0;overflow:auto;padding:26px clamp(18px,3vw,44px) 18px;border:0;border-radius:0;background:transparent;box-sizing:border-box;}
#igs-record-panel .igs-record-diary-meta{margin:0;padding-bottom:12px;border-bottom:1px solid var(--igs-rp-line,rgba(216,213,207,.22));color:var(--igs-rp-text,#d8d5cf);font-size:15px;letter-spacing:.12em;}
#igs-record-panel .igs-record-diary-detail h3{margin:18px 0 20px;font-size:26px;font-weight:400;letter-spacing:.22em;line-height:1.35;}
#igs-record-panel .igs-record-diary-detail .igs-record-body{margin:0;max-width:34em;font-size:16px;line-height:1.9;letter-spacing:.06em;}
#igs-record-panel .igs-record-diary-nav{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:12px;margin-top:auto;padding-top:16px;border-top:1px solid var(--igs-rp-line,rgba(216,213,207,.22));font-size:13px;}
#igs-record-panel .igs-record-diary-nav button{border:0!important;background:transparent!important;padding:8px 4px;min-height:40px;color:var(--igs-rp-text,#d8d5cf);letter-spacing:.1em;}
#igs-record-panel .igs-record-diary-nav button:first-child{justify-self:start;}
#igs-record-panel .igs-record-diary-nav button:last-child{justify-self:end;}
#igs-record-panel .igs-record-diary-nav button[disabled]{opacity:.38;cursor:default;}
#igs-record-panel .igs-record-diary-nav span{color:var(--igs-rp-text-soft,rgba(216,213,207,.72));font-variant-numeric:tabular-nums;letter-spacing:.18em;}
#igs-record-panel .igs-record-diary-empty{margin:auto;color:var(--igs-rp-text-soft,rgba(216,213,207,.72));}
#igs-record-panel.igs-rp-narrow .igs-record-diary{grid-template-columns:1fr;grid-template-rows:auto minmax(0,1fr);gap:14px;}
#igs-record-panel.igs-rp-narrow .igs-record-bookshelf{flex-wrap:nowrap;overflow:visible;padding-bottom:30px;gap:10px;}
#igs-record-panel.igs-rp-narrow .igs-record-book{flex:0 0 calc((100% - 20px)/3);width:calc((100% - 20px)/3);min-width:calc((100% - 20px)/3);height:150px;min-height:150px;padding:26px 6px 14px;}
#igs-record-panel.igs-rp-narrow .igs-record-chapters{flex-direction:row;justify-content:center;overflow-x:auto;}
#igs-record-panel.igs-rp-narrow .igs-record-chapters li + li{border-top:0;border-left:1px solid var(--igs-rp-line-soft,rgba(216,213,207,.12));}
#igs-record-panel.igs-rp-narrow .igs-record-chapters button{position:relative;flex-direction:column;align-items:center;justify-content:flex-start;gap:4px;min-width:58px;padding:8px 10px 11px;text-align:center;white-space:nowrap;}
#igs-record-panel.igs-rp-narrow .igs-record-chapter-date{flex:0 0 auto;}
#igs-record-panel.igs-rp-narrow .igs-record-chapter-title{display:none;}
#igs-record-panel.igs-rp-narrow .igs-record-chapters button[aria-current="true"]::before{display:none;}
#igs-record-panel.igs-rp-narrow .igs-record-chapters button[aria-current="true"]::after{content:"";position:absolute;left:50%;bottom:3px;width:24px;height:1px;transform:translateX(-50%);background:var(--igs-rp-accent,#d8d5cf);}
#igs-record-panel.igs-rp-narrow .igs-record-diary-detail{padding:18px 16px 14px;}
#igs-record-panel.igs-rp-narrow .igs-record-diary-detail h3{font-size:20px;}
#igs-record-panel.igs-rp-short .igs-record-diary-detail h3{margin:10px 0 12px;font-size:20px;}
#igs-record-panel .igs-record-book{box-sizing:border-box;width:79px;height:95px;min-height:95px;padding:27px 4px 10px;grid-template-columns:1fr;align-content:center;}
#igs-record-panel.igs-rp-narrow .igs-record-book{flex:0 0 79px;width:79px;min-width:79px;height:95px;min-height:95px;padding:27px 4px 10px;}
#igs-record-panel .igs-record-book::after{left:10px;width:12px;height:20px;}
#igs-record-panel .igs-record-book-meta{grid-column:1;grid-row:2;display:block;width:100%;min-width:0;max-width:100%;transform:none;text-align:center;}
#igs-record-panel .igs-record-book-meta>span{display:block;width:100%;min-width:0;max-width:100%;font-size:11px;line-height:1.3;letter-spacing:0;white-space:normal;overflow:visible;overflow-wrap:anywhere;word-break:break-word;text-overflow:clip;text-align:center;transform:translateY(4px);}
#igs-record-panel .igs-record-book-meta>small{position:absolute!important;top:6px!important;right:6px!important;bottom:auto!important;left:auto!important;display:grid;place-items:center;width:18px;height:18px;min-width:18px;padding:0;border:0;border-radius:50%;background:rgba(216,213,207,.82);color:#1a1d20;font-size:9px;line-height:1;font-variant-numeric:tabular-nums;white-space:nowrap;grid-column:auto!important;grid-row:auto!important;justify-self:auto!important;z-index:3;}
#igs-record-panel .igs-record-book-meta>small::before{content:none;}

#igs-record-panel .igs-record-relationships{display:grid;grid-template-columns:minmax(320px,58%) minmax(300px,42%);grid-template-rows:minmax(220px,42%) minmax(0,58%);grid-template-areas:"stage people" "stage detail";gap:0;min-height:calc(100% - 12px);align-items:stretch;}
#igs-record-panel .igs-record-people,#igs-record-panel .igs-record-relationship-stage,#igs-record-panel .igs-record-relationship-detail{min-width:0;min-height:0;box-sizing:border-box;background:transparent;}
#igs-record-panel .igs-record-people{grid-area:people;display:flex;flex-direction:column;padding:18px 0 12px 30px;overflow:auto;border:0;}
#igs-record-panel .igs-record-people h2{margin:0 0 16px;font-size:16px;font-weight:400;letter-spacing:.16em;}
#igs-record-panel .igs-record-people-list{display:flex;flex-wrap:wrap;align-items:flex-start;gap:8px 14px;min-height:0;overflow:auto;}
#igs-record-panel .igs-record-people-list button{display:flex;flex-direction:column;align-items:center;justify-content:flex-start;gap:4px;flex:0 0 64px;width:64px;min-width:64px;min-height:44px;padding:8px 6px 6px;border:0;background:transparent;border-radius:0;text-align:center;}
#igs-record-panel .igs-record-people-list button[aria-current="true"]{background:transparent;border:0;}
#igs-record-panel .igs-record-person-avatar{display:inline-grid;place-items:center;flex:0 0 48px;width:48px;height:48px;border:1px solid var(--igs-rp-line,rgba(216,213,207,.56));border-radius:50%;font-size:22px;line-height:1;}
#igs-record-panel .igs-record-person-copy{display:flex;flex-direction:column;align-items:center;gap:0;min-width:0;}
#igs-record-panel .igs-record-person-copy strong{font-size:13px;font-weight:400;overflow-wrap:anywhere;}
#igs-record-panel .igs-record-person-copy small{color:var(--igs-rp-text-soft,rgba(216,213,207,.72));font-size:12px;overflow-wrap:anywhere;}
#igs-record-panel .igs-record-relationship-stage{grid-area:stage;position:relative;display:grid;place-items:center;padding:18px 28px;overflow:hidden;border:0;}
#igs-record-panel .igs-record-relationship-graph{position:relative;width:min(100%,520px);aspect-ratio:1.28;min-height:330px;}
#igs-record-panel .igs-record-relationship-lines{position:absolute;inset:0;width:100%;height:100%;overflow:visible;}
#igs-record-panel .igs-record-relationship-lines path{fill:none;stroke:var(--igs-rp-line,rgba(216,213,207,.58));stroke-width:1.1;vector-effect:non-scaling-stroke;}
#igs-record-panel .igs-record-relationship-node{position:absolute;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:8px;min-width:78px;min-height:0;padding:0;border:0;background:transparent;font-size:13px;white-space:nowrap;overflow-wrap:anywhere;}
#igs-record-panel .igs-record-scroll .igs-record-relationship-node{min-height:0!important;padding:0!important;border:0!important;border-radius:0!important;background:transparent!important;box-shadow:none;}
#igs-record-panel .igs-record-node-avatar{display:grid;place-items:center;width:72px;height:72px;border:1px solid var(--igs-rp-line,rgba(216,213,207,.62));border-radius:50%;background:rgba(22,24,26,.30);font-size:30px;line-height:1;}
#igs-record-panel .igs-record-relationship-node.is-current .igs-record-node-avatar{border-color:var(--igs-rp-accent,#d8d5cf);box-shadow:0 0 0 2px rgba(216,213,207,.10);}
#igs-record-panel .igs-record-relationship-node:not(.is-current) .igs-record-node-avatar{width:62px;height:62px;font-size:26px;}
#igs-record-panel .igs-record-relationship-node.is-current .igs-record-node-avatar{width:88px;height:88px;font-size:36px;}
#igs-record-panel .igs-record-node-name{max-width:9em;overflow-wrap:anywhere;}
#igs-record-panel .igs-record-relationship-label{position:absolute;transform:translate(-50%,-50%);max-width:30%;padding:0 5px;border:0;background:transparent;color:var(--igs-rp-text,#d8d5cf);font-size:12px;line-height:1.25;text-align:center;overflow-wrap:anywhere;text-shadow:0 1px 3px rgba(8,9,10,.9);}
#igs-record-panel .igs-record-relationship-detail{grid-area:detail;padding:18px 0 18px 30px;overflow:auto;}
#igs-record-panel .igs-record-person-head{display:flex;align-items:center;gap:0;padding:0;border:0;}
#igs-record-panel .igs-record-person-head h2{margin:0;font-size:20px;font-weight:400;letter-spacing:.14em;overflow-wrap:anywhere;}
#igs-record-panel .igs-record-relationship-detail h3{margin:0 0 10px;font-size:15px;font-weight:400;letter-spacing:.12em;}
#igs-record-panel .igs-record-relationship-section{padding:14px 0 0;border:0;}
#igs-record-panel .igs-record-relationship-role{margin:0;color:var(--igs-rp-text-soft,rgba(216,213,207,.72));font-size:14px;}
#igs-record-panel .igs-record-relationship-description{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.8;}
#igs-record-panel .igs-record-relationship-detail ul{list-style:none;margin:0;padding:0;}
#igs-record-panel .igs-record-relationship-detail li{display:flex;justify-content:flex-start;gap:8px;padding:9px 0;border-bottom:1px solid var(--igs-rp-line-soft,rgba(216,213,207,.12));overflow-wrap:anywhere;}
#igs-record-panel .igs-record-relationship-detail li small{color:var(--igs-rp-text-soft,rgba(216,213,207,.72));white-space:nowrap;}
#igs-record-panel .igs-record-relationship-note,#igs-record-panel .igs-record-relationship-empty{color:var(--igs-rp-text-soft,rgba(216,213,207,.72));line-height:1.7;}
#igs-record-panel.igs-rp-mid .igs-record-relationships{grid-template-columns:minmax(300px,52%) minmax(0,1fr);grid-template-rows:minmax(220px,42%) minmax(0,58%);grid-template-areas:"stage people" "stage detail";}
#igs-record-panel.igs-rp-mid .igs-record-people{grid-area:people;}
#igs-record-panel.igs-rp-mid .igs-record-relationship-stage{grid-area:stage;}
#igs-record-panel.igs-rp-mid .igs-record-relationship-detail{grid-area:detail;}
#igs-record-panel.igs-rp-narrow .igs-record-relationships{display:grid;grid-template-columns:1fr;grid-template-rows:minmax(250px,1fr) auto auto;grid-template-areas:"stage" "people" "detail";gap:12px;min-height:0;}
#igs-record-panel.igs-rp-narrow .igs-record-people{grid-area:people;padding:12px 0 0;border:0;}
#igs-record-panel.igs-rp-narrow .igs-record-people-list{flex-direction:row;flex-wrap:nowrap;overflow-x:auto;overflow-y:hidden;gap:8px;}
#igs-record-panel.igs-rp-narrow .igs-record-scroll .igs-record-people-list button{display:flex;flex-direction:column;align-items:center;justify-content:flex-start;flex:0 0 72px;width:72px;min-width:72px;min-height:44px;padding:8px 6px 6px!important;border:0!important;border-radius:0!important;background:transparent!important;gap:4px;}
#igs-record-panel.igs-rp-narrow .igs-record-scroll .igs-record-people-list button[aria-current="true"]{border:0!important;background:transparent!important;}
#igs-record-panel.igs-rp-narrow .igs-record-people-list button[aria-current="true"] .igs-record-person-avatar{border-color:var(--igs-rp-accent,#d8d5cf);box-shadow:0 0 0 2px rgba(216,213,207,.16);}
#igs-record-panel.igs-rp-narrow .igs-record-people-list button[aria-current="true"] .igs-record-person-copy{position:relative;padding-bottom:5px;}
#igs-record-panel.igs-rp-narrow .igs-record-people-list button[aria-current="true"] .igs-record-person-copy::after{content:"";position:absolute;left:50%;bottom:0;width:20px;height:1px;transform:translateX(-50%);background:var(--igs-rp-accent,#d8d5cf);}
#igs-record-panel.igs-rp-narrow .igs-record-person-avatar{flex-basis:42px;width:42px;height:42px;font-size:20px;}
#igs-record-panel.igs-rp-narrow .igs-record-person-copy{align-items:center;gap:0;}
#igs-record-panel.igs-rp-narrow .igs-record-person-copy strong{font-size:13px;}
#igs-record-panel.igs-rp-narrow .igs-record-person-copy small{display:none;}
#igs-record-panel.igs-rp-narrow .igs-record-relationship-stage{grid-area:stage;min-height:250px;padding:10px;border:0;}
#igs-record-panel.igs-rp-narrow .igs-record-relationship-graph{width:min(100%,320px);aspect-ratio:1.05;min-height:280px;}
#igs-record-panel.igs-rp-narrow .igs-record-relationship-node{min-width:64px;gap:4px;font-size:12px;}
#igs-record-panel.igs-rp-narrow .igs-record-node-avatar{width:54px;height:54px;font-size:23px;}
#igs-record-panel.igs-rp-narrow .igs-record-relationship-node.is-current .igs-record-node-avatar{width:72px;height:72px;font-size:29px;}
#igs-record-panel.igs-rp-narrow .igs-record-node-name{max-width:7em;white-space:normal;line-height:1.2;text-align:center;}
#igs-record-panel.igs-rp-narrow .igs-record-relationship-label{max-width:22%;padding:0 2px;font-size:11px;line-height:1.15;}
#igs-record-panel:not(.igs-rp-narrow) .igs-record-relationships{grid-template-rows:minmax(0,.7fr) auto auto minmax(0,1.3fr);grid-template-areas:"stage ." "stage people" "stage detail" "stage .";}
#igs-record-panel:not(.igs-rp-narrow) .igs-record-people{align-items:flex-start;justify-content:center;}
#igs-record-panel:not(.igs-rp-narrow) .igs-record-people-list{justify-content:flex-start;}
#igs-record-panel:not(.igs-rp-narrow) .igs-record-people-list button{gap:2px;}
#igs-record-panel:not(.igs-rp-narrow) .igs-record-person-avatar{flex-basis:52px;width:52px;height:52px;font-size:24px;}


#igs-record-panel.igs-rp-narrow .igs-record-inventory{display:block;}
#igs-record-panel.igs-rp-narrow .igs-record-slots button{padding:8px 4px 26px;}
#igs-record-panel.igs-rp-narrow .igs-record-slots button svg{width:34px;height:34px;transform:translateY(2px);}
#igs-record-panel.igs-rp-narrow .igs-record-slot-name{left:6px;right:26px;bottom:7px;font-size:11px;}
#igs-record-panel.igs-rp-narrow .igs-record-slot-quantity{right:5px;bottom:5px;font-size:10px;}
#igs-record-panel.igs-rp-narrow .igs-record-item-detail{display:grid;grid-template-columns:72px minmax(0,1fr);column-gap:14px;min-height:0;margin-top:18px;padding:18px 0 0;border-left:0;border-top:1px solid var(--igs-rp-line-soft,rgba(216,213,207,.18));}
#igs-record-panel.igs-rp-narrow .igs-record-item-detail-icon{grid-column:1;grid-row:1;width:72px;height:72px;margin:0;}
#igs-record-panel.igs-rp-narrow .igs-record-item-detail-icon svg{width:72px;height:72px;}
#igs-record-panel.igs-rp-narrow .igs-record-item-detail-copy{grid-column:2;grid-row:1;}
#igs-record-panel.igs-rp-narrow .igs-record-item-detail h3{font-size:20px;line-height:1.35;margin-bottom:6px;}
#igs-record-panel.igs-rp-narrow .igs-record-item-description{margin-top:14px;padding-top:0;border-top:0;line-height:1.7;}
#igs-record-panel.igs-rp-narrow .igs-record-item-detail-copy .igs-record-fields{margin-top:14px;padding-top:14px;}
#igs-record-panel.igs-rp-narrow .igs-record-item-empty{margin-top:18px;border-top:1px solid var(--igs-rp-line-soft,rgba(216,213,207,.18));min-height:88px;}

#igs-record-panel.igs-rp-narrow .igs-record-relationship-detail{grid-area:detail;padding:16px 0;}
#igs-record-panel.igs-rp-narrow .igs-record-person-head{padding:0;border:0;}
#igs-record-panel.igs-rp-narrow .igs-record-relationship-section{padding:14px 0 0;border:0;}
#igs-record-panel.igs-rp-narrow .igs-record-relationship-detail h2{font-size:20px;}
#igs-record-panel.igs-rp-short .igs-record-relationship-graph{min-height:190px;}
#igs-record-panel.igs-rp-short .igs-record-node-avatar{width:58px;height:58px;font-size:24px;}
#igs-record-panel .igs-record-table-scroll{overflow:auto;max-width:100%;}
#igs-record-panel table{border-collapse:collapse;width:100%;text-align:left;}
#igs-record-panel caption{text-align:left;margin-bottom:8px;}
#igs-record-panel th,#igs-record-panel td{padding:8px;border:1px solid var(--igs-rp-line-soft,rgba(216,213,207,.12));white-space:pre-wrap;overflow-wrap:anywhere;min-width:80px;}
`;
