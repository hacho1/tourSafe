/**
 * createVariableCollection
 *
 * Creates a new Figma variable collection with the specified name and modes.
 * If `modeNames` has more than one entry, the first mode is renamed from
 * Figma's default "Mode 1" to the first name, and additional modes are added.
 *
 * @param {string} name - The display name of the collection (e.g. "Color", "Spacing").
 * @param {string[]} modeNames - Ordered list of mode names (e.g. ["Light", "Dark"] or ["Value"]).
 * @returns {Promise<{
 *   collection: VariableCollection,
 *   modeIds: Record<string, string>
 * }>}
 *   `modeIds` maps each mode name to its modeId string.
 */
async function createVariableCollection(name, modeNames) {
  if (!modeNames || modeNames.length === 0) {
    throw new Error('createVariableCollection: modeNames must have at least one entry.')
  }

  // Create the collection — Figma always creates it with one mode named "Mode 1".
  const collection = figma.variables.createVariableCollection(name)

  // modeIds accumulator
  const modeIds = {}

  // Rename the default first mode
  const defaultMode = collection.modes[0]
  collection.renameMode(defaultMode.modeId, modeNames[0])
  modeIds[modeNames[0]] = defaultMode.modeId

  // Add additional modes
  for (let i = 1; i < modeNames.length; i++) {
    const newModeId = collection.addMode(modeNames[i])
    modeIds[modeNames[i]] = newModeId
  }

  return { collection, modeIds }
}
/**
 * createSemanticTokens
 *
 * Creates a batch of Figma variables in the given collection, one per entry in
 * `tokenMap`. Supports raw values, variable alias references, code syntax, and
 * scopes. Returns a map of token name → Variable for use in subsequent steps.
 *
 * @param {VariableCollection} collection - The target variable collection.
 * @param {Record<string, string>} modeIds - Map of {modeName: modeId} from createVariableCollection.
 * @param {Array<{
 *   name: string,
 *   type: 'COLOR' | 'FLOAT' | 'STRING' | 'BOOLEAN' | 'TIMING' | 'EASING',
 *   values: Record<string, string | number | boolean | MotionEasing | {type: 'VARIABLE_ALIAS', id: string}>,
 *   scopes?: VariableScope[],
 *   codeSyntax?: {WEB?: string, ANDROID?: string, iOS?: string}
 * }>} tokenMap - Ordered list of token definitions.
 *   - `name`: Variable name using slash hierarchy (e.g. "color/bg/primary").
 *   - `type`: Figma variable type.
 *   - `values`: Map of {modeName: value}. Values can be raw (hex string for COLOR,
 *     number for FLOAT) or alias objects {type: 'VARIABLE_ALIAS', id: variableId}.
 *     For COLOR, raw values are accepted as hex strings ("#rrggbb" or "#rrggbbaa")
 *     and converted to {r, g, b, a} automatically.
 *   - `scopes`: Array of VariableScope strings. Omit to use [] (hidden/primitive).
 *   - `codeSyntax`: Platform code syntax strings. Omit to skip.
 * @returns {Promise<{variables: Record<string, Variable>}>}
 *   `variables` maps each token name to its created Variable object.
 */
async function createSemanticTokens(collection, modeIds, tokenMap) {
  const variables = {}

  for (const token of tokenMap) {
    // Create the variable
    const variable = figma.variables.createVariable(token.name, collection, token.type)

    // Set values for each mode
    for (const [modeName, rawValue] of Object.entries(token.values)) {
      const modeId = modeIds[modeName]
      if (!modeId) {
        throw new Error(
          `createSemanticTokens: mode "${modeName}" not found in modeIds for token "${token.name}". ` +
            `Available modes: ${Object.keys(modeIds).join(', ')}`,
        )
      }

      let value = rawValue

      // Convert hex strings to Figma RGBA for COLOR type
      if (token.type === 'COLOR' && typeof rawValue === 'string' && rawValue.startsWith('#')) {
        value = hexToFigmaColor(rawValue)
      }

      variable.setValueForMode(modeId, value)
    }

    // Set scopes (default: empty array = hidden from property pickers / primitives)
    variable.scopes = token.scopes || []

    // Set code syntax per platform
    if (token.codeSyntax) {
      if (token.codeSyntax.WEB) {
        variable.setVariableCodeSyntax('WEB', token.codeSyntax.WEB)
      }
      if (token.codeSyntax.ANDROID) {
        variable.setVariableCodeSyntax('ANDROID', token.codeSyntax.ANDROID)
      }
      if (token.codeSyntax.iOS) {
        variable.setVariableCodeSyntax('iOS', token.codeSyntax.iOS)
      }
    }

    variables[token.name] = variable
  }

  return { variables }
}

/**
 * Converts a hex color string to a Figma RGBA object.
 * Supports "#rgb", "#rrggbb", and "#rrggbbaa".
 *
 * @param {string} hex
 * @returns {{ r: number, g: number, b: number, a: number }}
 */
function hexToFigmaColor(hex) {
  let h = hex.replace('#', '')

  // Expand shorthand #rgb → #rrggbb
  if (h.length === 3) {
    h = h
      .split('')
      .map((c) => c + c)
      .join('')
  }

  const r = parseInt(h.substring(0, 2), 16) / 255
  const g = parseInt(h.substring(2, 4), 16) / 255
  const b = parseInt(h.substring(4, 6), 16) / 255
  const a = h.length === 8 ? parseInt(h.substring(6, 8), 16) / 255 : 1

  return { r, g, b, a }
}
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

