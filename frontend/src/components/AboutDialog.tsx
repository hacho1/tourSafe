import { ArrowUpRight, Database, ShieldCheck } from "lucide-react";
import { Modal } from "./Modal";
export function AboutDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal
      title="TourSafe의 추천 기준"
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
        <p>
          TourSafe는 현재 위치·시간·날씨와 공공지원시설을 함께 비교하는 가족
          여행 도우미입니다. 점수는 절대적인 안전 수준이나 사고 발생 확률을
          뜻하지 않습니다.
        </p>
        <h3>점수는 이렇게 계산해요</h3>
        <div className="weight-grid">
          {[
            ["운영·정보 신뢰성", 25],
            ["의료시설 접근성", 20],
            ["경찰시설 접근성", 15],
            ["관광안내소 접근성", 10],
            ["현재 기상 적합성", 20],
            ["가족 편의시설", 10],
          ].map(([label, value]) => (
            <div key={label}>
              <span>{label}</span>
              <strong>{value}점</strong>
            </div>
          ))}
        </div>
        <p className="formula">획득 점수 ÷ 확인 가능한 배점 × 100</p>
        <p>
          미확인 항목은 점수의 분모에서 제외합니다. ‘정보 신뢰도’는 배점 기준
          확인율입니다. 90% 이상은 높음, 60% 이상은 보통이며 데이터의 정확성을
          보증하지 않습니다. 공식 폐쇄·출입통제 또는 위험 기상특보가 확인되면
          점수와 관계없이 추천을 보류합니다.
        </p>
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
