import test from 'node:test';
import assert from 'node:assert/strict';
import type { Recommendation } from '../shared/models';
import { assess, suitabilityOrder, buildVisitQuestions, needEvidenceLabel, NEEDS } from '../frontend/src/utils/suitability';
const source = { kind:'PUBLIC_DATA' as const, name:'무장애 여행', url:null };
const item = (): Recommendation => ({
 spot: { safety: { nursingRoom: { status:'CONFIRMED',value:true,source,updatedAt:null }, strollerAccessible:{status:'UNKNOWN',value:null,source:null,updatedAt:null} }, visitDetails:[], distanceMeters:10 } as unknown as Recommendation['spot'],
 facilities:[], score:{coverage:90}, statuses:[], weather:{} as Recommendation['weather'],
} as Recommendation);
const field=(row:Recommendation,id:string,text:string)=>{ row.spot.visitDetails!.push({id:'accessible-'+id,label:id,text,source,updatedAt:null}); };
test('필수조건 모두 확인되면 충족',()=>{let r=item(); field(r,'elevator','있음'); assert.equal(assess(r,{nursing:'required',elevator:'required'}).status,'met');});
test('미충족 필수조건은 다른 선호 및 지원시설로 상쇄되지 않음',()=>{let r=item(); field(r,'elevator','없음'); assert.equal(assess(r,{elevator:'required',nursing:'preferred'}).status,'unmet');});
test('일부 미확인이면 확인 필요',()=>{let r=item(); assert.equal(assess(r,{nursing:'required',wheelchair:'required'}).status,'unknown');});
test('선호만 선택하거나 선택하지 않으면 필수조건 미설정',()=>{let r=item(); assert.equal(assess(r,{nursing:'preferred'}).status,'unset'); assert.equal(assess(r,{}).status,'unset');});
test('누락, 모호한 원문, 잘못된 형식은 미확인',()=>{let r=item(); field(r,'wheelchair','대여 가능'); assert.equal(assess(r,{wheelchair:'required'}).status,'unknown'); (r.spot.safety.nursingRoom as unknown as {value:string}).value='true'; assert.equal(assess(r,{nursing:'required'}).status,'unknown'); });
test('일반 의료기관은 응급의료기관 정보로 판정하지 않음',()=>{let r=item(); r.facilities=[{type:'MEDICAL',emergency:false} as Recommendation['facilities'][number]]; assert.equal(assess(r,{emergency:'required'}).status,'unknown');});
test('불명확한 관광안내소 부재는 미확인',()=>{assert.equal(assess(item(),{tourInfo:'required'}).status,'unknown');});
test('필수조건 미충족은 정보 확인율로 앞서지 않음',()=>{let a=item(),b=item();field(a,'elevator','없음');field(b,'elevator','있음');a.score.coverage=100;b.score.coverage=10;assert.ok(suitabilityOrder(a,b,{elevator:'required'})>0);});

test('계단 존재만으로 무단차 출입 부재를 추론하지 않음',()=>{let r=item();field(r,'exit','계단 있음');assert.equal(assess(r,{stepFree:'required'}).status,'unknown');});
test('부재 상태의 null 값은 잘못된 형식으로 미확인',()=>{let r=item();r.spot.safety.nursingRoom={status:'NOT_AVAILABLE',value:null,source,updatedAt:null};assert.equal(assess(r,{nursing:'required'}).status,'unknown');});

