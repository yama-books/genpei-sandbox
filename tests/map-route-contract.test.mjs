import test from "node:test";
import assert from "node:assert/strict";
import { createWorld, installModernPois, snapshot } from "../prototype/core.mjs";
import { SIM_POIS } from "./fixtures/sim-pois.mjs";
import { makeModernRouteRequest, reviewModernRoute, assessAgentRealMapPlacement, historicalLayerReviewGate, SPATIAL_DOMAINS } from "../prototype/map/route-contract.mjs";

function fixture() {
  const world=createWorld(1185);
  installModernPois(world,SIM_POIS);
  const [a,b]=world.modernPois;
  const result=makeModernRouteRequest(a,b);
  assert.equal(result.ok,true);
  const request=result.request;
  const answer={
    schemaVersion:"modern-route/1",positionDomain:"modern_wgs84",
    travelMode:"walking",yearContext:"present_day",
    originId:a.id,destinationId:b.id,distanceMeters:350,
    geometry:{type:"LineString",coordinates:[
      [a.modernLocation.lng,a.modernLocation.lat],
      [b.modernLocation.lng,b.modernLocation.lat]]},
    provenance:{providerId:"fixture_route_provider",sourceId:"test-source-1",
      license:"CC0-1.0",attribution:"Synthetic route fixture only",
      retrievedAt:"2026-10-20T04:00:00Z",confidence:"estimated"},
  };
  return {world,a,b,request,answer};
}
test("施設同士のリクエストは現代座標・出典のみで、人物の座標を含まない",()=>{
  const {request,world}=fixture(),before=snapshot(world);
  assert.equal(request.positionDomain,SPATIAL_DOMAINS.modern);
  assert.equal(request.routePurpose,"facility_to_facility_preview");
  assert.equal(request.yearContext,"present_day");
  assert.equal(request.travelMode,"walking");
  assert.equal(request.origin.provenance.provider,"OpenPOI");
  assert.equal(request.destination.provenance.source,"synthetic_sim_fixture");
  assert.equal("agentId" in request,false);
  assert.equal("route" in request,false);
  assert.equal("durationSeconds" in request,false);
  assert.deepEqual(world,before);
});
test("架空座標・史跡代表点・典拠のない施設はルート候補に昇格しない",()=>{
  const {a,b}=fixture();
  assert.equal(makeModernRouteRequest(a,a).reason,"same_place");
  assert.equal(makeModernRouteRequest({id:"yashima",x:744,y:300},b).reason,"missing_verified_modern_place");
  assert.equal(makeModernRouteRequest({...a,modernLocation:{lat:200,lng:134}},b).ok,false);
  assert.equal(makeModernRouteRequest({...a,provenance:{...a.provenance,licenses:[]}},b).ok,false);
  assert.equal(makeModernRouteRequest({...a,provenance:{...a.provenance,source:""}},b).ok,false);
});
test("典拠付き施設間のGeoJSONルートは描画候補だが、人物移動には使えない",()=>{
  const {request,answer}=fixture();
  const result=reviewModernRoute(request,answer);
  assert.equal(result.ok,true);
  assert.equal(result.status,"geometry_ready_for_review");
  assert.equal(result.canDrawPreview,true);
  assert.equal(result.canMoveAgent,false);
  assert.deepEqual(result.routePreview.geometry,answer.geometry);
  assert.ok(result.routePreview.claims.includes("not_a_medieval_route"));
});
test("回答なし・異なる空間や時代のルートを棄却",()=>{
  const {request,answer}=fixture();
  assert.equal(reviewModernRoute(request,null).reason,"no_provider_response");
  assert.equal(reviewModernRoute(request,{...answer,positionDomain:"historical_geo"}).reason,"wrong_domain_or_version");
  assert.equal(reviewModernRoute(request,{...answer,yearContext:1185}).reason,"wrong_domain_or_version");
  assert.equal(reviewModernRoute(request,{...answer,travelMode:"ship"}).ok,false);
  assert.equal(reviewModernRoute({...request,positionDomain:"abstract"},answer).reason,"invalid_request");
});
test("異なる施設IDや、典拠が欠落した照会元を棄却",()=>{
  const {request,answer}=fixture();
  assert.equal(reviewModernRoute(request,{...answer,destinationId:"forged"}).reason,"mismatched_endpoints");
  const altered=structuredClone(request);altered.origin.provenance.licenses=[];
  assert.equal(reviewModernRoute(altered,answer).reason,"invalid_request");
  const same=structuredClone(request);same.destination.placeId=same.origin.placeId;
  assert.equal(reviewModernRoute(same,answer).reason,"invalid_request");
});
test("ライセンス・帰属・日時・確実性の不足を受け入れない",()=>{
  const {request,answer}=fixture();
  const variants=[
    {providerId:""},{sourceId:""},{license:""},{attribution:""},
    {retrievedAt:"invalid"},{confidence:"unknown"}
  ];
  for(const changed of variants) {
    const result=reviewModernRoute(request,{...answer,provenance:{...answer.provenance,...changed}});
    assert.equal(result.reason,"missing_provider_evidence");
  }
});
test("経路点が不正・逆向き・目的地に接続していなければ受け付けない",()=>{
  const {request,answer}=fixture();
  assert.equal(reviewModernRoute(request,{...answer,geometry:{type:"Point",coordinates:[134,34]}}).reason,"invalid_route_geometry");
  assert.equal(reviewModernRoute(request,{...answer,geometry:{type:"LineString",coordinates:[[0,0],[134,34]]}}).reason,"invalid_route_coordinates");
  const reversed=[...answer.geometry.coordinates].reverse();
  assert.equal(reviewModernRoute(request,{...answer,geometry:{type:"LineString",coordinates:reversed}}).reason,"route_not_connected_to_places");
  const wrong=[...answer.geometry.coordinates];wrong[0]=[135,35];
  assert.equal(reviewModernRoute(request,{...answer,geometry:{type:"LineString",coordinates:wrong}}).reason,"route_not_connected_to_places");
});
test("不正な長さや距離値の捏造はrejectし、経路なしを黙って直線にしない",()=>{
  const {request,answer}=fixture();
  assert.equal(reviewModernRoute(request,{...answer,distanceMeters:10}).reason,"invalid_reported_distance");
  assert.equal(reviewModernRoute(request,{...answer,distanceMeters:NaN}).reason,"invalid_reported_distance");
  assert.equal(reviewModernRoute(request,{...answer,distanceMeters:300000}).reason,"invalid_reported_distance");
  assert.equal(reviewModernRoute(request,{...answer,geometry:null}).ok,false);
});
test("施設データ・レスポンスは参照時に変化しない",()=>{
  const {world,request,answer}=fixture();
  const before=snapshot(world),evidence=structuredClone(answer);
  const result=reviewModernRoute(request,answer);
  assert.deepEqual(world,before);
  assert.deepEqual(answer,evidence);
  result.routePreview.geometry.coordinates[0][0]=0;
  assert.notEqual(answer.geometry.coordinates[0][0],0);
});
test("どの人物も現行版では現代地図の実位置を持たない",()=>{
  const {world}=fixture();
  for(const agent of world.agents)
    assert.deepEqual(assessAgentRealMapPlacement(world,agent.id),
      {canDraw:false,reason:"abstract_agent_position"});
  assert.deepEqual(assessAgentRealMapPlacement(world,"unknown"),{canDraw:false,reason:"unknown_agent"});
});
test("歴史地理の取得依頼と現代の道路網を混同しない",()=>{
  const review=historicalLayerReviewGate({
    asOfYear:1185,location:{siteId:"YS001"},confidence:"estimated",
    provenance:{sourceId:"historical_fixture"}
  });
  assert.equal(review.request.asOfYear,1185);
  assert.equal(review.request.feature.provinceLabel,"讃岐国");
  assert.equal(review.review.ok,true);
  assert.equal(review.canDrawModernRoad,false);
  assert.equal(review.canMoveAgent,false);
  const wrong=historicalLayerReviewGate({
    asOfYear:2026,location:{siteId:"YS001"},confidence:"documented",
    provenance:{sourceId:"modern_fixture"}
  });
  assert.equal(wrong.review.reason,"era_mismatch");
});
