import { ArrowUpRight, Database, ShieldCheck } from "lucide-react";
import { Modal } from "./Modal";
export function AboutDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal
      title="TripFit의 추천 기준"
      onClose={onClose}
      className="about-dialog"
    >
      <div className="about-body">
        <div className="about-symbol">
          <ShieldCheck size={30} />
        </div>
        <h2>
          확인할 수 있는 정보로,
          <br />더 신중한 나들이를.
        </h2>
        <p>TripFit는 필요한 여행환경을 선택하고 긴급지원과 관광지원 정보를 찾도록 돕습니다. 범죄율이나 사고 가능성을 예측하지 않습니다.</p>
        <h3>개인별 필요조건을 먼저 확인해요</h3>
        <p>필수조건 중 하나라도 이용할 수 없다고 확인되면 미충족, 미확인 항목이 있으면 확인 필요로 표시합니다. 필수조건을 설정하지 않았다면 적합성을 판정하지 않습니다. 선호조건이 필수조건의 미충족을 상쇄하지 않습니다.</p>
        <p>기존 정보 확인율은 초기 프로토타입 항목의 확인 비율이며 데이터 정확도나 안전 확률이 아닙니다. 이전 점수의 가중치는 사고 위험 감소에 대해 검증되지 않았습니다.</p>
        <p>의료·경찰은 주변 긴급지원 정보입니다. 관광안내소는 관광정보와 비긴급 도움을 제공하며 응급 구조기관이 아닙니다. 1330은 관광안내·통역 문의입니다.</p>
        <h3>데이터를 읽는 방법</h3>
        <ul className="about-list">
          <li>
            <b>확인됨</b> · 출처가 해당 정보를 제공했습니다.
          </li>
          <li>
            <b>없음 확인</b> · 부재가 명시적으로 확인됐습니다.
          </li>
          <li>
            <b>미확인</b> · 정보를 얻지 못했습니다. 없다는 뜻이 아닙니다.
          </li>
          <li>
            <b>DEMO</b> · 가상의 시연용 데이터입니다.
          </li>
        </ul>
        <p>
          지원시설 거리는 관광지 좌표부터의 직선거리입니다. 실제
          보행거리·이동시간과 다르며, 진료·운영 가능 여부는 별도 확인이
          필요합니다. 현재 기상특보 자동 수집은 연결되어 있지 않습니다.
        </p>
        <h3>
          <Database size={17} /> 데이터 출처
        </h3>
        <div className="source-links">
          <a
            href="https://api.visitkorea.or.kr/"
            target="_blank"
            rel="noreferrer"
          >
            한국관광공사 TourAPI <ArrowUpRight size={14} />
          </a>
          <a
            href="https://www.data.go.kr/data/15084084/openapi.do"
            target="_blank"
            rel="noreferrer"
          >
            기상청 단기예보 <ArrowUpRight size={14} />
          </a>
          <a
            href="https://www.data.go.kr/data/15000563/openapi.do"
            target="_blank"
            rel="noreferrer"
          >
            국립중앙의료원 <ArrowUpRight size={14} />
          </a>
          <a
            href="https://www.data.go.kr/data/15013112/standard.do"
            target="_blank"
            rel="noreferrer"
          >
            전국관광안내소표준데이터 <ArrowUpRight size={14} />
          </a>
          <a
            href="https://www.data.go.kr/data/15012892/standard.do"
            target="_blank"
            rel="noreferrer"
          >
            전국공중화장실표준데이터 <ArrowUpRight size={14} />
          </a>
          <a
            href="https://developers.kakao.com/docs/ko/local/dev-guide"
            target="_blank"
            rel="noreferrer"
          >
            Kakao 장소검색 <ArrowUpRight size={14} />
          </a>
        </div>
      </div>
    </Modal>
  );
}
