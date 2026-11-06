export function songKey(name) { return name.replace(/\.[^.]+$/,'').trim().toLocaleLowerCase(); }
export function parseLrc(text) {
    let offset=0; const found=text.match(/\[offset:([+-]?\d+)\]/i); if(found)offset=Number(found[1])/1000;
    const lines=[];
    for(const line of text.split(/\r?\n/)) {
        const stamps=[...line.matchAll(/\[(\d+):(\d{1,2}(?:\.\d+)?)\]/g)];
        const words=line.replace(/\[[^\]]*\]/g,'').trim();
        for(const stamp of stamps) lines.push({time:Math.max(0,Number(stamp[1])*60+Number(stamp[2])+offset),text:words});
    }
    return lines.sort((a,b)=>a.time-b.time);
}
export function lyricAt(lines,time) {
    let result=''; for(const line of lines) { if(line.time>time)break;result=line.text; } return result;
}
export function clock(seconds) {
    if(!Number.isFinite(seconds)||seconds<0)return '0:00';
    return Math.floor(seconds/60)+':'+String(Math.floor(seconds%60)).padStart(2,'0');
}
export function musicLink(text) {
    const match=text.match(/https?:\/\/[^\s<>"'\u3000]+/i);
    if(!match)throw new Error('请粘贴歌曲分享文字或音频链接');
    const url=new URL(match[0].replace(/[)）。，]+$/,''));
    if(url.username||url.password)throw new Error('请使用不含账号密码的链接');
    const host=url.hostname.toLowerCase();
    const title=text.match(/《([^》]+)》/)?.[1]?.replace(/\s*\(.*/, '').trim();
    if(host==='163cn.tv')return {kind:'short',url:url.href,name:title};
    if(host==='music.163.com'||host==='y.music.163.com') {
        const id=url.searchParams.get('id')||url.hash.match(/[?&]id=(\d+)/)?.[1];
        if(!id||!/^\d+$/.test(id)||!/(?:^|\/)song(?:[/?]|$)/.test(url.pathname+url.hash.replace(/^#/,'')))throw new Error('请使用网易云单曲链接');
        return {kind:'audio',url:'https://music.163.com/song/media/outer/url?id='+id+'.mp3',name:title||'网易云歌曲 '+id,source:url.href};
    }
    if(/(?:^|\.)(?:qq\.com|kugou\.com|kuwo\.cn|spotify\.com|163\.com)$/.test(host))throw new Error('这是音乐网页，请改用可直接播放的音频链接，或导入本机音乐');
    let file='';try{file=decodeURIComponent(url.pathname.split('/').pop()||'');}catch{}
    return {kind:'audio',url:url.href,name:title||file.replace(/\.[^.]+$/,'')||'在线音乐',source:url.href};
}
