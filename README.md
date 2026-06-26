# 냉장고를 부탁해

로컬 저장소 기반 PWA 냉장고 재료 관리 + AI 레시피 추천 웹앱입니다.

## v6 수정 내용

- 홈 탭 제거
- 첫 번째 탭을 `냉장고`로 변경
- 재료 카드를 과한 요약형에서 분류별 DB 목록형으로 변경
- 메인재료 / 서브재료 / 소스류 그룹화
- 냉장고 탭에 `간단히 / 상세히` 보기 전환 추가
- 재료 수정 기능 추가
- 추천 탭에서 냉장고 재료를 간단히 보고 선택한 뒤 AI 추천 실행
- 추천 결과는 레시피 히스토리에 자동 저장
- 저장 탭을 `레시피` 탭으로 변경
- 레시피 히스토리에서 메모, 별점 관리
- 별점 필터 추가
- 삭제 시 영구 삭제 대신 휴지통 이동
- 휴지통 보기, 복원, 완전 삭제 기능 추가
- GitHub Pages 캐시 갱신용 v6 적용

## 배포 구조

GitHub Pages의 `/chef` 저장소 루트에 아래 파일이 바로 위치해야 합니다.

```text
chef/
├─ index.html
├─ style.css
├─ app.js
├─ manifest.webmanifest
├─ sw.js
├─ worker.js
└─ icons/
   ├─ icon-192.png
   └─ icon-512.png
```

## AI 연결

설정 탭의 `AI Worker URL`에 Cloudflare Worker의 `/api/recipe` 주소를 입력하면 됩니다.
Worker URL이 비어 있으면 로컬 추천 모드로 작동합니다.

## 캐시 문제 해결

GitHub Pages에서 이전 화면이 계속 보이면 브라우저 개발자도구에서 Service Worker를 해제하거나 사이트 데이터를 삭제하세요.

```text
Application → Service Workers → Unregister
Application → Storage → Clear site data
```
