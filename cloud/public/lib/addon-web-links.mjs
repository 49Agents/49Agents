/**
 * Copyright (c) 2014-2024 The xterm.js authors. All rights reserved.
 * @license MIT
 *
 * Copyright (c) 2012-2013, Christopher Jeffrey (MIT License)
 * @license MIT
 *
 * Originally forked from (with the author's permission):
 *   Fabrice Bellard's javascript vt100 for jslinux:
 *   http://bellard.org/jslinux/
 *   Copyright (c) 2011 Fabrice Bellard
 */
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var v=class{constructor(e,t,n,o={}){this._terminal=e;this._regex=t;this._handler=n;this._options=o}provideLinks(e,t){let n=g.computeLink(e,this._regex,this._terminal,this._handler);t(this._addCallbacks(n))}_addCallbacks(e){return e.map(t=>(t.leave=this._options.leave,t.hover=(n,o)=>{if(this._options.hover){let{range:p}=t;this._options.hover(n,o,p)}},t))}};function k(l){try{let e=new URL(l),t=e.password&&e.username?`${e.protocol}//${e.username}:${e.password}@${e.host}`:e.username?`${e.protocol}//${e.username}@${e.host}`:`${e.protocol}//${e.host}`;return l.toLocaleLowerCase().startsWith(t.toLocaleLowerCase())}catch{return!1}}var g=class l{static computeLink(e,t,n,o){let p=new RegExp(t.source,(t.flags||"")+"g"),[i,r]=l._getWindowedLineStrings(e-1,n),s=i.join(""),a,d=[];for(;a=p.exec(s);){let u=a[0];if(!k(u))continue;let[c,h]=l._mapStrIdx(n,r,0,a.index),[m,f]=l._mapStrIdx(n,c,h,u.length);if(c===-1||h===-1||m===-1||f===-1)continue;let b={start:{x:h+1,y:c+1},end:{x:f,y:m+1}};d.push({range:b,text:u,activate:o})}return d}static _getWindowedLineStrings(e,t){let n,o=e,p=e,i=0,r="",s=[];if(n=t.buffer.active.getLine(e)){let a=n.translateToString(!0);if(n.isWrapped&&a[0]!==" "){for(i=0;(n=t.buffer.active.getLine(--o))&&i<2048&&(r=n.translateToString(!0),i+=r.length,s.push(r),!(!n.isWrapped||r.indexOf(" ")!==-1)););s.reverse()}for(s.push(a),i=0;(n=t.buffer.active.getLine(++p))&&n.isWrapped&&i<2048&&(r=n.translateToString(!0),i+=r.length,s.push(r),r.indexOf(" ")===-1););}return[s,o]}static _mapStrIdx(e,t,n,o){let p=e.buffer.active,i=p.getNullCell(),r=n;for(;o;){let s=p.getLine(t);if(!s)return[-1,-1];for(let a=r;a<s.length;++a){s.getCell(a,i);let d=i.getChars();if(i.getWidth()&&(o-=d.length||1,a===s.length-1&&d==="")){let c=p.getLine(t+1);c&&c.isWrapped&&(c.getCell(0,i),i.getWidth()===2&&(o+=1))}if(o<0)return[t,a]}t++,r=0}return[t,r]}};var _=/(https?|HTTPS?):[/]{2}[^\s"'!*(){}|\\\^<>`]*[^\s"':,.!?{}|\\\^~\[\]`()<>]/;function w(l,e){let t=window.open();if(t){try{t.opener=null}catch{}t.location.href=e}else console.warn("Opening link blocked as opener could not be cleared")}var L=class{constructor(e=w,t={}){this._handler=e;this._options=t}activate(e){this._terminal=e;let t=this._options,n=t.urlRegex||_;this._linkProvider=this._terminal.registerLinkProvider(new v(this._terminal,n,this._handler,t))}dispose(){this._linkProvider?.dispose()}};export{L as WebLinksAddon};
//# sourceMappingURL=addon-web-links.mjs.map