const validFacility = (type: 'TOILET'|'TOURIST_INFO'|'MEDICAL' = 'TOURIST_INFO') => ({
  type, name:'근처 시설', source, updatedAt:null, lat:37.5, lng:127, distanceMeters:0, distanceType:'STRAIGHT_LINE', emergency:type === 'MEDICAL',
} as Recommendation['facilities'][number]);
const locatedItem = () => { const r=item(); r.spot.lat=37.5; r.spot.lng=127; return r; };
test('경사로 하나만으로 접근로와 경사로 전체를 충족 또는 미충족 처리하지 않음',()=>{
 for (const text of ['경사로 있음','경사로 설치','경사로 없음']) { const r=item(); field(r,'route',text); assert.equal(assess(r,{route:'required'}).status,'unknown',text); }
 const explicit=item(); field(explicit,'route','접근로 및 경사로 있음'); assert.equal(assess(explicit,{route:'required'}).status,'met');
});
test('조건부 원문과 상충되는 원문은 미확인',()=>{
 const r=item(); field(r,'elevator','엘리베이터 있음, 이용 전 문의'); assert.equal(assess(r,{elevator:'required'}).status,'unknown');
 r.spot.visitDetails=[]; field(r,'elevator','있음'); field(r,'elevator','없음'); assert.equal(assess(r,{elevator:'required'}).status,'unknown');
});
test('시설 배열 오류 및 null 원소는 예외 없이 미확인',()=>{
 const r=locatedItem(); (r as unknown as {facilities:unknown}).facilities={type:'TOILET'};
 assert.equal(assess(r,{toilet:'required'}).status,'unknown');
 (r as unknown as {facilities:unknown}).facilities=[validFacility('TOILET'),null];
 assert.equal(assess(r,{toilet:'required'}).status,'unknown');
});
test('공중화장실과 응급의료시설 정보는 유효한 출처, 직선거리 및 좌표가 필요함',()=>{
 for (const key of ['source','lat','lng','distanceMeters','distanceType','updatedAt'] as const) {
  const r=locatedItem(); const f=validFacility('TOILET');
  (f as unknown as Record<string,unknown>)[key] = key === 'distanceMeters' ? -1 : key === 'distanceType' ? 'WALK' : key === 'source' ? {kind:'PUBLIC_DATA',name:'',url:null} : key === 'updatedAt' ? '날짜 오류' : NaN;
  r.facilities=[f]; assert.equal(assess(r,{toilet:'required'}).status,'unknown',key);
 }
 const valid=locatedItem(); valid.facilities=[validFacility('TOILET'),validFacility('MEDICAL')];
 assert.equal(assess(valid,{toilet:'required',emergency:'required'}).status,'met');
 valid.facilities[1]!.distanceMeters=3000; assert.equal(assess(valid,{emergency:'required'}).status,'unknown');
});
test('무장애 원문의 잘못된 형식과 출처는 미확인',()=>{
 const r=item(); (r.spot as unknown as {visitDetails:unknown}).visitDetails={id:'accessible-elevator'};
 assert.equal(assess(r,{elevator:'required'}).status,'unknown');
 (r.spot as unknown as {visitDetails:unknown}).visitDetails=[null];
 assert.equal(assess(r,{elevator:'required'}).status,'unknown');
 r.spot.visitDetails=[]; field(r,'elevator','있음'); (r.spot.visitDetails[0] as unknown as {source:unknown}).source=null;
 assert.equal(assess(r,{elevator:'required'}).status,'unknown');
});
test('벤치 제공은 휴식 좌석 정보로 표시하며 벤치 부재는 전체 휴식 공간 부재가 아님',()=>{
 const r=item(); r.spot.safety.benches={status:'CONFIRMED',value:true,source,updatedAt:null};
 assert.equal(assess(r,{rest:'required'}).status,'met');
 r.spot.safety.benches={status:'NOT_AVAILABLE',value:false,source,updatedAt:null};
 assert.equal(assess(r,{rest:'required'}).status,'unknown');
});

