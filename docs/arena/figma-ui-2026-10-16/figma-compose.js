// STATE and ICONS are injected by the local runner; Figma Plugin API only.
const page=await figma.getNodeByIdAsync(STATE.foundation.pageId);await figma.setCurrentPageAsync(page);
const board=await figma.getNodeByIdAsync(STATE.foundation.boardId),kit=await figma.getNodeByIdAsync(STATE.foundation.kitId);
if(board.children.some(n=>n.name==='Mobile screens')) return {skipped:true,existing:board.children.map(n=>({id:n.id,name:n.name}))};
await Promise.all(['Regular','Medium','Bold'].map(style=>figma.loadFontAsync({family:'Noto Sans KR',style})));
const vars=Object.fromEntries(await Promise.all(Object.entries(STATE.foundation.variables).map(async([k,id])=>[k,await figma.variables.getVariableByIdAsync(id)])));
const created=[];
function paint(key){return [figma.variables.setBoundVariableForPaint({type:'SOLID',color:{r:0,g:0,b:0}},'color',vars[key])];}
function track(n){created.push(n);return n;}
function frame(name,parent,dir='VERTICAL',width=342,pad=0,gap=8,bg=null){const n=track(figma.createAutoLayout(dir));n.name=name;n.resize(width,100);n.layoutSizingHorizontal='FIXED';n.layoutSizingVertical='HUG';n.itemSpacing=gap;n.paddingLeft=n.paddingRight=n.paddingTop=n.paddingBottom=pad;n.fills=bg?paint(bg):[];if(vars['space/'+gap])n.setBoundVariable('itemSpacing',vars['space/'+gap]);if(vars['space/'+pad])for(const k of ['paddingLeft','paddingRight','paddingTop','paddingBottom'])n.setBoundVariable(k,vars['space/'+pad]);parent.appendChild(n);return n;}
function label(parent,value,style='Body',color='ink',width=null){const n=track(figma.createText());n.fontName={family:'Noto Sans KR',style:'Regular'};n.characters=value;n.textStyleId=STATE.foundation.styles[style];n.fills=paint(color);parent.appendChild(n);if(width){n.textAutoResize='HEIGHT';n.resize(width,n.height);}return n;}
function rounded(n,r=16){n.setBoundVariable('cornerRadius',vars['radius/'+r]);return n;}
function border(n){n.strokes=paint('line');n.strokeWeight=1;return n;}
const iconShelf=frame('Icons / Lucide',kit,'HORIZONTAL',840,8,12);
const iconComponents={};
for(const [name,svg] of Object.entries(ICONS)){
 const c=track(figma.createComponent());c.name='Icon / '+name;c.resize(20,20);c.fills=[];
 const graphic=track(figma.createNodeFromSvg(svg.replaceAll('currentColor','#286b50')));graphic.name=name;c.appendChild(graphic);iconShelf.appendChild(c);iconComponents[name]=c;
}
function icon(parent,name,color='brand',size=20){const n=track(iconComponents[name].createInstance());n.resize(size,size);parent.appendChild(n);for(const d of n.findAll(()=>true)){if(d.type==='FRAME')d.fills=[];if(d.type==='VECTOR'&&Array.isArray(d.strokes)&&d.strokes.some(s=>s.visible!==false))d.strokes=paint(color);if(d.type==='VECTOR'&&Array.isArray(d.fills)&&d.fills.some(f=>f.type==='SOLID'&&f.visible!==false))d.fills=paint(color);}return n;}
function compText(c,parent,name,value,style='Label',color='ink',width=null){const n=label(parent,value,style,color,width);const key=c.addComponentProperty(name,'TEXT',value);n.componentPropertyReferences={characters:key};return key;}
const chips=[];
for(const state of ['on','off']){
 const c=track(figma.createComponent());c.name='State='+state;c.layoutMode='VERTICAL';c.primaryAxisAlignItems='CENTER';c.counterAxisAlignItems='CENTER';c.resize(78,48);c.primaryAxisSizingMode=c.counterAxisSizingMode='FIXED';c.itemSpacing=2;c.fills=paint(state==='on'?'soft':'surface');rounded(c,12);border(c);
 const r=frame('Icon and status',c,'HORIZONTAL',42,0,8);r.primaryAxisAlignItems='CENTER';r.counterAxisAlignItems='CENTER';const ic=icon(r,'Video');const ip=c.addComponentProperty('Icon','INSTANCE_SWAP',iconComponents.Video.id);ic.componentPropertyReferences={mainComponent:ip};if(state==='on')icon(r,'Check','brand',12);
 compText(c,c,'Label','CCTV','Caption',state==='on'?'ink':'muted');chips.push(c);
}
const chipSet=track(figma.combineAsVariants(chips,kit));chipSet.name='TourSafe / Layer';chipSet.layoutMode='HORIZONTAL';chipSet.itemSpacing=12;chipSet.paddingTop=chipSet.paddingBottom=12;chipSet.primaryAxisSizingMode=chipSet.counterAxisSizingMode='AUTO';
const rowComp=track(figma.createComponent());rowComp.name='TourSafe / Facility row';rowComp.layoutMode='HORIZONTAL';rowComp.counterAxisAlignItems='CENTER';rowComp.primaryAxisSizingMode='FIXED';rowComp.counterAxisSizingMode='AUTO';rowComp.resize(342,80);rowComp.paddingLeft=rowComp.paddingRight=12;rowComp.paddingTop=rowComp.paddingBottom=16;rowComp.itemSpacing=12;rowComp.fills=paint('surface');rounded(rowComp,12);border(rowComp);kit.appendChild(rowComp);
const rc=frame('Place information',rowComp,'VERTICAL',278,0,4);compText(rowComp,rc,'Name','성수역 공중화장실','Label','ink',278);compText(rowComp,rc,'Distance','직선 180m · 화장실','Caption','muted',278);icon(rowComp,'ChevronRight');
const actionSet=await figma.getNodeByIdAsync(STATE.foundation.actionSetId);
function propName(owner,name){return Object.keys(owner.componentPropertyDefinitions).find(k=>k===name||k.startsWith(name+'#'));}
function action(parent,value,width=342,tone='primary'){const c=actionSet.children.find(n=>n.type==='COMPONENT'&&n.name==='Tone='+tone);const n=track(c.createInstance());parent.appendChild(n);n.setProperties({[propName(actionSet,'Label')]:value});n.resize(width,48);return n;}
function chip(parent,text,iconName,on=true,width=78){const c=chips[on?0:1];const n=track(c.createInstance());parent.appendChild(n);n.setProperties({[propName(chipSet,'Label')]:text,[propName(chipSet,'Icon')]:iconComponents[iconName].id});n.resize(width,48);return n;}
function row(parent,name,meta){const n=track(rowComp.createInstance());parent.appendChild(n);n.setProperties({[propName(rowComp,'Name')]:name,[propName(rowComp,'Distance')]:meta});return n;}
const screens=frame('Mobile screens',board,'HORIZONTAL',1712,0,24);screens.layoutSizingHorizontal='HUG';screens.counterAxisAlignItems='MIN';
function phone(name){const col=frame(name,screens,'VERTICAL',390,0,12);label(col,name,'Label');const p=track(figma.createFrame());p.name=name+' / 390 × 844';p.resize(390,844);rounded(p,24);p.fills=paint('surface');p.clipsContent=true;col.appendChild(p);return p;}
function absolute(n,x,y){n.x=x;n.y=y;return n;}
function mapBase(p){
 const svg='<svg width="390" height="768" viewBox="0 0 390 768" xmlns="http://www.w3.org/2000/svg"><rect width="390" height="768" fill="#1c332a"/><path d="M-30 610Q125 450 115 310T420 60" stroke="#24483c" stroke-width="68" fill="none"/><path d="M0 170L390 220M0 330L390 310M0 500L390 490M80 0L100 768M300 0L278 768M0 685L390 660" stroke="#4d6555" stroke-width="7" fill="none"/><path d="M0 250L390 267M0 404L390 398M180 0L190 768M350 0L340 768M0 580L390 570" stroke="#394e40" stroke-width="3" fill="none"/><path d="M20 550H165V650H20Z" fill="#2d4b35"/></svg>';
 const map=track(figma.createNodeFromSvg(svg));map.name='Map illustration / design-only';p.appendChild(map);absolute(map,0,0);
 const road=frame('Road label',p,'HORIZONTAL',80,0,4);label(road,'성수이로','Caption','mapText');absolute(road,295,282);
 const park=frame('Park label',p,'HORIZONTAL',80,0,4);label(park,'서울숲','Caption','mapText');absolute(park,55,595);
 for(const [type,x,y]of[['Video',66,260],['Shield',260,355],['Hospital',315,465],['Toilet',140,440],['Video',220,235]]){const pin=rounded(frame('Pin / '+type,p,'HORIZONTAL',42,0,0,type==='Video'?'cctv':type==='Shield'?'police':type==='Hospital'?'medical':'toilet'),12);pin.resize(42,44);pin.layoutSizingVertical='FIXED';pin.primaryAxisAlignItems='CENTER';pin.counterAxisAlignItems='CENTER';icon(pin,type,'mapText');absolute(pin,x,y);}
 const dot=track(figma.createEllipse());dot.name='조회 위치';dot.resize(20,20);dot.fills=[{type:'SOLID',color:{r:.55,g:.87,b:.70}}];dot.strokes=paint('surface');dot.strokeWeight=3;p.appendChild(dot);absolute(dot,184,370);
 const where=rounded(frame('Origin label',p,'HORIZONTAL',76,4,4,'brand'),12);label(where,'조회 위치','Caption','surface');absolute(where,156,400);
}
function nav(p){const n=frame('App navigation',p,'HORIZONTAL',390,12,0,'surface');n.resize(390,76);n.layoutSizingVertical='FIXED';n.counterAxisAlignItems='CENTER';absolute(n,0,768);for(const [text,i]of[['안심 지도','Map'],['여행지','Compass'],['도움','LifeBuoy'],['저장','Heart']]){const b=rounded(frame('Tab / '+text,n,'VERTICAL',91,4,4,text==='도움'?'soft':null),12);b.counterAxisAlignItems='CENTER';icon(b,i,text==='여행지'||text==='저장'?'muted':'brand');label(b,text,'Caption',text==='여행지'||text==='저장'?'muted':'brand');}}
function search(p){const n=rounded(frame('조회 기준과 장소 검색',p,'HORIZONTAL',302,12,8,'surface'),16);n.counterAxisAlignItems='CENTER';icon(n,'MapPin');const texts=frame('Location labels',n,'VERTICAL',222,0,0);label(texts,'TourSafe · 선택한 장소 기준','Caption','muted');label(texts,'성수역 주변','Label');icon(n,'Search');absolute(n,12,16);const settings=rounded(frame('지도 설정',p,'HORIZONTAL',48,12,0,'surface'),16);settings.resize(48,48);settings.layoutSizingVertical='FIXED';icon(settings,'SlidersHorizontal');absolute(settings,330,26);}
function gps(p,y=570){const n=rounded(frame('내 위치로 조회',p,'VERTICAL',56,8,4,'surface'),16);n.counterAxisAlignItems='CENTER';icon(n,'LocateFixed');label(n,'내 위치','Caption');absolute(n,322,y);}
function dock(p){const n=rounded(frame('시설판 / 표시와 찾기',p,'VERTICAL',366,12,8,'surface'),16);const top=frame('Dock heading',n,'HORIZONTAL',342,0,8);top.counterAxisAlignItems='CENTER';const t=label(top,'지도에 표시','Caption','muted');t.resize(176,20);t.textAutoResize='HEIGHT';action(top,'시설 목록  ↗',158,'secondary');const r=frame('Four independent layers',n,'HORIZONTAL',342,0,8);chip(r,'CCTV','Video');chip(r,'경찰','Shield');chip(r,'의료','Hospital');chip(r,'화장실','Toilet',false);absolute(n,12,640);}
const p1=phone('01 · 지도에 집중');mapBase(p1);search(p1);gps(p1,566);dock(p1);nav(p1);
const p2=phone('02 · 시설 목록');mapBase(p2);search(p2);const sheet=rounded(frame('주변 시설 목록',p2,'VERTICAL',390,24,12,'surface'),24);absolute(sheet,0,80);
const sh=frame('Sheet heading',sheet,'HORIZONTAL',342,0,12);label(sh,'주변 시설','Title').resize(266,30);icon(sh,'LifeBuoy');icon(sh,'X');label(sheet,'성수역 주변 기준','Caption','muted');
const cats=[['의료','Hospital'],['경찰','Shield'],['안내소','Info'],['화장실','Toilet'],['CCTV','Video'],['여행지','Trees']];for(let i=0;i<2;i++){const r=frame('Category choices '+i,sheet,'HORIZONTAL',342,0,12);for(const [name,ic]of cats.slice(i*3,i*3+3))chip(r,name,ic,name==='화장실',106);}
label(sheet,'화장실','Title');label(sheet,'직선거리 기준 · 주소 기준 위치예요.','Caption','muted');row(sheet,'성수역 공중화장실','직선 180m · 전화번호 미제공');row(sheet,'성수근린공원 화장실','직선 360m · 전화번호 제공');action(sheet,'다른 화장실 더 보기',342,'secondary');label(sheet,'등록된 자료예요. 개방 여부는 확인해 주세요.','Caption','muted',342);nav(p2);
const p3=phone('03 · 다음 행동이 보이는 카드');mapBase(p3);search(p3);gps(p3,430);const card=rounded(frame('선택 카드 / 시설판 대신 표시',p3,'VERTICAL',366,16,12,'surface'),16);absolute(card,12,506);const ct=frame('Back and close',card,'HORIZONTAL',334,0,8);icon(ct,'ChevronLeft');label(ct,'목록으로','Caption','brand').resize(258,20);icon(ct,'X');label(card,'화장실 · 직선 180m','Caption','muted');label(card,'성수역 공중화장실','Title','ink',334);label(card,'주소 기준 위치 · 실제 입구와 다를 수 있어요.','Caption','muted',334);action(card,'길찾기 열기  ↗',334);label(card,'주소·개방시간·자료 출처   +','Caption','brand');nav(p3);
const p4=phone('04 · 급할 때 바로 연락');const help=frame('도움 · 연락하기',p4,'VERTICAL',390,24,20,'surface');const hh=frame('Help heading',help,'HORIZONTAL',342,0,12);label(hh,'도움 · 연락하기','Label').resize(310,22);icon(hh,'X');label(help,'어디로 연락할까요?','Title');label(help,'위치 확인 없이도 전화 앱을 열 수 있어요.','Body','muted',342);const cr=frame('Emergency numbers',help,'HORIZONTAL',342,0,12);
for(const [number,kind,ic,tone]of[['112','위협·범죄','Shield','brand'],['119','화재·구급','Siren','alert']]){const c=border(rounded(frame(kind,cr,'VERTICAL',165,16,8,'canvas'),16));icon(c,ic,tone,24);label(c,kind,'Label',tone);const num=label(c,number,'Title',tone);num.fontSize=36;num.lineHeight={unit:'PIXELS',value:44};label(c,'전화 앱 열기 ↗','Caption',tone);}
const tr=border(rounded(frame('여행 안내·통역',help,'HORIZONTAL',342,16,12,'surface'),16));icon(tr,'Languages');const tt=frame('1330 info',tr,'VERTICAL',202,0,4);label(tt,'여행 안내·통역','Label');label(tt,'전화 앱 열기 ↗','Caption','muted');label(tr,'1330','Label');
label(help,'앱이 열리지 않으면 번호를 직접 입력해 주세요.','Caption','muted',342);
for(const [ic,text,note]of[['MapPin','내 위치 확인·전달','선택  +'],['Smartphone','흔들어서 도움 열기','꺼짐  +'],['Info','신고할 때 무엇을 말하나요?','+']]){const r=frame(text,help,'HORIZONTAL',342,12,8,'canvas');rounded(r,12);r.counterAxisAlignItems='CENTER';icon(r,ic);label(r,text,'Label','ink',230);label(r,note,'Caption','muted');}
label(help,'전화와 신고는 직접 선택해요.\n확인한 위치는 자동 전송되지 않아요.','Caption','muted',342);
const footer=label(board,'우승안: 간결한 지도 + 명확한 표시/목록 구분 + 선택 상태·포커스 복원. 실제 웹앱의 지도·시설 API는 유지합니다.','Body','muted',1640);
const phones=[p1,p2,p3,p4];
const all=[...created,...created.flatMap(n=>'findAll'in n?n.findAll(()=>true):[])];
const texts=board.findAllWithCriteria({types:['TEXT']});
const fonts=[...new Set(texts.flatMap(t=>t.getStyledTextSegments(['fontName']).map(s=>s.fontName.family)))];
if(fonts.some(f=>f!=='Noto Sans KR'))throw new Error('Unexpected font family');
return {createdNodeIds:[...new Set(all.map(n=>n.id))],mutatedNodeIds:[board.id,kit.id],boardId:board.id,screenIds:phones.map(p=>({id:p.id,name:p.name,width:p.width,height:p.height})),componentIds:{layer:chipSet.id,row:rowComp.id},fontFamilies:fonts,counts:board.findAll(()=>true).reduce((out,n)=>(out[n.type]=(out[n.type]||0)+1,out),{}),imageNodes:board.findAll(n=>'fills'in n&&Array.isArray(n.fills)&&n.fills.some(p=>p.type==='IMAGE')).map(n=>({id:n.id,name:n.name})),editable:true};
