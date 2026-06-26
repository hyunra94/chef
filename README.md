# 냉장고를 부탁해 v15

## 변경 내용

- 추천 결과가 레시피 탭에 자동 저장되지 않도록 수정했습니다.
- 추천 결과 카드에 `보관` / `폐기` 버튼을 추가했습니다.
- `보관`한 레시피만 레시피 탭에 표시됩니다.
- 레시피 탭에서는 별점, 메모, 휴지통 이동, 복원, 완전 삭제를 관리합니다.
- Worker가 AI 제공자 오류를 무조건 500으로 반환하지 않도록 수정했습니다.
- ChatGPT / Claude / Gemini 중 하나가 실패해도 가능한 다른 AI 또는 로컬 추천으로 대체합니다.
- Worker `/api/health`에서 API 키 감지 여부와 감지된 변수명만 확인할 수 있습니다. 키 값은 노출하지 않습니다.
- OpenAI 키 이름은 `OPENAI_API_KEY`를 우선 사용하지만 `CHATGPT_API_KEY`, `OPEN_API_KEY`, `OPENAI_KEY`도 보조로 인식합니다.
- Claude 키 이름은 `CLAUDE_API_KEY`를 우선 사용하고 `ANTHROPIC_API_KEY`도 보조로 인식합니다.
- Gemini는 지역 제한 오류가 발생할 수 있어 실패 시 자동 대체됩니다.
- PWA 캐시 버전을 v15로 변경했습니다.

## Cloudflare Worker 환경변수

권장 이름:

```text
OPENAI_API_KEY
CLAUDE_API_KEY
GEMINI_API_KEY
```

선택 모델명:

```text
OPENAI_MODEL=gpt-4o-mini
CLAUDE_MODEL=claude-3-5-haiku-latest
GEMINI_MODEL=gemini-2.5-flash
```

## 확인 주소

```text
https://<worker-name>.hyunra94.workers.dev/api/health
```

정상 예시:

```json
{
  "ok": true,
  "keys": {
    "openai": true,
    "claude": false,
    "gemini": true
  },
  "detectedKeyNames": {
    "openai": ["OPENAI_API_KEY"],
    "claude": [],
    "gemini": ["GEMINI_API_KEY"]
  }
}
```

## 배포

GitHub Pages `chef` 저장소 루트에 ZIP 안 파일을 그대로 덮어씌우세요.

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

업데이트 후 예전 화면이 남으면 브라우저의 Service Worker와 사이트 데이터를 삭제한 뒤 새로고침하세요.
