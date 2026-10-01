import type { Coordinates, WeatherInfo } from "../../../shared/models.js";
import { config } from "../config.js";
import { confirmed, emptyWeather, num, str } from "../utils/data.js";
import { toWeatherGrid } from "../utils/geo.js";
import { buildUrl, fetchData, publicItems } from "../utils/http.js";

const source = {
  kind: "PUBLIC_DATA" as const,
  name: "기상청 단기예보·초단기실황",
  url: "https://www.data.go.kr/data/15084084/openapi.do",
};
const base = "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0";
function stamp(date: Date) {
  return {
    date: date.toISOString().slice(0, 10).replaceAll("-", ""),
    hour: String(date.getUTCHours()).padStart(2, "0") + "00",
  };
}
export function weatherBaseTime(now = new Date()) {
  const kst = new Date(now.getTime() + 9 * 3600_000);
  if (kst.getUTCMinutes() < 40) kst.setUTCHours(kst.getUTCHours() - 1);
  return stamp(kst);
}
export async function getWeather(center: Coordinates): Promise<WeatherInfo> {
  const now = new Date(),
    grid = toWeatherGrid(center),
    t = weatherBaseTime(now);
  const common = {
    serviceKey: config.weatherKey,
    dataType: "JSON",
    pageNo: 1,
    numOfRows: 1000,
    ...grid,
  };
  const observed = publicItems(
    await fetchData(
      buildUrl(`${base}/getUltraSrtNcst`, {
        ...common,
        base_date: t.date,
        base_time: t.hour,
      }),
    ),
  );
  if (!observed.length) throw new Error("NO_WEATHER_OBSERVATIONS");
  const at = `${t.date.slice(0, 4)}-${t.date.slice(4, 6)}-${t.date.slice(6, 8)}T${t.hour.slice(0, 2)}:00:00+09:00`;
  const weather = emptyWeather();
  const field = (category: string) =>
    num(observed.find((r) => r.category === category)?.obsrValue);
  const temperature = field("T1H"),
    rain = field("RN1"),
    wind = field("WSD"),
    rainType = field("PTY");
  if (temperature !== null && temperature > -80 && temperature < 60)
    weather.temperature = confirmed(temperature, source, at);
  if (rain !== null && rain >= 0)
    weather.precipitation = confirmed(rain, source, at);
  if (wind !== null && wind >= 0)
    weather.windSpeed = confirmed(wind, source, at);
  const conditions: Record<number, string> = {
    0: "강수 없음",
    1: "비",
    2: "비 또는 눈",
    3: "눈",
    5: "빗방울",
    6: "빗방울·눈날림",
    7: "눈날림",
  };
  if (rainType !== null && conditions[rainType])
    weather.condition = confirmed(conditions[rainType]!, source, at);
  // POP is a forecast, never fabricated from rain observations. A forecast failure leaves it unknown.
  try {
    const published = new Date(now.getTime() + 9 * 3600_000 - 20 * 60_000);
    const hour = published.getUTCHours();
    const baseHour = [23, 20, 17, 14, 11, 8, 5, 2].find((h) => h <= hour);
    if (baseHour === undefined) {
      published.setUTCDate(published.getUTCDate() - 1);
      published.setUTCHours(23);
    } else published.setUTCHours(baseHour);
    const f = stamp(published);
    const rows = publicItems(
      await fetchData(
        buildUrl(`${base}/getVilageFcst`, {
          ...common,
          base_date: f.date,
          base_time: f.hour,
        }),
      ),
    );
    const target = stamp(new Date(now.getTime() + 9 * 3600_000));
    const popRow = rows
      .filter(
        (r) =>
          r.category === "POP" &&
          str(r.fcstDate)! + str(r.fcstTime)! >= target.date + target.hour,
      )
      .sort((a, b) =>
        (str(a.fcstDate)! + str(a.fcstTime)!).localeCompare(
          str(b.fcstDate)! + str(b.fcstTime)!,
        ),
      )[0];
    const pop = num(popRow?.fcstValue);
    if (pop !== null && pop >= 0 && pop <= 100)
      weather.precipitationProbability = confirmed(
        pop,
        source,
        `${String(popRow!.fcstDate).slice(0, 4)}-${String(popRow!.fcstDate).slice(4, 6)}-${String(popRow!.fcstDate).slice(6, 8)}T${String(popRow!.fcstTime).slice(0, 2)}:00:00+09:00`,
      );
  } catch {
    /* Preserve valid observations and leave forecast evidence UNKNOWN. */
  }
  return weather;
}
