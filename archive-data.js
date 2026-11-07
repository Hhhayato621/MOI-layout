const context = () => SillyTavern.getContext();
let snapshot;
let pending;
let epoch = 0;
export function archiveTime(archive) {
    const value = archive.last_mes ?? archive.last_message_date ?? archive.last_modified ?? archive.date_last_chat;
    if (typeof value === 'number') return value;
    if (value) {
        const moment = context().timestampToMoment(value);
        if (moment?.isValid()) return moment.valueOf();
    }
    const file = String(archive.file_name || '');
    const match = file.match(/(\d{4})-(\d\d)-(\d\d)@(\d\d)h(\d\d)m(\d\d)s/);
    return match ? new Date(+match[1],+match[2]-1,+match[3],+match[4],+match[5],+match[6]).getTime() : 0;
}
export function newestFirst(a,b) { return archiveTime(b)-archiveTime(a); }
export function invalidateArchives() { snapshot=undefined; pending=undefined; epoch++; }
export async function characterArchives({ fresh = false } = {}) {
    const ctx=context();
    const characters=ctx.characters.filter(c=>c.avatar && c.avatar!=='none');
    const key=characters.map(c=>c.avatar).join('|');
    if (!fresh && snapshot?.key===key && Date.now()-snapshot.time<15000) return snapshot.rows;
    if (pending?.key===key) return pending.promise;
    const version=epoch;
    const promise=(async()=>{
        // Use the same newest-activity order as SillyTavern's recent chats,
        // not in-story timestamps or the date embedded in the archive name.
        const response=await fetch('/api/chats/recent',{method:'POST',headers:ctx.getRequestHeaders(),body:JSON.stringify({pinned:[]})});
        if(!response.ok) throw new Error('最近聊天列表读取失败');
        const recent=await response.json();
        if(!Array.isArray(recent)) throw new Error('最近聊天列表格式异常');
        const byAvatar=new Map(characters.map(character=>[character.avatar,{character,archives:[],latest:0}]));
        recent.forEach((archive,index)=>{
            const row=!archive.group && byAvatar.get(archive.avatar);
            if(!row || !archive.file_name) return;
            row.archives.push(archive);
            if(!row.latest) row.latest=recent.length-index;
        });
        const rows=characters.map(character=>byAvatar.get(character.avatar));
        if(version===epoch) snapshot={key,rows,time:Date.now()};
        return rows;
    })();
    pending={key,promise};
    try{return await promise;}finally{if(pending?.promise===promise)pending=undefined;}
}
export function conversationMessages(messages) {
    return messages.filter(m=>!m.is_system && typeof m.mes==='string' && m.mes.trim());
}
