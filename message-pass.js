const asset = new URL('./message-pass.png', import.meta.url).href;
let queued = false;
let reconcileAll = false;
const dirtyMessages = new Set();
function node(tag, cls, text) {
    const n = document.createElement(tag); n.className = cls;
    if (text) n.textContent = text;
    return n;
}
function updatePasses() {
    queued = false;
    const messages=reconcileAll?document.querySelectorAll('#chat > .mes'):[...dirtyMessages];
    reconcileAll=false;dirtyMessages.clear();
    for (const mes of messages) {
        if(!mes.isConnected)continue;
        const block = mes.querySelector('.mes_block');
        const avatar = mes.querySelector('.mesAvatarWrapper .avatar img');
        if (!block || !avatar) continue;
        const name = mes.querySelector('.name_text')?.textContent || mes.getAttribute('ch_name') || '';
        const rawDate = mes.querySelector('.timestamp')?.textContent?.trim() || '';
        const date = rawDate.replace(/(\d{4})年(\d+)月(\d+)日\s*/, '$1/$2/$3  ');
        const tokens = mes.querySelector('.tokenCounterDisplay')?.textContent?.trim().replace(/t$/,'') || '—';
        const timer = mes.querySelector('.mes_timer')?.textContent?.trim() || '—';
        const id = mes.getAttribute('mesid') || '0';
        const src = avatar.getAttribute('src') || '';
        const signature = JSON.stringify([name,date,tokens,timer,id,src]);
        let identity = block.querySelector(':scope > .moi-message-identity');
        if (!identity) {
            identity = node('div','moi-message-identity');
            block.prepend(identity);
        }
        const header = block.querySelector('.ch_name');
        if (header && header.parentElement !== identity) identity.append(header);
        let badge = identity.querySelector(':scope > .moi-message-pass');
        if (badge?.dataset.signature === signature) continue;
        if (!badge) { badge = node('section','moi-message-pass'); identity.prepend(badge); }
        badge.dataset.signature = signature;
        badge.setAttribute('aria-label', name + '的消息证件牌');
        const frame = node('img','moi-message-pass-frame'); frame.src=asset;frame.alt='';frame.decoding='async';frame.loading='lazy';
        const title = node('div','moi-message-pass-name',name); title.title=name;
        const portrait = node('img','moi-message-pass-photo');portrait.src=src;portrait.alt=name;portrait.decoding='async';portrait.loading='lazy';
        const meta = node('div','moi-message-pass-meta');
        meta.append(node('time','moi-message-pass-date', date || '时间未记录'),
            node('div','moi-message-pass-tokens','Tokens  ' + tokens),
            node('div','moi-message-pass-duration','Time  ' + timer + '  ·  #' + id));
        badge.replaceChildren(frame,title,portrait,meta);
        mes.classList.add('moi-has-message-pass');
    }
}
function schedule(message) {
    if(message instanceof Element)dirtyMessages.add(message);else reconcileAll=true;
    if (queued) return;
    queued=true; requestAnimationFrame(updatePasses);
}
export function installMessagePasses() {
    const chat=document.getElementById('chat');
    if (!chat) return;
    new MutationObserver(records => {
        for(const record of records) {
            const target=record.target.nodeType===1?record.target:record.target.parentElement;
            if(target?.closest('.moi-message-pass,.mes_text'))continue;
            if(target===chat) {
                for(const added of record.addedNodes)if(added.nodeType===1&&added.matches('.mes'))schedule(added);
            } else {
                const message=target?.closest('#chat > .mes');
                if(message&&(target.closest('.mesAvatarWrapper,.ch_name')||record.type==='attributes'))schedule(message);
            }
        }
    }).observe(chat,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['ch_name','timestamp','src','mesid']});
    const {eventSource,eventTypes}=SillyTavern.getContext();
    for (const name of ['CHAT_CHANGED','MESSAGE_RECEIVED','MESSAGE_UPDATED','CHARACTER_MESSAGE_RENDERED','USER_MESSAGE_RENDERED','MESSAGE_SWIPED']) {
        if (eventTypes[name]) eventSource.on(eventTypes[name],()=>schedule());
    }
    schedule();
}
