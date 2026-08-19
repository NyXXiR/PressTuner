/**
 * 공개 URL의 단일 출처.
 *
 * 이 값을 파일마다 따로 적으면 폴백이 어긋나도 드러나지 않는다. 예전 폴백이던
 * https://www.briefflow.com 은 우리 도메인이 아니라 주차 페이지이고, 빌드 시점에
 * NEXT_PUBLIC_APP_URL 이 비면 사이트맵과 canonical 이 그 도메인을 가리키게 된다.
 */
export const SITE_URL =
  process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://briefflow.meerkathq.com";
