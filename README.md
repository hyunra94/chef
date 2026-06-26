# 냉장고를 부탁해

냉장고 속 재료를 로컬 저장소에 기록하고, 선택한 재료를 꼭 포함해서 레시피를 추천하는 PWA 웹앱입니다.

## 주요 기능

- PWA 지원
- 로컬 저장소 기반 재료 DB
- 재료 추가 / 삭제 / 수량 +, -
- 입력일 자동 저장
- 유통기한 선택 입력
- 소스류 / 메인재료 / 서브재료 분류
- 유통기한 임박 재료 표시
- 이번 추천에 꼭 포함할 재료 직접 선택
- 레시피 2~3개 추천
- 레시피 저장
- 별점 / 후기 입력
- 로컬 데이터 내보내기 / 가져오기
- Cloudflare Worker 기반 AI 추천 확장 준비

## GitHub Pages 배포 주의

`hyunra94.github.io/chef`처럼 저장소가 하위 경로로 배포되는 경우에도 동작하도록 모든 경로를 `./` 상대 경로로 작성했습니다.

업로드 시에는 `fridge-chef-app` 폴더 자체를 올리는 것이 아니라, 폴더 안의 파일들이 저장소 루트에 바로 있어야 합니다.

```text
chef/
├─ index.html
├─ style.css
├─ app.js
├─ manifest.webmanifest
├─ sw.js
├─ worker.js
└─ icons/
```

버튼이 계속 안 먹으면 이전 서비스워커 캐시가 남아 있을 수 있습니다.
브라우저 개발자도구 → Application → Service Workers → Unregister 후 새로고침하거나, 사이트 데이터 삭제 후 다시 접속하세요.

## AI Worker 사용

`worker.js`를 Cloudflare Worker에 배포하고 환경변수 `OPENAI_API_KEY`를 등록하세요.
앱의 설정 탭에 아래 형식의 URL을 입력하면 실제 AI 추천으로 전환됩니다.

```text
https://your-worker.workers.dev/api/recipe
```

Worker로 전달되는 재료 데이터에는 `mustUse` 값이 포함됩니다.
`mustUse: true`인 재료는 유통기한과 관계없이 추천 레시피에 반드시 포함하도록 프롬프트를 구성했습니다.
