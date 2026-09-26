export const RECORD_PANEL_STYLE_TEXT = `
#igs-overlay.igs-record-screen-open #igs-click-layer,#igs-overlay.igs-record-screen-open #igs-sprite,#igs-overlay.igs-record-screen-open #igs-dialog-layer,#igs-overlay.igs-record-screen-open #igs-toolbar-layer,#igs-overlay.igs-record-screen-open #igs-option-layer,#igs-overlay.igs-record-screen-open #igs-status-hud,#igs-overlay.igs-record-screen-open #igs-sprite-edit-bar{display:none!important;pointer-events:none!important;}
#igs-overlay.igs-record-screen-open #igs-db-layer{inset:0;z-index:20;pointer-events:none;}
#igs-record-panel{position:absolute;inset:0;z-index:11;display:block;padding:0;box-sizing:border-box;pointer-events:auto;background:transparent;color:var(--igs-rp-text,#ece8e1);}
#igs-record-panel .igs-record-window{width:100%;height:100%;min-height:0;overflow:hidden;box-sizing:border-box;background:transparent;border:0;border-radius:0;box-shadow:none;}
#igs-record-panel button{color:inherit;cursor:pointer;font-family:inherit;}
#igs-record-panel .igs-record-tabs{position:relative;z-index:2;display:flex;justify-content:center;gap:4px;overflow-x:auto;padding:0 16px 8px;flex:none;}
#igs-record-panel .igs-record-scroll{flex:1 1 auto;min-width:0;min-height:0;width:100%;overflow:auto;padding:8px clamp(18px,4vw,56px) 28px;overscroll-behavior:contain;box-sizing:border-box;}
#igs-record-panel .igs-record-body{white-space:pre-wrap;overflow-wrap:anywhere;}
#igs-record-panel .igs-record-fields{display:grid;gap:8px;margin:18px 0 0;}
#igs-record-panel .igs-record-fields div{display:grid;grid-template-columns:5em minmax(0,1fr);gap:12px;overflow-wrap:anywhere;}
#igs-record-panel .igs-record-fields dt{color:var(--igs-rp-text-soft);font-size:13px;}
#igs-record-panel .igs-record-fields dd{margin:0;min-width:0;white-space:pre-wrap;}
#igs-record-panel svg{width:22px;height:22px;flex:none;}

#igs-record-panel .igs-record-inventory{display:grid;grid-template-columns:minmax(0,1fr) minmax(280px,34%);gap:clamp(20px,3vw,40px);align-items:start;min-height:100%;}
#igs-record-panel .igs-record-inventory-main{display:flex;flex-direction:column;gap:16px;min-width:0;}
#igs-record-panel .igs-record-inventory-tools{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px 16px;}
#igs-record-panel .igs-record-groups{display:flex;flex-wrap:wrap;gap:4px;min-width:0;}
#igs-record-panel .igs-record-inventory-actions{display:flex;align-items:center;gap:6px;margin-left:auto;}
#igs-record-panel .igs-record-slots{display:grid;grid-template-columns:repeat(auto-fill,minmax(112px,1fr));gap:12px;}
#igs-record-panel .igs-record-slots button{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;min-width:0;aspect-ratio:1/1;padding:10px 10px 30px;border:0;border-radius:18px;background:var(--igs-rp-sheen),var(--igs-rp-fill);color:var(--igs-rp-text);text-align:center;transition:background .2s,transform .2s,box-shadow .2s;}
#igs-record-panel .igs-record-slots button:hover{background:var(--igs-rp-sheen),var(--igs-rp-fill-hover);transform:translateY(-2px);}
#igs-record-panel .igs-record-slots button[aria-current="true"]{background:linear-gradient(160deg,rgba(255,255,255,.24) 0%,rgba(255,255,255,.09) 55%,rgba(255,255,255,.14) 100%);box-shadow:0 12px 30px rgba(0,0,0,.26),inset 0 0 28px rgba(255,255,255,.06);}
#igs-record-panel .igs-record-slot-icon{display:grid;place-items:center;width:50%;aspect-ratio:1/1;opacity:.92;}
#igs-record-panel .igs-record-slot-icon svg{width:100%;height:100%;stroke-width:1.15;}
#igs-record-panel .igs-record-slot-name{position:absolute;left:12px;right:34px;bottom:10px;font-size:12px;line-height:1.3;color:var(--igs-rp-text-soft);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;text-align:left;}
#igs-record-panel .igs-record-slots button[aria-current="true"] .igs-record-slot-name{color:var(--igs-rp-text);}
#igs-record-panel .igs-record-slot-quantity{position:absolute;right:11px;bottom:10px;font-size:11px;line-height:1.3;color:var(--igs-rp-text-soft);font-variant-numeric:tabular-nums;}
#igs-record-panel .igs-record-slots-empty{grid-column:1/-1;margin:24px 0;color:var(--igs-rp-text-soft);text-align:center;}
#igs-record-panel .igs-record-item-pane{position:sticky;top:0;min-width:0;}
#igs-record-panel .igs-record-item-detail,#igs-record-panel .igs-record-item-empty{box-sizing:border-box;padding:28px 26px 24px;border-radius:var(--igs-rp-radius-sheet);background:var(--igs-rp-sheen),rgba(255,255,255,.04);box-shadow:var(--igs-rp-glow);}
#igs-record-panel .igs-record-item-detail-icon{display:grid;place-items:center;width:92px;height:92px;margin:0 0 18px;border-radius:26px;background:radial-gradient(circle at 30% 25%,rgba(255,255,255,.18),rgba(255,255,255,.04) 72%);color:var(--igs-rp-text);}
#igs-record-panel .igs-record-item-detail-icon svg{width:58px;height:58px;stroke-width:1.1;}
#igs-record-panel .igs-record-item-detail-copy{min-width:0;}
#igs-record-panel .igs-record-item-kicker{margin:0;color:var(--igs-rp-text-faint);font-size:11px;letter-spacing:.28em;}
#igs-record-panel .igs-record-item-detail h3{margin:6px 0 6px;font-size:24px;line-height:1.35;font-weight:400;letter-spacing:.06em;overflow-wrap:anywhere;}
#igs-record-panel .igs-record-item-quantity{margin:0;color:var(--igs-rp-text-soft);font-size:13px;font-variant-numeric:tabular-nums;}
#igs-record-panel .igs-record-item-description{margin:18px 0 0;line-height:1.85;white-space:pre-wrap;overflow-wrap:anywhere;}
#igs-record-panel .igs-record-item-actions{display:flex;flex-direction:column;align-items:flex-start;gap:8px;margin-top:24px;}
#igs-record-panel .igs-record-item-actions small{color:var(--igs-rp-text-faint);font-size:11px;line-height:1.5;}
#igs-record-panel .igs-record-feedback{margin:10px 0 0;color:var(--igs-rp-warm);font-size:12px;}
#igs-record-panel .igs-record-feedback:empty{display:none;}
#igs-record-panel .igs-record-item-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;min-height:240px;color:var(--igs-rp-text-soft);}
#igs-record-panel .igs-record-item-empty p{margin:0;font-size:14px;letter-spacing:.12em;}
#igs-record-panel .igs-record-item-empty-icon svg{width:26px;height:26px;opacity:.55;}

#igs-record-panel .igs-record-diary{display:grid;grid-template-columns:minmax(250px,30%) minmax(0,1fr);gap:clamp(20px,3vw,44px);height:100%;min-height:0;}
#igs-record-panel .igs-record-diary-side{display:flex;flex-direction:column;gap:12px;min-width:0;min-height:0;overflow:auto;padding-bottom:12px;}
#igs-record-panel .igs-record-diary-tools{display:flex;align-items:center;justify-content:space-between;gap:8px;}
#igs-record-panel .igs-record-prefs{display:grid;gap:2px;padding:8px;border-radius:20px;background:var(--igs-rp-sheen),rgba(255,255,255,.05);box-shadow:var(--igs-rp-glow);}
#igs-record-panel .igs-record-prefs button{display:flex;align-items:center;gap:12px;padding:9px 10px;border:0;border-radius:14px;background:transparent;text-align:left;transition:background .2s;}
#igs-record-panel .igs-record-prefs button:hover{background:var(--igs-rp-fill);}
#igs-record-panel .igs-record-prefs strong{display:block;font-size:13px;font-weight:400;letter-spacing:.08em;}
#igs-record-panel .igs-record-prefs small{display:block;color:var(--igs-rp-text-faint);font-size:11px;line-height:1.5;}
#igs-record-panel .igs-record-bookshelf{display:flex;flex-direction:column;gap:2px;}
#igs-record-panel .igs-record-book{position:relative;display:flex;align-items:center;gap:12px;width:100%;padding:9px 12px;border:0;border-radius:18px;background:transparent;text-align:left;transition:background .2s;}
#igs-record-panel .igs-record-book:hover{background:var(--igs-rp-fill);}
#igs-record-panel .igs-record-book[aria-current="true"]{background:var(--igs-rp-sheen),var(--igs-rp-fill-active);}
#igs-record-panel .igs-record-book-avatar,#igs-record-panel .igs-record-timeline-avatar{display:grid;place-items:center;flex:none;width:38px;height:38px;border-radius:50%;background:radial-gradient(circle at 32% 28%,rgba(255,255,255,.24),rgba(255,255,255,.06) 72%);font-size:16px;line-height:1;}
#igs-record-panel .igs-record-book-meta{display:flex;flex-direction:column;min-width:0;}
#igs-record-panel .igs-record-book-meta>span{font-size:14px;line-height:1.4;letter-spacing:.08em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
#igs-record-panel .igs-record-book-meta>small{color:var(--igs-rp-text-soft);font-size:11px;line-height:1.4;}
#igs-record-panel .igs-record-book>.igs-rp-dot{position:absolute;right:14px;top:50%;margin-top:-3px;}
#igs-record-panel .igs-record-chapters,#igs-record-panel .igs-record-timeline{list-style:none;margin:6px 0 0;padding:0;display:flex;flex-direction:column;gap:2px;}
#igs-record-panel .igs-record-chapters button{display:flex;align-items:center;gap:12px;width:100%;padding:9px 12px;border:0;border-radius:14px;background:transparent;color:var(--igs-rp-text-soft);text-align:left;transition:background .2s,color .2s;}
#igs-record-panel .igs-record-chapters button:hover{background:var(--igs-rp-fill);color:var(--igs-rp-text);}
#igs-record-panel .igs-record-chapters button[aria-current="true"],#igs-record-panel .igs-record-timeline button[aria-current="true"]{background:var(--igs-rp-fill-active);color:var(--igs-rp-text);}
#igs-record-panel .igs-record-chapter-date{flex:0 0 3.2em;color:var(--igs-rp-text-faint);font-size:12px;font-variant-numeric:tabular-nums;}
#igs-record-panel .igs-record-chapter-title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px;}
#igs-record-panel .igs-record-timeline-date{padding:12px 12px 2px;color:var(--igs-rp-text-faint);font-size:11px;letter-spacing:.24em;font-variant-numeric:tabular-nums;}
#igs-record-panel .igs-record-timeline button{display:flex;align-items:center;gap:12px;width:100%;padding:8px 12px 8px 8px;border:0;border-radius:16px;background:transparent;color:var(--igs-rp-text-soft);text-align:left;transition:background .2s,color .2s;}
#igs-record-panel .igs-record-timeline button:hover{background:var(--igs-rp-fill);color:var(--igs-rp-text);}
#igs-record-panel .igs-record-timeline-avatar{width:32px;height:32px;font-size:14px;}
#igs-record-panel .igs-record-timeline-copy{display:flex;flex-direction:column;flex:1;min-width:0;}
#igs-record-panel .igs-record-timeline-copy strong{font-size:14px;font-weight:400;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
#igs-record-panel .igs-record-timeline-copy small{color:var(--igs-rp-text-faint);font-size:11px;}
#igs-record-panel .igs-record-diary-detail,#igs-record-panel .igs-record-item-detail,#igs-record-panel .igs-record-relationship-detail{text-shadow:none;}
#igs-record-panel .igs-record-diary-detail{display:flex;flex-direction:column;min-width:0;min-height:0;overflow:auto;box-sizing:border-box;padding:clamp(24px,3.4vw,46px) clamp(22px,4vw,60px) 18px;border-radius:26px;background:var(--igs-rp-sheen),rgba(14,16,20,.22);box-shadow:var(--igs-rp-glow);}
#igs-record-panel .igs-record-diary-meta{display:flex;flex-wrap:wrap;align-items:center;gap:0;margin:0;color:var(--igs-rp-text-soft);font-size:13px;letter-spacing:.14em;}
#igs-record-panel .igs-record-diary-meta i{margin:0 10px;font-style:normal;color:var(--igs-rp-text-faint);}
#igs-record-panel .igs-record-diary-detail h3{margin:14px 0 22px;font-size:26px;font-weight:400;letter-spacing:.16em;line-height:1.4;overflow-wrap:anywhere;}
#igs-record-panel .igs-record-diary-detail .igs-record-body{margin:0;max-width:36em;font-size:17px;line-height:2;letter-spacing:.04em;}
#igs-record-panel .igs-record-diary-nav{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:12px;margin-top:auto;padding-top:28px;font-size:13px;}
#igs-record-panel .igs-record-diary-nav button{min-height:40px;padding:8px 14px;border:0;border-radius:999px;background:transparent;color:var(--igs-rp-text);letter-spacing:.12em;transition:background .2s;}
#igs-record-panel .igs-record-diary-nav button:hover:not([disabled]){background:var(--igs-rp-fill-hover);}
#igs-record-panel .igs-record-diary-nav button:first-child{justify-self:start;}
#igs-record-panel .igs-record-diary-nav button:last-child{justify-self:end;}
#igs-record-panel .igs-record-diary-nav button[disabled]{opacity:.32;cursor:default;}
#igs-record-panel .igs-record-diary-nav span{color:var(--igs-rp-text-faint);font-variant-numeric:tabular-nums;letter-spacing:.2em;}
#igs-record-panel .igs-record-diary-detail.is-scroll{gap:0;}
#igs-record-panel .igs-record-diary-page{padding:4px 0 40px;scroll-margin-top:16px;}
#igs-record-panel .igs-record-diary-page + .igs-record-diary-page{padding-top:40px;background:radial-gradient(circle at 50% 0,rgba(255,255,255,.28) 0 1.5px,transparent 2px) top center/24px 4px no-repeat;}
#igs-record-panel .igs-record-diary-page.is-current h3::before{content:"";display:inline-block;width:6px;height:6px;margin:0 12px 5px 0;border-radius:50%;background:var(--igs-rp-warm);box-shadow:0 0 8px rgba(242,212,155,.6);vertical-align:middle;}
#igs-record-panel .igs-record-diary-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;min-height:100%;border-radius:26px;background:var(--igs-rp-sheen),rgba(14,16,20,.14);color:var(--igs-rp-text-soft);}
#igs-record-panel .igs-record-diary-empty p{margin:0;letter-spacing:.14em;font-size:14px;}
#igs-record-panel .igs-record-diary-empty svg{width:30px;height:30px;opacity:.5;}
#igs-record-panel .igs-rp-turn-next{animation:igs-rp-turn-next .44s cubic-bezier(.2,.7,.2,1) both;transform-origin:left center;}
#igs-record-panel .igs-rp-turn-prev{animation:igs-rp-turn-prev .44s cubic-bezier(.2,.7,.2,1) both;transform-origin:right center;}
@keyframes igs-rp-turn-next{from{opacity:0;transform:perspective(1400px) translateX(26px) rotateY(-7deg);}to{opacity:1;transform:none;}}
@keyframes igs-rp-turn-prev{from{opacity:0;transform:perspective(1400px) translateX(-26px) rotateY(7deg);}to{opacity:1;transform:none;}}

#igs-record-panel .igs-record-relationships{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(300px,.85fr);grid-template-rows:auto minmax(0,1fr);grid-template-areas:"stage people" "stage detail";gap:16px clamp(20px,3vw,44px);min-height:100%;}
#igs-record-panel .igs-record-people,#igs-record-panel .igs-record-relationship-stage,#igs-record-panel .igs-record-relationship-detail{min-width:0;min-height:0;box-sizing:border-box;}
#igs-record-panel .igs-record-relationship-stage{grid-area:stage;position:relative;display:grid;place-items:center;min-height:360px;}
#igs-record-panel .igs-record-relationship-graph{position:relative;width:min(100%,560px);aspect-ratio:1.2;min-height:320px;}
#igs-record-panel .igs-record-relationship-lines{position:absolute;inset:0;width:100%;height:100%;overflow:visible;}
#igs-record-panel .igs-record-relationship-lines path{fill:none;stroke:rgba(255,255,255,.26);stroke-width:1.2;vector-effect:non-scaling-stroke;}
#igs-record-panel .igs-record-relationship-node{position:absolute;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:8px;min-width:78px;padding:0;border:0;background:transparent;font-size:13px;white-space:nowrap;}
#igs-record-panel .igs-record-node-avatar{display:grid;place-items:center;width:62px;height:62px;border-radius:50%;background:radial-gradient(circle at 32% 28%,rgba(255,255,255,.26),rgba(255,255,255,.07) 72%);box-shadow:0 8px 24px rgba(0,0,0,.24);font-size:25px;line-height:1;transition:transform .25s;}
#igs-record-panel .igs-record-relationship-node:hover .igs-record-node-avatar{transform:scale(1.06);}
#igs-record-panel .igs-record-relationship-node.is-current .igs-record-node-avatar{width:92px;height:92px;font-size:38px;background:radial-gradient(circle at 32% 28%,rgba(255,244,222,.42),rgba(255,255,255,.1) 72%);box-shadow:0 0 0 7px rgba(255,255,255,.045),0 0 44px rgba(255,232,196,.2),0 12px 30px rgba(0,0,0,.3);}
#igs-record-panel .igs-record-node-name{max-width:9em;overflow:hidden;text-overflow:ellipsis;}
#igs-record-panel .igs-record-relationship-label{position:absolute;transform:translate(-50%,-50%);max-width:30%;padding:3px 10px;border-radius:999px;background:rgba(20,22,27,.5);color:var(--igs-rp-text);font-size:12px;line-height:1.3;letter-spacing:.08em;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
#igs-record-panel .igs-record-people{grid-area:people;}
#igs-record-panel .igs-record-people-list{display:flex;flex-wrap:wrap;gap:4px;}
#igs-record-panel .igs-record-people-list button{display:flex;flex-direction:column;align-items:center;gap:6px;width:68px;min-height:44px;padding:8px 4px 6px;border:0;border-radius:16px;background:transparent;transition:background .2s;}
#igs-record-panel .igs-record-people-list button:hover{background:var(--igs-rp-fill);}
#igs-record-panel .igs-record-people-list button[aria-current="true"]{background:var(--igs-rp-fill-active);}
#igs-record-panel .igs-record-person-avatar{display:grid;place-items:center;width:44px;height:44px;border-radius:50%;background:radial-gradient(circle at 32% 28%,rgba(255,255,255,.24),rgba(255,255,255,.06) 72%);font-size:19px;line-height:1;}
#igs-record-panel .igs-record-person-copy strong{display:block;max-width:60px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--igs-rp-text-soft);font-size:12px;font-weight:400;}
#igs-record-panel .igs-record-people-list button[aria-current="true"] strong{color:var(--igs-rp-text);}
#igs-record-panel .igs-record-relationship-detail{grid-area:detail;align-self:start;max-height:100%;padding:26px 28px;border-radius:var(--igs-rp-radius-sheet);background:var(--igs-rp-sheen),rgba(255,255,255,.04);box-shadow:var(--igs-rp-glow);overflow:auto;}
#igs-record-panel .igs-record-person-head h2{margin:0;font-size:22px;font-weight:400;letter-spacing:.12em;line-height:1.4;overflow-wrap:anywhere;}
#igs-record-panel .igs-record-metrics{display:grid;gap:10px;margin:18px 0 4px;}
#igs-record-panel .igs-record-metric{display:grid;grid-template-columns:5.5em minmax(0,1fr) 3.6em;align-items:center;gap:12px;color:var(--igs-rp-text-soft);font-size:12px;}
#igs-record-panel .igs-record-metric i{display:block;height:4px;border-radius:999px;background:rgba(255,255,255,.1);overflow:hidden;}
#igs-record-panel .igs-record-metric b{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,rgba(255,206,184,.5),rgba(255,236,214,.95));box-shadow:0 0 10px rgba(255,220,190,.35);}
#igs-record-panel .igs-record-metric em{font-style:normal;text-align:right;color:var(--igs-rp-text);font-variant-numeric:tabular-nums;}
#igs-record-panel .igs-record-stage{display:inline-flex;align-items:center;gap:10px;width:fit-content;margin:0;padding:4px 14px;border-radius:999px;background:var(--igs-rp-fill);font-size:12px;}
#igs-record-panel .igs-record-stage span{color:var(--igs-rp-text-soft);}
#igs-record-panel .igs-record-stage strong{font-weight:400;font-size:13px;}
#igs-record-panel .igs-record-relationship-section{padding-top:14px;}
#igs-record-panel .igs-record-relationship-description{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.85;}
#igs-record-panel .igs-record-relationship-links{display:flex;flex-wrap:wrap;gap:6px;list-style:none;margin:16px 0 0;padding:0;}
#igs-record-panel .igs-record-relationship-links li{padding:4px 12px;border-radius:999px;background:var(--igs-rp-fill);font-size:13px;}
#igs-record-panel .igs-record-relationship-links span{margin-right:8px;color:var(--igs-rp-text-soft);font-size:12px;}
#igs-record-panel .igs-record-relationship-note,#igs-record-panel .igs-record-relationship-empty{color:var(--igs-rp-text-soft);line-height:1.7;}

#igs-record-panel .igs-record-table-scroll{overflow:auto;max-width:100%;}
#igs-record-panel table{border-collapse:collapse;width:100%;text-align:left;}
#igs-record-panel caption{text-align:left;margin-bottom:8px;}
#igs-record-panel th,#igs-record-panel td{padding:8px;border-bottom:1px solid var(--igs-rp-line-soft);white-space:pre-wrap;overflow-wrap:anywhere;min-width:80px;}

#igs-record-panel.igs-rp-mid .igs-record-inventory{grid-template-columns:minmax(0,1fr) minmax(250px,38%);}
#igs-record-panel.igs-rp-mid .igs-record-relationships{grid-template-columns:minmax(0,1fr) minmax(280px,.9fr);}
#igs-record-panel.igs-rp-narrow .igs-record-scroll{padding:4px 14px 20px;}
#igs-record-panel.igs-rp-narrow .igs-record-inventory{display:flex;flex-direction:column;align-items:stretch;gap:18px;}
#igs-record-panel.igs-rp-narrow .igs-record-inventory-tools{flex-direction:column;flex-wrap:nowrap;align-items:stretch;}
#igs-record-panel.igs-rp-narrow .igs-record-groups{flex-wrap:nowrap;overflow-x:auto;margin:0 -14px;padding:0 14px;}
#igs-record-panel.igs-rp-narrow .igs-record-inventory-actions{margin-left:0;}
#igs-record-panel.igs-rp-narrow .igs-rp-search{flex:1;}
#igs-record-panel.igs-rp-narrow .igs-record-slots{grid-template-columns:repeat(auto-fill,minmax(78px,1fr));gap:8px;}
#igs-record-panel.igs-rp-narrow .igs-record-slots button{padding:8px 6px 24px;border-radius:14px;}
#igs-record-panel.igs-rp-narrow .igs-record-slot-icon{width:48%;}
#igs-record-panel.igs-rp-narrow .igs-record-slot-name{left:8px;right:24px;bottom:6px;font-size:11px;-webkit-line-clamp:1;}
#igs-record-panel.igs-rp-narrow .igs-record-slot-quantity{right:7px;bottom:6px;font-size:10px;}
#igs-record-panel.igs-rp-narrow .igs-record-item-pane{position:static;}
#igs-record-panel.igs-rp-narrow .igs-record-item-detail{display:grid;grid-template-columns:64px minmax(0,1fr);column-gap:16px;padding:20px 18px;}
#igs-record-panel.igs-rp-narrow .igs-record-item-detail-icon{width:64px;height:64px;margin:0;border-radius:20px;}
#igs-record-panel.igs-rp-narrow .igs-record-item-detail-icon svg{width:40px;height:40px;}
#igs-record-panel.igs-rp-narrow .igs-record-item-detail h3{font-size:20px;}
#igs-record-panel.igs-rp-narrow .igs-record-item-empty{min-height:96px;padding:18px;}
#igs-record-panel.igs-rp-narrow .igs-record-diary{display:flex;flex-direction:column;gap:14px;height:auto;min-height:100%;}
#igs-record-panel.igs-rp-narrow .igs-record-diary-side{overflow:visible;padding-bottom:0;}
#igs-record-panel.igs-rp-narrow .igs-record-bookshelf{flex-direction:row;overflow-x:auto;margin:0 -14px;padding:0 14px;gap:4px;}
#igs-record-panel.igs-rp-narrow .igs-record-book{flex:0 0 auto;width:auto;padding:6px 14px 6px 6px;}
#igs-record-panel.igs-rp-narrow .igs-record-book-avatar{width:32px;height:32px;font-size:14px;}
#igs-record-panel.igs-rp-narrow .igs-record-book>.igs-rp-dot{top:8px;right:8px;margin:0;}
#igs-record-panel.igs-rp-narrow .igs-record-chapters,#igs-record-panel.igs-rp-narrow .igs-record-timeline{max-height:30vh;overflow:auto;}
#igs-record-panel.igs-rp-narrow .igs-record-diary-detail{flex:1 0 auto;min-height:320px;overflow:visible;padding:24px 20px 14px;border-radius:22px;}
#igs-record-panel.igs-rp-narrow .igs-record-diary-detail h3{font-size:21px;margin:10px 0 16px;}
#igs-record-panel.igs-rp-narrow .igs-record-diary-detail .igs-record-body{font-size:16px;line-height:1.95;}
#igs-record-panel.igs-rp-narrow .igs-record-diary-empty{min-height:160px;}
#igs-record-panel.igs-rp-narrow .igs-record-relationships{display:flex;flex-direction:column;gap:14px;min-height:0;}
#igs-record-panel.igs-rp-narrow .igs-record-relationship-stage{min-height:260px;}
#igs-record-panel.igs-rp-narrow .igs-record-relationship-graph{width:min(100%,340px);aspect-ratio:1.05;min-height:260px;}
#igs-record-panel.igs-rp-narrow .igs-record-people-list{flex-wrap:nowrap;overflow-x:auto;margin:0 -14px;padding:0 14px;}
#igs-record-panel.igs-rp-narrow .igs-record-people-list button{flex:0 0 64px;width:64px;}
#igs-record-panel.igs-rp-narrow .igs-record-person-avatar{width:40px;height:40px;font-size:18px;}
#igs-record-panel.igs-rp-narrow .igs-record-relationship-node{min-width:60px;gap:5px;font-size:12px;}
#igs-record-panel.igs-rp-narrow .igs-record-node-avatar{width:50px;height:50px;font-size:21px;}
#igs-record-panel.igs-rp-narrow .igs-record-relationship-node.is-current .igs-record-node-avatar{width:72px;height:72px;font-size:30px;}
#igs-record-panel.igs-rp-narrow .igs-record-node-name{max-width:6em;}
#igs-record-panel.igs-rp-narrow .igs-record-relationship-label{max-width:26%;padding:2px 7px;font-size:11px;}
#igs-record-panel.igs-rp-narrow .igs-record-relationship-detail{padding:20px 18px;}
#igs-record-panel.igs-rp-narrow .igs-record-person-head h2{font-size:20px;}
#igs-record-panel.igs-rp-short .igs-record-relationship-graph{min-height:200px;}
`;
