# 냉장고를 부탁해

냉장고 속 재료를 관리하고, 현재 있는 재료 기준으로 레시피를 추천받는 PWA 웹앱입니다.

## 포함 기능

- PWA 지원: manifest, service worker 포함
- 로컬 저장소 기반 재료 관리
- 재료 추가 / 수량 +, - / 삭제
- 입력일 자동 저장
- 유통기한 선택 입력
- 소스류 / 메인재료 / 서브재료 분류
- 유통기한 임박 재료 및 우선소모 체크
- 레시피 2~3개 추천
- 레시피 별점 / 후기 입력
- 희망 레시피 저장
- 데이터 내보내기 / 가져오기
- AI Worker URL 설정 영역

## 실행 방법

정적 파일이므로 GitHub Pages에 그대로 올리면 됩니다.

로컬에서 확인하려면 VS Code Live Server 또는 아래 명령을 사용할 수 있습니다.

```bash
python -m http.server 8080
```

브라우저에서 `http://localhost:8080` 접속.

## AI 연결 방법

1. `worker.js`를 Cloudflare Worker에 배포합니다.
2. Cloudflare Worker 환경변수에 `OPENAI_API_KEY`를 등록합니다.
3. 웹앱 설정 탭에 아래 형태의 URL을 입력합니다.

```text
https://your-worker.yourname.workers.dev/api/recipe
```

Worker URL이 비어 있으면 앱은 로컬 추천 모드로 작동합니다.

## Notion DB 확장 권장 구조

### 재료 DB
- 재료명: Title
- 카테고리: Select
- 수량: Number
- 단위: Select
- 입력일: Date
- 유통기한: Date
- 우선소모: Checkbox
- 메모: Text

### 레시피 DB
- 레시피명: Title
- 사용재료: Multi-select 또는 Relation
- 조리시간: Text
- 난이도: Select
- 레시피내용: Rich text
- 저장일: Date
- 즐겨찾기: Checkbox

### 평가 DB
- 레시피: Relation
- 별점: Number
- 후기: Text
- 작성일: Date
