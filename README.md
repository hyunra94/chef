# 냉장고를 부탁해 PWA

냉장고 재료를 로컬 저장소에 관리하고, 추천 탭에서 선택한 재료를 기준으로 AI 레시피를 받아보는 PWA입니다.

## v13 변경사항

- 추천 탭에 AI 선택 추가
  - ChatGPT
  - Claude
  - Gemini
  - 3개 모두 비교
  - 로컬 추천
- 추천 결과 카드에 어느 AI가 만든 결과인지 표시
- 레시피 히스토리에도 AI 제공자 정보 저장
- `worker.js`에서 OpenAI / Claude / Gemini API를 모두 지원
- 냉장고 탭 간단히 보기에서 메인재료를 2열 그리드로 표시
- API 키는 프론트에 저장하지 않고 Cloudflare Worker 환경변수로만 사용

## GitHub Pages 업로드 구조

`chef` 저장소 루트에 아래 파일들이 바로 있어야 합니다.

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

## Cloudflare Worker 설정

1. Cloudflare Worker를 새로 만들거나 기존 Worker를 엽니다.
2. `worker.js` 내용을 붙여넣습니다.
3. 환경변수/Secrets에 필요한 키를 등록합니다.

필수는 아니고, 사용할 모델의 키만 등록해도 됩니다.

```text
OPENAI_API_KEY=...
CLAUDE_API_KEY=...
GEMINI_API_KEY=...
```

모델명을 직접 지정하고 싶으면 아래 환경변수를 추가합니다.

```text
OPENAI_MODEL=gpt-4o-mini
ANTHROPIC_MODEL=claude-3-5-haiku-latest
GEMINI_MODEL=gemini-2.5-flash
```

4. 배포 후 앱 설정 탭의 `AI Worker URL`에 아래처럼 입력합니다.

```text
https://your-worker-name.your-account.workers.dev/api/recipe
```

5. 추천 탭에서 AI를 선택하고 `AI 추천 받기`를 누릅니다.

## 동작 방식

- Worker URL이 비어 있거나 AI 선택이 `로컬 추천`이면 브라우저 내부 로컬 추천이 실행됩니다.
- `ChatGPT`, `Claude`, `Gemini`를 선택하면 해당 API만 호출합니다.
- `3개 모두 비교`를 선택하면 등록된 API 키가 있는 제공자만 동시에 호출합니다.
- 일부 API가 실패해도 다른 API 결과가 있으면 표시됩니다.

## 캐시 갱신

GitHub Pages에서 예전 화면이 보이면 서비스워커 캐시를 삭제하세요.

```text
개발자도구 → Application → Service Workers → Unregister
개발자도구 → Application → Storage → Clear site data
```


## v13 변경사항

- 추천 탭에 `먹고 싶은 메뉴` 입력칸을 추가했습니다. 예: 닭볶음탕, 김치볶음밥
- 추천 탭에 `추가 구매 여부` 옵션을 추가했습니다.
  - 냉장고 재료만 사용
  - 부족한 재료 추가 구매 가능
- AI 프롬프트와 로컬 추천 모두 위 옵션을 반영합니다.
- 냉장고 탭과 추천 탭에서 서브재료 / 소스류 그룹을 접기·펼치기 할 수 있습니다.
- 캐시 버전을 v13으로 갱신했습니다.


## v14 변경 사항

- 냉장고 간단히 보기에서 메인재료/서브재료/소스류 모두 2열 표시
- 재료 카드 액션 정리: 소진/복원 버튼 옆 점점점(⋯)으로 수정 팝업 진입
- 재료 수정 팝업 상단에 삭제 버튼 추가
- Gemini `User location is not supported for the API use` 오류 발생 시 Worker가 ChatGPT/Claude 또는 로컬 추천으로 자동 대체
- 앱의 AI 오류 메시지를 더 짧고 이해하기 쉽게 정리
