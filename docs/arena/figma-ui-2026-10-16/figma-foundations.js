// Run through Figma use_figma. Helper functions are prepended from the installed skill.
const createdNodeIds = [];
const page = await figma.getNodeByIdAsync('0:1');
await figma.setCurrentPageAsync(page);
page.name = 'TourSafe · 모바일 사용성';
if (page.children.length) return { existing: page.children.map(n=>({id:n.id,name:n.name})), skipped:true };
await Promise.all(['Regular','Medium','Bold'].map(style => figma.loadFontAsync({family:'Noto Sans KR',style})));
const {collection:primitive, modeIds:pm}=await createVariableCollection('TourSafe / Primitives',['Value']);
const {collection:semantic, modeIds:sm}=await createVariableCollection('TourSafe / UI',['Default']);
const palette={surface:'#ffffff',canvas:'#f5f7f2',ink:'#183e30',muted:'#607466',brand:'#286b50',soft:'#e8f0e4',line:'#dce5d9',map:'#1c332a',mapRoad:'#4d6555',mapText:'#e4eedf',police:'#344b5c',medical:'#574650',toilet:'#355f61',cctv:'#3f604b',alert:'#914c38'};
const primitiveMap=(await createSemanticTokens(primitive,pm,Object.entries(palette).map(([name,value])=>({name:'color/'+name,type:'COLOR',values:{Value:value},scopes:[],codeSyntax:{WEB:'var(--ts-ui-'+name+')'}})))).variables;
const semanticMap=(await createSemanticTokens(semantic,sm,Object.entries(palette).map(([name])=>({name,type:'COLOR',values:{Default:{type:'VARIABLE_ALIAS',id:primitiveMap['color/'+name].id}},scopes:['FRAME_FILL','SHAPE_FILL','TEXT_FILL','STROKE_COLOR'],codeSyntax:{WEB:'var(--ts-ui-'+name+')'}})))).variables;
const dims=(await createSemanticTokens(semantic,sm,[...[4,8,12,16,20,24].map(n=>({name:'space/'+n,type:'FLOAT',values:{Default:n},scopes:['GAP'],codeSyntax:{WEB:'var(--ts-space-'+n+')'}})),...[12,16,24].map(n=>({name:'radius/'+n,type:'FLOAT',values:{Default:n},scopes:['CORNER_RADIUS'],codeSyntax:{WEB:'var(--ts-radius-'+n+')'}}))])).variables;
const styles={};
for(const [name,size,style,line] of [['Title',20,'Bold',30],['Body',14,'Regular',22],['Label',14,'Medium',22],['Caption',12,'Regular',18]]){
 const s=figma.createTextStyle(); s.name='TourSafe/'+name;s.fontName={family:'Noto Sans KR',style};s.fontSize=size;s.lineHeight={unit:'PIXELS',value:line};styles[name]=s;
}
function paint(v){return [figma.variables.setBoundVariableForPaint({type:'SOLID',color:{r:0,g:0,b:0}},'color',semanticMap[v])];}
const kit=figma.createAutoLayout('VERTICAL');kit.name='Components · TourSafe';kit.x=200;kit.y=1150;kit.resize(900,100);kit.layoutSizingVertical='HUG';kit.itemSpacing=16;kit.paddingLeft=24;kit.paddingRight=24;kit.paddingTop=24;kit.paddingBottom=24;kit.fills=paint('canvas');createdNodeIds.push(kit.id);
const actionVariants=[];
for(const tone of ['primary','secondary']){
 const c=figma.createComponent();c.name='Tone='+tone;c.description='Reusable action; 48px touch target; Noto Sans KR.';c.layoutMode='HORIZONTAL';c.primaryAxisAlignItems='CENTER';c.counterAxisAlignItems='CENTER';c.resize(168,48);c.primaryAxisSizingMode='FIXED';c.counterAxisSizingMode='FIXED';c.setBoundVariable('cornerRadius',dims['radius/12']);c.setBoundVariable('paddingLeft',dims['space/16']);c.setBoundVariable('paddingRight',dims['space/16']);c.fills=paint(tone==='primary'?'brand':'soft');
 const t=figma.createText();t.fontName={family:'Noto Sans KR',style:'Medium'};t.characters='주변 시설 찾기';t.textStyleId=styles.Label.id;t.fills=paint(tone==='primary'?'surface':'ink');c.appendChild(t);const prop=c.addComponentProperty('Label','TEXT','주변 시설 찾기');t.componentPropertyReferences={characters:prop};actionVariants.push(c);createdNodeIds.push(c.id,t.id);
}
const set=figma.combineAsVariants(actionVariants,kit);set.name='TourSafe / Action';set.layoutMode='HORIZONTAL';set.itemSpacing=16;set.paddingTop=12;set.paddingBottom=12;set.paddingLeft=12;set.paddingRight=12;set.primaryAxisSizingMode='AUTO';set.counterAxisSizingMode='AUTO';createdNodeIds.push(set.id);
const board=figma.createAutoLayout('VERTICAL');board.name='TourSafe · 우승안 / 4가지 핵심 화면';board.x=200;board.y=80;board.resize(1776,100);board.layoutSizingVertical='HUG';board.itemSpacing=24;board.paddingTop=32;board.paddingBottom=32;board.paddingLeft=32;board.paddingRight=32;board.fills=paint('canvas');createdNodeIds.push(board.id);
const title=figma.createText();title.fontName={family:'Noto Sans KR',style:'Bold'};title.characters='TourSafe — 필요한 도움을 더 쉽게';title.fontSize=28;title.lineHeight={unit:'PIXELS',value:40};title.fills=paint('ink');board.appendChild(title);createdNodeIds.push(title.id);
const subtitle=figma.createText();subtitle.fontName={family:'Noto Sans KR',style:'Regular'};subtitle.characters='아레나 UI 검토 · 2026.10.16   /   배치 시안: 시설 이름·거리·지도는 설명용 예시';subtitle.fontSize=14;subtitle.fills=paint('muted');board.appendChild(subtitle);createdNodeIds.push(subtitle.id);
return {createdNodeIds,mutatedNodeIds:[page.id],pageId:page.id,boardId:board.id,kitId:kit.id,actionSetId:set.id,actionVariants:actionVariants.map(c=>({id:c.id,name:c.name,props:c.componentPropertyDefinitions})),collections:[primitive.id,semantic.id],variables:Object.fromEntries(Object.entries({...semanticMap,...dims}).map(([k,v])=>[k,v.id])),styles:Object.fromEntries(Object.entries(styles).map(([k,v])=>[k,v.id])),font:'Noto Sans KR',scope:'4 mobile views plus required reusable components'};