test('기관의 주출입구와 전용 화장실 문구는 그 조건에 한해서 인식한다',()=>{
 const r=item(); field(r,'exit','주출입구는 단차가 없어 휠체어 접근 가능함'); field(r,'restroom','장애인 전용 화장실 있음');
 assert.equal(assess(r,{stepFree:'required',accessibleToilet:'required'}).status,'met');
 assert.equal(assess(r,{strollerAccess:'required'}).status,'unknown');
 assert.equal(assess(r,{wheelchair:'required'}).status,'unknown');
});
test('조건·예외·미래 계획이 붙은 원문을 긍정 부분문장으로 판정하지 않는다',()=>{
 for(const text of ['주출입구는 단차가 없어 휠체어 접근 가능함, 단 공사 중','주출입구는 단차가 없어 휠체어 접근 가능함 예정','주출입구는 단차가 있어 휠체어 접근 불가함']) {
  const r=item(); field(r,'exit',text); assert.equal(assess(r,{stepFree:'required'}).status,'unknown',text);
 }
 const r=item(); field(r,'restroom','장애인 전용 화장실 있음 (외부 건물)'); assert.equal(assess(r,{accessibleToilet:'required'}).status,'unknown');
});
test('자료 없음과 원문 해석 보류와 상충을 구별한다',()=>{
 const r=item(); assert.equal(needEvidenceLabel(assess(r,{stepFree:'required'}).results[0]!),'자료 없음');
 field(r,'exit','주출입구 경사로 안내는 문의'); assert.equal(needEvidenceLabel(assess(r,{stepFree:'required'}).results[0]!),'원문 있음 · 해석 보류');
 field(r,'exit','계단 없는 출입구'); assert.equal(needEvidenceLabel(assess(r,{stepFree:'required'}).results[0]!),'자료 상충');
});
test('대여 원문과 출입 원문은 유모차 전체 동선의 근거가 아니다',()=>{
 const r=item(); field(r,'stroller','유모차 대여 가능'); field(r,'exit','주출입구는 단차가 없어 휠체어 접근 가능함');
 const result=assess(r,{strollerRental:'preferred',strollerAccess:'required'});
 assert.equal(result.status,'unknown'); assert.equal(result.results.find(x=>x.id==='strollerRental')?.state,'met');
});
test('수유실 원문이 있으면 구조화 값 누락과 구별한다',()=>{
 const r=item(); r.spot.safety.nursingRoom={status:'UNKNOWN',value:null,source:null,updatedAt:null}; field(r,'lactationroom','수유실 이용은 사전 문의');
 assert.equal(needEvidenceLabel(assess(r,{nursing:'required'}).results[0]!),'원문 있음 · 해석 보류');
});
test('후보 정렬은 가중 확인율로 필수 조건 근거를 대체하지 않는다',()=>{
 const a=item(),b=item(); a.score.coverage=100; b.score.coverage=1; field(b,'exit','주출입구는 단차가 없어 휠체어 접근 가능함');
 assert.ok(suitabilityOrder(a,b,{stepFree:'required'})>0);
});
test('공식 폐쇄 등 방문 경고가 있는 후보는 필수조건 자료만으로 앞세우지 않는다',()=>{
 const a=item(),b=item(); field(a,'exit','주출입구는 단차가 없어 휠체어 접근 가능함'); a.score.hardFilter=['공식 폐쇄 자료 있음']; b.score.hardFilter=[];
 assert.ok(suitabilityOrder(a,b,{stepFree:'required'})>0);
});
test('방문 질문은 선택한 조건과 현재 이용 확인을 남기며 자동 충족 기록을 만들지 않는다',()=>{
 const questions=buildVisitQuestions({stepFree:'required',strollerRental:'preferred'});
 assert.equal(questions.length,3); assert.match(questions[0]!,/운영시간/); assert.match(questions[1]!,/필수 · 계단 없는 출입/); assert.match(questions[2]!,/선호 · 유모차 대여/);
 assert.equal(buildVisitQuestions({}).length,1);
 const all=buildVisitQuestions(Object.fromEntries(NEEDS.map(([id])=>[id,'required'])));
 assert.equal(all.length,15); assert.ok(all.every(q=>q.length<=300));
});
