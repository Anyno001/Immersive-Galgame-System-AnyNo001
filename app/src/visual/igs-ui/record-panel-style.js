export const RECORD_PANEL_STYLE_TEXT = `
#igs-overlay.igs-record-screen-open #igs-click-layer,#igs-overlay.igs-record-screen-open #igs-sprite,#igs-overlay.igs-record-screen-open #igs-dialog-layer,#igs-overlay.igs-record-screen-open #igs-toolbar-layer,#igs-overlay.igs-record-screen-open #igs-option-layer,#igs-overlay.igs-record-screen-open #igs-status-hud,#igs-overlay.igs-record-screen-open #igs-sprite-edit-bar{display:none!important;pointer-events:none!important;}
#igs-overlay.igs-record-screen-open #igs-db-layer{inset:0;z-index:20;pointer-events:none;}
#igs-record-panel{position:absolute;inset:0;z-index:11;display:block;padding:0;box-sizing:border-box;pointer-events:auto;background:transparent;color:var(--igs-rp-text,#eceae6);}
#igs-record-panel .igs-record-window{width:100%;height:100%;min-height:0;overflow:hidden;box-sizing:border-box;background:transparent;border:0;border-radius:0;box-shadow:none;}
#igs-record-panel button{color:inherit;cursor:pointer;font-family:inherit;}
#igs-record-panel .igs-record-tabs{position:relative;z-index:2;display:flex;justify-content:center;gap:4px;overflow-x:auto;padding:0 16px 8px;flex:none;}
#igs-record-panel .igs-record-scroll{flex:1 1 auto;min-width:0;min-height:0;width:100%;overflow:auto;padding:8px clamp(18px,4vw,56px) 28px;overscroll-behavior:contain;box-sizing:border-box;}
#igs-record-panel .igs-record-body{white-space:pre-wrap;overflow-wrap:anywhere;}
#igs-record-panel .igs-record-fields{display:grid;gap:8px;margin:18px 0 0;}
#igs-record-panel .igs-record-fields div{display:grid;grid-template-columns:5em minmax(0,1fr);gap:12px;overflow-wrap:anywhere;}
#igs-record-panel .igs-record-fields dt{color:var(--igs-rp-text-faint);font-size:12px;}
#igs-record-panel .igs-record-fields dd{margin:0;min-width:0;white-space:pre-wrap;}
#igs-record-panel svg{width:22px;height:22px;flex:none;}

#igs-record-panel .igs-record-inventory{display:grid;grid-template-columns:minmax(0,1fr) minmax(280px,34%);gap:clamp(20px,3vw,40px);align-items:start;min-height:100%;}
#igs-record-panel .igs-record-inventory-main{display:flex;flex-direction:column;gap:14px;min-width:0;}
#igs-record-panel .igs-record-inventory-tools{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px 16px;}
#igs-record-panel .igs-record-groups{display:flex;flex-wrap:wrap;gap:2px;min-width:0;}
#igs-record-panel .igs-record-inventory-actions{display:flex;align-items:center;gap:6px;margin-left:auto;}
#igs-record-panel .igs-record-slots{display:grid;grid-template-columns:repeat(auto-fill,minmax(108px,1fr));gap:10px;}
#igs-record-panel .igs-record-slots button{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;min-width:0;aspect-ratio:1/1;padding:10px 10px 30px;border:0;border-radius:var(--igs-rp-radius-l);background:var(--igs-rp-pane);box-shadow:var(--igs-rp-pane-edge);color:var(--igs-rp-text-soft);text-align:center;transition:background .18s var(--igs-rp-ease),color .18s var(--igs-rp-ease),transform .12s var(--igs-rp-ease);}
#igs-record-panel .igs-record-slots button:hover{background:var(--igs-rp-fill-active);color:var(--igs-rp-text);}
#igs-record-panel .igs-record-slots button:active{transform:scale(.97);}
#igs-record-panel .igs-record-slots button[aria-current="true"]{background:var(--igs-rp-text);color:var(--igs-rp-on-ink);box-shadow:none;}
#igs-record-panel .igs-record-slot-icon{display:grid;place-items:center;width:44%;aspect-ratio:1/1;}
#igs-record-panel .igs-record-slot-icon svg{width:100%;height:100%;stroke-width:1.3;}
#igs-record-panel .igs-record-slot-name{position:absolute;left:10px;right:32px;bottom:9px;font-size:12px;font-weight:500;line-height:1.3;color:inherit;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;text-align:left;}
#igs-record-panel .igs-record-slot-quantity{position:absolute;right:10px;bottom:9px;font-size:11px;line-height:1.3;color:inherit;opacity:.66;font-variant-numeric:tabular-nums;}
#igs-record-panel .igs-record-slots-empty{grid-column:1/-1;margin:24px 0;color:var(--igs-rp-text-faint);text-align:center;}
#igs-record-panel .igs-record-item-pane{position:sticky;top:0;min-width:0;}
#igs-record-panel .igs-record-item-detail,#igs-record-panel .igs-record-item-empty{box-sizing:border-box;padding:24px 24px 22px;border-radius:var(--igs-rp-radius-l);background:var(--igs-rp-pane);box-shadow:var(--igs-rp-pane-edge);}
#igs-record-panel .igs-record-item-detail-icon{display:grid;place-items:center;width:72px;height:72px;margin:0 0 18px;border-radius:var(--igs-rp-radius-l);background:var(--igs-rp-fill-hover);color:var(--igs-rp-text);}
#igs-record-panel .igs-record-item-detail-icon svg{width:40px;height:40px;stroke-width:1.3;}
#igs-record-panel .igs-record-item-detail-copy{min-width:0;}
#igs-record-panel .igs-record-item-kicker{margin:0;color:var(--igs-rp-text-faint);font-size:11px;font-weight:500;letter-spacing:.16em;}
#igs-record-panel .igs-record-item-detail h3{margin:6px 0 4px;font-size:20px;line-height:1.35;font-weight:600;letter-spacing:.04em;overflow-wrap:anywhere;}
#igs-record-panel .igs-record-item-quantity{margin:0;color:var(--igs-rp-text-faint);font-size:12px;font-variant-numeric:tabular-nums;}
#igs-record-panel .igs-record-item-description{margin:16px 0 0;font-family:var(--igs-rp-font-body);font-size:15px;line-height:1.85;color:var(--igs-rp-text);white-space:pre-wrap;overflow-wrap:anywhere;}
#igs-record-panel .igs-record-item-actions{display:flex;flex-direction:column;align-items:flex-start;gap:8px;margin-top:22px;}
#igs-record-panel .igs-record-item-actions small{color:var(--igs-rp-text-faint);font-size:11px;line-height:1.5;}
#igs-record-panel .igs-record-feedback{margin:10px 0 0;color:var(--igs-rp-warm);font-size:12px;}
#igs-record-panel .igs-record-feedback:empty{display:none;}
#igs-record-panel .igs-record-item-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;min-height:220px;color:var(--igs-rp-text-faint);}
#igs-record-panel .igs-record-item-empty p{margin:0;font-size:13px;letter-spacing:.08em;}
#igs-record-panel .igs-record-item-empty-icon svg{width:24px;height:24px;opacity:.6;}

#igs-record-panel .igs-record-diary{display:grid;grid-template-columns:minmax(250px,30%) minmax(0,1fr);gap:clamp(20px,3vw,40px);height:100%;min-height:0;}
#igs-record-panel .igs-record-diary-side{display:flex;flex-direction:column;gap:12px;min-width:0;min-height:0;overflow:auto;padding-bottom:12px;}
#igs-record-panel .igs-record-diary-tools{display:flex;align-items:center;justify-content:space-between;gap:8px;}
#igs-record-panel .igs-record-prefs{display:grid;gap:2px;padding:6px;border-radius:var(--igs-rp-radius-l);background:var(--igs-rp-pane);box-shadow:var(--igs-rp-pane-edge);}
#igs-record-panel .igs-record-prefs button{display:flex;align-items:center;gap:12px;padding:8px 10px;border:0;border-radius:var(--igs-rp-radius-m);background:transparent;text-align:left;transition:background .18s var(--igs-rp-ease);}
#igs-record-panel .igs-record-prefs button:hover{background:var(--igs-rp-fill);}
#igs-record-panel .igs-record-prefs strong{display:block;font-size:13px;font-weight:500;letter-spacing:.04em;}
#igs-record-panel .igs-record-prefs small{display:block;color:var(--igs-rp-text-faint);font-size:11px;line-height:1.5;}
#igs-record-panel .igs-record-font-size{display:flex;align-items:center;gap:12px;padding:6px 6px 8px 10px;}
#igs-record-panel .igs-record-font-size>span:first-child{flex:1;min-width:0;}
#igs-record-panel .igs-record-stepper{display:inline-flex;align-items:center;gap:2px;padding:2px;border-radius:var(--igs-rp-radius-m);background:var(--igs-rp-fill);}
#igs-record-panel .igs-record-prefs .igs-record-stepper button{display:grid;place-items:center;width:30px;height:28px;padding:0;border-radius:calc(var(--igs-rp-radius-m) - 2px);font-size:13px;font-weight:600;line-height:1;}
#igs-record-panel .igs-record-prefs .igs-record-stepper button:hover:not([disabled]){background:var(--igs-rp-fill-hover);}
#igs-record-panel .igs-record-prefs .igs-record-stepper button[disabled]{opacity:.3;cursor:default;}
#igs-record-panel .igs-record-stepper output{min-width:2.4em;text-align:center;font-size:13px;font-weight:600;font-variant-numeric:tabular-nums;}
#igs-record-panel .igs-record-bookshelf{display:flex;flex-direction:column;gap:2px;}
#igs-record-panel .igs-record-book{position:relative;display:flex;align-items:center;gap:12px;width:100%;padding:8px 10px;border:0;border-radius:var(--igs-rp-radius-l);background:transparent;text-align:left;transition:background .18s var(--igs-rp-ease);}
#igs-record-panel .igs-record-book:hover{background:var(--igs-rp-fill);}
#igs-record-panel .igs-record-book[aria-current="true"]{background:var(--igs-rp-fill-active);}
#igs-record-panel .igs-record-book-avatar,#igs-record-panel .igs-record-timeline-avatar{display:grid;place-items:center;flex:none;width:36px;height:36px;border-radius:50%;background:var(--igs-rp-fill-hover);font-size:15px;font-weight:600;line-height:1;}
#igs-record-panel .igs-record-book[aria-current="true"] .igs-record-book-avatar{background:var(--igs-rp-text);color:var(--igs-rp-on-ink);}
#igs-record-panel .igs-record-book-meta{display:flex;flex-direction:column;min-width:0;}
#igs-record-panel .igs-record-book-meta>span{font-size:14px;font-weight:500;line-height:1.4;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
#igs-record-panel .igs-record-book-meta>small{color:var(--igs-rp-text-faint);font-size:11px;line-height:1.4;}
#igs-record-panel .igs-record-book>.igs-rp-dot{position:absolute;right:14px;top:50%;margin-top:-3px;}
#igs-record-panel .igs-record-chapters,#igs-record-panel .igs-record-timeline{list-style:none;margin:6px 0 0;padding:0;display:flex;flex-direction:column;gap:2px;}
#igs-record-panel .igs-record-chapters button{display:flex;align-items:center;gap:12px;width:100%;padding:8px 10px;border:0;border-radius:var(--igs-rp-radius-m);background:transparent;color:var(--igs-rp-text-soft);text-align:left;transition:background .18s var(--igs-rp-ease),color .18s var(--igs-rp-ease);}
#igs-record-panel .igs-record-chapters button:hover{background:var(--igs-rp-fill);color:var(--igs-rp-text);}
#igs-record-panel .igs-record-chapters button[aria-current="true"],#igs-record-panel .igs-record-timeline button[aria-current="true"]{background:var(--igs-rp-fill-active);color:var(--igs-rp-text);}
#igs-record-panel .igs-record-chapter-date{flex:0 0 3.2em;color:var(--igs-rp-text-faint);font-size:12px;font-variant-numeric:tabular-nums;}
#igs-record-panel .igs-record-chapter-title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px;}
#igs-record-panel .igs-record-timeline-date{padding:14px 10px 4px;color:var(--igs-rp-text-faint);font-size:11px;font-weight:500;letter-spacing:.16em;font-variant-numeric:tabular-nums;}
#igs-record-panel .igs-record-timeline button{display:flex;align-items:center;gap:12px;width:100%;padding:7px 10px 7px 8px;border:0;border-radius:var(--igs-rp-radius-m);background:transparent;color:var(--igs-rp-text-soft);text-align:left;transition:background .18s var(--igs-rp-ease),color .18s var(--igs-rp-ease);}
#igs-record-panel .igs-record-timeline button:hover{background:var(--igs-rp-fill);color:var(--igs-rp-text);}
#igs-record-panel .igs-record-timeline-avatar{width:30px;height:30px;font-size:13px;}
#igs-record-panel .igs-record-timeline-copy{display:flex;flex-direction:column;flex:1;min-width:0;}
#igs-record-panel .igs-record-timeline-copy strong{font-size:14px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
#igs-record-panel .igs-record-timeline-copy small{color:var(--igs-rp-text-faint);font-size:11px;}
#igs-record-panel .igs-record-diary-detail{display:flex;flex-direction:column;min-width:0;min-height:0;overflow:auto;box-sizing:border-box;padding:clamp(24px,3.4vw,44px) clamp(22px,4vw,56px) 16px;border-radius:var(--igs-rp-radius-l);background:var(--igs-rp-reading);box-shadow:var(--igs-rp-pane-edge);}
#igs-record-panel .igs-record-diary-meta{display:flex;flex-wrap:wrap;align-items:center;gap:0;margin:0;color:var(--igs-rp-text-faint);font-size:12px;font-weight:500;letter-spacing:.12em;}
#igs-record-panel .igs-record-diary-meta i{margin:0 10px;font-style:normal;color:var(--igs-rp-text-ghost);}
#igs-record-panel .igs-record-diary-detail h3{margin:12px 0 20px;font-family:var(--igs-rp-font-body);font-size:calc(var(--igs-rp-diary-size) + 7px);font-weight:400;letter-spacing:.08em;line-height:1.4;overflow-wrap:anywhere;}
#igs-record-panel .igs-record-diary-detail .igs-record-body{margin:0;max-width:34em;font-family:var(--igs-rp-font-body);font-size:var(--igs-rp-diary-size);line-height:1.95;letter-spacing:.03em;color:var(--igs-rp-text);}
#igs-record-panel .igs-record-diary-nav{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:12px;margin-top:auto;padding-top:28px;font-size:13px;}
#igs-record-panel .igs-record-diary-nav button{min-height:36px;padding:7px 12px;border:0;border-radius:var(--igs-rp-radius-m);background:transparent;color:var(--igs-rp-text-soft);font-weight:500;letter-spacing:.06em;transition:background .18s var(--igs-rp-ease),color .18s var(--igs-rp-ease);}
#igs-record-panel .igs-record-diary-nav button:hover:not([disabled]){background:var(--igs-rp-fill-hover);color:var(--igs-rp-text);}
#igs-record-panel .igs-record-diary-nav button:first-child{justify-self:start;}
#igs-record-panel .igs-record-diary-nav button:last-child{justify-self:end;}
#igs-record-panel .igs-record-diary-nav button[disabled]{opacity:.3;cursor:default;}
#igs-record-panel .igs-record-diary-nav span{color:var(--igs-rp-text-faint);font-size:12px;font-variant-numeric:tabular-nums;letter-spacing:.16em;}
#igs-record-panel .igs-record-diary-detail.is-scroll{gap:0;}
#igs-record-panel .igs-record-diary-page{padding:4px 0 40px;scroll-margin-top:16px;}
#igs-record-panel .igs-record-diary-page + .igs-record-diary-page{padding-top:40px;background:radial-gradient(circle,var(--igs-rp-text-ghost) 1.5px,transparent 2px) top center/4px 4px no-repeat;}
#igs-record-panel .igs-record-diary-page.is-current h3::before{content:"";display:inline-block;width:6px;height:6px;margin:0 12px 5px 0;border-radius:50%;background:var(--igs-rp-warm);vertical-align:middle;}
#igs-record-panel .igs-record-diary-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;min-height:100%;border-radius:var(--igs-rp-radius-l);background:var(--igs-rp-pane);box-shadow:var(--igs-rp-pane-edge);color:var(--igs-rp-text-faint);}
#igs-record-panel .igs-record-diary-empty p{margin:0;letter-spacing:.08em;font-size:13px;}
#igs-record-panel .igs-record-diary-empty svg{width:28px;height:28px;opacity:.6;}
#igs-record-panel .igs-rp-turn-next{animation:igs-rp-turn-next .38s var(--igs-rp-ease) both;}
#igs-record-panel .igs-rp-turn-prev{animation:igs-rp-turn-prev .38s var(--igs-rp-ease) both;}
@keyframes igs-rp-turn-next{from{opacity:0;transform:translateX(18px);}to{opacity:1;transform:none;}}
@keyframes igs-rp-turn-prev{from{opacity:0;transform:translateX(-18px);}to{opacity:1;transform:none;}}

#igs-record-panel .igs-record-relationships{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(300px,.85fr);grid-template-rows:auto minmax(0,1fr);grid-template-areas:"stage people" "stage detail";gap:16px clamp(20px,3vw,40px);min-height:100%;}
#igs-record-panel .igs-record-people,#igs-record-panel .igs-record-relationship-stage,#igs-record-panel .igs-record-relationship-detail{min-width:0;min-height:0;box-sizing:border-box;}
#igs-record-panel .igs-record-relationship-stage{grid-area:stage;position:relative;display:grid;place-items:center;min-height:360px;}
#igs-record-panel .igs-record-relationship-graph{position:relative;width:min(100%,560px);aspect-ratio:1.2;min-height:320px;}
#igs-record-panel .igs-record-relationship-lines{position:absolute;inset:0;width:100%;height:100%;overflow:visible;}
#igs-record-panel .igs-record-relationship-lines path{fill:none;stroke:rgba(236,234,230,.22);stroke-width:1;vector-effect:non-scaling-stroke;}
#igs-record-panel .igs-record-relationship-node{position:absolute;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:8px;min-width:78px;padding:0;border:0;background:transparent;font-size:13px;font-weight:500;white-space:nowrap;}
#igs-record-panel .igs-record-node-avatar{display:grid;place-items:center;width:56px;height:56px;border-radius:50%;background:#383b3f;font-size:22px;font-weight:600;line-height:1;transition:transform .2s var(--igs-rp-ease);}
#igs-record-panel .igs-record-relationship-node:hover .igs-record-node-avatar{transform:scale(1.05);}
#igs-record-panel .igs-record-relationship-node.is-current .igs-record-node-avatar{width:84px;height:84px;font-size:34px;background:var(--igs-rp-text);color:var(--igs-rp-on-ink);}
#igs-record-panel .igs-record-node-name{max-width:9em;overflow:hidden;text-overflow:ellipsis;}
#igs-record-panel .igs-record-relationship-label{position:absolute;transform:translate(-50%,-50%);max-width:30%;padding:3px 8px;border-radius:var(--igs-rp-radius-s);background:rgba(18,20,23,.82);color:var(--igs-rp-text-soft);font-size:12px;line-height:1.3;letter-spacing:.04em;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
#igs-record-panel .igs-record-people{grid-area:people;}
#igs-record-panel .igs-record-people-list{display:flex;flex-wrap:wrap;gap:2px;}
#igs-record-panel .igs-record-people-list button{display:flex;flex-direction:column;align-items:center;gap:6px;width:68px;min-height:44px;padding:8px 4px 6px;border:0;border-radius:var(--igs-rp-radius-l);background:transparent;transition:background .18s var(--igs-rp-ease);}
#igs-record-panel .igs-record-people-list button:hover{background:var(--igs-rp-fill);}
#igs-record-panel .igs-record-people-list button[aria-current="true"]{background:var(--igs-rp-fill-active);}
#igs-record-panel .igs-record-person-avatar{display:grid;place-items:center;width:42px;height:42px;border-radius:50%;background:var(--igs-rp-fill-hover);font-size:17px;font-weight:600;line-height:1;}
#igs-record-panel .igs-record-people-list button[aria-current="true"] .igs-record-person-avatar{background:var(--igs-rp-text);color:var(--igs-rp-on-ink);}
#igs-record-panel .igs-record-person-copy strong{display:block;max-width:60px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--igs-rp-text-soft);font-size:12px;font-weight:500;}
#igs-record-panel .igs-record-people-list button[aria-current="true"] strong{color:var(--igs-rp-text);}
#igs-record-panel .igs-record-relationship-detail{grid-area:detail;align-self:start;max-height:100%;padding:24px 24px;border-radius:var(--igs-rp-radius-l);background:var(--igs-rp-pane);box-shadow:var(--igs-rp-pane-edge);overflow:auto;}
#igs-record-panel .igs-record-person-head h2{margin:0;font-size:20px;font-weight:600;letter-spacing:.06em;line-height:1.4;overflow-wrap:anywhere;}
#igs-record-panel .igs-record-metrics{display:grid;gap:10px;margin:18px 0 4px;}
#igs-record-panel .igs-record-metric{display:grid;grid-template-columns:5.5em minmax(0,1fr) 3.2em;align-items:center;gap:12px;color:var(--igs-rp-text-faint);font-size:12px;}
#igs-record-panel .igs-record-metric i{display:block;height:4px;border-radius:2px;background:var(--igs-rp-fill-hover);overflow:hidden;}
#igs-record-panel .igs-record-metric b{display:block;height:100%;border-radius:inherit;background:var(--igs-rp-warm);}
#igs-record-panel .igs-record-metric em{font-style:normal;font-weight:600;text-align:right;color:var(--igs-rp-text);font-variant-numeric:tabular-nums;}
#igs-record-panel .igs-record-stage{display:inline-flex;align-items:center;gap:10px;width:fit-content;margin:0;padding:4px 10px;border-radius:var(--igs-rp-radius-s);background:var(--igs-rp-fill-hover);font-size:12px;}
#igs-record-panel .igs-record-stage span{color:var(--igs-rp-text-faint);}
#igs-record-panel .igs-record-stage strong{font-weight:600;font-size:13px;}
#igs-record-panel .igs-record-relationship-section{padding-top:14px;}
#igs-record-panel .igs-record-relationship-description{margin:0;font-family:var(--igs-rp-font-body);font-size:15px;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.85;}
#igs-record-panel .igs-record-relationship-links{display:flex;flex-wrap:wrap;gap:6px;list-style:none;margin:16px 0 0;padding:0;}
#igs-record-panel .igs-record-relationship-links li{padding:4px 10px;border-radius:var(--igs-rp-radius-s);background:var(--igs-rp-fill-hover);font-size:13px;}
#igs-record-panel .igs-record-relationship-links span{margin-right:8px;color:var(--igs-rp-text-faint);font-size:12px;}
#igs-record-panel .igs-record-relationship-note,#igs-record-panel .igs-record-relationship-empty{color:var(--igs-rp-text-faint);line-height:1.7;}

#igs-record-panel .igs-record-table-scroll{overflow:auto;max-width:100%;}
#igs-record-panel table{border-collapse:collapse;width:100%;text-align:left;}
#igs-record-panel caption{text-align:left;margin-bottom:8px;font-weight:600;}
#igs-record-panel th,#igs-record-panel td{padding:8px;border-bottom:1px solid var(--igs-rp-line-soft);white-space:pre-wrap;overflow-wrap:anywhere;min-width:80px;}
#igs-record-panel th{color:var(--igs-rp-text-faint);font-size:12px;font-weight:500;}

#igs-record-panel.igs-rp-mid .igs-record-inventory{grid-template-columns:minmax(0,1fr) minmax(250px,38%);}
#igs-record-panel.igs-rp-mid .igs-record-relationships{grid-template-columns:minmax(0,1fr) minmax(280px,.9fr);}
#igs-record-panel.igs-rp-narrow .igs-record-scroll{padding:4px 14px 20px;}
#igs-record-panel.igs-rp-narrow .igs-record-inventory{display:flex;flex-direction:column;align-items:stretch;gap:16px;}
#igs-record-panel.igs-rp-narrow .igs-record-inventory-tools{flex-direction:column;flex-wrap:nowrap;align-items:stretch;}
#igs-record-panel.igs-rp-narrow .igs-record-groups{flex-wrap:nowrap;overflow-x:auto;margin:0 -14px;padding:0 14px;}
#igs-record-panel.igs-rp-narrow .igs-record-inventory-actions{margin-left:0;}
#igs-record-panel.igs-rp-narrow .igs-rp-search{flex:1;}
#igs-record-panel.igs-rp-narrow .igs-record-slots{grid-template-columns:repeat(auto-fill,minmax(76px,1fr));gap:8px;}
#igs-record-panel.igs-rp-narrow .igs-record-slots button{padding:8px 6px 24px;border-radius:var(--igs-rp-radius-m);}
#igs-record-panel.igs-rp-narrow .igs-record-slot-icon{width:44%;}
#igs-record-panel.igs-rp-narrow .igs-record-slot-name{left:7px;right:22px;bottom:6px;font-size:11px;-webkit-line-clamp:1;}
#igs-record-panel.igs-rp-narrow .igs-record-slot-quantity{right:7px;bottom:6px;font-size:10px;}
#igs-record-panel.igs-rp-narrow .igs-record-item-pane{position:static;}
#igs-record-panel.igs-rp-narrow .igs-record-item-detail{display:grid;grid-template-columns:56px minmax(0,1fr);column-gap:14px;padding:18px 16px;}
#igs-record-panel.igs-rp-narrow .igs-record-item-detail-icon{width:56px;height:56px;margin:0;border-radius:var(--igs-rp-radius-m);}
#igs-record-panel.igs-rp-narrow .igs-record-item-detail-icon svg{width:32px;height:32px;}
#igs-record-panel.igs-rp-narrow .igs-record-item-detail h3{font-size:18px;}
#igs-record-panel.igs-rp-narrow .igs-record-item-empty{min-height:96px;padding:18px;}
#igs-record-panel.igs-rp-narrow .igs-record-diary{display:flex;flex-direction:column;gap:14px;height:auto;min-height:100%;}
#igs-record-panel.igs-rp-narrow .igs-record-diary-side{overflow:visible;padding-bottom:0;}
#igs-record-panel.igs-rp-narrow .igs-record-bookshelf{flex-direction:row;overflow-x:auto;margin:0 -14px;padding:0 14px;gap:4px;}
#igs-record-panel.igs-rp-narrow .igs-record-book{flex:0 0 auto;width:auto;padding:6px 14px 6px 6px;}
#igs-record-panel.igs-rp-narrow .igs-record-book-avatar{width:30px;height:30px;font-size:13px;}
#igs-record-panel.igs-rp-narrow .igs-record-book>.igs-rp-dot{top:8px;right:8px;margin:0;}
#igs-record-panel.igs-rp-narrow .igs-record-chapters,#igs-record-panel.igs-rp-narrow .igs-record-timeline{max-height:30vh;overflow:auto;}
#igs-record-panel.igs-rp-narrow .igs-record-diary-detail{flex:1 0 auto;min-height:320px;overflow:visible;padding:22px 18px 12px;}
#igs-record-panel.igs-rp-narrow .igs-record-diary-detail h3{font-size:calc(var(--igs-rp-diary-size) + 4px);margin:10px 0 16px;}
#igs-record-panel.igs-rp-narrow .igs-record-diary-detail .igs-record-body{line-height:1.9;}
#igs-record-panel.igs-rp-narrow .igs-record-diary-empty{min-height:160px;}
#igs-record-panel.igs-rp-narrow .igs-record-relationships{display:flex;flex-direction:column;gap:14px;min-height:0;}
#igs-record-panel.igs-rp-narrow .igs-record-relationship-stage{min-height:260px;}
#igs-record-panel.igs-rp-narrow .igs-record-relationship-graph{width:min(100%,340px);aspect-ratio:1.05;min-height:260px;}
#igs-record-panel.igs-rp-narrow .igs-record-people-list{flex-wrap:nowrap;overflow-x:auto;margin:0 -14px;padding:0 14px;}
#igs-record-panel.igs-rp-narrow .igs-record-people-list button{flex:0 0 64px;width:64px;}
#igs-record-panel.igs-rp-narrow .igs-record-person-avatar{width:38px;height:38px;font-size:16px;}
#igs-record-panel.igs-rp-narrow .igs-record-relationship-node{min-width:60px;gap:5px;font-size:12px;}
#igs-record-panel.igs-rp-narrow .igs-record-node-avatar{width:46px;height:46px;font-size:19px;}
#igs-record-panel.igs-rp-narrow .igs-record-relationship-node.is-current .igs-record-node-avatar{width:68px;height:68px;font-size:28px;}
#igs-record-panel.igs-rp-narrow .igs-record-node-name{max-width:6em;}
#igs-record-panel.igs-rp-narrow .igs-record-relationship-label{max-width:26%;padding:2px 6px;font-size:11px;}
#igs-record-panel.igs-rp-narrow .igs-record-relationship-detail{padding:18px 16px;}
#igs-record-panel.igs-rp-narrow .igs-record-person-head h2{font-size:18px;}
#igs-record-panel.igs-rp-short .igs-record-relationship-graph{min-height:200px;}
`;
